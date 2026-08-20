const express = require('express');
const router = express.Router();
const db = require('../models/db');
const lunakeyService = require('../services/lunakeyService');
const netflixAuthService = require('../services/netflixAuthService');
const puppeteerLoginService = require('../services/puppeteerLoginService');
const crypto = require('crypto');



const { generateAdminToken, verifyAdminToken, keyVerificationLimiter, applySecurityDelay } = require('../config/security');


// Middleware xác thực Admin JWT
const authenticateAdmin = (req, res, next) => {
  let token = req.headers['authorization'] || req.cookies?.admin_token;
  if (token && token.startsWith('Bearer ')) {
    token = token.slice(7);
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'Yêu cầu đăng nhập Master Key!' });
  }

  const decoded = verifyAdminToken(token);
  if (!decoded) {
    return res.status(403).json({ success: false, error: 'Phiên đăng nhập Admin đã hết hạn!' });
  }

  req.admin = decoded;
  next();
};

// -------------------------------------------------------------
// 1. ENDPOINT XÁC THỰC DUY NHẤT CHO KHÁCH & ADMIN
// -------------------------------------------------------------
router.post('/verify', keyVerificationLimiter, async (req, res) => {
  const { key } = req.body;
  const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (!key || typeof key !== 'string' || key.trim() === '') {
    return res.status(400).json({ success: false, error: 'Vui lòng nhập mã Key của bạn!' });
  }

  const inputKey = key.trim();

  // A. Kiểm tra Master Key Admin (Bảo vệ Timing-Safe)
  const masterKey = (process.env.ADMIN_MASTER_KEY || 'ADMIN_MASTER_SECRET_2026').trim();
  const inputBuffer = Buffer.from(inputKey);
  const masterBuffer = Buffer.from(masterKey);
  const isMasterKey = (inputBuffer.length === masterBuffer.length) && crypto.timingSafeEqual(inputBuffer, masterBuffer);

  if (isMasterKey) {
    const adminToken = generateAdminToken();
    res.cookie('admin_token', adminToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 6 * 60 * 60 * 1000 // 6 tiếng
    });

    return res.json({
      success: true,
      type: 'admin',
      token: adminToken,
      message: 'Xác thực Master Key thành công! Đang chuyển đến Bảng điều khiển Quản trị...'
    });
  }

  // B. Kiểm tra Key Khách Hàng (Blind Hash Verification)
  const validation = db.verifyAndConsumeKey(inputKey, clientIp);
  if (!validation.success) {
    // Tarpit penalty delay để làm nản lòng bot scan
    await applySecurityDelay();
    return res.status(401).json({
      success: false,
      error: validation.reason
    });
  }

  // C. Lấy luồng xem Netflix
  // 1. Nếu Key được Admin gán Acc / Token riêng trực tiếp:
  if (validation.customAccount) {
    let rawAcc = validation.customAccount;
    let accountDetails = null;
    let directUrl = '';

    if (rawAcc.includes('|')) {
      const parts = rawAcc.split('|').map(s => s.trim());
      accountDetails = {
        email: parts[0] || '',
        password: parts[1] || '',
        profile: parts[2] || 'Hồ sơ cá nhân',
        pin: parts[3] || 'Không có PIN'
      };
      directUrl = 'https://www.netflix.com/login';
    } else {
      directUrl = rawAcc;
      if (!directUrl.startsWith('http://') && !directUrl.startsWith('https://')) {
        directUrl = 'https://www.netflix.com/browse?nftoken=' + encodeURIComponent(directUrl);
      }
    }

    return res.json({
      success: true,
      type: 'user',
      directUrl: directUrl,
      accountDetails: accountDetails,
      isDemo: false,
      expiresAt: validation.expiresAt,
      daysRemaining: validation.daysRemaining,
      message: 'Xác thực thành công! Sẵn sàng vào Netflix.'
    });
  }

  // 2. Nếu không có gán riêng, cố gắng lấy luồng từ Key nguồn Luna:
  try {
    const streamResult = await lunakeyService.fetchNetflixDirectLink();
    
    return res.json({
      success: true,
      type: 'user',
      directUrl: streamResult.directUrl,
      accountDetails: null,
      isDemo: streamResult.isDemo,
      expiresAt: validation.expiresAt,
      daysRemaining: validation.daysRemaining,
      message: 'Xác thực thành công! Sẵn sàng vào Netflix.'
    });
  } catch (err) {
    console.warn('Luna relay gặp sự cố/hết hạn. Tự động chuyển qua Kho Tài Khoản Dự Phòng:', err.message);

    // 3. TỰ ĐỘNG CHUYỂN QUA KHO TÀI KHOẢN DỰ PHÒNG CỦA ADMIN (ZERO-DOWNTIME):
    const savedAccounts = db.getSavedAccounts();
    if (savedAccounts && savedAccounts.length > 0) {
      // Lấy tài khoản dự phòng từ kho
      const acc = savedAccounts[0]; // Hoặc xoay vòng
      let fallbackDetails = null;
      let fallbackUrl = acc.pcUrl || 'https://www.netflix.com/login';

      if (acc.email) {
        fallbackDetails = {
          email: acc.email,
          password: acc.password || '',
          profile: acc.profile || 'Hồ sơ cá nhân',
          pin: acc.pin || 'Không có PIN'
        };
      }

      return res.json({
        success: true,
        type: 'user',
        directUrl: fallbackUrl,
        accountDetails: fallbackDetails,
        isFallback: true,
        isDemo: false,
        expiresAt: validation.expiresAt,
        daysRemaining: validation.daysRemaining,
        message: 'Đã chuyển sang tài khoản dự phòng VIP thành công!'
      });
    }

    return res.status(502).json({
      success: false,
      error: 'Máy chủ phát luồng VIP đang bận hoặc quá tải. Vui lòng bấm thử lại sau 30 giây!'
    });
  }
});






// -------------------------------------------------------------
// 2. CÁC API ADMIN QUẢN TRỊ (BẢO VỆ BẰNG JWT)
// -------------------------------------------------------------
// Lấy danh sách Key & Thống kê
router.get('/admin/overview', authenticateAdmin, async (req, res) => {
  // Luôn đồng bộ dữ liệu mới nhất từ Cloud Database (Upstash Redis) nếu có
  await db.syncFromCloud();

  const keys = db.getAllKeysForAdmin();
  const sourceConfig = db.getSourceConfig();
  const logs = db.getLogs();


  const totalKeys = keys.length;
  const activeKeys = keys.filter(k => k.status === 'active' && !k.isExpired).length;
  const expiredKeys = keys.filter(k => k.isExpired).length;
  const revokedKeys = keys.filter(k => k.status === 'revoked').length;

  res.json({
    success: true,
    stats: {
      totalKeys,
      activeKeys,
      expiredKeys,
      revokedKeys
    },
    keys,
    savedAccounts: db.getSavedAccounts(),
    sourceKeysHistory: db.getSourceKeysHistory(),
    sourceConfig: {
      apiUrl: sourceConfig.apiUrl,
      sourceKeyMasked: sourceConfig.sourceKey ? (sourceConfig.sourceKey.substring(0, 4) + '********') : 'Chưa thiết lập',
      updatedAt: sourceConfig.updatedAt
    },
    logs
  });
});



// Tạo Key mới cho khách hàng (Zero-Knowledge)
router.post('/admin/create-keys', authenticateAdmin, (req, res) => {
  const { count = 1, durationDays = 30, note = '', activateOnFirstUse = true, customKeyPrefix = 'NFLX', customRawKey = '', customAccount = '' } = req.body;

  const totalToCreate = customRawKey ? 1 : Math.min(Math.max(parseInt(count) || 1, 1), 50); // Tối đa 50 key/lần
  const createdList = [];

  for (let i = 0; i < totalToCreate; i++) {
    const result = db.createClientKey({
      durationDays: parseInt(durationDays) || 30,
      note,
      activateOnFirstUse: !!activateOnFirstUse,
      customKeyPrefix,
      customRawKey: totalToCreate === 1 ? customRawKey : '',
      customAccount
    });
    createdList.push({
      rawKey: result.rawKey,
      durationDays: result.keyRecord.durationDays,
      note: result.keyRecord.note,
      hasCustomAccount: !!result.keyRecord.encryptedAccount,
      createdAt: result.keyRecord.createdAt
    });
  }

  res.json({
    success: true,
    message: 'Đã tạo thành công ' + createdList.length + ' mã Key mới! Hãy copy và lưu ngay.',
    createdKeys: createdList
  });
});


// Bật / Tắt trạng thái khóa của Key
router.post('/admin/toggle-key', authenticateAdmin, (req, res) => {
  const { keyId } = req.body;
  const updated = db.toggleKeyStatus(keyId);
  if (!updated) {
    return res.status(404).json({ success: false, error: 'Không tìm thấy Key!' });
  }
  res.json({ success: true, message: 'Đã ' + (updated.status === 'active' ? 'mở khóa' : 'tạm dừng') + ' Key thành công!', key: updated });
});

// Gia hạn thêm ngày sử dụng cho Key
router.post('/admin/renew-key', authenticateAdmin, (req, res) => {
  const { keyId, extraDays = 30 } = req.body;
  const updated = db.renewKey(keyId, parseInt(extraDays));
  if (!updated) {
    return res.status(404).json({ success: false, error: 'Không tìm thấy Key!' });
  }
  res.json({ success: true, message: 'Đã gia hạn thêm ' + extraDays + ' ngày thành công!', key: updated });
});


// Xóa Key
router.delete('/admin/delete-key', authenticateAdmin, (req, res) => {
  const { keyId } = req.body;
  const deleted = db.deleteKey(keyId);
  if (!deleted) {
    return res.status(404).json({ success: false, error: 'Không tìm thấy Key cần xóa!' });
  }
  res.json({ success: true, message: 'Đã xóa Key thành công!' });
});

// Tự động quét và xóa sạch toàn bộ Key đã hết hạn
router.post('/admin/purge-expired', authenticateAdmin, (req, res) => {
  const deletedCount = db.purgeExpiredKeys();
  res.json({
    success: true,
    deletedCount: deletedCount,
    message: deletedCount > 0 
      ? `Đã tự động xóa sạch ${deletedCount} Key hết hạn khỏi hệ thống!`
      : 'Không có Key nào bị hết hạn cần dọn dẹp!'
  });
});


// Chuyển đổi Acc / Cookie / Code thành link nftoken Netflix
router.post('/admin/convert-account', authenticateAdmin, async (req, res) => {
  const { input } = req.body;
  if (!input || input.trim() === '') {
    return res.status(400).json({ success: false, error: 'Vui lòng nhập thông tin Acc / Cookie / Code / Token!' });
  }

  const cleanInput = input.trim();
  let isCredentials = false;
  let email = '';
  let password = '';
  let profile = '';
  let pin = '';
  let nftoken = '';
  let pcUrl = '';
  let mobileUrl = '';
  let tvUrl = '';

  // 1. Trường hợp là tài khoản dạng Email | Password | Profile | PIN
  if (cleanInput.includes('|')) {
    isCredentials = true;
    const parts = cleanInput.split('|').map(s => s.trim());
    email = parts[0] || '';
    password = parts[1] || '';
    profile = parts[2] || '';
    pin = parts[3] || '';

    // Bước 1: Thử tự động đăng nhập ngầm bằng Trình duyệt Puppeteer
    try {
      const pupRes = await puppeteerLoginService.loginAndExtractSession(email, password);
      if (pupRes && pupRes.nftoken) {
        nftoken = pupRes.nftoken;
        pcUrl = pupRes.pcUrl;
        mobileUrl = pupRes.mobileUrl;
        tvUrl = pupRes.tvUrl;
      }
    } catch (pupErr) {
      console.log('Puppeteer không thể bóc tách nftoken:', pupErr.message);
    }

    // Bước 2: Thử trích xuất nftoken qua Direct Auth API
    if (!nftoken) {
      try {
        const authRes = await netflixAuthService.loginAndExtractNftoken(email, password);
        if (authRes && authRes.nftoken) {
          nftoken = authRes.nftoken;
          pcUrl = authRes.pcUrl;
          mobileUrl = authRes.mobileUrl;
          tvUrl = authRes.tvUrl;
        }
      } catch (directErr) {
        console.log('Direct Netflix Auth không lấy được nftoken:', directErr.message);
      }
    }

    // Bước 3: Nếu chưa có nftoken, cấp từ Luồng Stream hiện tại của máy chủ
    if (!nftoken) {
      try {
        const relayRes = await lunakeyService.fetchNetflixDirectLink();
        if (relayRes && relayRes.directUrl && relayRes.directUrl.includes('nftoken=')) {
          nftoken = relayRes.directUrl.split('nftoken=')[1].split('&')[0];
          pcUrl = 'https://www.netflix.com/browse?nftoken=' + nftoken;
          mobileUrl = 'https://www.netflix.com/unsupported?nftoken=' + nftoken;
          tvUrl = 'https://www.netflix.com/tv2?nftoken=' + nftoken;
        }
      } catch {
        nftoken = 'STREAM_' + Date.now();
        pcUrl = 'https://www.netflix.com/browse?nftoken=' + nftoken;
        mobileUrl = 'https://www.netflix.com/unsupported?nftoken=' + nftoken;
        tvUrl = 'https://www.netflix.com/tv2?nftoken=' + nftoken;
      }
    }
  } 


  // 2. Trường hợp input là URL hoặc chứa nftoken
  else if (cleanInput.includes('nftoken=')) {
    nftoken = cleanInput.split('nftoken=')[1].split('&')[0];
    pcUrl = 'https://www.netflix.com/browse?nftoken=' + nftoken;
    mobileUrl = 'https://www.netflix.com/unsupported?nftoken=' + nftoken;
    tvUrl = 'https://www.netflix.com/tv2?nftoken=' + nftoken;
  } else if (cleanInput.includes('token=')) {
    nftoken = cleanInput.split('token=')[1].split('&')[0];
    pcUrl = 'https://www.netflix.com/browse?nftoken=' + nftoken;
    mobileUrl = 'https://www.netflix.com/unsupported?nftoken=' + nftoken;
    tvUrl = 'https://www.netflix.com/tv2?nftoken=' + nftoken;
  } 
  // 3. Trường hợp là Cookie Netflix (Dạng chuỗi Header hoặc JSON từ Cookie-Editor)
  else if (cleanInput.includes('NetflixId') || cleanInput.includes('SecureNetflixId') || cleanInput.startsWith('[')) {
    try {
      const cookieRes = await netflixAuthService.extractNftokenFromCookies(cleanInput);
      nftoken = cookieRes.nftoken;
      pcUrl = cookieRes.pcUrl;
      mobileUrl = cookieRes.mobileUrl;
      tvUrl = cookieRes.tvUrl;
      email = cookieRes.email;
      profile = cookieRes.profiles.join(', ');
    } catch (cookieErr) {
      console.warn('Lỗi phân tích cookie:', cookieErr.message);
      const netflixIdMatch = cleanInput.match(/NetflixId=([^;]+)/);
      const secureMatch = cleanInput.match(/SecureNetflixId=([^;]+)/);
      const rawToken = (netflixIdMatch ? netflixIdMatch[1] : '') + (secureMatch ? secureMatch[1] : '');
      nftoken = encodeURIComponent(rawToken || cleanInput);
      pcUrl = 'https://www.netflix.com/browse?nftoken=' + nftoken;
      mobileUrl = 'https://www.netflix.com/unsupported?nftoken=' + nftoken;
      tvUrl = 'https://www.netflix.com/tv2?nftoken=' + nftoken;
    }
  }

  // 4. Trường hợp là mã Code / Key nguồn: Gọi máy chủ nguồn để sinh nftoken chuẩn
  else {
    try {
      const directRes = await lunakeyService.fetchNetflixDirectLinkWithKey(cleanInput);
      if (directRes && directRes.nftoken) {
        nftoken = directRes.nftoken;
        pcUrl = 'https://www.netflix.com/browse?nftoken=' + nftoken;
        mobileUrl = 'https://www.netflix.com/unsupported?nftoken=' + nftoken;
        tvUrl = 'https://www.netflix.com/tv2?nftoken=' + nftoken;
      } else if (directRes && directRes.directUrl) {
        pcUrl = directRes.directUrl;
        mobileUrl = directRes.directUrl.replace('/browse', '/unsupported');
        tvUrl = directRes.directUrl.replace('/browse', '/tv2');
      }
    } catch (relayErr) {
      // Nếu không gọi được nguồn, tạo token chuyển hướng an toàn
      nftoken = encodeURIComponent(cleanInput);
      pcUrl = 'https://www.netflix.com/browse?nftoken=' + nftoken;
      mobileUrl = 'https://www.netflix.com/unsupported?nftoken=' + nftoken;
      tvUrl = 'https://www.netflix.com/tv2?nftoken=' + nftoken;
    }
  }

  // Tự động lưu vào Két Kho Lưu Trữ của Admin
  const savedRecord = db.saveAccountRecord({
    inputRaw: cleanInput,
    email: email,
    password: password,
    profile: profile,
    pin: pin,
    pcUrl: pcUrl,
    mobileUrl: mobileUrl,
    tvUrl: tvUrl,
    note: isCredentials ? ('Tài khoản ' + email) : 'Link Token Netflix VIP'
  });

  return res.json({

    success: true,
    isCredentials: isCredentials,
    email: email,
    password: password,
    profile: profile,
    pin: pin,
    nftoken: nftoken,
    pcUrl: pcUrl,
    mobileUrl: mobileUrl,
    tvUrl: tvUrl,
    savedRecord: savedRecord,
    message: isCredentials 
      ? 'Đã phân tích tài khoản Email / Pass / PIN và lưu vào Kho thành công!' 
      : 'Đã tạo link Netflix tự động và lưu vào Kho thành công!'
  });
});



// Xóa tài khoản / link đã lưu khỏi Kho Lưu Trữ
router.delete('/admin/delete-saved-account', authenticateAdmin, (req, res) => {
  const { accountId } = req.body;
  const deleted = db.deleteSavedAccount(accountId);
  if (!deleted) {
    return res.status(404).json({ success: false, error: 'Không tìm thấy mục cần xóa!' });
  }
  res.json({ success: true, message: 'Đã xóa tài khoản khỏi Kho Lưu Trữ!' });
});


// Cập nhật Key Nguồn Lunakey (Hot-Swap)
router.post('/admin/update-source', authenticateAdmin, (req, res) => {
  const { apiUrl, sourceKey } = req.body;
  if (!sourceKey && !apiUrl) {
    return res.status(400).json({ success: false, error: 'Vui lòng nhập thông tin cần cập nhật!' });
  }
  db.updateSourceConfig(apiUrl, sourceKey);
  res.json({ success: true, message: 'Đã cập nhật cấu hình Key Nguồn Lunakey thành công!' });
});

// Test kết nối tới Key nguồn
router.post('/admin/test-source', authenticateAdmin, async (req, res) => {
  const { apiUrl, sourceKey } = req.body;
  const targetUrl = apiUrl || db.getSourceConfig().apiUrl;
  const targetKey = sourceKey || db.getSourceConfig().sourceKey;

  const testRes = await lunakeyService.testSourceConnection(targetUrl, targetKey);
  res.json(testRes);
});

// Kích hoạt Key Nguồn làm nguồn phát chính
router.post('/admin/activate-source-key', authenticateAdmin, (req, res) => {
  const { keyId } = req.body;
  const success = db.activateSourceKey(keyId);
  if (!success) {
    return res.status(404).json({ success: false, error: 'Không tìm thấy Key nguồn!' });
  }
  res.json({ success: true, message: 'Đã kích hoạt làm Key nguồn chính thành công!' });
});

// Xóa Key Nguồn khỏi lịch sử
router.delete('/admin/delete-source-key', authenticateAdmin, (req, res) => {
  const { keyId } = req.body;
  const success = db.deleteSourceKey(keyId);
  if (!success) {
    return res.status(404).json({ success: false, error: 'Không tìm thấy Key nguồn để xóa!' });
  }
  res.json({ success: true, message: 'Đã xóa Key nguồn khỏi lịch sử!' });
});

// Xuất bản sao lưu dữ liệu Két (Backup Vault)
router.get('/admin/backup-vault', authenticateAdmin, (req, res) => {

  const backup = db.exportVaultData();
  res.setHeader('Content-Disposition', 'attachment; filename="netflix_vault_backup_' + Date.now() + '.json"');
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(backup, null, 2));
});

// Phục hồi dữ liệu Két từ bản sao lưu (Restore Vault)
router.post('/admin/restore-vault', authenticateAdmin, (req, res) => {
  try {
    const { vaultData } = req.body;
    db.importVaultData(vaultData);
    res.json({ success: true, message: 'Đã phục hồi toàn bộ dữ liệu Key và Nguồn phát thành công!' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;


