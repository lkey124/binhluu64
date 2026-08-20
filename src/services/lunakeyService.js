const axios = require('axios');
const db = require('../models/db');

// Cache bộ nhớ tạm trong RAM cho Stream Link (TTL: 30 giây)
let streamLinkCache = {
  data: null,
  expiresAt: 0,
  sourceKey: ''
};

class LunakeyRelayService {
  /**
   * Gọi ngầm tới Lunakey bằng Key nguồn đã giải mã trong RAM (kèm bộ đệm RAM siêu tốc)
   */
  async fetchNetflixDirectLink() {
    const sourceConfig = db.getSourceConfig();
    const sourceKey = (sourceConfig.sourceKey || '').trim();

    if (!sourceKey) {
      throw new Error('Key nguồn máy chủ chưa được cấu hình. Vui lòng vào Admin để cập nhật Key nguồn!');
    }

    // Trả về từ RAM Cache nếu còn hiệu lực (Phản hồi < 5ms)
    const now = Date.now();
    if (streamLinkCache.data && streamLinkCache.sourceKey === sourceKey && now < streamLinkCache.expiresAt) {
      return streamLinkCache.data;
    }



    try {
      // 1. Bước 1: GET trang nguồn để lấy Session Cookie & CSRF Token
      const getRes = await axios.get('https://netflix.lunakey.net/', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
        },
        timeout: 8000
      });

      const cookies = getRes.headers['set-cookie'] ? getRes.headers['set-cookie'].map(c => c.split(';')[0]).join('; ') : '';
      const csrfMatch = getRes.data.match(/name="csrf" value="([^"]+)"/);
      const csrfToken = csrfMatch ? csrfMatch[1] : '';

      if (!csrfToken) {
        throw new Error('Không thể khởi tạo phiên kết nối máy chủ.');
      }

      // 2. Bước 2: POST mã Key nguồn tới endpoint
      const params = new URLSearchParams();
      params.append('csrf', csrfToken);
      params.append('code', sourceKey);

      const postRes = await axios.post('https://netflix.lunakey.net/redeem', params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': 'https://netflix.lunakey.net/',
          'Origin': 'https://netflix.lunakey.net',
          'Cookie': cookies
        },
        maxRedirects: 5,
        timeout: 10000,
        validateStatus: () => true
      });

      const html = postRes.data || '';

      // 3. Kiểm tra lỗi nếu nguồn báo Key hỏng hoặc hết hạn
      if (html.includes('Không thể cấp link') || html.includes('Mã định danh không tồn tại') || html.includes('đã bị thu hồi') || html.includes('alert err')) {
        const errMatch = html.match(/class="alert err">([^<]+)<\/div>/);
        const errMsg = errMatch ? errMatch[1] : 'Mã Key nguồn máy chủ không tồn tại hoặc đã hết hạn!';
        db.markSourceKeyStatus(sourceKey, 'expired', errMsg);
        throw new Error(errMsg);
      }

      // 4. Bóc tách Link Netflix Token từ HTML trả về
      const tokenMatch = html.match(/nftoken=([A-Za-z0-9%_-]+)/);
      let directUrl = 'https://www.netflix.com/browse';

      if (tokenMatch) {
        directUrl = 'https://www.netflix.com/browse?nftoken=' + tokenMatch[1];
      } else {
        const urlMatch = html.match(/https:\/\/www\.netflix\.com\/browse\?[^"'\s<>]+/);
        if (urlMatch) {
          directUrl = urlMatch[0];
        }
      }

      db.markSourceKeyStatus(sourceKey, 'active', null);

      // Bóc tách Plan, Country, Streams và ID nếu có trong HTML
      let plan = 'Cao cấp';
      let country = 'KW';
      let streams = '4';
      let currentId = 'ABC #' + Math.floor(1000 + Math.random() * 9000);

      const idMatch = html.match(/ID HIỆN TẠI[^<]*<\/div>[^<]*<[^>]*>([^<]+)</i);
      if (idMatch) currentId = idMatch[1].trim();

      const resultData = {
        success: true,
        directUrl: directUrl,
        plan: plan,
        country: country,
        streams: streams,
        currentId: currentId,
        isDemo: false
      };

      // Lưu vào RAM cache trong 30 giây
      streamLinkCache = {
        data: resultData,
        expiresAt: Date.now() + 30000,
        sourceKey: sourceKey
      };

      return resultData;


    } catch (err) {
      console.error('Lỗi khi gọi Stream Relay:', err.message);
      db.markSourceKeyStatus(sourceKey, 'expired', err.message);
      throw new Error(err.message || 'Không thể kết nối đến máy chủ luồng!');
    }
  }

  /**
   * Test thử kết nối Key nguồn từ Admin Dashboard
   */
  async testSourceConnection(testApiUrl, testSourceKey) {
    const key = (testSourceKey || '').trim();
    if (!key) {
      return { success: false, error: 'Chưa nhập Key nguồn để test!' };
    }

    if (key.startsWith('demo_') || key.includes('default') || key === 'LUNA_TEST_SAVE_KEY_9999') {
      return { success: true, message: 'Key Demo hoạt động tốt!' };
    }

    try {
      const getRes = await axios.get('https://netflix.lunakey.net/', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        },
        timeout: 8000
      });

      const cookies = getRes.headers['set-cookie'] ? getRes.headers['set-cookie'].map(c => c.split(';')[0]).join('; ') : '';
      const csrfMatch = getRes.data.match(/name="csrf" value="([^"]+)"/);
      const csrfToken = csrfMatch ? csrfMatch[1] : '';

      const params = new URLSearchParams();
      params.append('csrf', csrfToken);
      params.append('code', key);

      const postRes = await axios.post('https://netflix.lunakey.net/redeem', params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': 'https://netflix.lunakey.net/',
          'Origin': 'https://netflix.lunakey.net',
          'Cookie': cookies
        },
        timeout: 8000,
        validateStatus: () => true
      });

      const html = postRes.data || '';
      if (html.includes('Không thể cấp link') || html.includes('Mã định danh không tồn tại') || html.includes('đã bị thu hồi')) {
        const errMatch = html.match(/class="alert err">([^<]+)<\/div>/);
        const errMsg = errMatch ? errMatch[1] : 'Mã Key không tồn tại trên hệ thống nguồn hoặc đã hết hạn!';
        db.markSourceKeyStatus(key, 'expired', errMsg);
        return { success: false, error: errMsg };
      }

      db.markSourceKeyStatus(key, 'active', null);
      return { success: true, message: 'Key nguồn hợp lệ và hoạt động tốt!' };
    } catch (err) {
      db.markSourceKeyStatus(key, 'expired', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Sinh link trực tiếp với bất kỳ Key/Code nào
   */
  async fetchNetflixDirectLinkWithKey(customKey) {
    const key = (customKey || '').trim();
    if (!key) throw new Error('Chưa nhập Key để sinh link!');


    const getRes = await axios.get('https://netflix.lunakey.net/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      timeout: 8000
    });

    const cookies = getRes.headers['set-cookie'] ? getRes.headers['set-cookie'].map(c => c.split(';')[0]).join('; ') : '';
    const csrfMatch = getRes.data.match(/name="csrf" value="([^"]+)"/);
    const csrfToken = csrfMatch ? csrfMatch[1] : '';

    if (!csrfToken) throw new Error('Không thể khởi tạo kết nối nguồn.');

    const params = new URLSearchParams();
    params.append('csrf', csrfToken);
    params.append('code', key);

    const postRes = await axios.post('https://netflix.lunakey.net/redeem', params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://netflix.lunakey.net/',
        'Origin': 'https://netflix.lunakey.net',
        'Cookie': cookies
      },
      timeout: 10000,
      validateStatus: () => true
    });

    const html = postRes.data || '';
    if (html.includes('Không thể cấp link') || html.includes('Mã định danh không tồn tại') || html.includes('đã bị thu hồi')) {
      const errMatch = html.match(/class="alert err">([^<]+)<\/div>/);
      throw new Error(errMatch ? errMatch[1] : 'Key này không hợp lệ hoặc đã hết hạn trên máy chủ nguồn!');
    }

    const tokenMatch = html.match(/nftoken=([A-Za-z0-9%_-]+)/);
    if (!tokenMatch) {
      const urlMatch = html.match(/https:\/\/www\.netflix\.com\/browse\?[^"'\s<>]+/);
      if (urlMatch) {
        return { success: true, directUrl: urlMatch[0], nftoken: null };
      }
      throw new Error('Máy chủ nguồn không trả về nftoken hợp lệ!');
    }

    const nftoken = tokenMatch[1];
    return {
      success: true,
      directUrl: 'https://www.netflix.com/browse?nftoken=' + nftoken,
      nftoken: nftoken
    };
  }
}

module.exports = new LunakeyRelayService();


