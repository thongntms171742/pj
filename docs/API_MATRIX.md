# API Contract Matrix — Build Your Christmas

This file tracks the implementation status of API features across teams based on the **actual** Backend implementation and Frontend integration progress. Last updated to match the Christmas-domain backend after the `thrift it!` pivot.

## Convention

- ✅ — implemented (verified)
- ⏳ — backend ready, frontend pending integration
- ❌ — intentionally removed during the Christmas pivot (do NOT use)
- 🚧 — planned but not started

---

| Method | Endpoint | Auth | Role | BE Status | FE Status | Notes |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **Auth** | | | | | | |
| POST | `/api/auth/register` | No | Public | ✅ | ⏳ | Email + name; auto-assigns `buyer` role |
| POST | `/api/auth/login` | No | Public | ✅ | ⏳ | Returns JWT (`7d`) + public user profile |
| PUT  | `/api/auth/me/avatar` | Yes | Any | ✅ | ⏳ | Update profile avatar URL |
| ~~POST~~ | ~~`/api/auth/seller/apply`~~ | — | — | ❌ | — | Marketplace endpoint removed |
| ~~POST~~ | ~~`/api/auth/cart/merge`~~ | — | — | ❌ | — | Guest-cart merge removed (single-brand, no guest cart) |
| **Users / Saved addresses** | | | | | | |
| GET    | `/api/users/me/addresses` | Yes | Any | ✅ | ⏳ | List user's saved addresses |
| POST   | `/api/users/me/addresses` | Yes | Any | ✅ | ⏳ | Add address (first one becomes default) |
| PATCH  | `/api/users/me/addresses/:id` | Yes | Any | ✅ | ⏳ | Update address, supports `isDefault` swap |
| DELETE | `/api/users/me/addresses/:id` | Yes | Any | ✅ | ⏳ | Delete address |
| **Catalog (public)** | | | | | | |
| GET  | `/api/catalog/trees` | No | Public | ✅ | ⏳ | 3 sizes S/M/L, with `price`, `stock`, `images`, `bareImage` |
| GET  | `/api/catalog/styles` | No | Public | ✅ | ⏳ | 6 concepts (CLASSIC, MINIMAL, GINGERBREAD, WINTER, CUTE, LUXURY) |
| GET  | `/api/catalog/accessories` | No | Public | ✅ | ⏳ | Filters: `type`, `group`, `style`, `size`. Returns `maxQty` per size when `size` is passed |
| GET  | `/api/catalog/presets` | No | Public | ✅ | ⏳ | Ready-made designs (admin-managed), hydrated |
| GET  | `/api/catalog/delivery-options` | No | Public | ✅ | ⏳ | `READY_TO_DISPLAY` (decorated) vs `FLAT_PACK` (DIY); flat shipping fee |
| POST | `/api/catalog/quote` | No | Public | ✅ | ⏳ | Live price preview from a `DesignConfig` (no auth needed) |
| **Designs (auth + public share)** | | | | | | |
| POST   | `/api/designs/quote` | No | Public | ✅ | ⏳ | Same as `catalog/quote`; kept under designs for editor convenience |
| POST   | `/api/designs` | Yes | Buyer | ✅ | ⏳ | Save a TreeDesign; returns `{ design, shareUrl }` |
| GET    | `/api/designs/mine` | Yes | Buyer | ✅ | ⏳ | List my designs |
| GET    | `/api/designs/share/:slug` | No / auth | Public/owner | ✅ | ⏳ | Public if `isPublic`; otherwise owner/admin only |
| GET    | `/api/designs/:id` | Yes | Owner/Admin | ✅ | ⏳ | Fetch design by Mongo `_id` |
| PATCH  | `/api/designs/:id` | Yes | Owner | ✅ | ⏳ | Rename / change `config` / toggle `isPublic`. Re-validates via pricing |
| DELETE | `/api/designs/:id` | Yes | Owner | ✅ | ⏳ | Delete design (preset cannot be deleted) |
| POST   | `/api/designs/:id/duplicate` | Yes | Any | ✅ | ⏳ | Clone any design (own / public / preset) |
| **Cart** | | | | | | |
| GET    | `/api/cart` | Yes | Buyer | ✅ | ⏳ | List cart items + live `currentUnitTotal` + `priceChanged` flag |
| POST   | `/api/cart/items` | Yes | Buyer | ✅ | ⏳ | Add design or inline `DesignConfig`; validates via pricing |
| PATCH  | `/api/cart/items/:id` | Yes | Buyer | ✅ | ⏳ | Update `quantity`, `checked`, or replace `config` |
| DELETE | `/api/cart/items/:id` | Yes | Buyer | ✅ | ⏳ | Remove one item |
| DELETE | `/api/cart/clear` | Yes | Buyer | ✅ | ⏳ | Empty cart |
| ~~POST~~ | ~~`/api/cart/merge`~~ | — | — | ❌ | — | Guest-cart merge removed |
| **Orders** | | | | | | |
| GET  | `/api/orders` | Yes | Buyer | ✅ | ⏳ | List my orders; optional `?status=` filter |
| POST | `/api/orders` | Yes | Buyer | ✅ | ⏳ | Create order. Accepts `items[]` or `cartItemIds[]`. Requires `designConfirmed: true`. HCM-only `79`. Snapshots price into order. |
| GET  | `/api/orders/:id` | Yes | Buyer/Admin | ✅ | ⏳ | Accepts Mongo `_id` or `orderCode` |
| PATCH | `/api/orders/:id/status` | Yes | Buyer/Admin | ✅ | ⏳ | State-machine transition. Buyer: `CANCELLED`/`CANCEL_REQUESTED`/`DELIVERED`/`COMPLETED`/`DISPUTED`. Personalization + `PACKING` blocks cancel-request. Restores stock on `CANCELLED`. |
| POST | `/api/orders/:id/shipment` | Yes | Admin | ✅ | ⏳ | Generate HCM delivery shipment, emits tracking events |
| GET  | `/api/orders/:id/shipment` | Yes | Buyer/Admin | ✅ | ⏳ | Live shipment + timeline events |
| ~~GET~~ | ~~`/api/orders/seller`~~ | — | — | ❌ | — | Marketplace endpoint removed |
| ~~PATCH~~ | ~~`/api/orders/:code/status`~~ | — | — | ❌ | — | Use `/api/orders/:id/status` instead |
| ~~POST~~ | ~~`/api/orders/:code/shipment`~~ | — | — | ❌ | — | Use `/api/orders/:id/shipment` instead |
| **Payments** | | | | | | |
| POST | `/api/payments/checkout` | Yes | Buyer | ✅ | ⏳ | Online-payment advance: `PENDING_PAYMENT → PAID → CONFIRMED` |
| ~~POST~~ | ~~`/api/payments/:code/cod-collect`~~ | — | — | ❌ | — | COD handled inside order creation (`paymentMethod: "COD"`) |
| **Notifications** | | | | | | |
| GET   | `/api/notifications` | Yes | Any | ✅ | ⏳ | Last 50; auto-emitted on order create |
| PATCH | `/api/notifications/:id/read` | Yes | Owner | ✅ | ⏳ | Mark one read; ownership enforced |
| **Admin (catalog)** | | | | | | |
| GET   | `/api/admin/trees` | Yes | Admin | ✅ | ⏳ | Optional `?isActive=true|false` |
| POST  | `/api/admin/trees` | Yes | Admin | ✅ | ⏳ | Create tree SKU |
| PATCH | `/api/admin/trees/:id` | Yes | Admin | ✅ | ⏳ | Update tree SKU |
| GET   | `/api/admin/styles` | Yes | Admin | ✅ | ⏳ | List all styles |
| POST  | `/api/admin/styles` | Yes | Admin | ✅ | ⏳ | Create style |
| PATCH | `/api/admin/styles/:id` | Yes | Admin | ✅ | ⏳ | Update style |
| GET   | `/api/admin/accessories` | Yes | Admin | ✅ | ⏳ | List all accessories |
| POST  | `/api/admin/accessories` | Yes | Admin | ✅ | ⏳ | Create accessory SKU |
| PATCH | `/api/admin/accessories/:id` | Yes | Admin | ✅ | ⏳ | Update accessory SKU |
| **Admin (designs / orders / users / stats)** | | | | | | |
| GET    | `/api/admin/presets` | Yes | Admin | ✅ | ⏳ | List admin presets (hydrated) |
| POST   | `/api/admin/presets` | Yes | Admin | ✅ | ⏳ | Create preset |
| PATCH  | `/api/admin/presets/:id` | Yes | Admin | ✅ | ⏳ | Update preset |
| DELETE | `/api/admin/presets/:id` | Yes | Admin | ✅ | ⏳ | Delete preset |
| GET    | `/api/admin/orders` | Yes | Admin | ✅ | ⏳ | List all orders; optional `?status=` |
| GET    | `/api/admin/stats` | Yes | Admin | ✅ | ⏳ | Dashboard counts (orders, users, designs, revenue, AOV, low-stock, personalization count) |
| GET    | `/api/admin/users` | Yes | Admin | ✅ | ⏳ | Paged + searchable (`?search=&page=&limit=`) |
| PATCH  | `/api/admin/users/:id/status` | Yes | Admin | ✅ | ⏳ | Ban / unban (cannot self-suspend) |
| GET    | `/api/admin/users/:id/details` | Yes | Admin | ✅ | ⏳ | Profile + per-user order/spend stats |
| ~~GET~~ | ~~`/api/admin/pending-listings`~~ | — | — | ❌ | — | Removed |
| ~~PATCH~~ | ~~`/api/admin/listings/:id/approve`~~ | — | — | ❌ | — | Removed |
| ~~PATCH~~ | ~~`/api/admin/listings/:id/reject`~~ | — | — | ❌ | — | Removed |
| ~~GET~~ | ~~`/api/admin/pending-sellers`~~ | — | — | ❌ | — | Removed |
| ~~PATCH~~ | ~~`/api/admin/sellers/:id/approve`~~ | — | — | ❌ | — | Removed |
| ~~PATCH~~ | ~~`/api/admin/sellers/:id/reject`~~ | — | — | ❌ | — | Removed |
| ~~PATCH~~ | ~~`/api/admin/sellers/:id/commission-rate`~~ | — | — | ❌ | — | Removed |
| **Sellers / Products / Reviews (legacy marketplace)** | | | | | | |
| — | `/api/sellers/*` | — | — | ❌ | — | Single-brand: no seller concept |
| — | `/api/products/*` | — | — | ❌ | — | Catalog replaced by `/api/catalog/*` |
| — | `/api/products/:id/reviews` | — | — | ❌ | — | Reviews removed (not in Christmas MVP) |
| **AI (legacy)** | | | | | | |
| — | `/api/ai/*` | — | — | ❌ | — | Gemini AI endpoints removed in favour of explicit FE-side composition |
| **Addresses (CAS proxy)** | | | | | | |
| GET | `/api/addresses/provinces` | No | Public | ✅ | ⏳ | Cached 24h; `?effectiveDate=YYYY-MM-DD` or `latest` |
| GET | `/api/addresses/provinces/:provinceId/communes` | No | Public | ✅ | ⏳ | Cached 24h |
| GET | `/api/addresses/communes` | No | Public | ✅ | ⏳ | Cached 24h |
| **Support chat** | | | | | | |
| — | — | — | — | 🚧 | — | Not implemented yet (uses generic `chat` notification type, no live channel). Use Zalo/email integration post-MVP. |