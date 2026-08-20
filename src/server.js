const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

const apiRoutes = require('./routes/api');
const db = require('./models/db');
const { scannerTrapMiddleware } = require('./config/security');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Tắt Header nhận diện Server Express (Chống Fingerprinting)
app.disable('x-powered-by');

// 2. Bảo mật HTTP Headers
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  frameguard: { action: 'sameorigin' },
  dnsPrefetchControl: { allow: false },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }
}));

// 3. Honeypot & Scanner Trap Middleware (Chặn bot quét cổng)
app.use(scannerTrapMiddleware);

app.use(express.json({ limit: '50kb' })); // Giới hạn kích thước payload
app.use(express.urlencoded({ extended: true, limit: '50kb' }));
app.use(cookieParser());

// 4. Phục vụ giao diện Frontend
app.use(express.static(path.join(__dirname, '../public')));

// 5. Route riêng truy cập trang Admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// 6. Gắn API Routes
app.use('/api', apiRoutes);

// 7. Khởi tạo dữ liệu mẫu nếu cần
const existingKeys = db.getAllKeysForAdmin();
if (existingKeys.length === 0) {
  const sample = db.createClientKey({
    durationDays: 30,
    note: 'Key trải nghiệm thử nghiệm ban đầu (30 ngày)',
    activateOnFirstUse: true,
    customKeyPrefix: 'NFLX-VIP'
  });
  console.log('⚡ Key mẫu ban đầu:', sample.rawKey);
}

// 8. Xử lý lỗi toàn cục (Sanitized Error Handler - Không lộ Stacktrace)
app.use((err, req, res, next) => {
  console.error('Lỗi máy chủ:', err.message);
  res.status(500).json({ success: false, error: 'Máy chủ đang bận. Vui lòng thử lại sau!' });
});

// 9. Khởi chạy Local Server (Nếu không phải Serverless Vercel)
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log('\n=====================================================');
    console.log('🚀 NETFLIX VIP GATEWAY ĐANG CHẠY TẠI: http://localhost:' + PORT);
    console.log('🛡️ BẢO MẬT: Zero-Knowledge Blind Hash + AES-256-GCM + Anti-Bruteforce');
    console.log('=====================================================\n');
  });

}

module.exports = app;
