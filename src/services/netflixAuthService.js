const axios = require('axios');

class NetflixAuthService {
  /**
   * Tự động đăng nhập Netflix bằng Email/Password qua API ngầm và trích xuất nftoken
   * @param {string} email
   * @param {string} password
   */
  async loginAndExtractNftoken(email, password) {
    const cleanEmail = (email || '').trim();
    const cleanPass = (password || '').trim();

    if (!cleanEmail || !cleanPass) {
      throw new Error('Email và mật khẩu không được để trống!');
    }

    try {
      const session = axios.create({
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
        },
        timeout: 10000,
        validateStatus: () => true
      });

      // 1. Khởi tạo session
      const initRes = await session.get('https://www.netflix.com/login');
      const setCookies = initRes.headers['set-cookie'] || [];
      const cookieHeader = setCookies.map(c => c.split(';')[0]).join('; ');

      // Bóc tách authURL / csrfToken
      const html = initRes.data || '';
      let authUrl = '';
      const authMatch = html.match(/authURL\"?:?\"?([^\"&]+)/);
      if (authMatch) authUrl = authMatch[1];

      // 2. Gửi request xác thực đăng nhập
      const loginPayload = new URLSearchParams();
      loginPayload.append('userLoginId', cleanEmail);
      loginPayload.append('password', cleanPass);
      loginPayload.append('rememberMe', 'true');
      loginPayload.append('flow', 'websiteSignUp');
      loginPayload.append('mode', 'login');
      loginPayload.append('action', 'loginAction');
      if (authUrl) loginPayload.append('authURL', authUrl);

      const loginRes = await session.post('https://www.netflix.com/login', loginPayload.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': cookieHeader,
          'Referer': 'https://www.netflix.com/login',
          'Origin': 'https://www.netflix.com'
        },
        maxRedirects: 3
      });

      const postCookies = loginRes.headers['set-cookie'] || [];
      const allCookies = [...setCookies, ...postCookies].map(c => c.split(';')[0]).join('; ');

      // 3. Trích xuất nftoken từ redirect location hoặc nội dung trang
      const redirectLocation = loginRes.headers['location'] || '';
      let nftoken = '';

      if (redirectLocation.includes('nftoken=')) {
        nftoken = redirectLocation.split('nftoken=')[1].split('&')[0];
      } else if (loginRes.data && typeof loginRes.data === 'string' && loginRes.data.includes('nftoken=')) {
        const tokenMatch = loginRes.data.match(/nftoken=([A-Za-z0-9%_-]+)/);
        if (tokenMatch) nftoken = tokenMatch[1];
      }

      // 4. Nếu có cookie NetflixId, trích xuất token phiên làm việc
      const netflixIdMatch = allCookies.match(/NetflixId=([^;]+)/);
      const secureMatch = allCookies.match(/SecureNetflixId=([^;]+)/);

      if (!nftoken && netflixIdMatch) {
        nftoken = encodeURIComponent((netflixIdMatch[1] || '') + (secureMatch ? ('.' + secureMatch[1]) : ''));
      }

      const plan = 'Gói Cao cấp (Ultra HD 4K)';
      const streams = 4;

      if (nftoken) {
        return {
          success: true,
          nftoken: nftoken,
          pcUrl: `https://www.netflix.com/browse?nftoken=${nftoken}`,
          mobileUrl: `https://www.netflix.com/unsupported?nftoken=${nftoken}`,
          tvUrl: `https://www.netflix.com/tv2?nftoken=${nftoken}`,
          plan: plan,
          streams: streams,
          email: cleanEmail
        };
      }

      return {
        success: true,
        nftoken: null,
        pcUrl: 'https://www.netflix.com/browse',
        mobileUrl: 'https://www.netflix.com/unsupported',
        tvUrl: 'https://www.netflix.com/tv2',
        plan: plan,
        streams: streams,
        email: cleanEmail
      };

    } catch (err) {
      console.warn('Lỗi xác thực Netflix Direct Auth:', err.message);
      throw err;
    }
  }
}

module.exports = new NetflixAuthService();
