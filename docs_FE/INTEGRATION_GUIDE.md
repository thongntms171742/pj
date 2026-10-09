# Frontend Integration Guide — Build Your Christmas

> **Source of Truth:** Accounts & env được sync với `AI_CONTEXT.md` và `backend/.env`.
> Nếu có xung đột, tin file này vì nó là instruction cho FE integration.

## Backend Environments

**Local**: `http://localhost:4000`

**Production** (đã deploy): `https://christmas-8ca4.onrender.com` (Render.com free tier, có thể sleep sau 15 phút không traffic)

> ⚠️ URL Render có thể đổi khi tạo lại service. Cập nhật `VITE_API_BASE_URL` trong `frontend/.env.production` cho khớp.
> Domain `api.buildyourchristmas.vn` (custom) hiện chưa set up — TODO post-MVP.

Health check: `GET /api/health` → `{ status: "ok", timestamp: ISO }`

## Frontend Environments

**Local**: `http://localhost:5173`

**Environment Variables** (xem `frontend/.env.example`):
```bash
# .env.development — dùng BE Render đã deploy
VITE_API_BASE_URL=https://christmas-8ca4.onrender.com/api
VITE_API_TARGET=https://christmas-8ca4.onrender.com

# .env.production — production build
VITE_API_BASE_URL=https://christmas-8ca4.onrender.com/api
```

> Lưu ý: tên biến là `VITE_API_BASE_URL` (không phải `VITE_API_URL`). Xem `frontend/src/lib/api.ts` để biết cách đọc.

## Test Accounts (sau khi seed)

> ⚠️ **KHÔNG commit password thật vào Git.** Tài khoản dưới đây là demo, an toàn cho development.
> Password lấy từ `SEED_ADMIN_PASSWORD` và `SEED_BUYER_PASSWORD` env vars (xem `backend/.env`).

### Admin

- **email**: `admin@buildyourchristmas.vn`
- **password**: value of `SEED_ADMIN_PASSWORD` env
- **role**: `admin`
- **purpose**: Test admin endpoints (`/api/admin/*`) — CRUD trees/styles/accessories/presets, view all orders, stats, user management.

### Buyer demo

- **email**: `buyer@buildyourchristmas.vn`
- **password**: value of `SEED_BUYER_PASSWORD` env
- **role**: `buyer`
- **purpose**: Test full flow — catalog, editor, save design, cart, checkout, order history, profile.

> Khi user mới đăng ký qua `POST /api/auth/register` → tự động role `buyer` (single-brand, không có seller concept).

---

## Notes quan trọng cho FE

### 1. JWT token
- Lưu `token` vào `localStorage` (key: `token`).
- Gửi kèm `Authorization: Bearer <token>` cho mọi request cần auth.
- Token hết hạn sau `JWT_EXPIRES_IN` (default 7 ngày). BE trả `401 TOKEN_INVALID` khi hết hạn → FE phải `localStorage.removeItem("token")` + redirect về `/login`.

### 2. Error response format
- Mọi error từ BE có dạng `{ error: { code: string, message: string } }`.
- **Branch logic dựa trên `code`, KHÔNG dựa trên `message`** (message có thể đổi tiếng Việt sau).
- Xem bảng đầy đủ 47 codes Christmas tại `docs/ERROR_CODES.md`.

### 3. Christmas flow chính (CREATE → CUSTOMIZE → PREVIEW → ORDER)

```
1. CREATE   → GET /api/catalog/trees + /styles + /accessories
2. CUSTOMIZE → POST /api/catalog/quote (live preview) hoặc /api/designs/quote
3. PREVIEW   → response { pricing: { unitTotal, productionDays, hasPersonalization, lines[] } }
4. SAVE     → POST /api/designs (auth) → shareUrl
5. CART     → POST /api/cart/items { designId | config, quantity }
6. CHECKOUT → POST /api/orders { designConfirmed: true, shippingProvinceId: "79", items[] | cartItemIds[] }
7. PAYMENT  → POST /api/payments/checkout (online) hoặc COD đã confirmed tự động
8. TRACK    → GET /api/orders/:id + /api/orders/:id/shipment
```

### 4. HCM-only delivery
- `POST /api/orders` reject nếu `shippingProvinceId !== "79"` với code `DELIVERY_AREA_NOT_SUPPORTED` (HTTP 422).
- FE có thể check trước: gọi `GET /api/addresses/provinces` → chỉ cho phép chọn province id `79` (TP.HCM).
- Nếu user chọn tỉnh khác → disable nút checkout + show banner "Hiện Build Your Christmas chỉ giao tại TP.HCM".

### 5. Accessory maxQty bound input
- Gọi `GET /api/catalog/accessories?size=L` để nhận `maxQty` là **number** (cho size đó). FE dùng để bound `<input type="number" max={maxQty} />` ngay.
- Gọi `GET /api/catalog/accessories` (không `size`) → `maxQty` là object `{ S, M, L }` (cho editor chưa chọn size).

### 6. Personalization
- Accessory có `isPersonalizable: true` (vd: `NAME_TAG`, `NAME_ORNAMENT`) → bắt buộc nhập `personalizationText` 1–20 chars, regex `^[A-Za-z0-9 ]{1,20}$`.
- Nếu thiếu → `PERSONALIZATION_REQUIRED` (400). Nếu sai format → `PERSONALIZATION_INVALID` (400).
- Nếu design có `hasPersonalization: true` và `currentStatus === PACKING` → buyer không thể `CANCEL_REQUESTED` (sẽ nhận `ORDER_CANCEL_NOT_ALLOWED`).

### 7. Cart priceChanged warning
- `GET /api/cart` trả `currentUnitTotal` (recompute live) + `priceSnapshot` (giá lúc add).
- Nếu `priceChanged: true` → FE hiển thị banner "Giá đã thay đổi từ {priceSnapshot} → {currentUnitTotal}. Bạn có muốn tiếp tục?"
- Nếu `warning` có giá trị → config không còn hợp lệ với catalog hiện tại (admin vừa tắt tree/style/accessory). FE yêu cầu user chỉnh lại.

### 8. Order status machine (buyer-side actions)
| Current status | Buyer có thể chuyển sang |
| :--- | :--- |
| `PENDING_PAYMENT` | `CANCELLED` |
| `PAID` | `CANCELLED` |
| `CONFIRMED` | `CANCEL_REQUESTED`, `DELIVERED` (early) |
| `PACKING` | `CANCEL_REQUESTED` (trừ khi personalization) |
| `SHIPPING` | `CANCEL_REQUESTED`, `DELIVERED` |
| `DELIVERING` | `DELIVERED`, `COMPLETED` |
| `DELIVERED` | `COMPLETED`, `DISPUTED` |
| `CANCEL_REQUESTED` | (chờ admin xử lý) |
| `COMPLETED`, `CANCELLED`, `DISPUTED` | (terminal) |

> Trừ khi admin, role `seller` KHÔNG tồn tại (single-brand).

### 9. Notification ownership
- `PATCH /api/notifications/:id/read` enforce ownership (user chỉ mark được notification của mình). Trước đây có thể mark của người khác — đã fix (IDOR).

### 10. Admin response shape
- Tất cả admin CRUD (trees, styles, accessories, presets) trả resource dạng camelCase với `_id` stringified. Tương thích trực tiếp với admin form của FE.

---

## Testing

### Unit tests (không cần DB)

```bash
cd backend
npm test              # errorContract (61 tests, 47 codes + status mapping)
npm run test:pricing  # pricing logic (25 tests)
npm run test:address  # CAS address proxy (16 tests)
```

### Tổng hợp

```bash
cd backend
npm run test:all
```

> Hiện tại: **102/102 PASS ✅** (61 + 25 + 16).

### Integration tests

> Hiện không có integration tests với DB thật (legacy `test:auth`/`test:order` đã bỏ theo pivot Christmas). Tất cả business logic đã cover qua:
> - 25 pricing tests (validate config + compute price)
> - 61 error contract tests (catalog + status mapping)
> - 16 address tests (CAS proxy + cache + timeout)

### Khi nào cần DB thật

Để test end-to-end (FE ↔ BE ↔ MongoDB):
1. Đảm bảo `backend/.env` có `MONGODB_URI` trỏ tới MongoDB Atlas hoặc local MongoDB.
2. Chạy `npm run seed -- --confirm-seed` để có data (3 trees, 6 styles, ~25 accessories, 3 presets, 1 admin, 1 buyer demo).
3. Khởi động BE: `npm run dev` → `http://localhost:4000`.
4. Test FE bằng Postman/Insomnia hoặc từ chính FE app.

---

## Common Pitfalls

| Vấn đề | Cách tránh |
| :--- | :--- |
| `DELIVERY_AREA_NOT_SUPPORTED` khi test ở tỉnh khác | Hard-code `shippingProvinceId: "79"` cho mọi test |
| `PERSONALIZATION_REQUIRED` khi test NAME_TAG | Luôn gửi `personalizationText` cho accessories `isPersonalizable: true` |
| `OUT_OF_STOCK` khi test 2 đơn liên tiếp | Stock đã bị reserve ở đơn 1, đơn 2 phải chờ cancel đơn 1 hoặc tăng stock |
| `DESIGN_NOT_CONFIRMED` khi checkout | Luôn gửi `designConfirmed: true` trong body `POST /api/orders` |
| `ORDER_INVALID_TRANSITION` khi PATCH status | Đọc state machine ở `docs/ENUMS.md` § OrderStatus, chỉ gửi transition hợp lệ |
| Token 401 sau 7 ngày | FE nên check `error.code === "TOKEN_INVALID"` → logout + redirect login |
| `priceChanged: true` cảnh báo | Catalog admin có thể đã đổi giá; user confirm trước khi checkout |
