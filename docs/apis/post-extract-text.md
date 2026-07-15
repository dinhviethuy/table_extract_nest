# API: Khởi tạo lô quét chữ OCR (POST /extract-text)

API này nhận nhiều tệp tải lên từ client, đưa vào hàng đợi `ocr-queue` của BullMQ và lưu trữ dữ liệu khởi tạo vào Redis để xử lý OCR bất đồng bộ.

---

## 📡 Chi Tiết Endpoint

- **Phương thức**: `POST`
- **Đường dẫn**: `/extract-text`
- **Content-Type**: `multipart/form-data`

---

## 📥 Dữ Liệu Yêu Cầu (Request)

### Headers
- `Content-Type`: `multipart/form-data; boundary=----WebKitFormBoundary...`

### Request Body (Form Data)
- `files`: File nhị phân (Hỗ trợ tải lên nhiều file cùng lúc).
  - Định dạng hỗ trợ: `PDF`, `DOCX`, `DOC`, `PNG`, `JPG`, `JPEG`, `WEBP`, `BMP`, `TIFF`.
  - Giới hạn dung lượng tối đa: **50MB** trên tổng lô tải lên.

---

## ⚙️ Luồng Xử Lý Chi Tiết (Processing Flow)

1. **Nhận File**: `FilesInterceptor('files')` chặn dữ liệu luồng tải lên và lưu tạm thời vào thư mục `uploads/` trên đĩa cứng bằng cấu hình Multer. Tên file được băm ngẫu nhiên bằng UUID để tránh xung đột trùng tên.
2. **Xác thực dữ liệu (Validation)**:
   - Hệ thống áp dụng `ParseFilePipeWithUnlink` để kiểm tra định dạng file (Regex whitelist) và dung lượng file (< 50MB).
   - Nếu file không hợp lệ, hệ thống tự động xoá file tạm trên đĩa cứng và trả về `400 Bad Request`.
3. **Sinh Batch ID**: Khởi tạo mã định danh lô `batchId` dạng UUID v4.
4. **Phân phối Job**:
   - Duyệt qua từng file đã tải lên.
   - Với mỗi file, khởi tạo `jobId` tương ứng có định dạng `${batchId}_${index}`.
   - Chuyển đổi tên file gốc từ mã hoá `latin1` sang `utf8` để bảo toàn ký tự tiếng Việt có dấu.
   - Đóng gói thông tin thành `OcrJobData` (gồm `filePath` trên đĩa, `fileName`, `batchId`, `mimeType`).
   - Đẩy công việc vào hàng đợi `ocr-queue` của BullMQ với cấu hình:
     - Số lần thử lại (`attempts`): Lấy từ biến môi trường `OCR_MAX_RETRIES` (mặc định là 3).
     - Backoff delay: Trễ luỹ tiến 5 giây để tránh lỗi rate limit của Google Cloud.
5. **Lưu trữ Metadata khởi tạo**:
   - Tạo đối tượng `BatchMetadata` lưu trữ `batchId`, thời gian tạo (`createdAt`), và danh sách tệp đính kèm với trạng thái ban đầu là `waiting`.
   - Lưu thông tin này vào Redis thông qua `JobStoreService` với khoá dạng `ocr:batch:${batchId}` (TTL: 24 giờ).
6. **Trả về Client**: Trả về `batchId` và danh sách công việc đã xếp hàng tức thời (HTTP 200) để Client không phải chờ đợi tiến trình quét tài liệu chạy xong.

---

## 📤 Dữ Liệu Phản Hồi (Response)

### Thành công (200 OK)
```json
{
  "statusCode": 200,
  "message": "Thành công",
  "data": {
    "batchId": "a18c8266-c328-4148-9e38-13d68e84df2f",
    "files": [
      {
        "fileIndex": 0,
        "jobId": "a18c8266-c328-4148-9e38-13d68e84df2f_0",
        "fileName": "giay_khai_sinh.png",
        "totalPages": 0,
        "status": "waiting"
      }
    ]
  }
}
```

### Thất bại (400 Bad Request - Định dạng không được hỗ trợ)
```json
{
  "statusCode": 400,
  "message": "Validation failed (file type is not supported)",
  "error": "Bad Request"
}
```
