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

## Notes & Recommendations for Frontend (No Frontend Code Changed)
1. **COD Orders**: Backend sets COD orders directly to `CONFIRMED` upon creation.
2. **Online Payments**: `POST /payments/checkout` advances online orders to `CONFIRMED` and returns full `ApiOrder` object.
3. **Cart Cleanup**: Creating an order automatically cleans checked items from the server database cart.
4. **Shipment Modal**: The seller shipment creation endpoint `POST /api/orders/:id/shipment` accepts `{ pickup: { name, phone, address, province, district, ward, note } }` and responds with `{ shipment: Shipment }`.
5. **Seller Screen & Cards**: Both property naming conventions (`name`/`avatar`/`thumbs`/`transactions` and `shopName`/`avatarUrl`/`coverImages`/`totalTransactions`) are supplied in responses for 100% frontend compatibility. Products also include the top-level string `seller: "handle"` matching `seller.handle`.
