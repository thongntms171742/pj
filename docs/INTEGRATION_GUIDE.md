# Frontend Integration Guide

> **Source of Truth:** Accounts & env được sync với `AI_CONTEXT.md` và `backend/.env`.
> Nếu có xung đột, tin file này vì nó là instruction cho FE integration.

## Backend Environments

**Local**:
`http://localhost:4000`

**Production**:
`https://api.thriftit.com`

Health check: `GET /api/health` → `{ status: "ok", timestamp: ISO }`

## Frontend Environments

**Local**:
`http://localhost:5173`

**Environment Variables (`.env`)**:
```
VITE_API_URL=http://localhost:4000/api
```

## Test Accounts

> ⚠️ **KHÔNG commit password thật vào Git.** Tài khoản dưới đây là demo, an toàn để dùng cho development.
> Password production thì KHÔNG BAO GIỜ được nhúng vào code hay docs.

### Buyer

- **email**: `linh.nguyen@gmail.com`
- **password**: `123456`
- **role**: `buyer` (default, không có seller profile)
- **purpose**: Test cart, checkout, order history, profile UI.

### Seller (APPROVED)

- **email**: `shop.minhtu@thriftit.vn`
- **password**: `shop123`
- **role**: `seller` + `sellerProfile.status === "active"` ← **đã được admin duyệt**
- **purpose**: Test tạo sản phẩm (`POST /api/products`), seller dashboard (`GET /api/products/mine`), xử lý đơn, tạo vận đơn.

### Demo (APPROVED Seller + Buyer)

- **email**: `demo@thriftit.vn`
- **password**: `demo123`
- **role**: `seller` + `sellerProfile.status === "active"`
- **purpose**: Dùng thay thế nếu seller account bị rate-limit hoặc cần test với data khác.

### Admin

- **email**: `admin@thriftit.vn`
- **password**: `admin`
- **role**: `admin`
- **purpose**: Test admin endpoints (`/api/admin/*`), duyệt listing.

---

## Notes quan trọng cho FE

1. **JWT token**:
   - Lưu `token` vào `localStorage` (key: `token`).
   - Gửi kèm header `Authorization: Bearer <token>` cho mọi request cần auth.
   - Token hết hạn sau `JWT_EXPIRES_IN` (mặc định 7 ngày). Backend trả `401 TOKEN_INVALID` khi hết hạn — FE phải clear localStorage + redirect về login.

2. **Error response format**:
   - Mọi error từ BE có dạng `{ error: { code: string, message: string } }`.
   - **Branch logic dựa trên `code`, KHÔNG dựa trên `message`** (message có thể đổi tiếng Việt sau).
   - Xem bảng đầy đủ tại `docs/ERROR_CODES.md`.

3. **Seller onboarding qua API**:
   - Hiện tại KHÔNG CÓ endpoint `POST /api/auth/seller/apply`. User muốn thành seller phải được admin set thủ công trong DB.
   - Nếu cần flow "Đăng ký bán hàng" trên UI, hỏi BE để bổ sung endpoint.

4. **Cart merge có 2 endpoint**:
   - `/api/cart/merge` ← **CHÍNH THỨC**, dùng cái này.
   - `/api/auth/cart/merge` ← legacy, sẽ bị xóa trong release sau.
   - Hai endpoint có cùng chức năng, FE chỉ nên gọi `/api/cart/merge`.

5. **Admin response shape**:
   - `PATCH /api/admin/listings/:id/approve` và `.../reject` giờ trả response qua `mapProduct`, **CÙNG shape với `GET /api/products`**. Trước đây trả raw Mongoose document — đã fix.

6. **Notification ownership**:
   - `PATCH /api/notifications/:id/read` hiện enforce ownership (user chỉ mark được notification của mình). Trước đây có thể mark của người khác — đã fix (IDOR).