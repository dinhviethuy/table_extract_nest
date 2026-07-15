# API: Xem trạng thái lô trích xuất bảng (GET /extract-tables/:batchId)

API này dùng để lấy trạng thái và tiến độ xử lý của toàn bộ các tệp tin trong lô trích xuất bảng biểu.

---

## 📡 Chi Tiết Endpoint

- **Phương thức**: `GET`
- **Đường dẫn**: `/extract-tables/:batchId`

---

## 📥 Dữ Liệu Yêu Cầu (Request)

### URL Parameters
- `batchId` (string, bắt buộc): ID lô xử lý (UUID v4) nhận được từ API `POST /extract-tables`.

---

## ⚙️ Luồng Xử Lý Chi Tiết (Processing Flow)

1. **Đọc Metadata từ Redis**:
   - Dịch vụ gọi `jobStoreService.getTableBatch(batchId)` để lấy metadata của lô từ Redis (key: `table:batch:${batchId}`).
   - Nếu không tìm thấy, hệ thống trả về lỗi `404 Not Found`.
2. **Kiểm tra trạng thái từng Job**:
   - Duyệt qua danh sách các file trong lô.
   - Với mỗi file, gọi `jobStoreService.getTableJobStatus(jobId)` để truy vấn trạng thái công việc hiện tại trong BullMQ qua Redis (`waiting`, `active`, `completed`, `failed`).
   - Nếu trạng thái là `active` (đang xử lý), lấy tiến độ hoàn thành từ `job.progress` (chứa số trang hoàn thành `completed` và tổng số trang `total`).
   - Nếu trạng thái là `completed` (hoàn thành), trích xuất danh sách trang chứa bảng biểu (`tablePageNumbers`) bằng cách đọc `jobStatus.pages.map(p => p.pageNumber)`. Các trang không có bảng biểu sẽ tự động bị bỏ qua trong danh sách này.
   - Để tối ưu hóa dung lượng truyền tải mạng (bandwidth), mảng `pages` (chứa dữ liệu cột/hàng thô của các bảng) sẽ bị xóa trắng (`pages: []`) trong endpoint này. Dữ liệu bảng biểu sẽ được tải qua endpoint lazy load riêng.
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
    "batchId": "b58c8266-c328-4148-9e38-13d68e84df1e",
    "status": "processing",
    "totalFiles": 1,
    "completedFiles": 0,
    "files": [
      {
        "fileIndex": 0,
        "jobId": "b58c8266-c328-4148-9e38-13d68e84df1e_0",
        "fileName": "bao_cao_tai_chinh.pdf",
        "status": "active",
        "totalPages": 12,
        "completedPages": 4,
        "pages": [],
        "tablePageNumbers": [],
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
    "batchId": "b58c8266-c328-4148-9e38-13d68e84df1e",
    "status": "completed",
    "totalFiles": 1,
    "completedFiles": 1,
    "files": [
      {
        "fileIndex": 0,
        "jobId": "b58c8266-c328-4148-9e38-13d68e84df1e_0",
        "fileName": "bao_cao_tai_chinh.pdf",
        "status": "completed",
        "totalPages": 12,
        "completedPages": 12,
        "pages": [],
        "tablePageNumbers": [2, 5, 8], // Chỉ trang 2, 5, 8 chứa bảng dữ liệu
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
  "message": "Không tìm thấy lô trích xuất bảng với ID: b58c8266-c328-4148-9e38-13d68e84df1e",
  "error": "Not Found"
}
```
