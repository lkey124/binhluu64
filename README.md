# 🎬 Netflix VIP Gateway & Zero-Knowledge License Manager

> Hệ thống Cổng Ủy Quyền & Phân Phối Mã Bản Quyền Netflix trung gian (Proxy Relay), tích hợp cơ chế bảo mật **Zero-Knowledge Blind Hashing**, két mã hóa **AES-256-GCM**, khả năng **thay nóng Key nguồn Lunakey** và **Admin Portal bí mật**.

---

## 🌟 1. Điểm nổi bật & Tính năng cốt lõi

- 🛡️ **Bảo mật Zero-Knowledge (Tuyệt đối không lưu Key dạng thô):**
  - Database **chỉ lưu trữ mã băm mật mã một chiều (HMAC SHA-256 + Salt)** của Key khách hàng.
  - Khi tạo Key, chuỗi Key thô chỉ hiển thị **1 lần duy nhất** cho Admin. Dù hacker có xâm nhập chiếm quyền server hay tải trọn database cũng **không thể đọc được Key gốc**.
- 🔐 **Két mã hóa Key Nguồn (Lunakey Vault):**
  - Key nguồn Lunakey được bảo vệ bằng mã hóa chuẩn quân sự **AES-256-GCM** với khóa bí mật 32-byte trong .env.
  - Khách hàng không bao giờ biết đến địa chỉ hay Key nguồn của 
etflix.lunakey.net.
- ⚡ **Thay nóng Key Nguồn (Hot-Swap) không gián đoạn:**
  - Khi Key nguồn Lunakey hết hạn hoặc cần đổi mới, Admin chỉ cần cập nhật trong Admin Dashboard.
  - **Tất cả khách hàng tiếp tục sử dụng bình thường** mà không cần phải cấp lại Key mới.
- 🕒 **Quản lý hạn dùng linh hoạt:**
  - Tự động tạo Key theo các gói: 7 ngày, 30 ngày (1 tháng), 90 ngày (3 tháng), 180 ngày, 365 ngày (1 năm).
  - Tùy chọn: *Tính hạn từ lúc tạo* hoặc *Tính hạn từ lần đầu khách nhập key*.
- 👑 **Cổng Admin bí mật (Master Key):**
  - Không có đường link hay nút đăng nhập Admin công khai.
  - Nhập trực tiếp **Master Key** vào ô tìm kiếm chính $\rightarrow$ Hệ thống tự động cấp phát JWT Token an toàn và mở **Admin Dashboard**.
- 🚫 **Chống Brute-Force & Dò mã (Rate Limiter & Timing-Safe):**
  - Giới hạn 20 lần thử trong 15 phút trên mỗi địa chỉ IP.
  - So sánh mã băm bằng hàm hằng định thời gian crypto.timingSafeEqual triệt tiêu nguy cơ tấn công kênh kề (Timing Attacks).

---

## 📐 2. Kiến trúc Hệ thống

`mermaid
flowchart TD
    subgraph Client_Side [Giao Diện Web Netflix Dark Style]
        UI[Khách hàng nhập Key: NFLX-VIP-XXXX]
        AdminUI[Admin Portal Dashboard]
    end

    subgraph Backend_Gateway [Node.js Gateway Server]
        WAF[Rate Limiter & WAF Protection]
        Auth[Engine Xác thực Blind Hash]
        Vault[Két Giải Mã Tức Thời AES-256-GCM]
        DB[(Database JSON Vault)]
    end

    subgraph External_Relay [Dịch Vụ Nguồn]
        Luna[netflix.lunakey.net]
        Netflix[Trình phát Netflix.com]
    end

    UI -->|Gửi Key| WAF
    WAF --> Auth
    Auth -->|So khớp chữ ký mật mã| DB
    Auth -->|Nếu là Master Key| AdminUI
    Auth -->|Key hợp lệ| Vault
    Vault -->|Gửi Source Key ngầm| Luna
    Luna -->|Trả về Direct Token URL| Vault
    Vault -->|Trả link chuyển hướng an toàn| UI
    UI -->|Click vào xem| Netflix
`

---

## 🚀 3. Hướng dẫn cài đặt & Khởi chạy

### Bước 1: Cài đặt thư viện
`ash
npm install
`

### Bước 2: Cấu hình file .env
Tạo file .env từ file .env.example và tùy chỉnh các thông số:
`nv
PORT=3000

# Khóa Master của Quản trị viên (Hãy đổi mã này khi triển khai thực tế)
ADMIN_MASTER_KEY=ADMIN_MASTER_SECRET_2026

# Khóa mã hóa 32-byte AES-256 cho Két bảo mật Lunakey
AES_SECRET_KEY=9f8e7d6c5b4a39281706f5e4d3c2b1a0e9d8c7b6a594837261504f3e2d1c0b9a

# Khóa ký Session JWT
JWT_SECRET=super_secret_jwt_session_token_key_2026_xyz

# URL API của dịch vụ Lunakey
LUNAKEY_API_URL=https://netflix.lunakey.net/api/get-link

# Key nguồn ban đầu (Có thể để demo hoặc dán key thật)
INITIAL_SOURCE_KEY=demo_lunakey_source_key
`

### Bước 3: Khởi động Server
`ash
# Chạy ở chế độ Production
npm start

# Hoặc chế độ Development (tự reload khi đổi code)
npm run dev
`

Mở trình duyệt truy cập: **http://localhost:3000**

---

## 📖 4. Hướng dẫn sử dụng

### 👤 Dành cho Khách Hàng (Client):
1. Nhận mã Key do bạn cấp (Ví dụ: NFLX-VIP-XXXX-XXXX-1234).
2. Dán mã Key vào ô nhập liệu trên trang chủ $\rightarrow$ Bấm **KÍCH HOẠT & VÀO XEM**.
3. Hệ thống hiển thị số ngày sử dụng còn lại + nút lớn **🍿 BẤM ĐỂ VÀO NETFLIX NGAY** để chuyển hướng thẳng vào phiên xem phim.

### 👑 Dành cho Quản Trị Viên (Admin):
1. Tại ô nhập Key ở trang chủ, nhập trực tiếp mã **ADMIN_MASTER_SECRET_2026** (hoặc mã bạn đã đổi trong .env).
2. Giao diện **TRUNG TÂM QUẢN TRỊ (Admin Portal)** sẽ tự động xuất hiện:
   - 📊 **Tổng quan:** Thống kê tổng số Key, Key đang hoạt động, Key hết hạn.
   - 🔑 **Tạo Key Mới:** Chọn số lượng (1 - 50 key), chọn thời hạn (7 ngày, 30 ngày, 90 ngày, 1 năm), ghi chú khách hàng.
   - 📋 **Danh sách Key:** Tìm kiếm, lọc theo trạng thái, gia hạn thêm +30 ngày, tạm khóa hoặc xóa Key.
   - ⚙️ **Key Nguồn Lunakey:** Cập nhật Key Lunakey mới bất kỳ lúc nào và bấm nút **"Test Thử Kết Nối"**.
   - 📜 **Nhật ký:** Theo dõi lịch sử IP và thời gian người dùng kích hoạt.

---

## 📁 5. Cấu trúc thư mục dự án

`	ext
netflix-license-gateway/
├── 📂 data/                    # Nơi lưu trữ Database băm mã hóa an toàn (vault.json)
├── 📂 public/                  # Giao diện Frontend (Netflix Dark Aesthetic)
│   ├── index.html              # Trang chủ và Modal Admin
│   ├── styles.css              # Hiệu ứng màu đỏ Netflix, Glassmorphism, Responsive
│   └── app.js                  # Xử lý Logic AJAX, xác thực, Admin Dashboard
├── 📂 src/
│   ├── 📂 config/
│   │   └── security.js         # Engine AES-256-GCM, HMAC SHA-256, Rate Limiter
│   ├── 📂 models/
│   │   └── db.js               # Database Manager không lưu raw plaintext
│   ├── 📂 routes/
│   │   └── api.js              # API Endpoints cho Client và Admin
│   ├── 📂 services/
│   │   └── lunakeyService.js   # Module Relay ngầm tới netflix.lunakey.net
│   └── server.js               # Express Server & Helmet Security Middleware
├── .env.example                # Mẫu cấu hình môi trường
├── package.json
└── README.md                   # Tài liệu hướng dẫn sử dụng
`

---

## 🛡️ 6. Cam kết bảo mật & Khuyến nghị vận hành

1. **Không đưa file .env lên Git/GitHub công khai.**
2. **Luôn thay đổi ADMIN_MASTER_KEY và AES_SECRET_KEY** trước khi chạy thực tế.
3. Khi tạo Key cho khách hàng, hãy lưu lại chuỗi Key ngay lập tức vì hệ thống áp dụng cơ chế băm 1 chiều và **không thể khôi phục lại chuỗi Key thô**.
