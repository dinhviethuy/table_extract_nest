# API: Stream tiến trình trích xuất bảng thời gian thực (GET /extract-tables/:batchId/stream)

API này cung cấp luồng Server-Sent Events (SSE) để phát liên tục tiến trình xử lý trích xuất bảng (số trang hoàn thành, thay đổi trạng thái) về Client mà không cần client phải poll HTTP liên tục.

---

## 📡 Chi Tiết Endpoint

- **Phương thức**: `GET`
- **Đường dẫn**: `/extract-tables/:batchId/stream`
- **Headers**:
  - `Content-Type`: `text/event-stream`
  - `Cache-Control`: `no-cache`
  - `Connection`: `keep-alive`

---

## 📥 Dữ Liệu Yêu Cầu (Request)

### URL Parameters
- `batchId` (string, bắt buộc): ID lô xử lý.

---

## ⚙️ Luồng Xử Lý Chi Tiết (Processing Flow)

1. **Khởi tạo kết nối SSE**:
   - Khi client kết nối, NestJS mở luồng giữ kết nối liên tục (`keep-alive`).
   - Nếu không tìm thấy lô tương ứng trong Redis, kết nối bị đóng ngay lập tức.
2. **Theo dõi sự thay đổi (Polling & Diffing)**:
   - Dịch vụ sử dụng hàm `Observable` của RxJS để định kỳ thăm dò trạng thái lô quét trong Redis mỗi **2 giây** (`setInterval` nội bộ).
   - Lấy tiến trình hiện tại của tất cả các file qua `getTableJobStatus(jobId)`.
   - So sánh tiến trình hiện tại (`completedPages`) và trạng thái (`status`) của các file với bản ghi lưu trữ trước đó.
   - Nếu phát hiện bất kỳ sự thay đổi nào, hệ thống sẽ đóng gói thông tin tiến trình và đẩy sự kiện (Event) xuống client.
3. **Kết thúc kết nối**:
   - Khi toàn bộ các file trong lô chuyển sang trạng thái `completed` hoặc `failed`, kết nối SSE sẽ tự động hoàn thành (Complete) và NestJS đóng kết nối an toàn.
   - Nếu client chủ động ngắt kết nối, NestJS tự động dọn dẹp bộ nhớ theo dõi.

---

## 📤 Dữ Liệu Phản Hồi (Response Stream)

Hệ thống sẽ gửi các tin nhắn dạng text stream theo chuẩn EventSource:

```http
event: message
data: {"type":"progress","fileIndex":0,"fileName":"bao_cao_tai_chinh.pdf","completed":1,"total":5,"status":"active"}

event: message
data: {"type":"progress","fileIndex":0,"fileName":"bao_cao_tai_chinh.pdf","completed":2,"total":5,"status":"active"}

event: message
data: {"type":"progress","fileIndex":0,"fileName":"bao_cao_tai_chinh.pdf","completed":5,"total":5,"status":"completed"}
```

### Các trường trong Data Payload:
- `type`: Loại sự kiện (`progress`, `file_done`, `file_failed`, `batch_done`).
- `fileIndex`: Chỉ mục của file trong batch.
- `fileName`: Tên file gốc.
- `completed`: Số trang đã trích xuất xong.
- `total`: Tổng số trang của tài liệu.
- `status`: Trạng thái hiện tại của file (`waiting` | `active` | `completed` | `failed`).
