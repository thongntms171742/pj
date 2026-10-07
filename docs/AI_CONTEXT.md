# AI Context — Build Your Christmas (BE)

> **Pivot 2026-10-07**: Dự án chuyển từ **thrift it! (vintage marketplace)** sang **Build Your Christmas** — single-brand e-commerce với Christmas Tree Editor. Bản gốc marketplace xem [CHANGELOG_AI.md](./CHANGELOG_AI.md) (entry trước 2026-10-07).

## Project Overview
- **Frontend**: Vite + React + TypeScript + Tailwind CSS (port 5173, proxy `/api` → `http://localhost:4000`)
- **Backend**: Express + TypeScript + Mongoose (port 4000)
- **Database**: MongoDB Atlas — user phải tự trỏ `MONGODB_URI` sang DB `buildyourchristmas` (BE không đụng secret). DB cũ `thriftit` bị seed script từ chối nếu cố ghi vào.
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
- `MONGODB_URI`: trỏ tới DB `buildyourchristmas` (user tự đổi từ `thriftit`). BE KHÔNG đụng secret này.
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
2. **Separate DB**: chuyển sang `buildyourchristmas` DB, KHÔNG xóa hay migrate data từ `thriftit` (xem Lưu ý của user).
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
- **DB đổi sang `buildyourchristmas`**: user tự đổi `MONGODB_URI`. Seed script refuse nếu vẫn là `thriftit`.
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
  - `.env` đang trỏ DB `christmas` — cần đổi sang `buildyourchristmas` (theo plan) hoặc giữ `christmas` (cũng hoạt động được, không bị seed block). BE KHÔNG đụng secret.
  - JWT secret fallback `"thriftit_super_secret_key_change_me"` đã được nâng cấp trong `.env` thành `JWT_SECRET=thriftit_abc` — nhưng production nên override qua `process.env.JWT_SECRET`.
  - Support chat: CHƯA có real-time channel. `Notification` đã có `type: "chat"` enum nhưng controller chỉ có GET/PATCH notifications; chưa có conversation model / WebSocket. Xếp vào backlog post-MVP (dùng Zalo/email tạm).
- ⚠️ `API_CHANGELOG.md`, `API_CONTRACT.md`, `openapi.yaml` đang còn một phần legacy thriftit — chưa rewrite sạch cho Christmas. Khi FE integrate, nếu thấy docs lệch với endpoint thực tế → báo lại BE để update.
- ✅ Không còn TODO chặn FE: catalog/design/cart/order/payment/notification/admin đều PASS test, BE có thể serve song song ngay khi FE call.

### Known limitations / Backlog
- "Your 2026 Christmas" duplicate flow là API cơ bản — FE tự handle year filter.
- Không có email/SMS confirmation.
- Stock rollback dùng manual (không Mongo transaction) — đủ cho MVP.
- Chưa có idempotency cho `/api/orders` (chỉ dùng `idempotencyKey` optional).
- Lint/format: project KHÔNG có sẵn (để giữ MVP gọn, không thêm dependency).

---

> Phần phía dưới là phần cũ của thrift it! marketplace — giữ lại để tham khảo, không còn áp dụng cho Christmas.

## Core Flows (Cart, Checkout/Payment, Shipment Tracking)
### 1. Cart Flow (`cartController.ts`, `routes/cart.ts`)
- `GET /api/cart`: Fetches authenticated user's cart and items populated with seller and category info, formatted via `mapCartItem`.
- `POST /api/cart/items`: Adds item with checks: product exists, `status === 'active'`, `quantity > 0`, prevents self-purchase (`product.sellerId === userId`), and validates combined cart quantity does not exceed available stock.
- `PATCH /api/cart/items/:id`: Updates quantity (stock validation, auto-deletes if quantity <= 0) and `checked` status with strict user cart ownership isolation.
- `DELETE /api/cart/items/:id`: Removes item ensuring it belongs to caller's cart.
- `DELETE /api/cart/clear`: Clears all items in the user's cart.
- `POST /api/cart/merge`: Merges guest cart items upon login.

### 2. Checkout & Payment Flow (`orderController.ts`, `paymentController.ts`)
- `POST /api/orders`:
  - Supports checkout via checked cart items or custom `items` payload.
  - Validates active status, stock availability, and self-purchase restrictions.
  - **COD Orders**: Immediately transitioned to `CONFIRMED`, stock decremented immediately (`quantity = quantity - item.quantity`; if 0, `status = 'sold'`), and sends notifications to both buyer and seller.
  - **Card / Online Orders**: Initial status `PENDING_PAYMENT`, temporarily places items on hold (`status = 'reserved'`, `reservedUntil = Date.now() + 30m`, `reservedByOrderId = order._id`).
- `POST /api/payments/checkout`:
  - Advances order `PENDING_PAYMENT` -> `PAID` -> `CONFIRMED`.
  - Finalizes inventory decrement (marks remaining stock `active` or `sold`), clears reservation holds, and sends notifications to buyer and seller.
  - Writes to `Ledger` to debit `PLATFORM_CASH` and credit `PLATFORM_REVENUE` (based on `PlatformFeeConfig`) and `SELLER_PAYABLE`.
- `POST /api/orders/:code/cod-collect` or `/api/payments/:code/cod-collect`:
  - Idempotent COD collection logic utilizing `Ledger` to ensure double-collection never occurs.

### 3. Shipment & Live Tracking Flow (`orderController.ts`, `routes/orders.ts`)
- `GET /api/orders/seller`: Retrieves all orders containing products sold by the authenticated seller (properly registered before `/:id` to avoid route collisions).
- `POST /api/orders/:code/shipment`: Seller generates shipping label (`provider`: GHTK, unique tracking number `GHTK...`, tracking URL, estimated delivery, and pickup info). Moves order to `SHIPPING` and creates initial timeline events (`CREATED`, `PICKED_UP`, `IN_TRANSIT`).
- `GET /api/orders/:code/shipment`: Returns live shipping details and timeline events matching frontend `Shipment` interface.

### 4. Seller & Shop Flow (`sellerController.ts`, `productController.ts`, `routes/sellers.ts`)
- **Seller Application Workflow**: Users start with `sellerStatus: "NONE"`. They can apply via `POST /api/auth/seller/apply` which sets status to `"PENDING"`. Admins approve/reject via `PATCH /api/admin/sellers/:id/approve` and `PATCH /api/admin/sellers/:id/reject` (in `adminController.ts`).
- **Product Creation Guardrails**: `POST /api/products` explicitly requires `user.sellerStatus === "APPROVED"` to enforce authorization.
- `GET /api/sellers`: Returns list of all active sellers mapped with dual frontend property aliases (`name` & `shopName`, `avatar` & `avatarUrl`, `thumbs` & `coverImages`, `transactions` & `totalTransactions`, `_id` & `id`).
- `GET /api/sellers/me`: Returns profile of the currently authenticated seller.
- `GET /api/sellers/:idOrHandle`: Case-insensitive seller lookup supporting handle with/without `@` prefix (e.g. `@minhtu.vintage` or `minhtu.vintage`), email, shopName, or MongoDB ObjectId.
- `GET /api/sellers/:idOrHandle/products`: Returns all active products belonging to the specified seller with populated seller and category details.
- `GET /api/products/mine` / `GET /api/products/seller`: Returns all products belonging to the authenticated seller (including `pending`, `active`, `sold`) and computes real-time seller statistics (`totalProducts`, `activeProducts`, `pendingProducts`, `soldProducts`, `totalViews`, `totalLikes`, `estimatedRevenue`).
- `mapProduct` in `productController.ts`: Returns `seller` (string handle), `sellerName`, `sellerAvatar`, `name` (alias for `title`), and `image` (alias for `coverImage`) alongside populated `sellerId` so frontend `products.filter(p => p.seller === seller.handle)` and `ProductCard` render cleanly.

## Database Management Best Practices (Feature Freeze & Outcome 1)
1. **Never delete historical data:** Products should be `archived` instead of deleted if they have dependent orders or reviews to avoid orphan references. Financial collections (`ledgers`, `platformfeeconfigs`, `orders`) should NEVER be truncated via scripts.
2. **Safe DB Reset**: Use `npx ts-node --transpile-only scripts/reset-demo-db.ts --execute --confirm-reset` to safely clean the active catalog while preserving history.
3. **Safe DB Seed**: Use `npx ts-node --transpile-only scripts/seed-demo-products.ts --execute --confirm-seed` to create fresh demo products for testing. Avoid using the old `seed.ts`.

## API Contract & Documentation (`docs/`)
The project follows a strict API contract model between the Frontend and Backend teams. All API documentation is located in the `docs/` folder:
- `API_CONTRACT.md`: The primary human-readable contract detailing endpoints, request/response formats, and required auth/roles. Covers all 35 endpoints (Auth, Sellers, Products, Cart, Orders, Shipments, Payments, Notifications, Admin, AI, Health). Each endpoint documents all 7 contract fields: Endpoint, Method, Auth/Authorization, Request body, Query/Path params, Success response, Errors. Includes mapping tables for order status state machine and shipment status derivation.
- `AUTH_SPEC.md`: Specifics on authentication, tokens, and role-based access control matrix.
- `ENUMS.md`: A unified vocabulary of enums (Order Status 11 values, Product Status, Product Condition, Seller Status, Payment Methods, Notification Type, Shipment Status, Error Codes). Now fully in sync with `backend/src/models/*` and `backend/src/utils/errors.ts`.
- `ERROR_CODES.md`: ~40 standardized business error codes mapped to FE actions and HTTP statuses. Format đã chuẩn hóa thành `{ error: { code, message } }` (xem Backend notes bên dưới).
- `API_CHANGELOG.md`: Tracks changes and breaking changes to the API over time. Có entry mới 2026-09-29 ghi nhận breaking change về error envelope + admin shape.
- `INTEGRATION_GUIDE.md`: Test accounts thật (lấy từ seed data) + health check + notes quan trọng cho FE.
- `API_MATRIX.md`: Progress tracking of feature completion on both BE and FE.

**Source of Truth:** API Contract là source of truth cho giao tiếp giữa FE và BE; Backend implementation và automated tests phải được kiểm tra để bảo đảm contract phản ánh API thực tế. Backend chịu trách nhiệm cập nhật các document này trước khi đánh dấu một tính năng là DONE. Frontend dựa vào các document này để làm thay vì phải tự đoán API behavior.

## Backend Architecture Refactor (2026-09-29)

### Unified Error Response System

Đã chuẩn hóa toàn bộ error response format thành `{ error: { code, message } }`:

- **`backend/src/utils/errors.ts`** (MỚI): Single source of truth chứa:
  - `ErrorCode` const object với ~40 business error codes (PRODUCT_NOT_FOUND, SELLER_NOT_APPROVED, ORDER_INVALID_TRANSITION, ...).
  - `ErrorStatus` map: HTTP status mặc định cho mỗi code.
  - `sendError(res, code, message, status?)` helper.
  - `handleInternalError(res, err, context)` helper cho catch block (log + trả INTERNAL_ERROR, không leak stack trace).
  - `ApiErrorBody` interface export để FE consumer có type-safe.

- **Tất cả 9 controllers + middleware** đã được refactor để dùng helper:
  - `controllers/authController.ts`
  - `controllers/productController.ts`
  - `controllers/cartController.ts`
  - `controllers/orderController.ts`
  - `controllers/paymentController.ts`
  - `controllers/sellerController.ts`
  - `controllers/adminController.ts`
  - `controllers/notificationController.ts`
  - `controllers/aiController.ts`
  - `middleware/auth.ts` (requireAuth, requireAdmin)
  - `app.ts` (404 wildcard + global error handler)

### Additional Fixes

1. **Admin endpoints chuẩn hóa shape**: `PATCH /api/admin/listings/:id/approve` và `.../reject` giờ chạy qua `mapProduct` → response CÙNG shape với `GET /api/products` (thay vì raw Mongoose document).

2. **Notification ownership fix**: `PATCH /api/notifications/:id/read` giờ enforce ownership (chỉ mark notification của mình) — fix IDOR.

3. **Auth response bổ sung**: `POST /api/auth/register` và `.../login` giờ trả `user._id` + `user.sellerStatus` trong response.

4. **Cart merge deprecation**: `/api/auth/cart/merge` trở thành thin wrapper delegate to `/api/cart/merge` + log deprecation warning. FE mới phải dùng `/api/cart/merge`.

### Verification

- ✅ `npx tsc --noEmit` pass (exit code 0).
- ✅ `npm run test` (errorContract) pass — **35/35 PASS**, bao gồm:
  - Verify ErrorCode catalog có đầy đủ 46 codes với HTTP status mapping.
  - Verify `sendError` produce đúng format `{ error: { code, message } }`.
  - Verify `handleInternalError` không leak stack trace ra response.
  - Verify critical error codes (UNAUTHORIZED, SELLER_NOT_APPROVED, ORDER_INVALID_TRANSITION, ...) tồn tại.
- ⚠️ **Integration tests chưa chạy được** (`test:auth`, `test:order`) vì cần `MONGODB_URI_TEST` — setup được ghi rõ trong `docs/INTEGRATION_GUIDE.md` § Testing. Tuyệt đối KHÔNG dùng production URI làm fallback.

### Known Limitations / Backward Compatibility

- Mọi endpoint trả error đều đã update format. Tuy nhiên, MỘT SỐ MESSAGE TIẾNG VIỆT cũ đã được giữ nguyên (chỉ wrap trong `{ error: { code, message } }`) — không breaking về UX, chỉ breaking về parser của FE.
- `/api/auth/cart/merge` vẫn hoạt động để không break FE cũ. Sẽ xóa trong release tiếp theo.

## Notes & Recommendations for Frontend (No Frontend Code Changed)
1. **COD Orders**: Backend sets COD orders directly to `CONFIRMED` upon creation.
2. **Online Payments**: `POST /payments/checkout` advances online orders to `CONFIRMED` and returns full `ApiOrder` object.
3. **Cart Cleanup**: Creating an order automatically cleans checked items from the server database cart.
4. **Shipment Modal**: The seller shipment creation endpoint `POST /api/orders/:id/shipment` accepts `{ pickup: { name, phone, address, province, district, ward, note } }` and responds with `{ shipment: Shipment }`.
5. **Seller Screen & Cards**: Both property naming conventions (`name`/`avatar`/`thumbs`/`transactions` and `shopName`/`avatarUrl`/`coverImages`/`totalTransactions`) are supplied in responses for 100% frontend compatibility. Products also include the top-level string `seller: "handle"` matching `seller.handle`.

---

## Backend Iteration 2026-09-29 (Admin Stats + Reviews + Admin Path Alignment)

### Added
- **`GET /api/admin/stats`** — Aggregated platform stats. Trả `{ stats: { pendingListings, soldProducts, totalOrders, totalUsers, totalSellers, platformProfit } }`. `platformProfit` tính bằng aggregate `$sum` của `Order.platformFee` (Ledger model chưa được tích hợp vào repo hiện tại).
- **`POST /api/products/:id/reviews`** — Buyer đánh giá sản phẩm sau khi đơn hàng giao thành công.
  - Tạo model mới `Review.ts` (compound unique index `(orderId, productId, buyerId)` để chống duplicate).
  - Validate: `rating` integer 1–5, order phải thuộc user gọi, status ∈ { `DELIVERED`, `COMPLETED` }, product phải nằm trong `order.items`.
  - 3 ErrorCodes mới: `REVIEW_RATING_INVALID` (400), `REVIEW_NOT_ALLOWED` (403), `REVIEW_ALREADY_EXISTS` (409).

### Changed (with backward compat aliases)
- **Admin seller moderation paths** align với FE `AdminScreen`:
  - Canonical: `PATCH /api/admin/sellers/:id/{approve,reject}`.
  - Legacy: `PATCH /api/admin/users/:id/{approve-seller,reject-seller}` vẫn hoạt động nhưng **deprecated** — log warning mỗi lần gọi. Sẽ xóa trong release tiếp theo khi FE đã migrate.
- **`GET /api/admin/pending-sellers`** response shape đổi:
  - Trước: `{ sellers, total }` (FE cũ đọc `res.sellers`).
  - Sau: `{ users, total }` (match FE `AdminScreen` đọc `res.users`).
  - **Breaking change** nhẹ — không có alias backward-compat vì key `sellers` cũ không còn được trả.

### Verification
- ✅ `npx tsc --noEmit` pass (exit 0).
- ✅ `npm run test` (errorContract) pass — **38/38 PASS** (đã bao gồm critical codes cho review + admin cũ).
- ✅ `npm run build` pass.

### Known Limitations
- `platformProfit` hiện tính trực tiếp từ `Order.platformFee`, không qua `Ledger` model. Khi `Ledger` được tích hợp, có thể cần refactor để dùng nguồn double-entry chuẩn.
- `Ledger.ts` và `PlatformFeeConfig.ts` được nhắc tới trong CHANGELOG_AI cũ nhưng **không tồn tại trong git working tree của branch `backend` hiện tại**. Nếu cần dùng phải tạo mới từ scratch.

### Backlog (cần làm trước khi vào production payment)

> Task lớn cần tracking riêng, không chặn tiến độ FE hiện tại vì `platformProfit` đã có giải pháp tạm aggregate `Order.platformFee`.

- [ ] **Implement `Ledger.ts` (double-entry accounting)**
  - Schema: `account` enum (PLATFORM_CASH, PLATFORM_REVENUE, SELLER_PAYABLE, BUYER_PAYMENT, REFUND), `entryType` (DEBIT/CREDIT), `amount`, `currency`, `orderId`, `idempotencyKey`, `createdAt`.
  - Migrations: backfill entries cho orders đã completed để reconcile với `Order.platformFee`.
  - Refactor `getAdminStats` để dùng `Ledger` thay vì aggregate trực tiếp (chống drift giữa platformFee Order vs Ledger entries).
- [ ] **Implement `PlatformFeeConfig.ts`**
  - Schema: `name`, `rate` (commission %), `effectiveFrom`, `effectiveTo`, `category` (optional).
  - Hook vào `orderController` để áp dụng rate theo thời điểm đặt hàng (không dùng hardcode `0.1`).
  - Admin endpoint để update rate với audit trail.
- [ ] **Cleanup deprecated admin paths**
  - Sau khi FE team confirm đã migrate sang canonical `/admin/sellers/:id/{approve,reject}`, xóa aliases `/admin/users/:id/{approve,reject}-seller`.

## Backend & Contract Iteration (2026-09-30) — Alignment with OpenAPI & FE Progress

### Implemented / Aligned Endpoints:
1. **`GET /api/products/:id`**:
   - Controller: `getProductById` in `productController.ts`. Populates `sellerId` and `categoryId`, maps via `mapProduct`.
   - Route: `router.get("/:id", getProductById)` in `routes/products.ts`.
2. **`PATCH /api/products/:id/archive`**:
   - Controller: `archiveProduct` in `productController.ts`. Authorization: owner seller hoặc admin.
   - Route: `router.patch("/:id/archive", requireAuth, archiveProduct)` in `routes/products.ts`.
3. **`GET /api/sellers/me/reviews` & `GET /api/sellers/:idOrHandle/reviews`**:
   - Controller: `getSellerReviews` in `sellerController.ts`. Finds all products of seller and loads reviews populated with buyer and product details.
   - Routes: `router.get("/me/reviews", requireAuth, getSellerReviews)` and `router.get("/:idOrHandle/reviews", getSellerReviews)` in `routes/sellers.ts`.
4. **`PUT /api/auth/me/avatar`**:
   - Controller: `updateAvatar` in `authController.ts`. Updates user & seller avatar URL.
   - Route: `router.put("/me/avatar", requireAuth, updateAvatar)` in `routes/auth.ts`.
5. **OpenAPI Specification (`docs/openapi.yaml`)**:
   - Đồng bộ và hoàn thiện toàn bộ schema OpenAPI 3.0.3 (Cart, Notifications, Sellers, Admin moderation, AI, Reviews).
   - Bổ sung response schema chi tiết cho `GET /api/admin/pending-sellers` (`PendingSellersResponse`), `PATCH /api/admin/sellers/:id/approve` (`ApproveSellerResponse`), `PATCH /api/admin/sellers/:id/reject` (`RejectSellerResponse`), `GET /api/admin/pending-listings`, `PATCH /api/admin/listings/:id/reject`.
   - Đồng bộ sang cả `pj_UI/docs/openapi.yaml`.
6. **API Progress Matrix (`docs/API_MATRIX.md`)**:
   - Cập nhật tiến độ hoàn thành thực tế giữa BE và FE (chuyển trạng thái các endpoint đã tích hợp từ `⏳` sang `✅`).

### Verification:
- ✅ `npx tsc --noEmit` pass (exit 0).
- ✅ `npm run build` pass (exit 0).
- ✅ `npm run test` (errorContract) pass — **38/38 PASS**.

### Backend Adjustments (2026-10-01)
- **`ORDER_BUYER_NOT_PARTICIPANT` Bug**: Fixed issue in `updateOrderStatus` where the buyer was previously blocked from transitioning an order to `DELIVERED` or `DISPUTED`. Updated role-based restrictions in `orderController.ts` to allow buyers to transition orders to `DELIVERED` and `DISPUTED` (alongside `CANCELLED` and `COMPLETED`). Updated `API_CONTRACT.md` and `ERROR_CODES.md` to reflect this fix. Fixed related test in `orderAuth.test.ts`.
- **`CANCEL_REQUESTED` Flow**: Added `CANCEL_REQUESTED` to `ORDER_STATUSES` enum and updated `VALID_TRANSITIONS` in `Order.ts` to support buyer cancellation requests. Added `cancelReason` and `cancelRequestedAt` fields to the `Order` schema and `mapOrder` output. Allowed inventory restoration when an order transitions to `CANCELLED` directly from `CANCEL_REQUESTED`.
- **Seller Delivery Restrictions**: Removed the role-based restriction preventing sellers from setting `DELIVERING` and `DELIVERED` status directly in `orderController.ts` (since there is no real shipping provider). Updated tests for new seller permissions.
- **Avatar Synchronization**: Fixed an issue in `authController.updateAvatar` where uploading a new avatar only updated the seller profile. Added `avatarUrl` field to `IUser` interface and `UserSchema` in `User.ts`. When registering a shop (`applySeller`), if the user does not provide an explicit `avatarUrl`, it automatically inherits `existingUser.avatarUrl` (buyer's avatar). If an avatar is provided during shop registration and the user has none, it also initializes `existingUser.avatarUrl`. Synchronized `avatarUrl` across `login`, `register`, `applySeller`, and `PUT /api/auth/me/avatar`.
- **CAS Address Kit Proxy & Order Address Snapshot (2026-10-03)**:
  - Added `backend/src/services/addressService.ts`: Proxies CAS Address Kit (`https://production.cas.so/address-kit`), implements 24-hour in-memory cache, 5s timeout via `AbortController`, validation of `effectiveDate` (`latest` or `YYYY-MM-DD`), and normalizes responses to `{ data: [{ id, name }], effectiveDate }`.
  - Added `backend/src/controllers/addressController.ts` and `backend/src/routes/addresses.ts`: Registered endpoints `GET /api/addresses/provinces`, `GET /api/addresses/provinces/:provinceId/communes`, and `GET /api/addresses/communes`.
  - Added order address snapshot fields (`shippingProvinceId`, `shippingProvinceName`, `shippingCommuneId`, `shippingCommuneName`, `addressEffectiveDate`) to `IOrder`, `OrderSchema`, `createOrder`, and `mapOrder` so historical orders retain unchanging address snapshots at the time of purchase.
  - Added `test:address` in `package.json` and integrated into `test:all`. Verified with 16/16 address tests passing.

## Backend Iteration (2026-10-06) — Per-size stock & price-delta for Products

### Problem
- `GET /api/products/:id` không trả `sizeQuantities` / `sizePriceDeltas` → FE hiển thị stock = 0 cho mọi size khác `product.size`. Product detail page bị unusable.

### Changes
1. **`models/Product.ts`** — Thêm 2 optional fields:
   - `sizeQuantities?: Record<string, number>` (`Schema.Types.Mixed`)
   - `sizePriceDeltas?: Record<string, number>` (`Schema.Types.Mixed`)
   - Tương thích ngược: cũ (không có data) vẫn hoạt động.

2. **`controllers/productController.ts`**:
   - Helper `normalizeSizeMap` / `isValidPriceDeltaMap` validate input.
   - `deriveSizeQuantities(p)` — synthesize `{ [p.size]: p.quantity }` khi DB thiếu data, đảm bảo response luôn có `sizeQuantities` (không undefined).
   - `mapProduct` — luôn trả `sizeQuantities` + `sizePriceDeltas`.
   - `createProduct` — accept + validate 2 field mới.
   - **`updateProduct` (MỚI)** — partial update cho owner seller / admin.

3. **`routes/products.ts`** — Thêm `router.patch("/:id", requireAuth, updateProduct)` trước `/:id` wildcard.

4. **`utils/errors.ts`** — Thêm error code `PRODUCT_SIZE_DATA_INVALID` (400).

5. **Docs** — Updated `docs/API_CONTRACT.md`, `docs/openapi.yaml`, `docs/API_MATRIX.md`, `docs/ERROR_CODES.md`, `docs/API_CHANGELOG.md`.

### Inventory semantics (intentional)
- `quantity` (tổng) **vẫn là source of truth** cho order/cart decrement. `sizeQuantities` hiện chỉ là **display**.
- Không tự động derive `quantity` từ `sizeQuantities` ở create/update — sẽ làm breaking change cho checkout flow.
- Follow-up: nếu FE/BE muốn giảm stock theo size cụ thể, cần thêm `size` vào `OrderItem` + refactor `orderController.ts`.

### Verification
- ✅ `npx tsc --noEmit` pass (exit 0).
- ✅ `npm run build` pass (exit 0).
- ✅ `npm test` (errorContract) — **38/38 PASS** (catalog now 57 codes, bao gồm `PRODUCT_SIZE_DATA_INVALID`).
- ⚠️ Integration tests (`test:auth`, `test:order`) **không chạy** vì cần `MONGODB_URI_TEST` — xem `docs/INTEGRATION_GUIDE.md`.

### Known limitations
- `sizeQuantities` chưa enforce consistency với `quantity` tổng — nếu seller nhập sizeQuantities có tổng ≠ `quantity`, BE không cảnh báo. Có thể thêm check trong tương lai.
- `sizePriceDeltas` hiện không affect `unitPrice` khi checkout — `OrderItem.unitPrice = product.price`. Cần refactor nếu muốn áp dụng.

## Backend Iteration (2026-10-06) — Per-seller Commission Rate

### Problem
- `orderController.ts` hardcode `* 0.9` / `* 0.1` cho commission → không thể admin chỉnh hoa hồng theo từng seller dù schema đã có `User.sellerProfile.commissionRate`.

### Changes
1. **`models/Order.ts`**: thêm `commissionRate` (0..1) + `commissionAmount` (VND) vào `IOrderItem` & `OrderItemSchema`. Snapshot tại lúc tạo order → historical orders giữ đúng rate đã áp dụng.
2. **`controllers/orderController.ts`** (`createOrder`):
   - Populate `sellerId`, đọc `sellerProfile.commissionRate` (default `0.1` nếu missing/invalid).
   - Tính `commissionAmount = round(unitPrice × qty × commissionRate)` và `sellerAmount = lineSubtotal − commissionAmount` cho mỗi item.
   - `order.platformFee = Σ item.commissionAmount` (aggregate).
   - `mapOrder` expose `commissionRate` + `commissionAmount` trên mỗi item.
3. **`controllers/adminController.ts`**: thêm `updateSellerCommission`. Validate `0 ≤ rate ≤ 1`. Idempotent + audit-friendly (trả `previousRate` + `newRate`).
4. **`routes/admin.ts`**: `PATCH /api/admin/sellers/:id/commission-rate` (requireAdmin).
5. **`utils/errors.ts`**: thêm `COMMISSION_RATE_INVALID` (400) + `SELLER_NOT_FOUND` (404). Catalog giờ 59 codes.
6. **Docs**: updated `docs/API_CONTRACT.md` (endpoint + OrderItem shape), `docs/openapi.yaml` (PATCH + OrderItem), `docs/API_MATRIX.md`, `docs/ERROR_CODES.md`, `docs/API_CHANGELOG.md` (entry 2026-10-06 commission).

### Snapshot semantics
- Rate mới chỉ áp dụng cho đơn hàng **tạo sau** khi admin update.
- Đơn cũ giữ rate snapshot trên `OrderItem.commissionRate`. Nếu cần re-rate đơn cũ → phải viết migration script riêng (TODO backlog).
- Admin KHÔNG nhận notification cho action này (admin-only, không cần thông báo seller). Có thể bật notification trong tương lai nếu nghiệp vụ cần.

### Verification
- ✅ `npx tsc --noEmit` pass (exit 0).
- ✅ `npm run build` pass (exit 0).
- ✅ `npm test` (errorContract) — **38/38 PASS** (catalog giờ 59 codes, bao gồm `COMMISSION_RATE_INVALID`, `SELLER_NOT_FOUND`).
- ⚠️ Integration tests (`test:auth`, `test:order`) **không chạy** vì cần `MONGODB_URI_TEST` — xem `docs/INTEGRATION_GUIDE.md`.

### Known limitations / Backlog
- `platformFee` cho đơn hàng tạo trước feature này sẽ hiển thị `commissionAmount = 0` trên items → aggregate `order.platformFee` cũng = 0. `getAdminStats` vẫn aggregate từ `Order.platformFee` đã có sẵn, không drift.
- `Ledger.ts` vẫn chưa được implement → commission chỉ được record trên `OrderItem.commissionAmount`, chưa có double-entry bookkeeping. Khi `Ledger` ready, cần refactor `paymentController.checkout` để ghi 4 entries (PLATFORM_CASH debit, PLATFORM_REVENUE credit, SELLER_PAYABLE credit, BUYER_PAYMENT credit) với amount snapshotted từ `OrderItem.commissionAmount`.
- `PlatformFeeConfig.ts` chưa được implement → không có global default rate override. Per-seller rate là single source of truth hiện tại.
