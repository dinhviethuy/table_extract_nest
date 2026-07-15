# API: Huỷ Job đang xử lý (POST /jobs/:id/cancel)

API này nhận yêu cầu huỷ bỏ xử lý một Job cụ thể đang trong hàng đợi hoặc đang chạy. Hệ thống sẽ huỷ tác vụ OCR hoặc Trích xuất bảng ngầm một cách an toàn và dọn dẹp tài nguyên lập tức.

---

## 📡 Chi Tiết Endpoint

- **Phương thức**: `POST`
- **Đường dẫn**: `/jobs/:id/cancel`
- **Content-Type**: `application/json`

---

## 📥 Dữ Liệu Yêu Cầu (Request)

### Path Parameters
- `id`: Mã định danh duy nhất của Job (`jobId`), ví dụ: `a18c8266-c328-4148-9e38-13d68e84df2f_0`.

---

## ⚙️ Luồng Xử Lý Chi Tiết (Processing Flow)

1. **Ghi nhận cờ huỷ (Cancellation Flag)**:
   - `JobStoreService` đánh dấu trạng thái huỷ (`cancellationFlag: true`) của Job tương ứng trong Redis.
2. **Kiểm tra trạng thái hàng đợi**:
   - Nếu Job đang chờ xử lý (`waiting`), BullMQ sẽ loại bỏ Job ra khỏi hàng đợi.
   - Nếu Job đang chạy (`active`), Worker Processor (`ProcessProcessor` hoặc `TableProcessProcessor`) sẽ nhận biết cờ huỷ này trước/sau mỗi lượt xử lý hoặc gọi API của từng trang đơn lẻ.
3. **Giải phóng tài nguyên ngầm**:
   - Worker dừng xử lý ngay lập tức khi phát hiện cờ huỷ.
   - Xoá sạch toàn bộ tệp tạm, tệp ảnh PNG kết xuất từ PDF, và file kết quả JSONL tạm thời của lượt chạy (`attemptToken`).
   - Cập nhật trạng thái của Job thành `failed` kèm lý do lỗi là `Huỷ bởi người dùng` (hoặc `CANCELLED`).

---

## 📤 Dữ Liệu Phản Hồi (Response)

### Thành công (200 OK)
```json
{
  "statusCode": 200,
  "message": "Thành công",
  "data": {
    "jobId": "a18c8266-c328-4148-9e38-13d68e84df2f_0",
    "status": "cancelled"
  }
}
```

### Thất bại (404 Not Found - Không tìm thấy Job)
```json
{
  "statusCode": 404,
  "message": "Không tìm thấy Job với ID: a18c8266-c328-4148-9e38-13d68e84df2f_0",
  "error": "Not Found"
}
```
