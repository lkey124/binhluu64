const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

// Lấy Secret từ biến môi trường (Ưu tiên Vercel Env)
const AES_SECRET = process.env.AES_SECRET_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const JWT_SECRET = process.env.JWT_SECRET || 'jwt_default_secret_key_change_me_super_secret_2026';

// Chuẩn hóa Key AES thành 32 bytes Buffer
const getAesKeyBuffer = () => {
  return crypto.createHash('sha256').update(AES_SECRET).digest();
};

/**
 * 1. Mã hóa AES-256-GCM (Dùng cho Key nguồn Stream)
 */
function encryptText(plaintext) {
  if (!plaintext) return null;
  const iv = crypto.randomBytes(12); // GCM chuẩn dùng 12 bytes IV
  const key = getAesKeyBuffer();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return {
    iv: iv.toString('hex'),
    encryptedData: encrypted,
    authTag: authTag
  };
}

/**
 * 2. Giải mã AES-256-GCM
 */
function decryptText(encryptedObj) {
  if (!encryptedObj || !encryptedObj.encryptedData) return null;
  try {
    const key = getAesKeyBuffer();
    const iv = Buffer.from(encryptedObj.iv, 'hex');
    const authTag = Buffer.from(encryptedObj.authTag, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedObj.encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    return null;
  }
}

/**
 * 3. Băm mật mã một chiều (One-Way Salted HMAC-SHA256 - Chuẩn Ngân Hàng cho Key Khách)
 * Không thể đọc ngược hay khôi phục lại Key gốc từ chuỗi băm này!
 */
function hashClientKey(rawKey, salt) {
  const finalSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHmac('sha256', finalSalt).update(rawKey.trim()).digest('hex');
  return {
    hash: hash,
    salt: finalSalt
  };
}

/**
 * 4. So sánh Key khách nhập với Hash trong DB bằng hằng định thời gian (Chống Timing Attack)
 */
function verifyClientKeyHash(inputKey, storedHash, storedSalt) {
  try {
    const computedHash = crypto.createHmac('sha256', storedSalt).update(inputKey.trim()).digest('hex');
    const computedBuffer = Buffer.from(computedHash, 'hex');
    const storedBuffer = Buffer.from(storedHash, 'hex');

    if (computedBuffer.length !== storedBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(computedBuffer, storedBuffer);
  } catch {
    return false;
  }
}

/**
 * 5. Chống Brute-force tốc độ cao: Tarpit Delay (Trì hoãn nhân tạo khi nhập sai)
 * Khi hacker dùng bot thử hàng nghìn key, mỗi request sẽ bị nghẽn lại 800ms - 1200ms
 */
async function applySecurityDelay() {
  const jitter = Math.floor(Math.random() * 400); // 0-400ms ngẫu nhiên
  const delayTime = 800 + jitter; // Tổng 800ms - 1200ms
  return new Promise(resolve => setTimeout(resolve, delayTime));
}

/**
 * 6. Tạo JWT Token cho Admin Session
 */
function generateAdminToken() {
  return jwt.sign({ role: 'admin', authAt: Date.now() }, JWT_SECRET, { expiresIn: '6h' });
}

/**
 * 7. Xác thực JWT Token Admin
 */
function verifyAdminToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/**
 * 8. Rate Limiter chống dò mã Brute-force cho Client
 * Tối đa 10 lần thử trong 15 phút trên mỗi IP
 */
const keyVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Hệ thống phát hiện quá nhiều lượt kích hoạt không hợp lệ. Vui lòng đợi 15 phút!'
  }
});

/**
 * 9. Rate Limiter cho Admin Login (Chống dò Master Key)
 * Tối đa 5 lần thử trong 15 phút
 */
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Đã thử đăng nhập Admin quá nhiều lần. IP của bạn đã bị tạm khóa 15 phút để bảo vệ hệ thống!'
  }
});

/**
 * 10. Honeypot & Scanner Defense (Chặn bot dò quét lỗ hổng)
 */
function scannerTrapMiddleware(req, res, next) {
  const suspiciousPaths = [
    '/.env', '/.git', '/wp-admin', '/wp-login', '/phpmyadmin',
    '/actuator', '/config.json', '/eval', '/shell', '/api/v1/pods',
    '/admin.php', '/dump', '/backup.sql'
  ];

  const requestUrl = req.originalUrl.toLowerCase();
  for (const trap of suspiciousPaths) {
    if (requestUrl.includes(trap)) {
      console.warn(`[SECURITY ALERT] Phát hiện Bot quét lỗ hổng từ IP ${req.ip}: ${req.originalUrl}`);
      return res.status(404).send('Not Found');
    }
  }
  next();
}


module.exports = {
  encryptText,
  decryptText,
  hashClientKey,
  verifyClientKeyHash,
  applySecurityDelay,
  generateAdminToken,
  verifyAdminToken,
  keyVerificationLimiter,
  adminLoginLimiter,
  scannerTrapMiddleware
};
