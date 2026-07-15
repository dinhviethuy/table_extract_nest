# API: Biên dịch xuất Excel (POST /export-excel)

API này nhận danh sách cấu trúc bảng biểu đã được hiệu chỉnh từ client và xuất bản thành file Excel nhị phân (.xlsx) nhiều sheet hoặc nén thành tệp nén (.zip) chứa các file Excel riêng lẻ.

---

## 📡 Chi Tiết Endpoint

- **Phương thức**: `POST`
- **Đường dẫn**: `/export-excel`
- **Content-Type**: `application/json`

---

## 📥 Dữ Liệu Yêu Cầu (Request)

### Request Body (JSON)
- `tables` (array, bắt buộc): Mảng các bảng biểu cần xuất. Mỗi phần tử chứa:
  - `tableName` (string): Tên bảng biểu (hoặc tên sheet hiển thị).
  - `headers` (array of strings): Mảng các tiêu đề cột.
  - `rows` (array of array of strings): Ma trận dữ liệu dòng/cột của bảng.
- `options` (object, tuỳ chọn):
  - `zip` (boolean, mặc định: false): Nếu `true`, hệ thống sẽ xuất mỗi bảng thành 1 file Excel riêng biệt và nén tất cả vào 1 file ZIP. Nếu `false`, gộp toàn bộ các bảng vào chung 1 file Excel (mỗi bảng tương ứng 1 sheet).

```json
{
  "tables": [
    {
      "tableName": "Doanh Thu Q1",
      "headers": ["Tháng", "Doanh Số"],
      "rows": [
        ["Tháng 1", "500M"],
        ["Tháng 2", "620M"]
      ]
    }
  ],
  "options": {
    "zip": false
  }
}
```

---

## ⚙️ Luồng Xử Lý Chi Tiết (Processing Flow)

1. **Nhận Dữ Liệu**: `ExportExcelService` nhận danh sách bảng. Hệ thống kiểm tra nếu mảng bảng rỗng thì trả về `400 Bad Request`.
2. **Khởi tạo Excel Workbook**:
   - Sử dụng thư viện Excel chuyên dụng để dựng cấu trúc workbook trong bộ nhớ.
   - Nếu `options.zip = false` (Xuất gộp):
     - Duyệt qua từng bảng. Với mỗi bảng, tạo 1 sheet mới có tên tương ứng (`tableName`).
     - Tự động cắt gọn tiêu đề sheet nếu vượt quá giới hạn 31 ký tự của định dạng Excel.
     - Dựng hàng đầu tiên là `headers` có định dạng in đậm.
     - Điền toàn bộ các dòng `rows` dữ liệu tiếp theo vào bảng.
   - Nếu `options.zip = true` (Xuất ZIP):
     - Khởi tạo đối tượng nén dữ liệu trong bộ nhớ (Buffer ZIP).
     - Với mỗi bảng, tạo 1 workbook độc lập, ghi dữ liệu vào sheet mặc định, xuất ra bộ đệm (Excel Buffer) và nén vào file ZIP với tên tương ứng của bảng.
3. **Trả về Stream nhị phân**:
   - Thiết lập các header HTTP phản hồi:
     - `Content-Type`: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (cho Excel) hoặc `application/zip` (cho file ZIP).
     - `Content-Disposition`: `attachment; filename=...` để kích hoạt trình tải xuống của trình duyệt.
   - Đẩy Stream nhị phân trực tiếp về Client.

---

## 📤 Dữ Liệu Phản Hồi (Response)

### Thành công (200 OK)
Trả về file nhị phân (Binary Stream) trực tiếp. Trình duyệt sẽ tự động kích hoạt tải xuống.

### Thất bại (400 Bad Request)
```json
{
  "statusCode": 400,
  "message": "Không có dữ liệu bảng để xuất",
  "error": "Bad Request"
}
```
