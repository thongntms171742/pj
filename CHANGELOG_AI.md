# AI Changelog

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
