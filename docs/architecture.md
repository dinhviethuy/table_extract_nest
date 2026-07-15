# Kiến Trúc Hệ Thống (System Architecture)

Tài liệu này mô tả chi tiết kiến trúc xử lý tài liệu bất đồng bộ (Asynchronous Document Processing Architecture) của hệ thống backend NestJS.

---

## 📊 Sơ Đồ Hoạt Động (Architecture Flowchart)

Dưới đây là sơ đồ Mermaid mô tả luồng dữ liệu từ khi Client tải tài liệu lên cho đến khi xử lý ngầm và lazy-load kết quả:

```mermaid
sequenceDiagram
    autonumber
    actor User as Client (React)
    participant API as NestJS Controller
    participant Redis as Redis Cache & BullMQ
    participant Worker as BullMQ Processor Worker
    participant GCP as Google APIs (Vision / Doc AI)

    User->>API: POST /extract-tables (Gửi tệp PDF/docx/ảnh)
    Note over API: Sinh UUID batchId<br/>Đẩy các file vào hàng đợi
    API->>Redis: Thêm Job vào Queue (jobId = batchId_index)
    API->>Redis: Lưu metadata của lô xử lý (Status = waiting)
    API-->>User: Trả về batchId & danh sách tệp tức thời (HTTP 200)
    Note over User: Chuyển sang Workspace view<br/>Bắt đầu Polling trạng thái mỗi 2 giây

    %% Background Processing Loop
    activate Worker
    Redis->>Worker: Kích hoạt Job (chờ hàng đợi)
    Note over Worker: Đọc tệp từ đĩa cứng<br/>Phân chia trang PDF/chuyển đổi docx
    Worker->>GCP: Gọi API xử lý song song (chống quá tải rate limit)
    GCP-->>Worker: Trả về kết quả thô (mỗi trang)
    Worker->>Redis: Cập nhật tiến độ xử lý trang (completedPages/totalPages)
    User->>API: GET /extract-tables/:batchId (Polling)
    API->>Redis: Đọc tiến độ công việc
    API-->>User: Trả về tiến trình % trang hoàn thành
    Worker->>Redis: Lưu kết quả trang đã xử lý (Status = completed)
    deactivate Worker

    %% Lazy loading page review
    User->>API: GET /extract-tables/:batchId/files/:fileIndex/pages/:pageNum
    API->>Redis: Truy xuất kết quả trang cụ thể
    API-->>User: Trả về danh sách bảng/văn bản của trang
```

---

## 🛠️ Các Thành Phần Cốt Lõi (Core Components)

### 1. Hàng đợi BullMQ & Redis
- **Mục tiêu**: Đóng vai trò là hàng đợi phân tán (Distributed Task Queue) giúp backend không bị nghẽn luồng xử lý chính khi gặp file PDF nặng (vài trăm trang) hoặc có nhiều người dùng đồng thời (50+ concurrent users).
- **Hàng đợi hiện có**:
  - `ocr-queue`: Dành cho luồng nhận dạng chữ Google Vision OCR.
  - `table-queue`: Dành cho luồng trích xuất cấu trúc bảng Google Document AI.
- **Dữ liệu tạm thời (TTL)**: Trạng thái và kết quả trích xuất được lưu trữ tạm thời trong Redis với thời gian hết hạn là **24 giờ** (`BATCH_TTL_SECONDS`), tránh tích tụ rác bộ nhớ.

### 2. Dịch vụ Điều phối Concurrency (`ConcurrencyService`)
- Để tối ưu hóa và chống lỗi Rate Limiting (Quá tải quota của Google Cloud API), hệ thống sử dụng hai luồng quản lý concurrency:
  - **Global Concurrency**: Giới hạn tổng số request gửi đi Google song song trên toàn hệ thống (ví dụ: tối đa 10).
  - **Page Concurrency**: Giới hạn số trang xử lý song song trên một tài liệu (ví dụ: tối đa 5).
- Các request vượt ngưỡng sẽ tự động xếp hàng đợi và xử lý cuốn chiếu (concurrency pool).

### 3. Tự động Thử lại và Backoff (Error Resilience)
- Khi Google API gặp sự cố nghẽn mạng tạm thời (HTTP 429 hoặc 503), BullMQ được cấu hình tự động thử lại tối đa **3 lần** (`attempts: 3`).
- Khoảng cách giữa các lần thử lại tuân theo cơ chế **Exponential Backoff** (ví dụ: trễ tăng dần 5s, 10s, 20s...) giúp dịch vụ tự phục hồi hiệu quả.

### 4. Phân Trang và Bỏ Qua Trang Trống (Page Skipping optimization)
- **OCR**: Chỉ lưu trữ văn bản và độ tin cậy của trang có dữ liệu chữ.
- **Table Extraction**: Bộ xử lý worker lọc bỏ các trang trống không có bảng biểu. Chỉ các trang chứa bảng dữ liệu mới được lưu vào danh sách `tablePageNumbers`. Frontend dựa vào danh sách này để phân trang thông minh, chỉ cho phép người dùng click duyệt qua các trang có bảng biểu thực tế, tăng tốc độ tương tác gấp nhiều lần.
