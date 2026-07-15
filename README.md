# DataExtract AI - NestJS Backend API

Hệ thống Backend được xây dựng bằng NestJS phục vụ việc trích xuất bảng biểu (Table Extraction) và nhận diện văn bản (OCR) quy mô lớn, hỗ trợ xử lý bất đồng bộ (Asynchronous) qua hàng đợi BullMQ + Redis, điều phối tài nguyên thông minh và hỗ trợ phân trang tối ưu hiệu năng.

---

## 🚀 Các Tính Năng Nổi Bật

1. **Kiến Trúc Hàng Đợi Bất Đồng Bộ (Queue-based Architecture)**:
   - Sử dụng **BullMQ** kết hợp **Redis** để xử lý ngầm (background job). Người dùng upload file lớn (lên tới 50MB) sẽ nhận về `batchId` tức thời, không lo bị HTTP Timeout.
2. **Google Document AI (Table Extraction)**:
   - Tự động nhận diện cấu trúc hàng, cột, merge cell của bảng biểu từ tệp PDF/Ảnh/Word và xuất bản sang định dạng Excel nhiều sheet hoặc file nén ZIP.
3. **Google Cloud Vision OCR (Text Extraction)**:
   - Quét ký tự quang học (OCR) hiệu năng cao từ tài liệu lớn, hỗ trợ tính toán độ tin cậy (confidence score) trên từng trang.
4. **Cơ Chế Phân Trang Đầu Cuối (End-to-End Pagination)**:
   - Cả hai luồng OCR và trích xuất bảng đều trả về thông tin tiến độ theo trang.
   - Cung cấp API tải chi tiết trang (lazy loading) để giảm tải payload mạng và giúp giao diện React Editor chạy mượt mà trên trình duyệt.
5. **Điều Phối Tài Nguyên & Tự Động Thử Lại (Concurrency & Retries)**:
   - Sử dụng `ConcurrencyService` giới hạn số lượng request song song (concurrency limit) gửi tới Google API để chống quá tải (rate limiting).
   - Tự động thực hiện lại (retry) tối đa 3 lần với khoảng trễ tăng dần (exponential backoff) nếu Google API gặp lỗi tạm thời.
6. **Hỗ Trợ Định Dạng Word (DOC/DOCX)**:
   - Tự động chuyển đổi Word sang PDF trước khi xử lý bằng Document AI.

---

## 🛠️ Công Nghệ Sử Dụng

- **Core**: NestJS (v11.x), TypeScript, RxJS.
- **Queue/Database**: BullMQ, Redis.
- **Document Processing**: `pdf-lib`, `sharp` (Xử lý ảnh), `libreoffice` (Chuyển đổi DOCX).
- **Validation**: Zod + `nestjs-zod`.
- **APIs**: Google Document AI, Google Cloud Vision API.

---

## ⚙️ Hướng Dẫn Cài Đặt

### 1. Cấu hình biến môi trường
Tạo tệp `.env` tại thư mục gốc của backend:

```env
PORT=3000

# Redis Config (BullMQ)
REDIS_HOST=localhost
REDIS_PORT=6379

# Google Cloud Project Config
GOOGLE_PROJECT_ID=your-gcp-project-id
GOOGLE_LOCATION=us # Hoặc location của Document AI Processor
GOOGLE_PROCESSOR_ID=your-document-ai-processor-id

# Cấu hình OCR & Concurrency
OCR_MAX_CONCURRENCY=5          # Số trang quét song song tối đa cùng lúc
OCR_MAX_RETRIES=3              # Số lần thử lại tối đa khi Google API lỗi
GLOBAL_CONCURRENCY_LIMIT=10     # Giới hạn request song song toàn hệ thống
```

### 2. Cài đặt chứng chỉ Google Cloud
Đảm bảo bạn đã có tệp JSON dịch vụ (Service Account Key) của GCP với các quyền:
- Document AI API User
- Cloud Vision API User

Tải tệp JSON về máy và đặt đường dẫn vào biến môi trường hệ thống:
```bash
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\your-key.json"
```

### 3. Khởi chạy Redis
Khởi chạy dịch vụ Redis qua Docker để phục vụ hàng đợi BullMQ:
```bash
docker run -d --name table-extractor-redis -p 6379:6379 redis:7-alpine
```

### 4. Khởi chạy Backend
Cài đặt thư viện dependencies và chạy máy chủ:
```bash
# Cài đặt thư viện
pnpm install

# Chạy chế độ phát triển (Development)
pnpm run start:dev

# Biên dịch gói Production
pnpm run build
```

---

## 📡 Tài Liệu API (API Endpoints)

### A. Luồng Trích Xuất Bảng (Table Extraction)

#### 1. POST Tạo Batch Trích xuất bảng
Gửi một hoặc nhiều tệp tin lên hàng đợi để trích xuất cấu trúc bảng.
- **Endpoint**: `POST /extract-tables`
- **Content-Type**: `multipart/form-data`
- **Body**:
  - `files`: File dữ liệu (`.pdf`, `.docx`, `.jpg`, `.png`, `.webp`,...)
- **Response (200 OK)**:
  ```json
  {
    "statusCode": 200,
    "message": "Thành công",
    "data": {
      "batchId": "6f8b9c9d-d815-467c-9b88-999888777abc",
      "files": [
        { "fileIndex": 0, "jobId": "6f8b9c9d-d815-467c-9b88-999888777abc_0", "fileName": "bang_luong.pdf", "totalPages": 0, "status": "waiting" }
      ]
    }
  }
  ```

#### 2. GET Xem tiến độ và kết quả của Batch
- **Endpoint**: `GET /extract-tables/:batchId`
- **Response**: Trả về trạng thái của toàn bộ tệp trong batch (`waiting`, `active`, `completed`, `failed`). Không chứa thông tin chi tiết bảng từng trang để giữ dung lượng nhẹ.

#### 3. GET Lấy chi tiết bảng biểu của một trang (Lazy Load)
- **Endpoint**: `GET /extract-tables/:batchId/files/:fileIndex/pages/:pageNumber`
- **Response (200 OK)**: Trả về danh sách cấu trúc bảng (hàng, cột, cell text) của riêng trang đó.
  ```json
  {
    "pageNumber": 1,
    "tables": [
      {
        "rows": [
          ["Tên nhân viên", "Lương cơ bản"],
          ["Nguyễn Văn A", "15,000,000"]
        ]
      }
    ]
  }
  ```

---

### B. Luồng Nhận Diện OCR (Text OCR)

#### 1. POST Tạo Batch Quét OCR văn bản
- **Endpoint**: `POST /extract-text`
- **Content-Type**: `multipart/form-data`
- **Body**:
  - `files`: File cần nhận diện OCR
- **Response (200 OK)**: Trả về `batchId` và danh sách các tệp tin được đưa vào hàng đợi BullMQ.

#### 2. GET Xem tiến độ lô OCR
- **Endpoint**: `GET /extract-text/:batchId`
- **Response**: Trả về tiến trình (`completedPages`/`totalPages`) của từng file.

#### 3. GET Lấy nội dung text OCR của một trang (Lazy Load)
- **Endpoint**: `GET /extract-text/:batchId/files/:fileIndex/pages/:pageNumber`
- **Response**: Trả về văn bản đã nhận diện và độ tin cậy (confidence score) của trang đó.
  ```json
  {
    "pageNumber": 1,
    "text": "Nội dung văn bản nhận diện được từ Google Vision API...",
    "confidence": 0.985
  }
  ```

#### 4. GET Stream tiến trình thời gian thực (SSE)
- **Endpoint**: `GET /extract-text/:batchId/stream`
- **Event**: Trả về dữ liệu tiến trình dạng Server-Sent Events khi có thay đổi.

---

### C. Tiện ích xuất Excel & Dọn dẹp

#### 1. POST Xuất Excel
Nhận dữ liệu bảng thô từ client và biên dịch thành tệp Excel `.xlsx` (hoặc ZIP nếu xuất riêng lẻ).
- **Endpoint**: `POST /export-excel`
- **Body**:
  ```json
  {
    "tables": [...],
    "options": { "zip": false }
  }
  ```

#### 2. DELETE Xóa file
- **Endpoint**: `DELETE /api/delete-file/:filename`
- **Description**: Dọn dẹp các tệp tạm thời trên server.
