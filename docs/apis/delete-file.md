# API: Xóa tệp tạm thời trên server (DELETE /api/delete-file/:filename)

API này phục vụ mục đích dọn dẹp các tệp tải lên tạm thời lưu trữ trên đĩa cứng hệ thống sau khi quá trình xử lý hoàn tất hoặc người dùng chọn làm mới trang (reset).

---

## 📡 Chi Tiết Endpoint

- **Phương thức**: `DELETE`
- **Đường dẫn**: `/api/delete-file/:filename`

---

## 📥 Dữ Liệu Yêu Cầu (Request)

### URL Parameters
- `filename` (string, bắt buộc): Tên tệp băm ngẫu nhiên cần xoá trên đĩa cứng (ví dụ: `4a7b9c9d-d815.pdf`).

---

## ⚙️ Luồng Xử Lý Chi Tiết (Processing Flow)

1. **Kiểm tra đầu vào (Validation)**:
   - Hệ thống kiểm tra tên file có hợp lệ hay không.
   - Để tránh các lỗ hổng bảo mật tấn công ghi đè/đọc file hệ thống (Directory Traversal), tên file đầu vào được lọc bỏ các ký tự điều hướng thư mục như `../` hoặc `..\`.
2. **Kiểm tra sự tồn tại (Existence Check)**:
   - Trỏ đường dẫn đầy đủ tới thư mục lưu trữ: `uploads/:filename`.
   - Sử dụng thư viện file system (`fs/promises`) kiểm tra sự tồn tại của tệp trên ổ đĩa. Nếu không tồn tại, trả về `404 Not Found`.
3. **Thực hiện xóa file (File deletion)**:
   - Thực thi xoá tệp trên đĩa cứng bằng hàm `fs.rm()`.
4. **Trả về phản hồi**: Trả về thông báo thành công `200 OK`.

---

## 📤 Dữ Liệu Phản Hồi (Response)

### Thành công (200 OK)
```json
{
  "statusCode": 200,
  "message": "Xoá file thành công",
  "data": {
    "filename": "4a7b9c9d-d815.pdf"
  }
}
```

### Thất bại (404 Not Found)
```json
{
  "statusCode": 404,
  "message": "Không tìm thấy file để xóa: 4a7b9c9d-d815.pdf",
  "error": "Not Found"
}
```
