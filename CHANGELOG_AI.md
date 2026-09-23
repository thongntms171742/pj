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
- Fixed Render build errors by moving TypeScript & `@types/*` into `dependencies` in `backend/package.json` and adding `types: ["node"]` in `tsconfig.json`.
- Updated `render.yaml` buildCommand to `npm install --include=dev && npm run build`.
- Fixed implicit any type error for `it` in `orderController.ts`.
- Added `apiId: p._id` in `frontend/src/lib/adapters.ts` (`adaptProduct`) and `productApiId: product.apiId` in `frontend/src/app/App.tsx` (`addToCart`) to ensure cart persistence to MongoDB Atlas and guest cart merge upon login without touching backend.
- Added `/products/mine` call in `frontend/src/app/App.tsx` (`useEffect`) when user has seller role, mapping results to `myProductsByEmail` via `adaptToSellerProduct` to preserve seller listings and stats across page reloads (F5).


