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
   - Endpoint `POST /api/auth/seller/apply` **ĐÃ CÓ** (từ 2026-09-29). User tự apply, admin duyệt/từ chối qua `/api/admin/sellers/:id/{approve,reject}`.
   - Xem contract chi tiết tại `API_CONTRACT.md` § Auth → `POST /api/auth/seller/apply`.

4. **Cart merge có 2 endpoint**:
   - `/api/cart/merge` ← **CHÍNH THỨC**, dùng cái này.
   - `/api/auth/cart/merge` ← legacy, sẽ bị xóa trong release sau.
   - Hai endpoint có cùng chức năng, FE chỉ nên gọi `/api/cart/merge`.

5. **Admin response shape**:
   - `PATCH /api/admin/listings/:id/approve` và `.../reject` giờ trả response qua `mapProduct`, **CÙNG shape với `GET /api/products`**. Trước đây trả raw Mongoose document — đã fix.

6. **Notification ownership**:
   - `PATCH /api/notifications/:id/read` hiện enforce ownership (user chỉ mark được notification của mình). Trước đây có thể mark của người khác — đã fix (IDOR).

---

## Testing

### Unit tests (không cần DB)

```bash
cd backend
npm run test
```

Test `errorContract.test.ts` verify:
- Toàn bộ `ErrorCode` enum có HTTP status mapping (`46/46`).
- `sendError` produce đúng shape `{ error: { code, message } }`.
- `handleInternalError` không leak internal message ra client.
- Critical error codes tồn tại.

**Hiện tại: 35/35 PASS ✅**

### Integration tests (cần MongoDB test DB)

```bash
cd backend
npm run test:auth    # POST /api/products authorization matrix
npm run test:order   # GET /orders/:code/shipment + PATCH /orders/:code/status
```

**Setup**:
1. Copy `backend/.env.test.example` thành `backend/.env.test`
2. Điền `MONGODB_URI_TEST` trỏ đến database riêng (khuyến nghị: cùng cluster nhưng DB name `thriftit_test`)
3. Test sẽ tự `dropDatabase()` trước khi chạy — **ĐẢM BẢO** URI là test DB, không phải production

**⚠️ QUAN TRỌNG**: Nếu không có `MONGODB_URI_TEST`, các test này sẽ fail. Tuyệt đối KHÔNG dùng production URI làm fallback.

### Chạy tất cả tests

```bash
cd backend
npm run test:all
```