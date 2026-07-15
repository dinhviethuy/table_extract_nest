# API: Tải chi tiết bảng biểu của một trang (GET /extract-tables/:batchId/files/:fileIndex/pages/:pageNumber)

API này hỗ trợ lazy load dữ liệu bảng biểu thô của một trang cụ thể thuộc một file nhất định trong lô xử lý.

---

## 📡 Chi Tiết Endpoint

- **Phương thức**: `GET`
- **Đường dẫn**: `/extract-tables/:batchId/files/:fileIndex/pages/:pageNumber`

---

## 📥 Dữ Liệu Yêu Cầu (Request)

### URL Parameters
- `batchId` (string, bắt buộc): ID lô xử lý.
- `fileIndex` (number, bắt buộc): Chỉ mục của file trong lô xử lý (bắt đầu từ 0).
- `pageNumber` (number, bắt buộc): Trang tài liệu cần tải thông tin bảng biểu (1-indexed).

---

## ⚙️ Luồng Xử Lý Chi Tiết (Processing Flow)

1. **Truy vấn trạng thái công việc (Job Retrieval)**:
   - Dịch vụ gọi `jobStoreService.getTableJobStatus(jobId)` với `jobId` định dạng `${batchId}_${fileIndex}`.
   - Nếu trạng thái là `unknown` (không tìm thấy công việc tương ứng), ném lỗi `404 Not Found`.
2. **Tìm kiếm dữ liệu trang**:
   - Duyệt trong mảng kết quả hoàn thành `jobStatus.pages` để tìm trang có `pageNumber` trùng khớp với tham số yêu cầu.
   - Nếu tìm thấy: Trả về đối tượng `Page` tương ứng gồm `pageNumber`, mảng `tables` (dữ liệu hàng, cột, merge cell) và lỗi `error` (nếu có).
   - Nếu không tìm thấy (do trang đó không chứa bảng biểu và đã bị worker lọc bỏ): Trả về đối tượng mặc định với danh sách bảng rỗng:
     ```json
     {
       "pageNumber": pageNumber,
       "tables": []
     }
     ```
3. **Trả về Client**: Dữ liệu bảng của trang được định dạng chuẩn và trả về để frontend hiển thị.

---

## 📤 Dữ Liệu Phản Hồi (Response)

### Thành công (200 OK - Trang có bảng)
```json
{
  "statusCode": 200,
  "message": "Thành công",
  "data": {
    "pageNumber": 2,
    "tables": [
      {
        "tableName": "Bảng Sản Phẩm",
        "headers": ["Mã SP", "Tên sản phẩm", "Đơn giá"],
        "rows": [
          ["SP01", "Laptop Dell XPS 13", "32,000,000"],
          ["SP02", "Chuột Logitech MX Master 3", "2,500,000"]
        ]
      }
    ]
  }
}
```

### Thành công (200 OK - Trang không có bảng hoặc trang trống)
```json
{
  "statusCode": 200,
  "message": "Thành công",
  "data": {
    "pageNumber": 3,
    "tables": []
  }
}
```

### Thất bại (404 Not Found - Không tìm thấy file hoặc batch)
```json
{
  "statusCode": 404,
  "message": "Không tìm thấy tiến trình xử lý cho fileIndex: 5",
  "error": "Not Found"
}
```
