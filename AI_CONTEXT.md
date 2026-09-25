# AI Context — thrift it! (Vintage Clothing Marketplace)

## Project Overview
- **Frontend**: Vite + React + TypeScript + Tailwind CSS (runs on port 5173, proxies `/api` -> `http://localhost:4000`)
- **Backend**: Express + TypeScript + Mongoose (runs on port 4000)
- **Database**: MongoDB Atlas (`Cluster0.jkkqqk7.mongodb.net`, database name `thriftit`)

## Backend Structure (`backend/`)
- `src/models/`:
  - `User.ts`: Users, roles (buyer, seller, admin), embedded sellerProfile
  - `Category.ts`: Product categories
  - `Product.ts`: Products with status (`pending`, `active`, `reserved`, `sold`, `archived`)
  - `Cart.ts`, `CartItem.ts`: Shopping cart & checked items
  - `Order.ts`: 11-step finite state machine order processing & status audit history
  - `Notification.ts`: User notifications
- `src/controllers/`: `authController`, `productController`, `sellerController`, `cartController`, `orderController`, `paymentController`, `notificationController`, `adminController`
- `src/routes/`: `auth`, `products`, `sellers`, `cart`, `orders`, `payments`, `notifications`, `admin`
- `src/middleware/auth.ts`: JWT verification (`requireAuth`, `requireAdmin`, `optionalAuth`)
- `src/seed.ts`: Mock data seed script to populate Atlas
- `src/server.ts`: Connects to MongoDB Atlas & starts Express on port 4000

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
- `PATCH /api/orders/:code/status`:
  - Enforces `VALID_TRANSITIONS` state machine.
  - **Cancellation (`CANCELLED`)**: Restores inventory and holds back to active stock (`quantity += item.quantity`, `status = 'active'`).
  - **Delivery updates (`DELIVERING`, `DELIVERED`, `COMPLETED`)**: Appends live delivery events to tracking timeline and notifies parties.

### 3. Shipment & Live Tracking Flow (`orderController.ts`, `routes/orders.ts`)
- `GET /api/orders/seller`: Retrieves all orders containing products sold by the authenticated seller (properly registered before `/:id` to avoid route collisions).
- `POST /api/orders/:code/shipment`: Seller generates shipping label (`provider`: GHTK, unique tracking number `GHTK...`, tracking URL, estimated delivery, and pickup info). Moves order to `SHIPPING` and creates initial timeline events (`CREATED`, `PICKED_UP`, `IN_TRANSIT`).
- `GET /api/orders/:code/shipment`: Returns live shipping details and timeline events matching frontend `Shipment` interface.

### 4. Seller & Shop Flow (`sellerController.ts`, `productController.ts`, `routes/sellers.ts`)
- `GET /api/sellers`: Returns list of all active sellers mapped with dual frontend property aliases (`name` & `shopName`, `avatar` & `avatarUrl`, `thumbs` & `coverImages`, `transactions` & `totalTransactions`, `_id` & `id`).
- `GET /api/sellers/me`: Returns profile of the currently authenticated seller.
- `GET /api/sellers/:idOrHandle`: Case-insensitive seller lookup supporting handle with/without `@` prefix (e.g. `@minhtu.vintage` or `minhtu.vintage`), email, shopName, or MongoDB ObjectId.
- `GET /api/sellers/:idOrHandle/products`: Returns all active products belonging to the specified seller with populated seller and category details.
- `GET /api/products/mine` / `GET /api/products/seller`: Returns all products belonging to the authenticated seller (including `pending`, `active`, `sold`) and computes real-time seller statistics (`totalProducts`, `activeProducts`, `pendingProducts`, `soldProducts`, `totalViews`, `totalLikes`, `estimatedRevenue`).
- `mapProduct` in `productController.ts`: Returns `seller` (string handle), `sellerName`, `sellerAvatar`, `name` (alias for `title`), and `image` (alias for `coverImage`) alongside populated `sellerId` so frontend `products.filter(p => p.seller === seller.handle)` and `ProductCard` render cleanly.

## Notes & Recommendations for Frontend (No Frontend Code Changed)
1. **COD Orders**: Backend sets COD orders directly to `CONFIRMED` upon creation.
2. **Online Payments**: `POST /payments/checkout` advances online orders to `CONFIRMED` and returns full `ApiOrder` object.
3. **Cart Cleanup**: Creating an order automatically cleans checked items from the server database cart.
4. **Shipment Modal**: The seller shipment creation endpoint `POST /api/orders/:id/shipment` accepts `{ pickup: { name, phone, address, province, district, ward, note } }` and responds with `{ shipment: Shipment }`.
5. **Seller Screen & Cards**: Both property naming conventions (`name`/`avatar`/`thumbs`/`transactions` and `shopName`/`avatarUrl`/`coverImages`/`totalTransactions`) are supplied in responses for 100% frontend compatibility. Products also include the top-level string `seller: "handle"` matching `seller.handle`.
6. **Order fields renamed**: `platformFee` → `platformFeeRate` + `platformFeeAmount` + `sellerAmount` (snapshot at checkout time). `mapOrder` returns these new field names.

### 5. Financial Architecture (PlatformFeeConfig, Ledger)
- **Architecture**: Modular monolith (NOT microservices). Clean domain boundaries: Payment / Order / Ledger.
- `PlatformFeeConfig` model (`rate`, `effectiveFrom`, `active`, `createdBy`): Admin-configurable platform fee. Only the `active: true` config is used at checkout time.
- **Fee Snapshot**: At `POST /api/orders`, the current fee rate is fetched and snapshotted into Order (`platformFeeRate`, `platformFeeAmount`, `sellerAmount`). Changing admin fee config does NOT affect historical orders.
- **No fallback**: If no `PlatformFeeConfig` exists, `POST /api/orders` returns 500 — admin MUST configure fee before platform accepts orders.
- `Ledger` model (double-entry accounting): Each transaction has balanced DR/CR entries.
- **Chart of Accounts**: `PLATFORM_CASH`, `BUYER_CLEARING`, `PLATFORM_REVENUE`, `SELLER_PAYABLE` (4 accounts, no others).
- **Online Payment ledger** (created in `paymentController.checkout`): DR PLATFORM_CASH / CR BUYER_CLEARING → DR BUYER_CLEARING / CR PLATFORM_REVENUE → DR BUYER_CLEARING / CR SELLER_PAYABLE.
- **COD ledger** (created in `orderController.collectCOD`): Same entries but only triggered when `POST /api/orders/:code/cod-collect` is called (after DELIVERED/COMPLETED). COD does NOT create ledger entries at order creation time.
- **Idempotency**: Both payment checkout and COD collect are idempotent — calling twice produces only one set of ledger entries.
- Admin APIs: `GET /api/admin/platform-fee` (history), `POST /api/admin/platform-fee` (set new rate).
- **Verified**: 5 financial test cases all pass (`verifyLedger.ts`).

### 6. Review System (`Review` model, `reviewController.ts`) — 🔒 LOCKED
- `Review` model: `userId`, `productId`, `orderId`, `rating` (1-5), `comment`, timestamps.
- **Unique constraint**: `(userId, orderId, productId)` — one review per product per order per buyer. Confirmed exists in MongoDB Atlas.
- `POST /api/products/:productId/reviews` (requireAuth): Creates review with 5 server-side checks:
  1. User is the buyer of the referenced order
  2. Order status is `COMPLETED`
  3. Product exists in the order's items (uses OrderItem snapshot, NOT live Product query)
  4. No duplicate review exists
  5. Rating is 1-5
- **Race condition guard**: `catch(err.code === 11000)` on `Review.create` — unique index is the real guard, `findOne` is UX only.
- `GET /api/products/:productId/reviews` (public): Paginated (`page`, `limit`, `totalPages`). No email leak. `avgRating` via `$avg` aggregation.
- **Verified**: 6 review test cases + 5-point audit all pass (`verifyReview.ts`, `auditReview.ts`).

### 7. Product CRUD (`productController.ts`)
- `POST /api/products`: Create product (status = `pending`, awaits admin approval).
- `PATCH /api/products/:id`: Update product. Owner-only. Only editable when `pending` or `active`. Whitelist fields.
- `PATCH /api/products/:id/archive`: Archive/hide product. Owner-only. Blocked for `sold` and `reserved` products.
- **Verified**: Seller MVP E2E scenario test passes (`verifySellerMVP.ts`).

## Buyer Funnel Status (MVP) — ✅ LOCKED
> Tìm kiếm → Xem sản phẩm → Mua → Thanh toán → Theo dõi giao hàng → Nhận hàng → Hoàn tất → Đánh giá ✅

## Seller Funnel Status (MVP) — ✅ LOCKED
> Đăng sản phẩm → Sửa SP → Admin duyệt → Buyer mua → Seller thấy Order → PACKING → SHIPPING → DELIVERING → DELIVERED → COMPLETED → Buyer Review ✅

**Verified via `verifySellerMVP.ts` — 18/18 passed.**

## Next Steps (NOT backend features)
1. Public Deploy (Render.com)
2. Real-device testing
3. User Manual
4. Demo flow (5-7 min)
5. TikTok + Facebook
6. Thu thập KPI thật → OC1 + OC2
