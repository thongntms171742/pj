# AI Context — Build Your Christmas (BE)

> **Pivot 2026-10-07**: Dự án chuyển từ **thrift it! (vintage marketplace)** sang **Build Your Christmas** — single-brand e-commerce với Christmas Tree Editor. Bản gốc marketplace xem [CHANGELOG_AI.md](./CHANGELOG_AI.md) (entry trước 2026-10-07).

## Project Overview
- **Frontend**: Vite + React + TypeScript + Tailwind CSS (port 5173, proxy `/api` → `http://localhost:4000`)
- **Backend**: Express + TypeScript + Mongoose (port 4000)
- **Database**: MongoDB Atlas — `MONGODB_URI` trong `backend/.env` trỏ tới DB `christmas` (đang chạy). DB cũ `thriftit` bị seed script từ chối nếu cố ghi vào.
- **Scope MVP**: HCM-only delivery. 3 sizes (S/M/L) × 6 styles × ~25 phụ kiện × 8 ready-made presets. Không có marketplace: không seller, không hoa hồng, không duyệt listing.

## Backend Structure (`backend/src/`)
### Models
- `User.ts`: người dùng với `roles: ["buyer", "admin"]`, embedded `addresses`. **Không** còn `sellerProfile` hay role `seller`.
- `Tree.ts`: SKU cây thông (size S/M/L — unique), gồm price/stock, kích thước, vật liệu, ảnh.
- `Style.ts`: 6 concept trang trí (CLASSIC, MINIMAL, GINGERBREAD, WINTER, CUTE, LUXURY), palette hex + coverImage.
- `Accessory.ts`: phụ kiện trang trí — 10 loại (LIGHT_STRING, BAUBLE, BELL, CANDY, FIGURINE, BOW, STOCKING, STAR, NAME_TAG, NAME_ORNAMENT), có `styleCodes` để filter theo style và `maxQtyBySize` để giới hạn số lượng theo size cây.
- `TreeDesign.ts`: thiết kế của người dùng (hoặc preset admin), có `slug` unique, `isPreset`, `isPublic`, `duplicatedFrom`, `previewImage`, `config: DesignConfig`.
- `Cart.ts`, `CartItem.ts`: giỏ hàng với item mới — `designId` + `config: DesignConfig` + `priceSnapshot` + `quantity` (số bộ) + `checked`.
- `Order.ts`: giữ `ORDER_STATUSES` + `VALID_TRANSITIONS` + shipping fields. OrderItem viết lại — `tree` (snapshot), `style` (snapshot), `lines[]` (ACCESSORY/SERVICE), `unitTotal`, `quantity`, `deliveryOption`, `hasPersonalization`, `productionDays`, `designId/designName/previewImage`, `designConfirmedAt`, `designLockedAt`.
- `Notification.ts`: thông báo cho buyer.
- `models/index.ts`: re-export tất cả.

### Services (business logic thuần)
- `services/pricingService.ts`: **pure function** `priceDesign(config, catalog)`. Validate toàn bộ (active, style match, qty bound, personalization text, dup accessory, deliveryOption) + tính `unitTotal` + `productionDays` + `hasPersonalization` + `hasService`. Không phụ thuộc DB.
- `services/catalogService.ts`: `loadCatalogForConfig` (1 query tree + 1 style + 1 accessories) → `CatalogSnapshot`. `buildPricedDesign` = load + price. `safelyBuildPricedDesign` wrap catch → `sendError`.
- `services/inventoryService.ts`: `reserveStock` (atomic `$inc` với `stock: { $gte: qty }`, rollback khi lỗi), `restoreStock`, `restoreTreeStock`.
- `services/designService.ts`: `loadCatalogForDesign` (recompute pricing), `buildDesignResponse` (FE-facing shape), `generateDesignSlug` + `findUniqueSlug` (unique slug generator).
- `config/business.ts`: `SHIPPING_FEE = 30_000`, `DECORATION_FEE_BY_SIZE = { S: 50_000, M: 80_000, L: 120_000 }`, `SERVICE_PROVINCE_ID = "79"` (TP.HCM), `DELIVERY_OPTIONS`, `PERSONALIZATION_REGEX`.

### Controllers & Routes
- `authController.ts` + `routes/auth.ts`: `register`, `login`, `updateAvatar`. **Bỏ**: `applySeller`, `/auth/cart/merge`, fields `sellerStatus`/`sellerProfile` trong response.
- `userController.ts` + `routes/users.ts`: sổ địa chỉ (`/me/addresses`) — **giữ nguyên** từ codebase cũ.
- `addressController.ts` + `routes/addresses.ts`: CAS Address Kit proxy — **giữ nguyên** (đã có từ 2026-10-03).
- `catalogController.ts` + `routes/catalog.ts` (MỚI): public. `GET /trees`, `/styles`, `/accessories` (filter group/type/style/size), `/presets`, `/delivery-options`. `POST /quote` cho live pricing.
- `designController.ts` + `routes/designs.ts` (MỚI): `POST /quote` (public), `POST /` (auth), `GET /mine` (auth), `GET /share/:slug` (public/owner), `GET /:id` (owner/admin), `PATCH /:id` (owner), `DELETE /:id` (owner), `POST /:id/duplicate` (auth). Mọi response kèm `pricing` (live total).
- `cartController.ts` + `routes/cart.ts`: `GET /api/cart` (items kèm `currentUnitTotal` + `priceChanged`), `POST /items` (`{ config | designId, quantity }`), `PATCH /items/:id`, `DELETE /items/:id`, `DELETE /clear`. **Bỏ**: `POST /merge` (không có giỏ guest ở MVP).
- `orderController.ts` + `routes/orders.ts`: `POST /` (yêu cầu `designConfirmed: true`, kiểm tra `shippingProvinceId === "79"`, recompute pricing, atomic reserve stock, tạo order, COD → `CONFIRMED` / online → `PENDING_PAYMENT`), `GET /mine`, `GET /:id`, `PATCH /:id/status` (buyer: CANCELLED/CANCEL_REQUESTED/DELIVERED/COMPLETED/DISPUTED, admin: mọi valid transition; hủy cá nhân hóa khi `PACKING` → `ORDER_CANCEL_NOT_ALLOWED`), `POST /:id/shipment` (admin only), `GET /:id/shipment`. **Bỏ**: `GET /seller`.
- `paymentController.ts` + `routes/payments.ts`: `POST /checkout` mock. KHÔNG trừ kho (đã trừ lúc createOrder), KHÔNG thông báo seller. Chỉ chuyển `PENDING_PAYMENT → PAID → CONFIRMED` + idempotent + gửi notification cho buyer.
- `adminController.ts` + `routes/admin.ts` (rewrite): CRUD `trees`, `styles`, `accessories`, `presets` (DELETE được cho presets). `GET /orders?status=`. `GET /stats` (totalOrders, revenue, aov, ordersByStatus, designsCreated/Shared, personalizationCount, lowStock). `GET /users`, `PATCH /users/:id/status`, `GET /users/:id/details`. **Bỏ**: pending-listings, pending-sellers, commission-rate.
- `notificationController.ts` + `routes/notifications.ts`: **giữ nguyên**.
- `app.ts`: mount `/api/{auth,users,addresses,catalog,designs,cart,orders,payments,notifications,admin}` + `/api/health` + 404 + global error handler.

### Middleware (`middleware/auth.ts`)
- `requireAuth`, `requireAdmin`, `signToken` — **giữ nguyên** từ codebase cũ.
- `optionalAuth` — giữ nguyên (cho share/quote public endpoints).

### Error contract (`utils/errors.ts`)
- Format: `{ error: { code, message } }`. Tất cả 8 controllers + middleware đều đi qua `sendError`/`handleInternalError`.
- **Catalog 47 codes** (đã xóa 22 codes marketplace: SELLER_*, PRODUCT_*, REVIEW_*, AI_*, COMMISSION_*, SELF_PURCHASE_NOT_ALLOWED, ORDER_SELLER_CANNOT_DELIVER, PRODUCT_ALREADY_NOT_FOR_SALE).
- **Thêm mới**:
  - `TREE_NOT_FOUND`, `STYLE_NOT_FOUND`, `ACCESSORY_NOT_FOUND`, `DESIGN_NOT_FOUND` → 404
  - `CATALOG_ITEM_UNAVAILABLE` → 409
  - `ACCESSORY_STYLE_MISMATCH`, `ACCESSORY_QUANTITY_INVALID`, `ACCESSORY_DUPLICATED` → 400
  - `PERSONALIZATION_REQUIRED`, `PERSONALIZATION_INVALID` → 400
  - `DELIVERY_OPTION_INVALID`, `DESIGN_CONFIG_INVALID`, `DESIGN_NOT_CONFIRMED` → 400
  - `DELIVERY_AREA_NOT_SUPPORTED` → 422
  - `OUT_OF_STOCK` (thay `PRODUCT_OUT_OF_STOCK`) → 409
  - `ORDER_CANCEL_NOT_ALLOWED` → 409
  - `DESIGN_NAME_REQUIRED`, `DESIGN_SLUG_TAKEN` → 400/409
  - `CART_EMPTY`, `NO_ITEMS_CHECKED`, `CART_NOT_FOUND`, `CART_ITEM_NOT_FOUND` → 400/404

### Configuration (`backend/.env`)
- `MONGODB_URI`: trỏ tới DB `christmas` trên Atlas. BE KHÔNG đụng secret này.
- `JWT_SECRET`: giữ nguyên.
- `PORT`: 4000.
- `SERVICE_PROVINCE_ID`: optional override (default `"79"`).
- `SEED_ADMIN_PASSWORD`, `SEED_BUYER_PASSWORD`: dùng bởi `seed-christmas.ts` (không hard-code).

## Test Accounts (sau khi seed)
- Admin: `admin@buildyourchristmas.vn` / `SEED_ADMIN_PASSWORD`
- Buyer demo: `buyer@buildyourchristmas.vn` / `SEED_BUYER_PASSWORD`

## Deployment (Render.com)
- Root `render.yaml` chưa cập nhật cho pivot này. TODO: review lại service names + env vars khi chốt deploy plan.

## Core Flows
### 1. Design Editor → Quote → Save (catalog + designService + pricingService)
- FE chọn Tree (S/M/L) + Style + accessories (qty, có thể có personalization text) + deliveryOption.
- `POST /api/catalog/quote` (public) → trả `PriceBreakdown` live (không cần login).
- Sau khi user chốt, login → `POST /api/designs` → BE validate lại qua `buildPricedDesign` → lưu `TreeDesign` với slug unique.
- `GET /api/designs/share/:slug` cho phép người khác (không cần login nếu `isPublic=true`) xem qua link share. Owner edit bằng `PATCH /api/designs/:id` (chỉ owner). `POST /api/designs/:id/duplicate` để nhân bản (cho năm sau).

### 2. Cart (`cartController.ts`)
- `GET /api/cart`: trả items + `currentUnitTotal` (recompute live) + `priceChanged` flag + `warning` nếu config không hợp lệ.
- `POST /api/cart/items`: 2 body shape — `{ config, quantity }` (config inline) hoặc `{ designId, quantity }` (clone từ design đã lưu). Validate qua `buildPricedDesign`.
- `PATCH /api/cart/items/:id`: `quantity`, `checked`, hoặc `config` mới.
- `DELETE /api/cart/items/:id` / `/clear`.

### 3. Checkout (HCM only)
- `POST /api/orders`: bắt buộc `designConfirmed: true`. Nguồn hàng: `cartItemIds[]`, checked cart items, hoặc inline `items[]`.
- BE check `shippingProvinceId === "79"` (constant `SERVICE_PROVINCE_ID`) → nếu khác thì `DELIVERY_AREA_NOT_SUPPORTED`.
- BE recompute pricing cho từng item, sau đó `reserveStock` atomic. Nếu một món hết → rollback toàn bộ + trả `OUT_OF_STOCK`.
- Tạo order với **snapshot đầy đủ** (`tree`, `style`, `lines[]`, `unitTotal`, `quantity`, `deliveryOption`, `hasPersonalization`, `productionDays`) + `designConfirmedAt` + `designLockedAt`.
- COD → `CONFIRMED` (kèm status history), online → `PENDING_PAYMENT`.
- Dọn cart items đã dùng. Notification cho buyer.

### 4. Payment + Status Transitions
- `POST /api/payments/checkout` (mock) — chỉ flip status, KHÔNG đụng stock, KHÔNG notify seller.
- `PATCH /api/orders/:id/status`:
  - Admin: mọi transition hợp lệ theo `VALID_TRANSITIONS`.
  - Buyer: `CANCELLED` (chỉ khi `PENDING_PAYMENT`/`PAID`), `CANCEL_REQUESTED` (khi ≥ `CONFIRMED`), `DELIVERED`, `COMPLETED`, `DISPUTED`. Khi `CANCELLED` → `restoreStock` cho cả tree + accessories.
  - **Q5**: nếu `hasPersonalization` và `currentStatus === "PACKING"` → block `CANCEL_REQUESTED` với `ORDER_CANCEL_NOT_ALLOWED`.

### 5. Shipment (admin only)
- `POST /api/orders/:id/shipment` (admin) — tạo `BYC#######` tracking number, `Build Your Christmas - HCM Delivery` provider, status `SHIPPING`, 2 events ban đầu (`CREATED`, `IN_TRANSIT`).
- `GET /api/orders/:id/shipment` (buyer/admin) — trả shipment hiện tại + events.

### 6. Admin (catalog + orders + users)
- CRUD cho trees/styles/accessories (chỉ PATCH, không DELETE — soft delete qua `isActive=false` để giữ snapshot lịch sử).
- CRUD cho presets (TreeDesign có `isPreset=true`) — có cả DELETE.
- `GET /api/admin/orders?status=`: tất cả đơn, dùng chung `mapOrder`.
- `GET /api/admin/stats`: `totalOrders, pendingOrders, completedOrders, totalUsers, totalDesigns, designsShared, revenue, aov, personalizationCount, ordersByStatus, lowStock { accessories, trees }`.
- `GET /api/admin/users`, `PATCH /:id/status`, `GET /:id/details` (giữ).

## Database Management Best Practices
1. **Never delete historical data**: trees/styles/accessories chỉ soft-delete (`isActive=false`). Orders/Notifications/Designs tuyệt đối không xóa. OrderItem phải có snapshot đầy đủ nên ngay cả khi accessory/archive bị ẩn, đơn cũ vẫn render đúng.
2. **Separate DB**: hiện đang dùng DB `christmas` (rename từ `thriftit`). KHÔNG xóa hay migrate data từ cluster cũ.
3. **Safe DB Seed**: `npm run seed -- --confirm-seed`. Script **từ chối chạy** nếu URI vẫn trỏ về `thriftit`. Mật khẩu từ env, không hard-code.
4. **No destructive reset** được ship kèm Christmas (vứt bỏ `reset-demo-db.ts` legacy).

## API Contract & Documentation (`docs/`)
Tất cả docs đang được rewrite theo pivot Christmas. Cập nhật sẽ theo từng bước trong plan.
- `API_CONTRACT.md`: 7 contract fields/endpoint, bao phủ Auth/Users/Addresses/Catalog/Designs/Cart/Orders/Payments/Notifications/Admin.
- `openapi.yaml`: OpenAPI 3.0.3, cập nhật từng bước.
- `AUTH_SPEC.md`: role matrix mới (chỉ buyer/admin, không seller) — đã rewrite 2026-10-07.
- `ENUMS.md`: mới thêm `TreeSize`, `StyleCode`, `AccessoryGroup`, `AccessoryType`, `DeliveryOption`, `OrderLineKind` — đã rewrite 2026-10-07.
- `ERROR_CODES.md`: 47 codes mới — đã rewrite 2026-10-07.
- `API_MATRIX.md`: tiến độ Christmas-specific — đã rewrite 2026-10-07.
- `API_CHANGELOG.md`: entry breaking change 2026-10-07 (marketplace → Christmas) — đã thêm entry pivot chi tiết 2026-10-07.
- `INTEGRATION_GUIDE.md`: hướng dẫn đổi DB + test accounts Christmas — đã rewrite 2026-10-07.
- `openapi.yaml`: OpenAPI 3.0.3 đầy đủ Christmas-specific (44 paths, 25 schemas, 11 tags) — đã rewrite 2026-10-07, validate YAML OK.

> **Trạng thái docs 2026-10-07**: Tất cả 8 file docs (`API_CONTRACT.md` 1050 dòng, `API_CHANGELOG.md` 353 dòng, `openapi.yaml` 1937 dòng, `ERROR_CODES.md` 174 dòng, `ENUMS.md` 167 dòng, `AUTH_SPEC.md` 131 dòng, `INTEGRATION_GUIDE.md` 117 dòng, `API_MATRIX.md` 99 dòng) đã được rewrite cho khớp với implementation Christmas. FE có thể dựng UI/UX dựa trên các file này — đây là single source of truth cho contract.

## Backend Architecture Refactor (2026-10-07) — Christmas Pivot

### Breaking changes
- **Bỏ toàn bộ marketplace**: `/api/products`, `/api/sellers`, `/api/ai`, admin listing/seller moderation. Mọi thứ liên quan tới seller, hoa hồng, duyệt listing → xóa file.
- **DB đang dùng**: `christmas` (rename từ `thriftit`). Seed script refuse nếu URI vẫn là `thriftit`.
- **Auth response đơn giản hoá**: không còn `sellerStatus`/`sellerProfile`.
- **Catalog/Design/Cart/Order có shape mới**: xem "Core Flows" ở trên.
- **Order status machine giữ nguyên**, chỉ thay đổi payload (OrderItem là snapshot thay vì productId/sellerId).
- **HCM only**: mọi order ngoài province `79` bị reject.

### Verification
- ✅ `npx tsc --noEmit` pass (exit 0).
- ✅ `npm run build` pass (exit 0).
- ✅ `npm test` (errorContract) pass — **61/61 PASS** (catalog 47 codes, không còn codes marketplace).
- ✅ `npm run test:pricing` pass — **25/25 PASS** (cover concept example, qty bound, style match, personalization, dup accessory, delivery option, decoration fee theo size).
- ✅ `npm run test:address` pass — **16/16 PASS** (CAS proxy + province/commune discovery, HCM-79 logic).

### AI Handoff Readiness Review (2026-10-07, end of pivot)
- ✅ Tất cả routes BE ready cho FE song song: auth, users, addresses (CAS), catalog (trees/styles/accessories/presets/delivery-options/quote), designs (CRUD + share + mine + duplicate + quote), cart (CRUD + clear), orders (POST + GET + PATCH status + shipment), payments (checkout), notifications, admin (catalog CRUD + presets + orders + stats + users).
- ✅ Code mu source-of-truth: `docs/API_MATRIX.md` đã viết lại 2026-10-07 cho khớp với implementation Christmas (bỏ các endpoint marketplace: `/sellers/*`, `/products/*`, `/ai/*`, `/orders/seller`, `/orders/:code/*`, `/payments/:code/cod-collect`, `/admin/pending-*`, `/admin/listings/*`, `/admin/sellers/*`, `/auth/seller/apply`, `/auth/cart/merge`, `/cart/merge`).
- ✅ Error contract: format `{ error: { code, message } }` chuẩn hoá, 47 codes Christmas-specific, đã verify qua 61 passing tests.
- ⚠️ **Cần FE xác nhận khi integrate**:
  - `.env` đang trỏ DB `christmas` trên Atlas cluster `cluster0.jkkqqk7.mongodb.net`. Hoạt động bình thường, không bị seed block. BE KHÔNG đụng secret.
  - JWT secret trong `.env` = `byc_2026_christmas_dev_secret_change_in_production_8f3a9b2c`. Production nên override qua `process.env.JWT_SECRET` (Render sẽ tự generate qua `render.yaml`).
  - Seed passwords (`SEED_ADMIN_PASSWORD` = `Admin@BYC2026`, `SEED_BUYER_PASSWORD` = `Buyer@BYC2026`) trong `.env` chỉ dùng cho development. Production nên đổi sang strong random.
  - **All docs synced với code Christmas** (2026-10-08 audit pass). FE có thể dùng `API_CONTRACT.md` + `ERROR_CODES.md` + `ENUMS.md` + `API_MATRIX.md` + `openapi.yaml` làm single source of truth.
  - Support chat: CHƯA có real-time channel. `Notification` đã có `type: "chat"` enum nhưng controller chỉ có GET/PATCH notifications; chưa có conversation model / WebSocket. Xếp vào backlog post-MVP (dùng Zalo/email tạm).
- ✅ Không còn TODO chặn FE: catalog/design/cart/order/payment/notification/admin đều PASS test, BE có thể serve song song ngay khi FE call.

### Known limitations / Backlog
- "Your 2026 Christmas" duplicate flow là API cơ bản — FE tự handle year filter.
- Không có email/SMS confirmation.
- Stock rollback dùng manual (không Mongo transaction) — đủ cho MVP.
- Chưa có idempotency cho `/api/orders` (chỉ dùng `idempotencyKey` optional).
- Lint/format: project KHÔNG có sẵn (để giữ MVP gọn, không thêm dependency).

## 2026-10-08 — Docs audit pass (Christmas-clean)

> **Audit pass** toàn bộ folder `docs/` để chuẩn bị handoff cho FE. Đã sửa các inconsistency còn sót từ marketplace era.

### Changes

- **`FLAT_PACK` → `DIY_KIT` / `SEPARATE`** trong 5 files: `ERROR_CODES.md`, `API_MATRIX.md`, `openapi.yaml`, `API_CHANGELOG.md`, `API_CONTRACT.md`. BE chỉ support 3 delivery options.
- **`MVP_FE_BE_DOCUMENTATION.md`**: removed sections `GET /banners`, `POST /newsletter/subscribe`, `GET/POST/PATCH/DELETE /api/admin/banners` (BE không có). Added note "NOT IN MVP SCOPE".
- **`MVP_FE_BE_DOCUMENTATION.md`**: removed `GET /api/users/me` (BE không có profile endpoint riêng).
- **`MVP_FE_BE_DOCUMENTATION.md`**: removed `DELETE /api/admin/trees/:id` + `DELETE /api/admin/styles/:id` + `DELETE /api/admin/accessories/:id` (BE chỉ soft-delete qua PATCH).
- **`AI_CONTEXT.md`**: trimmed từ 435 → 179 dòng (bỏ 250+ dòng legacy marketplace). DB name synced từ `buildyourchristmas` → `christmas` (theo `backend/.env` thực tế).
- **`docs/_archive/README.md`**: file mới, archive tất cả thông tin legacy (seller/products/AI/commission/Ledger).
- **`docs/README.md`** + **`docs/ONBOARDING.md`**: mới - onboarding index cho FE team.

### Verification

- ✅ `npx tsc --noEmit` pass.
- ✅ `npm run test:all` — 203/203 PASS (61 errorContract + 25 pricing + 16 address + 87 authValidation + 14 presetsResilience).
- ✅ `openapi.yaml` validates: 44 paths, 25 schemas, 11 tags (match BE routes).
- ✅ Không còn `FLAT_PACK` trong bất kỳ file nào.
- ✅ `ERROR_CODES.md` + `API_MATRIX.md` + `API_CONTRACT.md` + `openapi.yaml` đồng bộ về delivery options (3 values).
- ✅ `API_MATRIX.md` (cột BE Status) match với code BE thực tế.
- ✅ Production `/api/catalog/presets` & `/api/admin/presets` resilient với orphaned presets (2026-10-08 fix).

### File count

- Before: 13 files, 284 KB
- After: 16 files (added README.md, ONBOARDING.md, _archive/README.md), 274 KB

---

## Legacy marketplace content (REMOVED)

Toan bo noi dung legacy (seller/products/AI/commission/Ledger) da duoc chuyen sang [docs/_archive/README.md](./_archive/README.md) de khong lam confuse FE team. File `AI_CONTEXT.md` nay chi chua thong tin Christmas hien tai.
