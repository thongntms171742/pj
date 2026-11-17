# Build Your Christmas — Documentation (Dành cho Frontend Team)

> **Source of Truth**: `backend/src/` (Express + TypeScript + Mongoose).
> Bộ tài liệu chuẩn hóa để Frontend Team tích hợp và phát triển ứng dụng **Build Your Christmas**.

---

## 📖 CÁC TÀI LIỆU CHÍNH

| # | Tài liệu | Mục đích |
|---|----------|----------|
| 1 | **[FE_API_REFERENCE.md](./FE_API_REFERENCE.md)** | **Cẩm nang tích hợp chính**: Môi trường, tài khoản test, flow giỏ hàng, danh mục cây 3 tầng Shopee, Media, Reviews, code mẫu React và cURL. |
| 2 | **[API_CONTRACT.md](./API_CONTRACT.md)** | **Đặc tả hợp đồng API chi tiết**: Request body, Response JSON, Headers, Status codes cho toàn bộ endpoints. |
| 3 | **[API_CHANGELOG.md](./API_CHANGELOG.md)** | **Nhật ký thay đổi API**: Theo dõi toàn bộ thay đổi và các cập nhật mới nhất của backend. |
| 4 | **[FE_CHAT_INTEGRATION_GUIDE.md](./FE_CHAT_INTEGRATION_GUIDE.md)** | **Tích hợp Chat Hybrid (AI + Admin)** & Socket.IO namespace `/chat`. |
| 5 | **[FE_MEDIA_INTEGRATION_GUIDE.md](./FE_MEDIA_INTEGRATION_GUIDE.md)** | **Tích hợp Media** (Hero Video, Story Feed, Nhạc nền). |
| 6 | **[BE_HANDOFF_COMPOSITING.md](./BE_HANDOFF_COMPOSITING.md)** | **Hệ thống ghép ảnh 4 lớp** cho Tree Customizer (`foregroundMask`, `anchor`, `shadow`, `depth`). |
| 7 | **[ASSET_PREPARATION_GUIDE.md](./ASSET_PREPARATION_GUIDE.md)** | **Hướng dẫn chuẩn bị ảnh** cho designer/ops (cây trơn, mask cành trước, PNG phụ kiện). |

> Tài liệu kỹ thuật nội bộ BE xem thêm tại `backend/docs/` (`PRODUCT_CUSTOMIZATION.md`, `CHAT_API.md`, `CHAT_HYBRID_API.md`, `RENDER_KEEPALIVE.md`).

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

### 4. Khởi chạy dự án local
```bash
cd backend
npm install
npm run seed -- --confirm-seed    # Seed dữ liệu cây, phụ kiện, tài khoản test
npm run dev                         # Chạy backend tại http://localhost:4000
```

---

## 📌 NGUYÊN TẮC QUAN TRỌNG KHI GỌI API

1. **Authentication**: Gửi header `Authorization: Bearer <token>` sau khi login. Token có hạn 7 ngày. Khi gặp lỗi `401 TOKEN_INVALID`, FE cần xóa token và chuyển hướng về `/login`.
2. **Error Format**: Mọi lỗi trả về đều có dạng chuẩn `{ "error": { "code": "...", "message": "...", "requestId": "..." } }`. FE rẽ nhánh xử lý dựa trên `error.code`.
3. **Giỏ hàng (Cart)**:
   - `POST /api/cart/items` dùng `variantId` + `deliveryOption` (và `designId` optional nếu đã tùy chỉnh).
   - Hỗ trợ khách vãng lai qua header `X-Session-Id` và gộp giỏ hàng sau khi đăng nhập qua `POST /api/cart/merge`.
4. **Địa chỉ & Vận chuyển (TP.HCM — mã `79`)**:
   - Giao hàng, sổ địa chỉ (`/api/users/me/addresses`) và kho gửi hàng (`/api/shipping/warehouse`) phục vụ trong khu vực TP.HCM (`provinceId = "79"`).
   - FE / Admin nhập địa chỉ kho linh hoạt qua `PUT/PATCH /api/shipping/warehouse` (hoặc `/api/admin/warehouse`) — không hardcode địa chỉ kho dưới BE.
   - FE tính phí ship realtime qua `POST /api/shipping/quote` và truyền địa chỉ trực tiếp khi đặt hàng `POST /api/orders` (hoặc chọn `addressId` từ sổ địa chỉ).
