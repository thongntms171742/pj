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

