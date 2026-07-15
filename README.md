# DataExtract AI - NestJS Backend API

Hệ thống Backend được xây dựng bằng NestJS phục vụ việc trích xuất bảng biểu (Table Extraction) và nhận diện văn bản (OCR) quy mô lớn, hỗ trợ xử lý bất đồng bộ (Asynchronous) qua hàng đợi BullMQ + Redis, điều phối tài nguyên thông minh và hỗ trợ phân trang tối ưu hiệu năng.

- 📖 Xem [Tài liệu Kiến trúc Hệ thống](file:///d:/Programing/Tool/tool/table_extractor_api_nest/table_extract/docs/architecture.md)
- ⚙️ Xem [Tài liệu Luồng Chạy Chi Tiết (Pipeline Flow)](file:///d:/Programing/Tool/tool/table_extractor_api_nest/table_extract/docs/pipeline-flow.md)

---

## 🚀 Các Tính Năng Nổi Bật (Cập Nhật Phiên Bản Production-Ready)

1. **Kiến Trúc Hàng Đợi Cô Lập (Decoupled Queue Architecture)**:
   - Luồng OCR và luồng Trích xuất bảng được chia tách thành các hàng đợi BullMQ chuyên biệt:
     - `ocr-convert` & `table-convert`: Chuyển đổi tệp Word (DOC/DOCX) sang PDF sử dụng LibreOffice chạy headless trong các tiểu trình cô lập.
     - `ocr-process` & `table-process`: Phân tích tách trang PDF và thực hiện quét ký tự quang học (Vision API) / phân tích trích xuất cấu trúc bảng biểu (Document AI) song song.
     - `ocr-cleanup` & `table-cleanup`: Tự động dọn dẹp các tệp tin tạm thời và workspace của Job sau một khoảng thời gian chờ (TTL) cấu hình trước.
2. **Lưu Trữ Kết Quả Độc Lập & Idempotent (Decoupled Result Storage)**:
   - Các kết quả quét OCR và kết quả trích xuất bảng biểu (chứa toạ độ, chữ và cấu trúc bảng phức tạp) được lưu trực tiếp vào các tệp Line-Delimited JSON (JSONL) ở ổ đĩa thay vì lưu trữ trong Redis.
   - Redis chỉ lưu trữ trạng thái tiến trình (metadata) có kích thước nhẹ.
   - Mỗi lần xử lý (attempt) được định danh bằng một `attemptToken` duy nhất để tránh xung đột ghi đè dữ liệu.
   - Quá trình thăng hạng (promotion) kết quả cuối cùng diễn ra nguyên tử (atomic rename/promotion) phòng chống race conditions.
3. **Xử Lý Tiết Kiệm Bộ Nhớ Tuần Tự (O(1) Memory Footprint)**:
   - Các tài liệu PDF lớn được chia trang và xử lý tuần tự/song song (giới hạn bởi concurrency limits).
   - Hệ thống thực hiện nạp dữ liệu của từng trang đơn lẻ, lưu trữ kết quả và xóa tệp tạm thời ngay lập tức trước khi tiếp tục trang tiếp theo. Không lưu giữ toàn bộ tài liệu hay kết quả trong bộ nhớ RAM.
4. **Hỗ Trợ Huỷ Job Chủ Động (Cooperative Job Cancellation)**:
   - Cung cấp endpoint `POST /jobs/:id/cancel` giúp huỷ cả tác vụ OCR và tác vụ trích xuất bảng biểu đang chạy. Các worker kiểm tra cờ huỷ trong Redis ở mỗi bước và dừng xử lý ngay lập tức để tiết kiệm tài nguyên hệ thống.
5. **Cơ Chế Thử Lại Tối Ưu (Retries with Exponential Backoff & Jitter)**:
   - Các yêu cầu gửi đến Google APIs nếu gặp lỗi tạm thời sẽ được tự động thực hiện lại với khoảng thời gian trễ tăng dần (exponential backoff) cộng thêm độ nhiễu ngẫu nhiên (jitter) để giảm tải cho máy chủ GCP.
6. **Bảng Điều Khiển Trực Quan Bull Board**:
   - Tích hợp bảng giám sát hàng đợi trực quan tại đường dẫn `/admin/queues` giúp kiểm soát trạng thái các Job theo thời gian thực.

---

## 🛠️ Công Nghệ Sử Dụng

- **Core**: NestJS (v11.x), TypeScript, RxJS.
- **Queue/Database**: BullMQ, Redis, `@bull-board/nestjs`.
- **Document Processing**: `pdfinfo` / `pdftoppm` (Poppler PDF Tools), `libreoffice` (Chuyển đổi DOCX).
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
JOB_RETRY_ATTEMPTS=5           # Số lần thử lại tối đa cho GCP API
JOB_TIMEOUT=600000             # Thời gian tối đa cho 1 Job (ms)
JOB_CLEANUP_TTL_MS=3600000     # Thời gian chờ trước khi dọn dẹp workspace (ms)
MAX_PDF_PAGES=2000             # Giới hạn số trang tối đa cho 1 file PDF
MAX_UPLOAD_SIZE=52428800       # Giới hạn kích thước file upload (50MB)

# Giới hạn luồng chạy song song
LIBREOFFICE_CONCURRENCY=2      # Số luồng chuyển đổi Word song song
PROCESS_WORKER_CONCURRENCY=2   # Số luồng xử lý OCR Job song song
VISION_CONCURRENCY=5           # Số trang quét song song tối đa trên mỗi PDF
```

### 2. Cài đặt các công cụ đi kèm (Poppler & LibreOffice)
- Đảm bảo các tệp thực thi `pdfinfo.exe` và `pdftoppm.exe` được đặt trong thư mục `Release-26.02.0-0/poppler-26.02.0/Library/bin/` ở thư mục gốc của dự án.
- Đảm bảo đã cài đặt LibreOffice trên máy chủ (đường dẫn mặc định `C:\Program Files\LibreOffice\program\soffice.exe` trên Windows hoặc cấu hình thích hợp).

### 3. Khởi chạy Backend
```bash
# Cài đặt thư viện
pnpm install

# Khởi chạy Redis qua Docker
docker run -d --name table-extractor-redis -p 6379:6379 redis:7-alpine

# Chạy chế độ phát triển
pnpm run start:dev

# Chạy các bài kiểm tra Unit Test
pnpm test
```

---

## 📡 Tài Liệu API (API Endpoints)

### A. Luồng Nhận Diện OCR (Text OCR)

#### 1. POST Tạo Batch Quét OCR văn bản
- **Endpoint**: `POST /extract-text`
- **Content-Type**: `multipart/form-data`
- **Response (200 OK)**:
  ```json
  {
    "statusCode": 200,
    "message": "Thành công",
    "data": {
      "batchId": "6f8b9c9d-d815-467c-9b88-999888777abc",
      "files": [
        { "fileIndex": 0, "jobId": "6f8b9c9d-d815-467c-9b88-999888777abc_0", "fileName": "contract.pdf", "totalPages": 0, "status": "waiting" }
      ]
    }
  }
  ```

#### 2. POST Huỷ Job OCR đang chạy
- **Endpoint**: `POST /jobs/:id/cancel`
- **Response (200 OK)**:
  ```json
  {
    "jobId": "6f8b9c9d-d815-467c-9b88-999888777abc_0",
    "status": "cancelled"
  }
  ```

#### 3. GET Xem tiến độ lô OCR
- **Endpoint**: `GET /extract-text/:batchId`

#### 4. GET Lấy nội dung text OCR của một trang (Lazy Load)
- **Endpoint**: `GET /extract-text/:batchId/files/:fileIndex/pages/:pageNumber`

---

### B. Giám sát hệ thống
Truy cập giao diện quản trị hàng đợi trực quan tại: `http://localhost:3000/admin/queues`.
