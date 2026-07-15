# Tài Liệu Đặc Tả API (API Reference)

Tất cả các endpoint trả về dữ liệu đều được chuẩn hoá thông qua Interceptor theo định dạng chung:
```json
{
  "statusCode": 200,
  "message": "Thành công",
  "data": { ... }
}
```

---

## 📊 1. Trích Xuất Bảng (Table Extraction)

### 1.1 POST Khởi tạo Batch trích xuất bảng
Tải lên danh sách tài liệu để xếp vào hàng đợi trích xuất bảng biểu.
- **Endpoint**: `POST /extract-tables`
- **Content-Type**: `multipart/form-data`
- **Body**:
  - `files`: Chọn một hoặc nhiều file tài liệu (`.pdf`, `.docx`, `.png`, `.jpg`, `.webp`)
- **Response mẫu**:
  ```json
  {
    "statusCode": 200,
    "message": "Thành công",
    "data": {
      "batchId": "b58c8266-c328-4148-9e38-13d68e84df1e",
      "files": [
        {
          "fileIndex": 0,
          "jobId": "b58c8266-c328-4148-9e38-13d68e84df1e_0",
          "fileName": "document_demo.pdf",
          "totalPages": 0,
          "status": "waiting"
        }
      ]
    }
  }
  ```

### 1.2 GET Truy vấn trạng thái của lô (Batch Status)
Kiểm tra tiến độ hoàn thành của tất cả các file trong lô. Endpoint này không trả về nội dung bảng chi tiết để giữ dung lượng nhẹ (Lightweight).
- **Endpoint**: `GET /extract-tables/:batchId`
- **Response mẫu**:
  ```json
  {
    "statusCode": 200,
    "message": "Thành công",
    "data": {
      "batchId": "b58c8266-c328-4148-9e38-13d68e84df1e",
      "status": "processing", // waiting | processing | completed | failed
      "totalFiles": 1,
      "completedFiles": 0,
      "files": [
        {
          "fileIndex": 0,
          "jobId": "b58c8266-c328-4148-9e38-13d68e84df1e_0",
          "fileName": "document_demo.pdf",
          "status": "active", // waiting | active | completed | failed
          "totalPages": 12,
          "completedPages": 3,
          "pages": [], // Luôn rỗng ở endpoint status
          "tablePageNumbers": [2, 5, 8], // Chỉ số các trang chứa bảng biểu (chỉ hiển thị khi file completed)
          "failedReason": null
        }
      ]
    }
  }
  ```

### 1.3 GET Chi tiết tệp tin phân trang (File Detail)
Được sử dụng để lấy thông tin chi tiết của một tệp tin cụ thể trong lô trích xuất bảng biểu.
- **Endpoint**: `GET /extract-tables/:batchId/files/:fileIndex`
- **Query Parameters**:
  - `page` (optional, default: 1): Trang cần xem kết quả bảng biểu.
  - `pageSize` (optional, default: 10): Số lượng dòng kết quả trên mỗi trang.
- **Response mẫu**:
  ```json
  {
    "statusCode": 200,
    "message": "Thành công",
    "data": {
      "fileIndex": 0,
      "fileName": "document_demo.pdf",
      "status": "completed",
      "totalPages": 12,
      "completedPages": 12,
      "pages": [
        {
          "pageNumber": 2,
          "tables": [...]
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

### 1.4 GET Chi tiết bảng của một trang cụ thể (Lazy Load)
Được gọi bởi Frontend khi người dùng chuyển sang trang tương ứng trên thanh phân trang.
- **Endpoint**: `GET /extract-tables/:batchId/files/:fileIndex/pages/:pageNumber`
- **Response mẫu**:
  ```json
  {
    "statusCode": 200,
    "message": "Thành công",
    "data": {
      "pageNumber": 2,
      "tables": [
        {
          "rows": [
            ["Mã SP", "Tên sản phẩm", "Đơn giá"],
            ["SP01", "Laptop Dell XPS 13", "32,000,000"],
            ["SP02", "Chuột Logitech MX Master 3", "2,500,000"]
          ]
        }
      ]
    }
  }
  ```

### 1.5 GET Stream tiến trình thời gian thực (SSE)
- **Endpoint**: `GET /extract-tables/:batchId/stream`
- **Định dạng stream**: Trả về dữ liệu dạng Server-Sent Events khi trạng thái của file hoặc số trang hoàn thành thay đổi.
  - Event: `message`
  - Data payload tương tự như luồng OCR.

---

## 🔍 2. Quét Ký Tự OCR (Text Extraction)

### 2.1 POST Khởi tạo Batch quét OCR
- **Endpoint**: `POST /extract-text`
- **Content-Type**: `multipart/form-data`
- **Body**:
  - `files`: Chọn một hoặc nhiều file tài liệu
- **Response mẫu**: Tương tự như `POST /extract-tables`, trả về `batchId` và danh sách các tệp chờ xử lý.

### 2.2 POST Huỷ Job OCR đang chạy
Gửi tín hiệu huỷ bỏ xử lý một Job cụ thể. Hệ thống sẽ huỷ tác vụ OCR ngầm một cách an toàn và giải phóng tài nguyên lập tức.
- **Endpoint**: `POST /jobs/:id/cancel`
- **Response mẫu**:
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

### 2.3 GET Truy vấn trạng thái lô OCR
- **Endpoint**: `GET /extract-text/:batchId`
- **Response mẫu**:
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
          "fileName": "demo_ocr.png",
          "status": "completed",
          "totalPages": 1,
          "completedPages": 1,
          "pages": []
        }
      ]
    }
  }
  ```

### 2.4 GET Chi tiết văn bản OCR của một trang cụ thể
Đọc nội dung văn bản quét được từ tệp kết quả JSONL cục bộ.
- **Endpoint**: `GET /extract-text/:batchId/files/:fileIndex/pages/:pageNumber`
- **Response mẫu**:
  ```json
  {
    "statusCode": 200,
    "message": "Thành công",
    "data": {
      "pageNumber": 1,
      "text": "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc...",
      "confidence": 0.992
    }
  }
  ```

### 2.5 GET Stream tiến trình thời gian thực (SSE)
- **Endpoint**: `GET /extract-text/:batchId/stream`
- **Định dạng stream**: Trả về dữ liệu dạng Server-Sent Events khi trạng thái của file hoặc số trang hoàn thành thay đổi.
  - Event: `message`
  - Data payload:
    ```json
    {
      "type": "progress",
      "fileIndex": 0,
      "fileName": "demo_ocr.pdf",
      "completed": 4,
      "total": 12,
      "status": "active"
    }
    ```

---

## 📊 3. Xuất Excel, Giám Sát & Dọn Dẹp

### 3.1 POST Xuất Excel
Chuyển đổi mảng bảng biểu thành tệp tin Excel nhị phân hoặc đóng gói file ZIP.
- **Endpoint**: `POST /export-excel`
- **Body**:
  ```json
  {
    "tables": [
      {
        "tableName": "Bảng Sản Phẩm",
        "headers": ["Mã SP", "Tên sản phẩm", "Đơn giá"],
        "rows": [
          ["SP01", "Laptop Dell XPS 13", "32,000,000"],
          ["SP02", "Chuột Logitech MX Master 3", "2,500,000"]
        ]
      }
    ],
    "options": {
      "zip": false // Nếu true, mỗi bảng xuất thành 1 file và nén thành ZIP
    }
  }
  ```
- **Response**: Trả về tệp nhị phân dưới dạng Stream tải xuống (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` hoặc `application/zip`).

### 3.2 DELETE Xóa file tạm trên server
- **Endpoint**: `DELETE /api/delete-file/:filename`

### 3.3 GET Giao diện quản lý Bull Board
- **Endpoint**: `/admin/queues`
- **Description**: Trình theo dõi BullMQ thời gian thực trực quan.
