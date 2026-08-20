const express = require('express');
const router = express.Router();
const db = require('../models/db');
const lunakeyService = require('../services/lunakeyService');
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
    let directUrl = validation.customAccount;
    if (!directUrl.startsWith('http://') && !directUrl.startsWith('https://')) {
      directUrl = 'https://www.netflix.com/browse?nftoken=' + encodeURIComponent(directUrl);
    }
    return res.json({
      success: true,
      type: 'user',
      directUrl: directUrl,
      isDemo: false,
      expiresAt: validation.expiresAt,
      daysRemaining: validation.daysRemaining,
      message: 'Xác thực thành công! Sẵn sàng vào Netflix.'
    });
  }

  // 2. Nếu không có gán riêng, tự động lấy luồng từ Két nguồn chung:
  try {
    const streamResult = await lunakeyService.fetchNetflixDirectLink();
    
    return res.json({
      success: true,
      type: 'user',
      directUrl: streamResult.directUrl,
      isDemo: streamResult.isDemo,
      expiresAt: validation.expiresAt,
      daysRemaining: validation.daysRemaining,
      message: 'Xác thực thành công! Sẵn sàng vào Netflix.'
    });
  } catch (err) {
    console.error('Relay Error:', err.message);
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
router.get('/admin/overview', authenticateAdmin, (req, res) => {
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
    return res.status(404).json({ success: false, error: 'Không tìm thấy Key để xóa!' });
  }
  res.json({ success: true, message: 'Đã xóa Key khỏi hệ thống!' });
});

// Chuyển đổi Acc / Cookie / Code thành link nftoken Netflix
router.post('/admin/convert-account', authenticateAdmin, async (req, res) => {
  const { input } = req.body;
  if (!input || input.trim() === '') {
    return res.status(400).json({ success: false, error: 'Vui lòng nhập thông tin Acc / Cookie / Code / Token!' });
  }

  const cleanInput = input.trim();
  let nftoken = '';

  // 1. Trường hợp input là URL hoặc chứa nftoken
  if (cleanInput.includes('nftoken=')) {
    nftoken = cleanInput.split('nftoken=')[1].split('&')[0];
  } else if (cleanInput.includes('token=')) {
    nftoken = cleanInput.split('token=')[1].split('&')[0];
  } 
  // 2. Trường hợp là Cookie Netflix
  else if (cleanInput.includes('NetflixId=') || cleanInput.includes('SecureNetflixId=')) {
    const netflixIdMatch = cleanInput.match(/NetflixId=([^;]+)/);
    const secureMatch = cleanInput.match(/SecureNetflixId=([^;]+)/);
    const rawToken = (netflixIdMatch ? netflixIdMatch[1] : '') + (secureMatch ? secureMatch[1] : '');
    nftoken = encodeURIComponent(rawToken || cleanInput);
  }
  // 3. Trường hợp là mã Code / Key nguồn
  else if (/^[A-Za-z0-9_-]{4,32}$/.test(cleanInput)) {
    try {
      const relayRes = await lunakeyService.fetchNetflixDirectLink();
      if (relayRes && relayRes.directUrl && relayRes.directUrl.includes('nftoken=')) {
        nftoken = relayRes.directUrl.split('nftoken=')[1].split('&')[0];
      } else {
        nftoken = encodeURIComponent(cleanInput);
      }
    } catch {
      nftoken = encodeURIComponent(cleanInput);
    }
  } else {
    nftoken = encodeURIComponent(cleanInput);
  }

  const pcUrl = 'https://www.netflix.com/browse?nftoken=' + nftoken;
  const mobileUrl = 'https://www.netflix.com/unsupported?nftoken=' + nftoken;
  const tvUrl = 'https://www.netflix.com/tv2?nftoken=' + nftoken;

  return res.json({
    success: true,
    nftoken: nftoken,
    pcUrl: pcUrl,
    mobileUrl: mobileUrl,
    tvUrl: tvUrl,
    message: 'Đã tạo bộ link Netflix thành công!'
  });
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

module.exports = router;
