let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch {
  puppeteer = null;
}

class PuppeteerLoginService {
  /**
   * Tự động mở trình duyệt ngầm, đăng nhập và lấy nftoken / cookie
   * @param {string} email
   * @param {string} password
   */
  async loginAndExtractSession(email, password) {
    if (!puppeteer) {
      throw new Error('Gói Puppeteer chưa được khởi tạo trên máy chủ!');
    }

    const cleanEmail = (email || '').trim();
    const cleanPass = (password || '').trim();

    let browser = null;
    try {
      console.log(`🤖 [BOT-PUPPETEER] Bắt đầu mở trình duyệt ngầm cho: ${cleanEmail}...`);

      browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled'
        ]
      });

      const page = await browser.newPage();

      // Giả lập User-Agent chuẩn người dùng thực
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1366, height: 768 });

      // Gỡ bỏ cờ tự động hóa (Anti-Bot evasion)
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
      });

      console.log('🤖 [BOT-PUPPETEER] Đang truy cập https://www.netflix.com/login...');
      await page.goto('https://www.netflix.com/login', { waitUntil: 'networkidle2', timeout: 25000 });

      // Điền Email
      const emailSelector = 'input[name="userLoginId"], input[id="id_userLoginId"]';
      await page.waitForSelector(emailSelector, { timeout: 10000 });
      await page.type(emailSelector, cleanEmail, { delay: 30 });

      // Điền Mật khẩu
      const passSelector = 'input[name="password"], input[id="id_password"]';
      await page.waitForSelector(passSelector, { timeout: 10000 });
      await page.type(passSelector, cleanPass, { delay: 30 });

      // Bấm Đăng nhập
      const submitSelector = 'button[type="submit"]';
      await Promise.all([
        page.click(submitSelector),
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {})
      ]);

      const currentUrl = page.url();
      console.log(`🤖 [BOT-PUPPETEER] Đã điều hướng đến URL: ${currentUrl}`);

      // 1. Trích xuất nftoken từ URL nếu có
      let nftoken = '';
      if (currentUrl.includes('nftoken=')) {
        nftoken = currentUrl.split('nftoken=')[1].split('&')[0];
      }

      // 2. Lấy cookies từ phiên duyệt
      const cookies = await page.cookies();
      const netflixIdCookie = cookies.find(c => c.name === 'NetflixId');
      const secureIdCookie = cookies.find(c => c.name === 'SecureNetflixId');

      if (!nftoken && netflixIdCookie) {
        nftoken = encodeURIComponent(netflixIdCookie.value + (secureIdCookie ? ('.' + secureIdCookie.value) : ''));
      }

      if (nftoken) {
        console.log(`✅ [BOT-PUPPETEER] Trích xuất nftoken thành công: ${nftoken.substring(0, 16)}...`);
        return {
          success: true,
          nftoken: nftoken,
          pcUrl: `https://www.netflix.com/browse?nftoken=${nftoken}`,
          mobileUrl: `https://www.netflix.com/unsupported?nftoken=${nftoken}`,
          tvUrl: `https://www.netflix.com/tv2?nftoken=${nftoken}`,
          cookies: cookies.map(c => `${c.name}=${c.value}`).join('; ')
        };
      }

      throw new Error('Không trích xuất được phiên đăng nhập từ trình duyệt!');

    } catch (err) {
      console.warn('⚠️ [BOT-PUPPETEER] Lỗi tự động đăng nhập:', err.message);
      throw err;
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }
}

module.exports = new PuppeteerLoginService();
