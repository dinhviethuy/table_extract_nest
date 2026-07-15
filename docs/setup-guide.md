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

## 📄 3. Cài Đặt Poppler PDF Tools

Hệ thống xử lý PDF page-by-page thông qua các công cụ `pdfinfo` và `pdftoppm` của Poppler.

1. Tải bản Poppler cho Windows.
2. Giải nén và đặt các tệp thực thi `pdfinfo.exe` và `pdftoppm.exe` vào đúng thư mục sau trong dự án:
   `Release-26.02.0-0/poppler-26.02.0/Library/bin/`
3. Đảm bảo các tệp tin này có quyền thực thi và được gọi đúng bởi backend NestJS.

---

## 📝 4. LibreOffice (Hỗ Trợ Chuyển Đổi Word DOCX)

Hệ thống sử dụng LibreOffice thông qua CLI để chuyển đổi tệp Word (.doc, .docx) thành PDF trước khi chuyển qua xử lý OCR hoặc Document AI.

### Thiết lập trên Windows:
1. Tải và cài đặt LibreOffice từ trang chủ [LibreOffice Download](https://www.libreoffice.org/download/download/).
2. Đảm bảo thư mục chứa file thi hành (`soffice.exe`) được đặt ở đường dẫn cài đặt mặc định:
   `C:\Program Files\LibreOffice\program\soffice.exe`
   Hoặc thêm thư mục trên vào biến môi trường **PATH** của hệ thống.

### Thiết lập trên Linux (Ubuntu/Debian):
```bash
sudo apt update
sudo apt install libreoffice -y
```

---

## 📝 5. Cấu Hìn Tệp `.env`

Tạo tệp `.env` tại thư mục gốc backend (`table_extract/.env`) với nội dung cấu hình đầy đủ sau:

```env
PORT=3000

# Cấu hình kết nối Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# GCP Project Config
GOOGLE_PROJECT_ID=your-gcp-project-id
GOOGLE_LOCATION=us
GOOGLE_PROCESSOR_ID=your-processor-id

# Cấu hình tham số OCR
OCR_RETRY_ATTEMPTS=5           # Số lần thử lại tối đa khi Google API lỗi
OCR_JOB_TIMEOUT=600000         # Thời gian chạy tối đa cho 1 Job (10 phút)
OCR_CLEANUP_TTL_MS=3600000     # Thời gian giữ lại workspace trước khi xoá (1 giờ)
MAX_PDF_PAGES=2000             # Giới hạn số trang tối đa của PDF
MAX_UPLOAD_SIZE=52428800       # Kích thước file tối đa cho phép upload (50MB)

# Concurrency tuning
LIBREOFFICE_CONCURRENCY=2      # Số tệp Word chuyển đổi song song
PROCESS_WORKER_CONCURRENCY=2   # Số job OCR xử lý song song
VISION_CONCURRENCY=5           # Số luồng quét trang song song trên mỗi PDF
```
