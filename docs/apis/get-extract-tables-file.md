# API: Lấy chi tiết tiến độ và kết quả tệp tin trích xuất bảng (GET /extract-tables/:batchId/files/:fileIndex)

API này hỗ trợ lấy thông tin chi tiết kèm phân trang kết quả trích xuất cấu trúc bảng của một tệp tin cụ thể thuộc lô xử lý.

---

## 📡 Chi Tiết Endpoint

- **Phương thức**: `GET`
- **Đường dẫn**: `/extract-tables/:batchId/files/:fileIndex`
- **Query Parameters**:
  - `page` (number, optional, mặc định: 1): Trang kết quả cần xem.
  - `pageSize` (number, optional, mặc định: 10): Số lượng trang kết quả trên một lượt phản hồi.

---

## 📥 Dữ Liệu Yêu Cầu (Request)

### URL Parameters
- `batchId` (string, bắt buộc): ID lô xử lý.
- `fileIndex` (number, bắt buộc): Chỉ mục của file trong lô xử lý (bắt đầu từ 0).

---

## ⚙️ Luồng Xử Lý Chi Tiết (Processing Flow)

1. **Kiểm tra lô và tệp tin**:
   - Dịch vụ truy xuất thông tin lô trích xuất bảng từ Redis bằng `jobStoreService.getTableBatch(batchId)`.
   - Tìm kiếm file tương ứng với `fileIndex` trong danh sách tệp thuộc lô. Nếu không tìm thấy, hệ thống trả về lỗi `404 Not Found`.
2. **Lấy trạng thái và phân trang kết quả**:
   - Truy vấn trạng thái chi tiết của công việc qua `jobStoreService.getTableJobStatus(jobId)`.
   - Phân trang mảng kết quả `pages` (chứa các bảng trích xuất được) dựa trên tham số `page` và `pageSize` yêu cầu.
3. **Trả về Client**: Phản hồi thông tin chi tiết của tệp tin kèm mảng trang kết quả đã được cắt phân trang và đối tượng metadata phân trang (`pagination`).

---

## 📤 Dữ Liệu Phản Hồi (Response)

### Thành công (200 OK)
```json
{
  "statusCode": 200,
  "message": "Thành công",
  "data": {
    "fileIndex": 0,
    "fileName": "bao_cao_tai_chinh.pdf",
    "status": "completed",
    "totalPages": 15,
    "completedPages": 15,
    "pages": [
      {
        "pageNumber": 2,
        "tables": [
          {
            "tableIndex": 0,
            "rows": [
              {
                "rowIndex": 0,
                "cells": [
                  { "colIndex": 0, "text": "Doanh thu", "colSpan": 1, "rowSpan": 1 },
                  { "colIndex": 1, "text": "15,000,000", "colSpan": 1, "rowSpan": 1 }
                ]
              }
            ]
          }
        ]
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 10,
      "totalResultPages": 2
    },
    "failedReason": null
  }
}
```
