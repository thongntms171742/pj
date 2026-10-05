# API Contract Matrix

This file tracks the implementation status of API features across teams based on the actual Backend implementation and Frontend integration progress.

| Method | Endpoint | Auth | Role | BE Status | FE Status | Notes |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **Auth** | | | | | | |
| POST | `/api/auth/register` | No | Public | ✅ | ✅ | Registration with auto role assignment |
| POST | `/api/auth/login` | No | Public | ✅ | ✅ | Login returning JWT + user profile |
| PUT | `/api/auth/me/avatar` | Yes | Any | ✅ | ✅ | Update profile avatar |
| POST | `/api/auth/seller/apply` | Yes | Any | ✅ | ✅ | Seller onboarding application |
| POST | `/api/auth/cart/merge` | Yes | Buyer | ✅ | ✅ | Legacy cart merge alias |
| **Users** | | | | | | |
| GET | `/api/users/me/addresses` | Yes | Any | ✅ | ⏳ | Get user's saved addresses |
| POST | `/api/users/me/addresses` | Yes | Any | ✅ | ⏳ | Add a new address |
| PATCH | `/api/users/me/addresses/:id` | Yes | Any | ✅ | ⏳ | Update an address (incl. default) |
| DELETE | `/api/users/me/addresses/:id` | Yes | Any | ✅ | ⏳ | Delete an address |
| **Sellers** | | | | | | |
| GET | `/api/sellers` | No | Public | ✅ | ✅ | Active seller shops catalog |
| GET | `/api/sellers/me` | Yes | Seller | ✅ | ✅ | Authenticated seller dashboard profile |
| GET | `/api/sellers/me/reviews` | Yes | Seller | ✅ | ✅ | Reviews received by current seller |
| GET | `/api/sellers/:idOrHandle` | No | Public | ✅ | ✅ | Public seller profile lookup |
| GET | `/api/sellers/:idOrHandle/products` | No | Public | ✅ | ✅ | Products of a specific shop |
| GET | `/api/sellers/:idOrHandle/reviews` | No | Public | ✅ | ✅ | Customer reviews for a seller |
| **Products** | | | | | | |
| GET | `/api/products` | No | Public | ✅ | ✅ | Catalog with filter (category, seller, status) |
| GET | `/api/products/mine` | Yes | Seller | ✅ | ✅ | Seller listings + live metrics |
| GET | `/api/products/seller` | Yes | Seller | ✅ | ✅ | Alias for `/api/products/mine` |
| GET | `/api/products/:id` | No | Public | ✅ | ✅ | Single product detail (incl. `sizeQuantities`, `sizePriceDeltas`) |
| POST | `/api/products` | Yes | Approved Seller | ✅ | ✅ | Create listing (accepts `sizeQuantities`, `sizePriceDeltas`) |
| PATCH | `/api/products/:id` | Yes | Owner/Admin | ✅ | ⏳ | Partial update (incl. per-size stock & price deltas) |
| PATCH | `/api/products/:id/archive` | Yes | Owner/Admin | ✅ | ✅ | Archive product |
| POST | `/api/products/:id/reviews` | Yes | Buyer | ✅ | ✅ | Submit review for delivered product |
| GET | `/api/products/:id/reviews` | No | Public | ✅ | ✅ | Reviews for product |
| **Cart** | | | | | | |
| GET | `/api/cart` | Yes | Buyer | ✅ | ✅ | User cart with populated items |
| POST | `/api/cart/items` | Yes | Buyer | ✅ | ✅ | Add item to cart with stock validation |
| PATCH | `/api/cart/items/:id` | Yes | Buyer | ✅ | ✅ | Update quantity / checked status |
| DELETE | `/api/cart/items/:id` | Yes | Buyer | ✅ | ✅ | Remove item from cart |
| DELETE | `/api/cart/clear` | Yes | Buyer | ✅ | ✅ | Clear all cart items |
| POST | `/api/cart/merge` | Yes | Buyer | ✅ | ✅ | Merge guest cart upon login |
| **Orders** | | | | | | |
| GET | `/api/orders` | Yes | Buyer | ✅ | ✅ | Buyer order history |
| GET | `/api/orders/seller` | Yes | Seller | ✅ | ✅ | Seller orders needing processing |
| POST | `/api/orders` | Yes | Buyer | ✅ | ✅ | Checkout (checked cart items or custom payload) |
| GET | `/api/orders/:id` | Yes | Buyer/Seller | ✅ | ✅ | Order details by code or ID |
| PATCH | `/api/orders/:code/status` | Yes | Buyer/Seller | ✅ | ✅ | State machine transition |
| GET | `/api/orders/:code/shipment` | Yes | Buyer/Seller | ✅ | ✅ | Live shipment tracking & timeline |
| POST | `/api/orders/:code/shipment` | Yes | Seller | ✅ | ✅ | Generate GHTK shipping label |
| **Payments** | | | | | | |
| POST | `/api/payments/checkout` | Yes | Buyer | ✅ | ✅ | Online payment processing & inventory deduction |
| POST | `/api/payments/:code/cod-collect` | Yes | Admin/System | ✅ | ⏳ | Idempotent COD collection |
| **Notifications** | | | | | | |
| GET | `/api/notifications` | Yes | Any | ✅ | ✅ | User notification feed |
| PATCH | `/api/notifications/:id/read` | Yes | Any | ✅ | ✅ | Mark notification as read |
| **Admin** | | | | | | |
| GET | `/api/admin/users` | Yes | Admin | ✅ | ⏳ | Users list with pagination & filters |
| PATCH | `/api/admin/users/:id/status` | Yes | Admin | ✅ | ⏳ | Ban or unban user account |
| GET | `/api/admin/users/:id/details` | Yes | Admin | ✅ | ⏳ | User details & stats |
| GET | `/api/admin/pending-listings` | Yes | Admin | ✅ | ✅ | Pending product listings moderation |
| PATCH | `/api/admin/listings/:id/approve` | Yes | Admin | ✅ | ✅ | Approve listing -> active |
| PATCH | `/api/admin/listings/:id/reject` | Yes | Admin | ✅ | ✅ | Reject listing -> archived |
| GET | `/api/admin/pending-sellers` | Yes | Admin | ✅ | ✅ | Pending seller applications (`res.users`) |
| PATCH | `/api/admin/sellers/:id/approve` | Yes | Admin | ✅ | ✅ | Approve seller application |
| PATCH | `/api/admin/sellers/:id/reject` | Yes | Admin | ✅ | ✅ | Reject seller application |
| PATCH | `/api/admin/sellers/:id/commission-rate` | Yes | Admin | ✅ | ⏳ | Update per-seller commission rate |
| GET | `/api/admin/stats` | Yes | Admin | ✅ | ✅ | Admin dashboard platform stats |
| **AI** | | | | | | |
| POST | `/api/ai/search` | No | Public | ✅ | ✅ | Natural language search |
| POST | `/api/ai/analyze-listing` | No | Public | ✅ | ✅ | Listing valuation and categorization |
| POST | `/api/ai/recommendations` | No | Public | ✅ | ⏳ | Product recommendations |
| **Addresses** | | | | | | |
| GET | `/api/addresses/provinces` | No | Public | ✅ | ⏳ | CAS proxy: list provinces/cities (cached 24h) |
| GET | `/api/addresses/provinces/:provinceId/communes` | No | Public | ✅ | ⏳ | CAS proxy: list communes by province (cached 24h) |
| GET | `/api/addresses/communes` | No | Public | ✅ | ⏳ | CAS proxy: list all communes nationwide (cached 24h) |
