# Hướng Dẫn Thiết Lập Môi Trường (Setup Guide)

Tài liệu này hướng dẫn cài đặt và cấu hình toàn bộ các dịch vụ phụ trợ để vận hành backend NestJS ổn định.

---

## 🔑 1. Google Cloud Platform Credentials

Để sử dụng Google Cloud Vision API và Document AI, bạn cần cấu hình tài khoản dịch vụ (Service Account):

1. Truy cập [Google Cloud Console](https://console.cloud.google.com/).
2. Chọn **IAM & Admin** > **Service Accounts** > Chọn **Create Service Account**.
3. Cấp các vai trò (Roles) tối thiểu sau:
   - **Document AI API User**
   - **Cloud Vision API User**
4. Chuyển sang tab **Keys** > **Add Key** > **Create new key** (chọn định dạng JSON).
5. Lưu file tải về vào một thư mục bảo mật trong máy (ví dụ: `C:\gcp-keys\table-extractor-credentials.json`).
6. Thiết lập biến môi trường hệ thống:
   - **Windows (CMD)**:
     ```cmd
     set GOOGLE_APPLICATION_CREDENTIALS=C:\gcp-keys\table-extractor-credentials.json
     ```
   - **Windows (PowerShell)**:
     ```powershell
     $env:GOOGLE_APPLICATION_CREDENTIALS="C:\gcp-keys\table-extractor-credentials.json"
     ```
   - **Linux / macOS**:
     ```bash
     export GOOGLE_APPLICATION_CREDENTIALS="/path/to/table-extractor-credentials.json"
     ```

---

## 🗄️ 2. Cài Đặt Redis

Dự án sử dụng Redis làm Broker quản lý hàng đợi và cache trạng thái công việc của BullMQ.

### Cách 1: Sử dụng Docker (Khuyên Dùng)
Chạy lệnh sau để tạo và khởi động container Redis:
```bash
docker run -d \
  --name table-extractor-redis \
  -p 6379:6379 \
  --restart always \
  redis:7-alpine
```

### Cách 2: Cài đặt trực tiếp trên Windows (Native)
1. Tải bản cài đặt Redis cho Windows từ [GitHub Redis-Windows](https://github.com/tporadowski/redis/releases).
2. Chạy file MSI cài đặt hoặc giải nén thư mục zip.
3. Chạy `redis-server.exe` để khởi chạy máy chủ.

---

## 📝 3. LibreOffice (Hỗ Trợ Chuyển Đổi Word DOCX)

Hệ thống sử dụng LibreOffice thông qua CLI để chuyển đổi tệp Word (.doc, .docx) thành PDF trước khi chuyển qua Google Document AI.

### Thiết lập trên Windows:
1. Tải và cài đặt LibreOffice từ trang chủ [LibreOffice Download](https://www.libreoffice.org/download/download/).
2. Thêm thư mục chứa file thi hành (`soffice.exe`) vào biến môi trường **PATH** của hệ thống (mặc định là `C:\Program Files\LibreOffice\program`).
3. Khởi động lại terminal để cập nhật PATH. Kiểm tra xem lệnh sau có chạy được không:
   ```cmd
   soffice --version
   ```

### Thiết lập trên Linux (Ubuntu/Debian):
```bash
sudo apt update
sudo apt install libreoffice -y
```

---

## 📝 4. Cấu Hình Tệp `.env`

Tạo tệp `.env` tại thư mục gốc backend (`table_extract/.env`) với nội dung tham khảo sau:

```env
PORT=3000

# Cấu hình kết nối Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# GCP Project (Document AI)
GOOGLE_PROJECT_ID=table-extractor-12345
GOOGLE_LOCATION=us
GOOGLE_PROCESSOR_ID=8c9b88999888777a

# Cấu hình giới hạn hiệu năng & hàng đợi
OCR_MAX_CONCURRENCY=5             # Giới hạn số luồng xử lý trang đồng thời của 1 tệp tin
OCR_MAX_RETRIES=3                 # Số lần thử lại nếu Google API báo lỗi tạm thời
GLOBAL_CONCURRENCY_LIMIT=10        # Giới hạn request song song toàn hệ thống để bảo vệ quota
```
