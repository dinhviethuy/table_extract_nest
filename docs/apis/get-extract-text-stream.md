# API: Stream tiến trình thời gian thực (GET /extract-text/:batchId/stream)

API này cung cấp luồng Server-Sent Events (SSE) để phát liên tục tiến trình xử lý tài liệu OCR (số trang hoàn thành, thay đổi trạng thái) về Client mà không cần client phải poll HTTP liên tục.

---

## 📡 Chi Tiết Endpoint

- **Phương thức**: `GET`
- **Đường dẫn**: `/extract-text/:batchId/stream`
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
   - Dịch vụ sử dụng hàm `Observable` của RxJS và hàm `interval` để kiểm tra trạng thái lô quét trong Redis mỗi **1 giây** (`interval(1000)`).
   - Lấy tiến trình hiện tại của tất cả các file qua `getJobStatus(jobId)`.
   - So sánh tiến trình hiện tại (`completedPages`) và trạng thái (`status`) của các file với bản ghi lưu trữ trước đó.
   - Nếu phát hiện bất kỳ sự thay đổi nào (ví dụ: một trang vừa được quét xong, trạng thái file chuyển sang completed), hệ thống sẽ đóng gói thông tin tiến trình và đẩy sự kiện (Event) xuống client.
3. **Kết thúc kết nối**:
   - Khi toàn bộ các file trong lô chuyển sang trạng thái `completed` hoặc `failed`, kết nối SSE sẽ tự động hoàn thành (Complete) và NestJS đóng kết nối an toàn.
   - Nếu client chủ động tắt tab/đóng trình duyệt, kết nối bị ngắt, NestJS tự động dọn dẹp bộ nhớ theo dõi.

---

## 📤 Dữ Liệu Phản Hồi (Response Stream)

Hệ thống sẽ gửi các tin nhắn dạng text stream theo chuẩn EventSource:

```http
event: message
data: {"type":"progress","fileIndex":0,"fileName":"hop_dong.pdf","completed":1,"total":5,"status":"active"}

event: message
data: {"type":"progress","fileIndex":0,"fileName":"hop_dong.pdf","completed":2,"total":5,"status":"active"}

event: message
data: {"type":"progress","fileIndex":0,"fileName":"hop_dong.pdf","completed":5,"total":5,"status":"completed"}
```

### Các trường trong Data Payload:
- `type`: Loại sự kiện (mặc định là `progress`).
- `fileIndex`: Chỉ mục của file trong batch.
- `fileName`: Tên file gốc.
- `completed`: Số trang đã quét xong.
- `total`: Tổng số trang của tài liệu.
- `status`: Trạng thái hiện tại của file (`waiting` | `active` | `completed` | `failed`).
