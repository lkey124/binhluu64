const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

// Chống crash toàn cục khi deploy trên Render / Cloud
process.on('uncaughtException', (err) => {
  console.warn('⚠️ [Uncaught Exception Safe Guard]:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.warn('⚠️ [Unhandled Rejection Safe Guard]:', reason);
});

const apiRoutes = require('./routes/api');
const db = require('./models/db');
const { scannerTrapMiddleware } = require('./config/security');

const app = express();
const PORT = process.env.PORT || 3000;


// 1. Tắt Header nhận diện Server Express & Bật Gzip/Brotli nén siêu tốc
app.disable('x-powered-by');
app.use(compression({ level: 6, threshold: 512 }));

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

app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));
app.use(cookieParser());

// 4. Phục vụ giao diện Frontend với bộ nhớ đệm HTTP ETag
app.use(express.static(path.join(__dirname, '../public'), {
  maxAge: '1h',
  etag: true
}));


// 5. Route riêng truy cập trang Admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// 6. Health Check Endpoint (Dành cho UptimeRobot / Ping 24/7)
app.get(['/health', '/api/health'], (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'Netflix VIP Gateway',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// 7. Gắn API Routes
app.use('/api', apiRoutes);

// 8. Xử lý lỗi toàn cục (Sanitized Error Handler - Không lộ Stacktrace)


// 9. Xử lý lỗi toàn cục (Sanitized Error Handler - Không lộ Stacktrace)
app.use((err, req, res, next) => {
  console.error('Lỗi máy chủ:', err.message);
  res.status(500).json({ success: false, error: 'Máy chủ đang bận. Vui lòng thử lại sau!' });
});

// 10. Khởi chạy Server (Tự động thích ứng Render / VPS / Localhost)
if (!process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('\n=====================================================');
    console.log('🚀 NETFLIX VIP GATEWAY ĐANG CHẠY TẠI: http://0.0.0.0:' + PORT);
    console.log('🛡️ BẢO MẬT: Zero-Knowledge Blind Hash + AES-256-GCM + Anti-Bruteforce');
    console.log('=====================================================\n');

    // 11. TỰ ĐỘNG GIỮ MÁY CHỦ THỨC 24/7 TRÊN RENDER (Self Keep-Alive)
    const appUrl = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL;
    if (appUrl) {
      console.log('⚡ [KEEP-ALIVE] Đã kích hoạt cơ chế tự động giữ máy chủ thức 24/7 tại:', appUrl);
      setInterval(async () => {
        try {
          const pingUrl = `${appUrl.replace(/\/$/, '')}/health`;
          await fetch(pingUrl);
          console.log(`💓 [KEEP-ALIVE PING] Giữ kết nối 24/7 thành công lúc: ${new Date().toLocaleTimeString()}`);
        } catch (pingErr) {
          console.warn('⚠️ [KEEP-ALIVE PING] Lỗi ping:', pingErr.message);
        }
      }, 10 * 60 * 1000); // Tự động ping mỗi 10 phút để Render không bao giờ ngủ
    }
  });
}

module.exports = app;


