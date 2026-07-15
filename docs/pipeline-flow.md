# Kiến Trúc Luồng Chạy Hệ Thống (Pipeline Execution Flow)

Tài liệu này mô tả chi tiết đường đi của một tệp tin (luồng xử lý bất đồng bộ) từ khi người dùng tải lên cho đến khi kết quả được trích xuất hoàn tất và bộ nhớ tạm được giải phóng. Kiến trúc này được áp dụng đồng bộ cho cả luồng **Nhận diện văn bản (OCR)** và **Trích xuất bảng biểu (Table Extraction)**.

---

## 🗺️ Sơ Đồ Luồng Tổng Quan (High-Level Sequence)

```mermaid
sequenceDiagram
    autonumber
    actor Client as Client / FE
    participant API as API Controller / Service
    participant Redis as Redis / BullMQ
    participant Convert as Convert Worker
    participant Process as Process Worker
    participant GCP as Google APIs (Vision / Doc AI)
    participant Disk as Local Disk (JSONL / Temp)
    participant Cleanup as Cleanup Worker

    Client->>API: POST /extract-tables (Tải file lên)
    Note over API: 1. Tạo batchId & jobId<br/>2. Di chuyển file vào uploads/<jobId>/<br/>3. Khởi tạo status=QUEUED ở Redis
    
    alt Tệp Word (.docx)
        API->>Redis: Thêm job vào ocr-convert / table-convert
        Redis->>Convert: Nhận job convert
        Note over Convert: 4. Cập nhật status=CONVERTING
        Convert->>Disk: Chạy LibreOffice -> xuất original.pdf
        Convert->>Redis: Thêm PDF job vào ocr-process / table-process
    else Tệp PDF hoặc Ảnh
        API->>Redis: Thêm PDF job trực tiếp vào ocr-process / table-process
    end

    Redis->>Process: Nhận job process
    Note over Process: 5. Cập nhật status=SPLITTING
    Process->>Disk: Tách PDF thành các trang đơn lẻ (PNG / PDF)
    Note over Process: 6. Cập nhật status=PROCESSING
    
    loop Cho từng trang (Giới hạn VISION_CONCURRENCY)
        Process->>Redis: Kiểm tra cờ huỷ (cancellationFlag)
        Process->>GCP: Gọi API Vision / Document AI (kèm Retry Jitter)
        GCP-->>Process: Trả về kết quả trang
        Process->>Disk: Ghi tăng dần (append) vào tệp tạm JSONL
        Process->>Redis: Cập nhật completedPages & tiến độ %
    end

    Note over Process: 7. Cập nhật status=SAVING_RESULTS
    Process->>Disk: Thăng hạng (promote) đổi tên tệp JSONL nguyên tử
    Note over Process: 8. Cập nhật status=COMPLETED
    Process->>Redis: Lên lịch hàng đợi dọn dẹp (sau trễ TTL)

    Note over Cleanup: 9. Xoá thư mục tạm uploads/<jobId>/
    Client->>API: GET /stream (SSE) hoặc GET /pages/:num (Đọc JSONL từng dòng)
    API-->>Client: Trả về kết quả phân trang nhẹ
```

---

## ⚙️ Các Giai Đoạn Chi Tiết (Detailed Steps)

### Giai Đoạn 1: Tiếp Nhận & Khởi Tạo (Ingestion & Initialization)
1. **Kiểm tra & Chuẩn hoá**:
   - Client gửi tệp thông qua `multipart/form-data`.
   - Hệ thống chuyển đổi tên tệp gốc từ hệ ký tự latin1 sang UTF-8 để hiển thị đúng tiếng Việt.
2. **Khởi tạo định danh & Khác biệt hoá**:
   - Sinh ra `batchId` cho toàn bộ lô, và `jobId` định dạng `<batchId>_<index>` cho từng tệp.
3. **Cô lập không gian làm việc (Workspace Isolation)**:
   - Tạo thư mục làm việc riêng tại `uploads/<jobId>/`.
   - Di chuyển tệp đã upload từ thư mục tạm của Multer vào `uploads/<jobId>/original.<ext>`.
4. **Đăng ký trạng thái**:
   - Ghi trạng thái ban đầu lên Redis: `status: JobState.QUEUED` và tiến độ `progress: { completed: 0, total: 0 }`.
   - Nếu đuôi mở rộng là Word (`.doc`/`.docx`), job được đẩy vào hàng đợi `convert`. Ngược lại (PDF, hình ảnh), job được xếp thẳng vào hàng đợi `process`.

---

### Giai Đoạn 2: Chuyển Đổi Tài Liệu (Document Conversion)
*Chỉ áp dụng cho tệp Word (`.doc`/`.docx`)*
1. **Tiếp nhận**: `TableConvertProcessor` / `ConvertProcessor` nhận tác vụ.
2. **Cập nhật**: Trạng thái chuyển thành `JobState.CONVERTING`.
3. **Thực thi chuyển đổi**:
   - Chạy lệnh headless của LibreOffice (`soffice.exe` trên Windows) để kết xuất tệp `original.pdf` trong thư mục `uploads/<jobId>/`.
4. **Xếp lịch tiếp theo**:
   - Đẩy thông tin tệp PDF mới tạo vào hàng đợi `process` để xử lý bước tiếp theo.
   - Nếu chuyển đổi thất bại, tác vụ lập tức chuyển thành `FAILED` và lên lịch dọn dẹp ngay lập tức (delay: 0).

---

### Giai Đoạn 3: Chia Nhỏ & Trích Xuất Song Song (Splitting & Parallel Extraction)
1. **Tiếp nhận & Đếm trang (Splitting)**:
   - `TableProcessProcessor` / `ProcessProcessor` nhận tác vụ xử lý PDF / Ảnh.
   - Trạng thái chuyển thành `JobState.SPLITTING`.
   - Sử dụng công cụ `pdfinfo` hoặc thư viện `pdf-lib` để xác định chính xác số lượng trang thực tế (`totalPages`).
   - Cắt tệp gốc thành các tệp tạm cho từng trang (OCR xuất thành ảnh PNG bằng `pdftoppm`; Table Extraction xuất thành tệp PDF trang đơn lẻ).
2. **Xử lý trích xuất (Processing)**:
   - Trạng thái chuyển thành `JobState.OCR_PROCESSING` (được ghi nhận trong Redis là `active`).
   - Tạo một chuỗi `attemptToken` (UUID) đại diện cho lượt chạy này để chống xung đột ghi đè.
   - Xếp lịch xử lý song song các trang (giới hạn bởi biến `VISION_CONCURRENCY` thông qua thư viện `p-limit` và `ConcurrencyService`).
3. **Cơ chế huỷ chủ động (Cooperative Cancellation)**:
   - Trước và sau khi gọi API đám mây (Vision API / Document AI), worker luôn kiểm tra cờ `cancellationFlag` trong Redis.
   - Nếu người dùng bấm nút **Huỷ tác vụ**, worker sẽ dừng lập tức, xoá tệp kết quả tạm thời và chuyển trạng thái thành `CANCELLED`.
4. **Gọi API đám mây & Retry**:
   - Mỗi trang được gọi đến API của Google để trích xuất dữ liệu.
   - Trường hợp lỗi tạm thời (Rate Limit 429 hoặc lỗi 50x từ GCP), hệ thống sẽ tự động thử lại (tối đa `JOB_RETRY_ATTEMPTS` lần) với cơ chế trễ tăng dần (exponential backoff) kết hợp nhiễu ngẫu nhiên (jitter).
5. **Lưu trữ tuần tự & Cập nhật tiến độ**:
   - Kết quả trích xuất của trang được ghi nối tiếp (append) trực tiếp xuống đĩa cứng thành file JSONL tạm thời: `uploads/results/<jobId>_<attemptToken>.jsonl` để tránh chiếm dụng RAM của hệ thống (O(1) memory footprint).
   - Cập nhật tiến độ trang hoàn thành về Redis để Client nhận biết qua SSE / Polling.

---

### Giai Đoạn 4: Thăng Hạng & Hoàn Tất (Promotion & Completion)
1. **Lưu trữ nguyên tử (Atomic Promotion)**:
   - Khi toàn bộ các trang hoàn thành thành công, trạng thái chuyển thành `JobState.SAVING_RESULTS`.
   - Hệ thống tiến hành thăng hạng kết quả bằng cách đổi tên file (atomic rename) từ `<jobId>_<attemptToken>.jsonl` thành `<jobId>.jsonl`. 
   - Có cơ chế fallback: Nếu đổi tên khác phân vùng đĩa (`EXDEV`), hệ thống sẽ tự động sao chép, đồng bộ dữ liệu (`fsync`), đổi tên và giải phóng file nguồn an toàn.
2. **Hoàn tất**:
   - Cập nhật Redis: `status: JobState.COMPLETED`, ghi nhận `completedAt`.
3. **Lập lịch dọn dẹp trễ (Delayed Cleanup)**:
   - Thêm một job vào hàng đợi `cleanup` với thời gian trễ `JOB_CLEANUP_TTL_MS` (mặc định 1 giờ).

---

### Giai Đoạn 5: Dọn Dẹp Workspace (Background Cleanup)
1. **Kích hoạt**: `TableCleanupProcessor` / `CleanupProcessor` nhận tác vụ dọn dẹp.
2. **Dọn dẹp**:
   - Xoá sạch toàn bộ thư mục workspace `uploads/<jobId>/` (chứa file gốc, tệp PDF trung gian, các trang đơn lẻ).
   - Tệp kết quả cuối cùng tại `uploads/results/<jobId>.jsonl` vẫn được giữ lại để người dùng tải xuống hoặc xem trực tuyến.
   - Tác vụ dọn dẹp được thiết kế có tính idempotent (nếu thư mục đã được xoá trước đó do lỗi/huỷ, tiến trình sẽ kết thúc thành công mà không ném ra lỗi).
