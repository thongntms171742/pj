# FE Onboarding — Build Your Christmas

> **Cho ai?** Dev FE mới vào dự án. Đọc xong file này xong sẽ biết phải làm gì tiếp theo.

## 🎯 Mục tiêu MVP

Build giao diện cho 1 single-brand e-commerce: **Build Your Christmas**.

- **Phạm vi**: TP. Hồ Chí Minh only (province ID = `79`).
- **Catalog**: 3 sizes cây (S/M/L) × 6 styles × ~25 phụ kiện × 8 ready-made presets.
- **Flow chính**: Tree Selector → Style Selector → Accessory Picker → Live Quote → Save Design → Add to Cart → Checkout → Track Order.
- **Auth**: JWT (7d expiry), 2 roles: `buyer` (default) + `admin`.

## ✅ Setup Checklist (làm theo thứ tự)

### Bước 1: Setup môi trường (30 phút)

- [ ] Đọc [docs/README.md](./README.md) (file này).
- [ ] Cài Node.js 20+ (`node --version`).
- [ ] Cài MongoDB Atlas account (BE đã có cluster sẵn).
- [ ] Clone repo.
- [ ] `cd backend && npm install`
- [ ] `cd frontend && npm install`

### Bước 2: Start BE + seed data (15 phút) — OPTION

Có 2 cách dev:

**Option A: Dùng BE đã deploy trên Render (recommended cho frontend dev)**
- Không cần cài BE local. Mọi API call đi qua `https://christmas-8ca4.onrender.com/api`.
- Đảm bảo `frontend/.env.development` có:
  ```
  VITE_API_BASE_URL=https://christmas-8ca4.onrender.com/api
  VITE_API_TARGET=https://christmas-8ca4.onrender.com
  ```
- BE Render có thể sleep sau 15 phút không traffic → request đầu tiên ~30s để wake up. Sau đó nhanh bình thường.
- Test account: `buyer@buildyourchristmas.vn` / `Buyer@BYC2026` (seed sẵn).

**Option B: Chạy BE local (cho BE dev hoặc test offline)**
- Copy `backend/.env.example` thành `backend/.env` (nếu có), hoặc dùng env có sẵn.
- Check `backend/.env` có:
  - `MONGODB_URI` (trỏ tới cluster Atlas, DB name = `christmas`).
  - `JWT_SECRET`.
  - `SEED_ADMIN_PASSWORD`, `SEED_BUYER_PASSWORD`.
- `cd backend && npm run seed -- --confirm-seed` → seed 3 trees, 6 styles, ~25 accessories, 3 presets, 1 admin, 1 buyer.
- `npm run dev` → BE chạy ở `http://localhost:4000`.
- Verify: `curl http://localhost:4000/api/health` → `{ "status": "ok", ... }`.
- Đổi `frontend/.env.development` thành `VITE_API_BASE_URL=http://localhost:4000/api`.

### Bước 3: Start FE (10 phút)

- File env dùng `VITE_API_BASE_URL` (không phải `VITE_API_URL`).
- `cd frontend && npm run dev` → FE chạy ở `http://localhost:5173`.
- Mở browser → `http://localhost:5173` → thấy HomePage.
- Click "Đăng nhập" → dùng `buyer@buildyourchristmas.vn` / `Buyer@BYC2026` (BE Render seed sẵn).

### Bước 4: Smoke test API (15 phút)

- [ ] Mở DevTools Network tab.
- [ ] Thử login → verify call `POST /api/auth/login` trả `{ token, user }`.
- [ ] Vào `/editor` → thử chọn cây + style + accessories.
- [ ] Verify call `POST /api/catalog/quote` trả `{ pricing: { unitTotal, ... } }`.
- [ ] Save design → verify call `POST /api/designs` trả `{ design, shareUrl }`.

## 🗂 Đọc docs theo thứ tự (khi bắt đầu code từng phần)

### Làm Auth → đọc [AUTH_SPEC.md](./AUTH_SPEC.md)
- Endpoint: `POST /api/auth/register`, `POST /api/auth/login`, `PUT /api/auth/me/avatar`.
- Lưu token vào `localStorage("token")`.
- Gửi `Authorization: Bearer <token>` cho mọi protected request.
- Handle `401 TOKEN_INVALID` → clear token + redirect login.

### Làm Catalog/Editor → đọc [API_CONTRACT.md § Catalog](./API_CONTRACT.md#catalog-public) + [ENUMS.md](./ENUMS.md)
- Gọi `GET /api/catalog/trees`, `/styles`, `/accessories` (filter `?group=&type=&size=`).
- Cache `_id` của tree/style/accessory (ObjectId) - dùng làm input cho `POST /api/catalog/quote`.
- ĐỪNG dùng `treeSize` hay `styleCode` (đó là code cũ, BE không nhận).

### Làm Cart → đọc [API_CONTRACT.md § Cart](./API_CONTRACT.md#cart) + [API_INTEGRATION_CHECKLIST.md](./API_INTEGRATION_CHECKLIST.md)
- `POST /api/cart/items` nhận `{ config: DesignConfig, quantity }` HOẶC `{ designId, quantity }`.
- `GET /api/cart` trả `currentUnitTotal` + `priceChanged` flag → show warning nếu `priceChanged: true`.

### Làm Checkout → đọc [API_CONTRACT.md § Orders](./API_CONTRACT.md#orders) + [ERROR_CODES.md](./ERROR_CODES.md#delivery-2)
- `POST /api/orders` BẮT BUỘC `designConfirmed: true` + `shippingProvinceId: "79"`.
- Province khác `79` → `422 DELIVERY_AREA_NOT_SUPPORTED` → disable checkout.
- Personalization + `PACKING` → `409 ORDER_CANCEL_NOT_ALLOWED` (buyer không thể cancel).

### Làm Admin → đọc [API_MATRIX.md § Admin](./API_MATRIX.md)
- Tất cả `/api/admin/*` require role `admin`.
- Trees/Styles/Accessories: KHÔNG có DELETE - chỉ soft-delete qua PATCH `{ isActive: false }`.
- Presets: có DELETE.

## 🚫 Những thứ KHÔNG có trong MVP

- ❌ Banner slider (HomePage) - dùng static slides.
- ❌ Newsletter form - skip hoặc integrate Zalo/email.
- ❌ `GET /api/users/me` profile - dùng response từ login.
- ❌ Live chat / Conversation model - dùng `Notification` với `type: "chat"` placeholder.
- ❌ Reviews - bỏ cho MVP.
- ❌ AI recommendations - bỏ (FE tự compose).
- ❌ Seller concept - đã bỏ (single-brand).

Xem chi tiết: [MVP_FE_BE_DOCUMENTATION.md § NOT IN MVP SCOPE](./MVP_FE_BE_DOCUMENTATION.md#not-in-mvp-scope).

## 🐛 Common pitfalls

| Lỗi | Cách tránh |
|-----|------------|
| `DELIVERY_AREA_NOT_SUPPORTED` khi test tỉnh khác | Hard-code `shippingProvinceId: "79"` cho mọi test |
| `PERSONALIZATION_REQUIRED` khi test NAME_TAG | Luôn gửi `personalizationText` cho accessories `isPersonalizable: true` |
| `OUT_OF_STOCK` khi test 2 đơn liên tiếp | Stock đã reserve ở đơn 1, đơn 2 phải chờ cancel đơn 1 hoặc tăng stock |
| `DESIGN_NOT_CONFIRMED` khi checkout | Luôn gửi `designConfirmed: true` trong body `POST /api/orders` |
| `ORDER_INVALID_TRANSITION` khi PATCH status | Đọc state machine ở [ENUMS.md § OrderStatus](./ENUMS.md#orderstatus-state-machine-11-values) |
| Token 401 sau 7 ngày | Check `error.code === "TOKEN_INVALID"` → logout + redirect login |
| `priceChanged: true` cảnh báo | Catalog admin có thể đã đổi giá; user confirm trước khi checkout |

## 📞 Khi cần hỏi

1. Đọc docs liên quan (xem [docs/README.md](./README.md) § Reading order).
2. Test trực tiếp với Postman/Insomnia + `backend/src/` code.
3. Nếu vẫn chưa rõ → ping BE team.
4. Nếu thấy docs sai → báo BE để update cả docs lẫn code.

## 🧪 Test accounts (sau khi seed)

| Role | Email | Password | Purpose |
|------|-------|----------|---------|
| Admin | `admin@buildyourchristmas.vn` | value of `SEED_ADMIN_PASSWORD` env | Test `/api/admin/*` |
| Buyer demo | `buyer@buildyourchristmas.vn` | value of `SEED_BUYER_PASSWORD` env | Test full buyer flow |

> Password lấy từ env vars (xem `backend/.env`). KHÔNG hard-code trong code.
