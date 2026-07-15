# API: Xem trạng thái lô quét OCR (GET /extract-text/:batchId)

API này dùng để lấy trạng thái và tiến độ xử lý văn bản OCR của toàn bộ các tệp tin trong lô quét.

---

## 📡 Chi Tiết Endpoint

- **Phương thức**: `GET`
- **Đường dẫn**: `/extract-text/:batchId`

---

## 📥 Dữ Liệu Yêu Cầu (Request)

### URL Parameters
- `batchId` (string, bắt buộc): ID lô quét OCR (UUID v4) nhận được từ API `POST /extract-text`.

---

## ⚙️ Luồng Xử Lý Chi Tiết (Processing Flow)

1. **Đọc Metadata từ Redis**:
   - Dịch vụ gọi `jobStoreService.getBatch(batchId)` để lấy metadata của lô từ Redis (key: `ocr:batch:${batchId}`).
   - Nếu không tìm thấy, hệ thống trả về lỗi `404 Not Found`.
2. **Kiểm tra trạng thái từng Job**:
   - Duyệt qua danh sách các file trong lô.
   - Với mỗi file, gọi `jobStoreService.getJobStatus(jobId)` để truy vấn trạng thái công việc hiện tại trong BullMQ qua Redis (`waiting`, `active`, `completed`, `failed`).
   - Nếu trạng thái là `active` (đang xử lý), lấy tiến độ hoàn thành từ `job.progress` (chứa số trang hoàn thành `completed` và tổng số trang `total`).
   - Để tối ưu hóa dung lượng truyền tải mạng (bandwidth), mảng `pages` (chứa văn bản thô của từng trang) sẽ bị xóa trắng (`pages: []`) trong endpoint này. Dữ liệu văn bản chi tiết sẽ được tải qua endpoint lazy load riêng.
3. **Tổng hợp trạng thái toàn bộ Lô (Batch Status Calculation)**:
   - Trạng thái của toàn bộ lô được tính toán dựa trên trạng thái của từng tệp:
     - `completed`: Khi toàn bộ các tệp xử lý thành công.
     - `failed`: Khi toàn bộ các tệp xử lý xong nhưng có ít nhất một tệp bị thất bại.
     - `waiting`: Khi toàn bộ các tệp đang ở trạng thái chờ xử lý trong hàng đợi.
     - `processing`: Khi có ít nhất một tệp đang được quét hoặc một số đã hoàn thành và một số đang chờ.
4. **Trả về Client**: Trả về dữ liệu trạng thái chuẩn hoá.

---

## 📤 Dữ Liệu Phản Hồi (Response)

### Thành công (200 OK - Đang xử lý)
```json
{
  "statusCode": 200,
  "message": "Thành công",
  "data": {
    "batchId": "a18c8266-c328-4148-9e38-13d68e84df2f",
    "status": "processing",
    "totalFiles": 1,
    "completedFiles": 0,
    "files": [
      {
        "fileIndex": 0,
        "jobId": "a18c8266-c328-4148-9e38-13d68e84df2f_0",
        "fileName": "demo_ocr.pdf",
        "status": "active",
        "totalPages": 10,
        "completedPages": 5,
        "pages": [],
        "failedReason": null
      }
    ]
  }
}
```

### Thành công (200 OK - Đã hoàn thành)
```json
{
  "statusCode": 200,
  "message": "Thành công",
  "data": {
    "batchId": "a18c8266-c328-4148-9e38-13d68e84df2f",
    "status": "completed",
    "totalFiles": 1,
    "completedFiles": 1,
    "files": [
      {
        "fileIndex": 0,
        "jobId": "a18c8266-c328-4148-9e38-13d68e84df2f_0",
        "fileName": "demo_ocr.pdf",
        "status": "completed",
        "totalPages": 10,
        "completedPages": 10,
        "pages": [],
        "failedReason": null
      }
    ]
  }
}
```

### Thất bại (404 Not Found)
```json
{
  "statusCode": 404,
  "message": "Không tìm thấy lô trích xuất văn bản với ID: a18c8266-c328-4148-9e38-13d68e84df2f",
  "error": "Not Found"
}
```
