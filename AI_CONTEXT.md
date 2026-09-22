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

## Notes & Recommendations for Frontend (No Frontend Code Changed)
1. **COD Orders**: Backend sets COD orders directly to `CONFIRMED` upon creation.
2. **Online Payments**: `POST /payments/checkout` advances online orders to `CONFIRMED` and returns full `ApiOrder` object.
3. **Cart Cleanup**: Creating an order automatically cleans checked items from the server database cart.
4. **Shipment Modal**: The seller shipment creation endpoint `POST /api/orders/:id/shipment` accepts `{ pickup: { name, phone, address, province, district, ward, note } }` and responds with `{ shipment: Shipment }`.


