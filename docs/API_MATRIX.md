# API Contract Matrix

This file tracks the implementation status of API features across teams based on the actual Backend implementation.

| Method | Endpoint | Auth | Role | BE Status | FE Status |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Auth** | | | | | |
| POST | `/api/auth/register` | No | Public | ✅ | ⏳ |
| POST | `/api/auth/login` | No | Public | ✅ | ⏳ |
| POST | `/api/auth/cart/merge` | Yes | Buyer | ✅ | ⏳ |
| **Sellers** | | | | | |
| GET | `/api/sellers` | No | Public | ✅ | ⏳ |
| GET | `/api/sellers/me` | Yes | Any | ✅ | ⏳ |
| GET | `/api/sellers/:idOrHandle/products` | No | Public | ✅ | ⏳ |
| GET | `/api/sellers/:idOrHandle` | No | Public | ✅ | ⏳ |
| **Products** | | | | | |
| GET | `/api/products` | No | Public | ✅ | ⏳ |
| GET | `/api/products/mine` | Yes | Any | ✅ | ⏳ |
| GET | `/api/products/seller` | Yes | Any | ✅ | ⏳ |
| POST | `/api/products` | Yes | Seller Approved | ✅ | ⏳ |
| **Orders** | | | | | |
| GET | `/api/orders` | Yes | Buyer | ✅ | ⏳ |
| GET | `/api/orders/seller` | Yes | Seller | ✅ | ⏳ |
| POST | `/api/orders` | Yes | Buyer | ✅ | ⏳ |
| GET | `/api/orders/:id` | Yes | Buyer/Seller | ✅ | ⏳ |
| GET | `/api/orders/:code/shipment` | No | Public | ✅ | ⏳ |
| POST | `/api/orders/:code/shipment` | Yes | Seller | ✅ | ⏳ |
| PATCH | `/api/orders/:code/status` | Yes | Seller | ✅ | ⏳ |
| **Payments** | | | | | |
| POST | `/api/payments/checkout` | Yes | Buyer | ✅ | ⏳ |
| **Cart** | | | | | |
| GET | `/api/cart` | Yes | Buyer | ✅ | ⏳ |
| POST | `/api/cart/items` | Yes | Buyer | ✅ | ⏳ |
| PATCH | `/api/cart/items/:id` | Yes | Buyer | ✅ | ⏳ |
| DELETE | `/api/cart/items/:id` | Yes | Buyer | ✅ | ⏳ |
| DELETE | `/api/cart/clear` | Yes | Buyer | ✅ | ⏳ |
| POST | `/api/cart/merge` | Yes | Buyer | ✅ | ⏳ |
| **Notifications** | | | | | |
| GET | `/api/notifications` | Yes | Any | ✅ | ⏳ |
| PATCH | `/api/notifications/:id/read` | Yes | Any | ✅ | ⏳ |
| **Admin** | | | | | |
| GET | `/api/admin/pending-listings` | Yes | Admin | ✅ | ⏳ |
| PATCH | `/api/admin/listings/:id/approve` | Yes | Admin | ✅ | ⏳ |
| PATCH | `/api/admin/listings/:id/reject` | Yes | Admin | ✅ | ⏳ |
| **AI** | | | | | |
| POST | `/api/ai/search` | No | Public | ✅ | ⏳ |
| POST | `/api/ai/analyze-listing` | No | Public | ✅ | ⏳ |
| POST | `/api/ai/recommendations` | No | Public | ✅ | ⏳ |
