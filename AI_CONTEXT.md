# AI Context — thrift it! (Vintage Clothing Marketplace)

## Project Overview
- **Frontend**: Vite + React + TypeScript + Tailwind CSS (runs on port 5173, proxies `/api` -> `http://localhost:4000`)
- **Backend**: Express + TypeScript + Mongoose (runs on port 4000)
- **Database**: MongoDB Atlas (`Cluster0.jkkqqk7.mongodb.net`, database name `thriftit`)

## Backend Structure (`backend/`)
- `src/models/`:
  - `User.ts`: Users, roles (buyer, seller, admin), embedded sellerProfile. Includes `sellerStatus`: `"NONE" | "PENDING" | "APPROVED" | "REJECTED"`.
  - `Category.ts`: Product categories
  - `Product.ts`: Products with status (`pending`, `active`, `reserved`, `sold`, `archived`)
  - `Cart.ts`, `CartItem.ts`: Shopping cart & checked items
  - `Order.ts`: 11-step finite state machine order processing & status audit history
  - `Notification.ts`: User notifications
  - `Review.ts`: Reviews for products
  - `Ledger.ts`: Double-entry accounting system for financial transactions (PLATFORM_CASH, PLATFORM_REVENUE, SELLER_PAYABLE, etc.)
  - `PlatformFeeConfig.ts`: Marketplace commission rates
- `src/controllers/`: `authController`, `productController`, `sellerController`, `cartController`, `orderController`, `paymentController`, `notificationController`, `adminController`
- `src/routes/`: `auth`, `products`, `sellers`, `cart`, `orders`, `payments`, `notifications`, `admin`
- `src/middleware/auth.ts`: JWT verification (`requireAuth`, `requireAdmin`, `optionalAuth`)
- `src/server.ts`: Connects to MongoDB Atlas & starts Express on port 4000
- `scripts/`:
  - `backup-db.ts`: Local JSON snapshot generator via mongoose driver (`npm run db:backup`).
  - `reset-demo-db.ts`: Safely clears carts/notifications and archives active products without mutating financial or historical data.
  - `seed-demo-products.ts`: Safely generates 25 high-quality demo products distributed among existing sellers.

## Configuration (`backend/.env`)
- `MONGODB_URI`: `mongodb+srv://nguyentangminhthong1_db_user:to12345@cluster0.jkkqqk7.mongodb.net/thriftit?retryWrites=true&w=majority&appName=Cluster0&tlsAllowInvalidCertificates=true`
- Note: `tlsAllowInvalidCertificates=true` is used to prevent TLS certificate timestamp errors due to client clock offset.
- `JWT_SECRET`: Secret key for JWT auth
- `PORT`: 4000

## Test Accounts
- Buyer: `linh.nguyen@gmail.com` / `123456`
- Seller: `shop.minhtu@thriftit.vn` / `shop123`
- Demo: `demo@thriftit.vn` / `demo123`
- Admin: `admin@thriftit.vn` / `admin`

## Deployment (Render.com)
- Root `render.yaml` configured for Blueprint deployment.
- **Backend**: Web Service (Node, root `backend`, build: `npm install && npm run build`, start: `npm start`).
- **Frontend**: Static Site (root `frontend`, build: `npm install && npm run build`, publish: `dist`).
- Environment variable `VITE_API_URL` links frontend to backend on Render.

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
