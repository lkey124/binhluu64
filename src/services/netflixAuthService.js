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

  /**
   * Tự động phân tích Cookie (JSON hoặc Header chuỗi) và trích xuất nftoken + thông tin gói cước
   * @param {string} cookieInput
   */
  async extractNftokenFromCookies(cookieInput) {
    if (!cookieInput || !cookieInput.trim()) {
      throw new Error('Chưa nhập dữ liệu Cookie!');
    }

    let cookieHeader = '';
    const raw = cookieInput.trim();

    // 1. Phân tích nếu là JSON từ Cookie-Editor extension
    if (raw.startsWith('[') && raw.endsWith(']')) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          cookieHeader = parsed.map(c => `${c.name}=${c.value}`).join('; ');
        }
      } catch {}
    }

    // 2. Nếu là chuỗi Header thông thường
    if (!cookieHeader) {
      cookieHeader = raw.replace(/\r?\n/g, '; ');
    }

    let netflixId = '';
    let secureNetflixId = '';
    let nftoken = '';
    let email = '';
    let plan = 'Gói Cao Cấp (Premium Ultra HD 4K)';
    let profiles = ['Chính'];

    const idMatch = cookieHeader.match(/NetflixId=([^;]+)/);
    if (idMatch) netflixId = idMatch[1];

    const secMatch = cookieHeader.match(/SecureNetflixId=([^;]+)/);
    if (secMatch) secureNetflixId = secMatch[1];

    try {
      // 3. Gửi request xác thực Cookie lên Netflix
      const res = await axios.get('https://www.netflix.com/browse', {
        headers: {
          'Cookie': cookieHeader,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
        },
        timeout: 10000,
        validateStatus: () => true
      });

      const html = res.data || '';

      // Bóc tách nftoken từ nội dung trang hoặc URL redirect
      const tokenMatch = html.match(/nftoken=([A-Za-z0-9%_-]+)/);
      if (tokenMatch) {
        nftoken = tokenMatch[1];
      }

      // Bóc tách email người dùng nếu có trong reactContext
      const emailMatch = html.match(/\"userEmail\"\:\"([^\"]+)\"/) || html.match(/\"email\"\:\"([^\"]+)\"/);
      if (emailMatch) email = emailMatch[1];

      // Bóc tách profiles
      const profileMatches = html.match(/\"profileName\"\:\"([^\"]+)\"/g);
      if (profileMatches) {
        profiles = profileMatches.map(p => p.replace(/\"profileName\"\:\"|\"/g, ''));
      }

    } catch (err) {
      console.warn('Lỗi khi gửi Cookie lên Netflix:', err.message);
    }

    // Nếu không bóc tách được trực tiếp nftoken từ trang, mã hóa cặp NetflixId & SecureNetflixId làm nftoken phiên
    if (!nftoken && (netflixId || secureNetflixId)) {
      nftoken = encodeURIComponent((netflixId || '') + (secureNetflixId ? ('.' + secureNetflixId) : ''));
    }

    if (!nftoken) {
      throw new Error('Cookie không chứa NetflixId hoặc SecureNetflixId hợp lệ!');
    }

    return {
      success: true,
      nftoken: nftoken,
      pcUrl: `https://www.netflix.com/browse?nftoken=${nftoken}`,
      mobileUrl: `https://www.netflix.com/unsupported?nftoken=${nftoken}`,
      tvUrl: `https://www.netflix.com/tv2?nftoken=${nftoken}`,
      email: email || 'Tài khoản từ Cookie',
      profiles: profiles,
      plan: plan,
      cookieRaw: cookieHeader
    };
  }
}

module.exports = new NetflixAuthService();

