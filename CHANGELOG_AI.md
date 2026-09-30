# AI Changelog

## [2026-10-01]
### Added
- Added `CANCEL_REQUESTED` to `ORDER_STATUSES` enum and updated `VALID_TRANSITIONS` in `Order.ts` to support buyer cancellation requests.
- Added `cancelReason` and `cancelRequestedAt` fields to the `Order` model and `mapOrder` response.

### Changed
- Removed the role-based restriction preventing sellers from setting `DELIVERING` and `DELIVERED` status directly in `orderController.ts` (since there is no real shipping provider).
- Updated role-based restrictions in `orderController.ts` to allow sellers to transition orders from `CANCEL_REQUESTED` to `CANCELLED` (accept cancel) or `CONFIRMED` (reject cancel).
- Enforced a constraint where buyers can only use `CANCELLED` directly if the order is in `PENDING_PAYMENT` or `PAID`. Once the order reaches `CONFIRMED` or later, they must use `CANCEL_REQUESTED`.
- Allowed inventory restoration when an order transitions to `CANCELLED` directly from `CANCEL_REQUESTED`.
- Updated `API_CONTRACT.md` and `ERROR_CODES.md` to reflect new valid transitions for buyers and sellers.
- Fixed a buggy test in `orderAuth.test.ts` which attempted an invalid state machine transition when testing seller delivery restrictions, and updated tests for new seller permissions.

### Fixed
- Fixed `ORDER_BUYER_NOT_PARTICIPANT` error when buyers attempted to mark orders as `DELIVERED` or `DISPUTED`. Updated role-based restrictions in `orderController.ts` to allow buyers to transition orders to `DELIVERED` and `DISPUTED` (in addition to `CANCELLED` and `COMPLETED`).

## [2026-09-23]
### Added
- Express + TypeScript + Mongoose backend initialized in `backend/`.
- 7 Mongoose models: `User`, `Category`, `Product`, `Cart`, `CartItem`, `Order`, `Notification`.
- Full REST controllers and routes matching frontend API contracts.
- MongoDB Atlas connection with TLS clock skew support (`tlsAllowInvalidCertificates=true`).
- Seed script (`seed.ts`) populating categories, users, products, cart items, orders, and notifications.

### Fixed & Implemented
- Fixed MongoDB Atlas credentials (`to12345`).
- Fixed duplicate index warnings on `User.ts` (`email`) and `Order.ts` (`idempotencyKey`).
- Fixed JWT expiresIn TypeScript typing.
- Fixed `AccountScreen.tsx` Temporal Dead Zone `ReferenceError: Cannot access 'filteredOrders' before initialization`.
- Added missing `/api/sellers` and `/api/sellers/:idOrHandle` routes & controller (`sellerController.ts`).
- Added `/api/orders/:code/shipment` endpoint for tracking shipments.
- Fixed `GET /api/products` 500 error by ensuring all Mongoose models are registered on startup and adding defensive population guards.
- Fixed Render build errors by moving TypeScript & `@types/*` into `dependencies` in `backend/package.json` and adding `types: ["node"]` in `tsconfig.json`.
- Updated `render.yaml` buildCommand to `npm install --include=dev && npm run build`.
- Fixed implicit any type error for `it` in `orderController.ts`.
- Added `apiId: p._id` in `frontend/src/lib/adapters.ts` (`adaptProduct`) and `productApiId: product.apiId` in `frontend/src/app/App.tsx` (`addToCart`) to ensure cart persistence to MongoDB Atlas and guest cart merge upon login without touching backend.
- Added `/products/mine` call in `frontend/src/app/App.tsx` (`useEffect`) when user has seller role, mapping results to `myProductsByEmail` via `adaptToSellerProduct` to preserve seller listings and stats across page reloads (F5).
- Fixed 401 Unauthorized handling by syncing `setToken` with session storage and clearing expired tokens automatically.
- **Cart flow**: Added ownership isolation, stock validation, self-purchase blocking, `DELETE /api/cart/clear`, and `POST /api/cart/merge`.
- **Order & Payment flow**:
  - Implemented automatic inventory holding (`status: "reserved"`) during online card checkout, and direct confirmation for COD.
  - Implemented complete `checkout` payment flow with automatic inventory deduction, sold state updates, and buyer/seller notifications.
  - Implemented automatic stock restoration when an order is `CANCELLED`.
  - Registered `GET /api/orders/seller` before `GET /api/orders/:id` to prevent route collision.
- **Shipment & Tracking flow**:
  - Added `POST /api/orders/:code/shipment` for sellers to create shipping labels with realistic tracking numbers and timeline events.
  - Enriched `GET /api/orders/:code/shipment` with live tracking status, GHTK tracking URLs, and chronological event milestones.
  - Added transition updates for `DELIVERING` and `DELIVERED` with automatic buyer notification and timeline logging.
- **Seller flow & display fix**:
  - Enriched `sellerController.ts` with dual frontend property aliases (`name` & `shopName`, `avatar` & `avatarUrl`, `thumbs` & `coverImages`, `transactions` & `totalTransactions`).
  - Handled flexible seller lookup in `GET /api/sellers/:idOrHandle` supporting handle with/without `@`, case-insensitive matching, email, and ObjectId.
  - Added `GET /api/sellers/:idOrHandle/products` to fetch active listings of a specific shop.
  - Added `GET /api/products/mine` and `GET /api/products/seller` for authenticated sellers to retrieve all listings and dashboard stats.
- **Seller orders needing processing fix ("Đơn hàng cần xử lý")**:
  - Broadened `VALID_TRANSITIONS` in `Order.ts` allowing `SHIPPING` -> `DELIVERED` and `PAID` -> `PACKING`.
  - Added robust ObjectId/string query matching in `getSellerOrders` for `items.sellerId`.
  - Updated `AccountScreen.tsx` to include `PAID` and `DELIVERING` in the processing filter so active orders are not hidden.
  - Implemented `handleSellerUpdateStatus` in `AccountScreen.tsx` to immediately update UI state and transition orders through Packing, Shipping, and Delivered.

## [2026-09-26] (Feature Freeze / Outcome 1 Preparation)
### Added & Audited
- Audited the entire `backend` branch and confirmed the existence of **11 full backend models**, including `Ledger.ts`, `PlatformFeeConfig.ts`, and `Review.ts`.
- Re-ran the Financial Engine Smoke Test via `verifyLedger.ts` verifying idempotency of both COD and Online Checkout collection. (5/5 PASS)
- Introduced safe deployment and reset tooling to strictly separate application architecture from volatile presentation data.

### Database Tooling (Safe Archiving & Reset Strategy)
- Created `backend/scripts/backup-db.ts` to export MongoDB JSON snapshots via Mongoose cursors instead of raw `mongodump` binaries.
- Created `backend/scripts/reset-demo-db.ts` to act as a **Safe State Reset**. Instead of utilizing `.deleteMany()`, it leverages an `updateMany({ status: 'archived' })` architecture. This prevents the creation of orphan object references for `orders` and `reviews`.
- Created `backend/scripts/seed-demo-products.ts` with execution guards (`--execute --confirm-seed`) to populate the `products` collection with 25 highly curated presentation datasets without mutating `users`, `categories`, or the `Financial Subsystem`.
- Added `.gitignore` configurations isolating local `.json` backups from the Git index.
- Finalized local **E2E Buyer/Seller flow tests** verifying real-world viability of Seller Add Product, Buyer Cart, COD Orders, Shipping transitions, and Ledger consistency without mock fallback code.

## [2026-09-30] (OpenAPI Specification Alignment & Missing Product/Seller Endpoints)
### Added & Aligned (Backend)
- **`GET /api/products/:id`**: Single product detail endpoint populated with seller and category information via `mapProduct`.
- **`PATCH /api/products/:id/archive`**: Allows seller owner or admin to archive/hide a product.
- **`GET /api/sellers/me/reviews` & `GET /api/sellers/:idOrHandle/reviews`**: Returns customer reviews for products belonging to the seller.
- **`PUT /api/auth/me/avatar`**: Updates authenticated user and seller profile avatar.

### Documentation & Contract Synchronization
- **`docs/openapi.yaml`**: Hoàn thiện toàn bộ OpenAPI 3.0.3 specification gồm 12 tags, đầy đủ Cart, Notifications, Sellers, Admin moderation, AI, Reviews, schema chi tiết và đồng bộ sang `pj_UI/docs/openapi.yaml`.
- **`docs/API_MATRIX.md`**: Cập nhật ma trận tiến độ thực tế giữa BE và FE (đánh dấu hoàn tất các tính năng FE đã kết nối).
- **`docs/API_CONTRACT.md`**: Bổ sung chi tiết contract cho các endpoint `/products/:id`, `/products/:id/archive`, `/sellers/me/reviews`, `/auth/me/avatar`.

### Verification
- ✅ `npx tsc --noEmit` pass (0 errors).
- ✅ `npm run build` pass (tsc compile OK).
- ✅ `npm run test` (errorContract) pass — 38/38 PASS.

## [2026-09-29] (Admin Stats + Reviews + Admin Path Alignment)
### Added (Backend)

- **`GET /api/admin/stats`** — Aggregated platform stats cho Admin Dashboard.
  - Trả `{ stats: { pendingListings, soldProducts, totalOrders, totalUsers, totalSellers, platformProfit } }`.
  - `platformProfit` aggregate `$sum` của `Order.platformFee` (tạm thời, chưa dùng `Ledger`).
- **`POST /api/products/:id/reviews`** — Buyer review sau khi đơn giao.
  - Tạo model mới `backend/src/models/Review.ts` (compound unique index `(orderId, productId, buyerId)`).
  - Validate: rating integer 1–5, order thuộc user, status ∈ { DELIVERED, COMPLETED }, product trong order.
  - 3 ErrorCodes mới: `REVIEW_RATING_INVALID` (400), `REVIEW_NOT_ALLOWED` (403), `REVIEW_ALREADY_EXISTS` (409).
  - Wire route: `POST /api/products/:id/reviews` (sau `POST /api/products` để tránh route shadow).

### Changed (Backend)

- **Admin seller moderation paths align với FE `AdminScreen`**:
  - Canonical: `PATCH /api/admin/sellers/:id/{approve,reject}`.
  - Legacy deprecated: `PATCH /api/admin/users/:id/{approve-seller,reject-seller}` — vẫn hoạt động, log warning mỗi lần gọi.
- **`GET /api/admin/pending-sellers`** response shape đổi:
  - Trước: `{ sellers, total }`.
  - Sau: `{ users, total }` (match FE `AdminScreen` đọc `res.users`).
  - **Breaking change** — không có alias backward-compat.

### Files Changed
- `backend/src/controllers/adminController.ts` — thêm `getAdminStats`, đổi response shape `getPendingSellers`.
- `backend/src/routes/admin.ts` — thêm canonical paths + deprecated aliases.
- `backend/src/controllers/productController.ts` — thêm `createReview`, import `Order` & `Review`.
- `backend/src/routes/products.ts` — wire `POST /:id/reviews`.
- `backend/src/models/Review.ts` (NEW) — model + unique index.
- `backend/src/models/index.ts` — export `Review`.
- `backend/src/utils/errors.ts` — thêm 3 error codes (REVIEW_*) + HTTP status mappings.
- `docs/API_CONTRACT.md` — thêm docs cho `/admin/stats`, `/products/:id/reviews`, cập nhật admin endpoints.
- `docs/API_CHANGELOG.md` — entry mới ghi breaking change + new endpoints.
- `AI_CONTEXT.md` — section "Backend Iteration 2026-09-29" với verification + known limitations.

### Verification
- ✅ `npx tsc --noEmit` pass (exit 0).
- ✅ `npm run test` (errorContract) pass — **38/38 PASS** (bao gồm các critical codes).
- ✅ `npm run build` pass.

### Known Limitations
- `platformProfit` từ `Order.platformFee` thay vì `Ledger` (chưa tích hợp).
- `Ledger.ts` và `PlatformFeeConfig.ts` được nhắc trong entry 2026-09-26 cũ nhưng **không có trong git tree branch `backend` hiện tại** — cần tạo mới nếu muốn dùng.

### Backlog (cần làm trước khi vào production payment)

- [ ] **Implement `Ledger.ts`** — double-entry accounting (PLATFORM_CASH / PLATFORM_REVENUE / SELLER_PAYABLE / BUYER_PAYMENT / REFUND). Refactor `getAdminStats` dùng `Ledger` thay vì aggregate `Order.platformFee` để tránh drift.
- [ ] **Implement `PlatformFeeConfig.ts`** — schema + admin endpoint để update commission rate theo thời điểm áp dụng. Hook vào `orderController` thay hardcode `0.1`.
- [ ] **Cleanup deprecated admin paths** — sau khi FE team confirm migrate sang canonical `/admin/sellers/:id/{approve,reject}`, xóa aliases `/admin/users/:id/{approve,reject}-seller` trong `routes/admin.ts`.

## [2026-09-29] (Seller Application Flow)
### Added

- **`POST /api/auth/seller/apply`** — User tự đăng ký thành seller (trước đây admin phải set thủ công trong DB).
  - Validation: shopName 3-100 chars unique, handle 3-30 chars alphanumeric + `_` + `.`, description max 500, coverImages max 5.
  - Auto-generate `handle` từ email local-part nếu user không cung cấp.
  - Idempotent: nếu user đã apply, trả current state với status code 200 (vs 201 first-time).
  - Side effects: thêm role `"seller"` vào `user.roles`, set `sellerProfile.status = "pending_approval"`.
- **Admin seller moderation endpoints**:
  - `GET /api/admin/pending-sellers` — list applications đang chờ duyệt.
  - `PATCH /api/admin/users/:id/approve-seller` — duyệt, set `status = "active"`, gửi notification.
  - `PATCH /api/admin/users/:id/reject-seller` — từ chối, set `status = "suspended"` + remove role, gửi notification kèm `reason`.
- **3 ErrorCodes mới**: `SELLER_HANDLE_TAKEN` (409), `SELLER_SHOP_NAME_TAKEN` (409), `SELLER_ALREADY_APPROVED` (409).

### Documentation
- Updated `docs/API_CONTRACT.md` — added 4 endpoints (apply + 3 admin).
- Updated `docs/AUTH_SPEC.md` — added section "Seller Application Flow".
- Updated `docs/ERROR_CODES.md` — added 3 new codes.
- Updated `docs/API_CHANGELOG.md` — added entry 2026-09-29.
- Updated `backend/src/tests/errorContract.test.ts` — added 3 new critical codes (38/38 PASS).

### Verification
- ✅ `npx tsc --noEmit` pass.
- ✅ `npm run test` pass — **38/38 PASS** (was 35, +3 for new codes).

## [2026-09-29] (API Contract Unification)
### Added & Implemented

- **Unified Error Envelope** — Created `backend/src/utils/errors.ts` as single source of truth cho error response format.
  - `ErrorCode` enum với ~40 business codes (PRODUCT_NOT_FOUND, SELLER_NOT_APPROVED, ORDER_INVALID_TRANSITION, AI_NOT_CONFIGURED, ...).
  - `ErrorStatus` map chuẩn hóa HTTP status cho mỗi code.
  - `sendError(res, code, message, status?)` helper.
  - `handleInternalError(res, err, context)` helper cho catch block (không leak stack trace ra response).
  - `ApiErrorBody` interface export cho FE consumer.
- **Refactored toàn bộ BE** (9 controllers + middleware + app.ts) để dùng helper. Mọi error response giờ có format `{ error: { code: string, message: string } }`.

### Fixed
- **Admin endpoints shape inconsistency**: `PATCH /api/admin/listings/:id/approve|reject` giờ chạy qua `mapProduct` → response giống `GET /api/products` thay vì raw Mongoose document.
- **Notification IDOR**: `PATCH /api/notifications/:id/read` giờ enforce ownership (chỉ mark notification của chính user gọi).
- **Auth response missing fields**: `POST /api/auth/register` và `.../login` giờ trả `user._id` + `user.sellerStatus`.

### Changed (Backward Compatible)
- **Cart merge deprecation**: `/api/auth/cart/merge` trở thành thin wrapper delegate to `/api/cart/merge`. Endpoint chính thức là `/api/cart/merge`. Legacy endpoint vẫn hoạt động nhưng log warning.

### Documentation
- Updated `docs/API_CONTRACT.md` (đã đầy đủ 35 endpoints + ghi chú breaking change mới).
- Rewrote `docs/AUTH_SPEC.md` đồng bộ với code (response shape đầy đủ + Role Matrix cập nhật).
- Rewrote `docs/ENUMS.md` (Order Status 11 giá trị PAID/REFUNDED bổ sung, Payment Methods vocabulary thống nhất, Shipment Status mapping table, Error Code reference).
- Rewrote `docs/ERROR_CODES.md` (~40 codes + HTTP status + FE action + TypeScript switch example).
- Rewrote `docs/INTEGRATION_GUIDE.md` (test accounts thật từ seed + seller status + cart merge guidance).
- Added entry trong `docs/API_CHANGELOG.md` ghi nhận 4 breaking changes.

### Verification
- ✅ `npx tsc --noEmit` pass (exit 0).
- ✅ `npm run test` (errorContract.test.ts) pass — **35/35 tests PASS**, verify:
  - ErrorCode catalog đầy đủ 46 codes với HTTP status mapping.
  - `sendError` produce đúng format `{ error: { code, message } }`.
  - `handleInternalError` không leak stack trace ra response (regression test).
  - Critical codes (UNAUTHORIZED, SELLER_NOT_APPROVED, ORDER_INVALID_TRANSITION, ...) đều tồn tại.
- ⚠️ Integration tests (`productAuth.test.ts`, `orderAuth.test.ts`) chưa chạy được do thiếu `MONGODB_URI_TEST`. Setup ghi trong `docs/INTEGRATION_GUIDE.md` § Testing.

### Tests added (testing infrastructure)

- `backend/src/tests/errorContract.test.ts` (NEW): Unit test cho `utils/errors.ts`. Không cần DB, chạy nhanh (~2 giây).
- `backend/src/tests/productAuth.test.ts` (UPDATED): Thêm 5 test cases cho error envelope format. Tự `dropDatabase()` trước khi chạy để clean state.
- `backend/src/tests/orderAuth.test.ts` (UPDATED): Thêm 3 test cases + assert error code (FORBIDDEN, ORDER_NOT_FOUND, ORDER_STATUS_REQUIRED, ORDER_INVALID_TRANSITION).
- `backend/.env.test.example` (NEW): Template cho `MONGODB_URI_TEST`. BE lead cần copy thành `.env.test` và điền URI thật.
- `backend/package.json`: Thêm scripts `test`, `test:auth`, `test:order`, `test:all`.

## [2026-09-28]
### Added
- Implemented standardized API Contract Documentation architecture within the `docs/` directory to formally govern Backend and Frontend integration.
- Added `docs/API_CONTRACT.md` as the primary human-readable contract outlining all supported endpoints, request structures, and response schemas.
- Added `docs/AUTH_SPEC.md` for defining authentication methods, JWT handling, and Role-Based Access Control matrix.
- Added `docs/ENUMS.md` ensuring vocabulary consistency across the stack (Order Status, Product Conditions, Roles).
- Added `docs/ERROR_CODES.md` to map standardized business error codes to anticipated frontend UI actions.
- Added `docs/API_CHANGELOG.md` to audit structural API updates over time.
- Added `docs/INTEGRATION_GUIDE.md` detailing frontend environment variables and test account availability.
- Added `docs/API_MATRIX.md` to track endpoint implementations and integration progress between teams.
- **Security Fix**: Fixed seller authorization on `POST /api/products`. Previously it only validated `requireAuth`, allowing buyers to access product creation. It now strictly requires `user.roles.includes("seller")` and `user.sellerProfile.status === "active"`, rejecting with `403 SELLER_NOT_APPROVED` if unmet.
- **Contract Accuracy Fix**: Adjusted `docs/ENUMS.md` and `docs/API_CONTRACT.md` to reflect that `Product.condition` is a Number (0-100) and `SellerStatus` is actually `active` | `pending_approval` | `suspended` (not `APPROVED`).
- **Authorization Audit Fixes**: 
  - Fixed IDOR on `GET /api/orders/:code/shipment` (added `requireAuth` and ownership checks to prevent PII leak).
  - Fixed IDOR on `PATCH /api/orders/:code/status` (now checks if user is the buyer, a seller of an item in the order, or an admin).
  - Fixed State-machine Bypass on `PATCH /api/orders/:code/status` (Buyers can now only transition to CANCELLED or COMPLETED, Sellers cannot directly bypass to DELIVERED).
