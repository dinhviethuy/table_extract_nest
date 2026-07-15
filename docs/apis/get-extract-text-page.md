# API: Lấy chi tiết chữ OCR của một trang (GET /extract-text/:batchId/files/:fileIndex/pages/:pageNumber)

API này hỗ trợ lazy load văn bản thô đã nhận diện được bằng Google Vision OCR của một trang cụ thể thuộc một file nhất định trong lô xử lý.

---

## 📡 Chi Tiết Endpoint

- **Phương thức**: `GET`
- **Đường dẫn**: `/extract-text/:batchId/files/:fileIndex/pages/:pageNumber`

---

## 📥 Dữ Liệu Yêu Cầu (Request)

### URL Parameters
- `batchId` (string, bắt buộc): ID lô xử lý.
- `fileIndex` (number, bắt buộc): Chỉ mục của file trong lô xử lý (bắt đầu từ 0).
- `pageNumber` (number, bắt buộc): Trang tài liệu cần tải nội dung văn bản (1-indexed).

---

## ⚙️ Luồng Xử Lý Chi Tiết (Processing Flow)

1. **Truy vấn trạng thái công việc (Job Retrieval)**:
   - Dịch vụ gọi `jobStoreService.getJobStatus(jobId)` với `jobId` định dạng `${batchId}_${fileIndex}`.
   - Nếu trạng thái là `unknown` (không tìm thấy công việc tương ứng), ném lỗi `404 Not Found`.
2. **Tìm kiếm dữ liệu trang**:
   - Duyệt trong mảng kết quả hoàn thành `jobStatus.pages` để tìm trang có `pageNumber` trùng khớp với tham số yêu cầu.
   - Nếu tìm thấy: Trả về đối tượng `Page` tương ứng gồm `pageNumber`, `text` (văn bản nhận diện quang học) và `confidence` (độ tin cậy của mô hình Vision từ 0 đến 1).
   - Nếu không tìm thấy (do trang đó không chứa văn bản nào hoặc trang trống): Trả về đối tượng mặc định với nội dung văn bản rỗng:
     ```json
     {
       "pageNumber": pageNumber,
       "text": "",
       "confidence": 0
     }
     ```
3. **Trả về Client**: Dữ liệu văn bản và độ tin cậy của trang được trả về để frontend hiển thị.

---

## 📤 Dữ Liệu Phản Hồi (Response)

### Thành công (200 OK - Trang có văn bản)
```json
{
  "statusCode": 200,
  "message": "Thành công",
  "data": {
    "pageNumber": 1,
    "text": "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc...",
    "confidence": 0.995
  }
}
```

### Thành công (200 OK - Trang không có văn bản hoặc trang trống)
```json
{
  "statusCode": 200,
  "message": "Thành công",
  "data": {
    "pageNumber": 5,
    "text": "",
    "confidence": 0
  }
}
```

### Thất bại (404 Not Found - Không tìm thấy file hoặc batch)
```json
{
  "statusCode": 404,
  "message": "Không tìm thấy tiến trình xử lý cho fileIndex: 3",
  "error": "Not Found"
}
```
