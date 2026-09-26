# AI Changelog

## [2026-09-23]
### Added
- Express + TypeScript + Mongoose backend initialized in `backend/`.
- 7 Mongoose models: `User`, `Category`, `Product`, `Cart`, `CartItem`, `Order`, `Notification`.
- Full REST controllers and routes matching frontend API contracts.
- MongoDB Atlas connection with TLS clock skew support (`tlsAllowInvalidCertificates=true`).
- Seed script (`seed.ts`) populating categories, users, products, cart items, orders, and notifications.

### Fixed
- Fixed MongoDB Atlas credentials (`to12345`).
- Fixed duplicate index warnings on `User.ts` (`email`) and `Order.ts` (`idempotencyKey`).
- Fixed JWT expiresIn TypeScript typing.
- Fixed `AccountScreen.tsx` Temporal Dead Zone `ReferenceError: Cannot access 'filteredOrders' before initialization`.
- Added missing `/api/sellers` and `/api/sellers/:idOrHandle` routes & controller (`sellerController.ts`).
- Added `/api/orders/:code/shipment` endpoint for tracking shipments.
- Fixed `GET /api/products` 500 error by ensuring all Mongoose models are registered on startup and adding defensive population guards.
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
  - Enriched `productController.ts` with `seller` (string handle), `sellerName`, `sellerAvatar` top-level fields on products so `SellerScreen` and `ProductCard` filter correctly.
  - Added `GET /api/products/mine` and `GET /api/products/seller` for authenticated sellers to retrieve all listings and dashboard stats.

## [2026-09-27]
### Fixed
- Fixed compile and syntax errors in `orderController.ts` (`TS1472`, `TS1005`, duplicate try-blocks, and destructuring of `idempotencyKey`).
- Strengthened TypeScript types in `auth.ts` for `JWT_SECRET` and `JwtPayload` casting.
- Enforced Actor Authorization Check before state machine validation in `orderController.ts` ensuring unauthorized actors receive 403 Forbidden.
- Added MongoDB WriteConflict / TransientTransactionError retry loops in `orderController.ts` (`createOrder`) and `paymentController.ts` (`checkout`).
- Standardized COD collection on `paymentController.codCollect` and updated `verifyLedger.ts`.
- Created regression suite `src/verifyAuthConcurrency.ts` verifying all P0 security matrix rules, P1 concurrency stock isolation, payment idempotency, and fail-fast JWT startup (all 15 regression assertions passed: 15/15).
- Documented transaction rollback fault-injection test as TODO (not yet tested).



