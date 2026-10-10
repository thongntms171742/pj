# Build Your Christmas — Documentation (Dành cho Frontend Team)

> **Source of Truth**: `backend/src/` (Express + TypeScript + Mongoose).
> Bộ tài liệu chuẩn hóa để Frontend Team tích hợp và phát triển ứng dụng **Build Your Christmas**.

---

## 📖 CÁC TÀI LIỆU CHÍNH

Thư mục tài liệu đã được tinh gọn vào **4 tài liệu cốt lõi**:

| # | Tài liệu | Mục đích | Đọc khi nào |
|---|----------|----------|-------------|
| 1 | **[FE_API_REFERENCE.md](./FE_API_REFERENCE.md)** | **Cẩm nang tích hợp chính**: Thông tin môi trường, tài khoản test, flow giỏ hàng (không cần styleId), danh mục cây 3 tầng Shopee, code mẫu React và cURL. | Bắt đầu tích hợp & code giao diện |
| 2 | **[API_CONTRACT.md](./API_CONTRACT.md)** | **Đặc tả hợp đồng API chi tiết**: Request body, Response JSON, Headers, Status codes cho toàn bộ endpoints. | Khi implement từng API call cụ thể |
| 3 | **[openapi.yaml](./openapi.yaml)** | **Đặc tả OpenAPI 3.0.3**: Dùng import vào Swagger, Postman, hoặc generate client TypeScript SDK tự động. | Khi kiểm thử API hoặc gen type SDK |
| 4 | **[API_CHANGELOG.md](./API_CHANGELOG.md)** | **Nhật ký thay đổi API**: Theo dõi toàn bộ breaking changes và các cập nhật mới nhất của backend. | Khi cập nhật hoặc gặp lỗi do thay đổi API |

---

## 🚀 THÔNG TIN MÔI TRƯỜNG & KHỞI CHẠY NHANH

### 1. Môi trường API
- **Production (Render)**: `https://christmas-8ca4.onrender.com` (Base API: `https://christmas-8ca4.onrender.com/api`)
- **Local Backend**: `http://localhost:4000` (Base API: `http://localhost:4000/api`)
- **Frontend Local**: `http://localhost:5173`

### 2. Cấu hình biến môi trường Frontend (`.env.development` / `.env.production`)
```bash
VITE_API_BASE_URL=https://christmas-8ca4.onrender.com/api
VITE_API_TARGET=https://christmas-8ca4.onrender.com
```

### 3. Tài khoản Test (sau khi seed data)
- **Admin**: `admin@buildyourchristmas.vn` | Password: lấy từ `SEED_ADMIN_PASSWORD` trong `backend/.env`
- **Buyer demo**: `buyer@buildyourchristmas.vn` | Password: lấy từ `SEED_BUYER_PASSWORD` trong `backend/.env`

### 4. Khởi chạy dự án local (5 phút)
```bash
# Terminal 1: Backend
cd backend
npm install
npm run seed -- --confirm-seed    # Seed dữ liệu cây, phụ kiện, mẫu có sẵn, tài khoản test
npm run dev                         # Chạy backend tại http://localhost:4000

# Terminal 2: Frontend
cd frontend
npm install
npm run dev                         # Chạy frontend tại http://localhost:5173
```

---

## 📌 NGUYÊN TẮC QUAN TRỌNG KHI GỌI API

1. **Authentication**: Gửi header `Authorization: Bearer <token>` sau khi login. Token có hạn 7 ngày. Khi gặp lỗi `401 TOKEN_INVALID`, FE cần xóa token và chuyển hướng về `/login`.
2. **Error Format**: Mọi lỗi trả về đều có dạng chuẩn:
   ```json
   {
     "error": {
       "code": "TÊN_MÃ_LỖI",
       "message": "Mô tả lỗi chi tiết"
     }
   }
   ```
   *Frontend nên rẽ nhánh xử lý dựa trên `error.code`.*
3. **Giỏ hàng (Cart)**:
   - Endpoint `POST /api/cart/items` **không bắt buộc `styleId`**. Có thể thêm trực tiếp cây hoặc phụ kiện vào giỏ hàng.
   - Hỗ trợ khách vãng lai qua header `X-Session-Id` và gộp giỏ hàng sau khi đăng nhập qua `POST /api/cart/merge`.
4. **Phân vùng giao hàng (Delivery)**:
   - Cây trang trí sẵn (`READY_TO_DISPLAY`): Chỉ hỗ trợ giao nội thành TP.HCM (`shippingProvinceId: "79"`).
   - Bộ tự trang trí (`DIY_KIT`) và Giao riêng lẻ (`SEPARATE`): Hỗ trợ giao hàng toàn quốc (63 tỉnh thành).
