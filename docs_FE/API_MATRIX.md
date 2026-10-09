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
| POST | `/api/auth/register` | No | Public | ✅ | ✅ | Email + name; auto-assigns `buyer` role |
| POST | `/api/auth/login` | No | Public | ✅ | ✅ | Returns JWT (`7d`) + public user profile |
| PUT  | `/api/auth/me/avatar` | Yes | Any | ✅ | ✅ | Update profile avatar URL |
| ~~POST~~ | ~~`/api/auth/seller/apply`~~ | — | — | ❌ | — | Marketplace endpoint removed |
| ~~POST~~ | ~~`/api/auth/cart/merge`~~ | — | — | ❌ | — | Guest-cart merge removed (single-brand, no guest cart) |
| **Users / Saved addresses** | | | | | | |
| GET    | `/api/users/me/addresses` | Yes | Any | ✅ | ⏳ | List user's saved addresses. FE có sẵn page `/profile` + dialog add/edit — BE sẵn sàng |
| POST   | `/api/users/me/addresses` | Yes | Any | ✅ | ⏳ | Add address (first one becomes default) |
| PATCH  | `/api/users/me/addresses/:id` | Yes | Any | ✅ | ⏳ | Update address, supports `isDefault` swap |
| DELETE | `/api/users/me/addresses/:id` | Yes | Any | ✅ | ⏳ | Delete address |
| **Catalog (public)** | | | | | | |
| GET  | `/api/catalog/trees` | No | Public | ✅ | ✅ | 3 sizes S/M/L, with `price`, `stock`, `images`, `bareImage` |
| GET  | `/api/catalog/styles` | No | Public | ✅ | ✅ | 6 concepts (CLASSIC, MINIMAL, GINGERBREAD, WINTER, CUTE, LUXURY) |
| GET  | `/api/catalog/accessories` | No | Public | ✅ | ✅ | Filters: `type`, `group`, `style`, `size`. Returns `maxQty` per size when `size` is passed |
| GET  | `/api/catalog/presets` | No | Public | ✅ | ✅ | Ready-made designs (admin-managed), hydrated |
| GET  | `/api/catalog/delivery-options` | No | Public | ✅ | ✅ | `READY_TO_DISPLAY` (decorated), `DIY_KIT` (decorating kit), `SEPARATE` (split delivery); flat shipping fee |
| POST | `/api/catalog/quote` | No | Public | ✅ | ✅ | Live price preview from a `DesignConfig` (no auth needed) |
| **Designs (auth + public share)** | | | | | | |
| POST   | `/api/designs/quote` | No | Public | ✅ | ✅ | Same as `catalog/quote`; kept under designs for editor convenience |
| POST   | `/api/designs` | Yes | Buyer | ✅ | ✅ | Save a TreeDesign; returns `{ design, shareUrl }` |
| GET    | `/api/designs/mine` | Yes | Buyer | ✅ | ⏳ | List my designs (FE sẽ dùng ở `/profile` khi user click "Thiết kế của tôi") |
| GET    | `/api/designs/share/:slug` | No / auth | Public/owner | ✅ | ✅ | Public if `isPublic`; otherwise owner/admin only. FE render ở `/tree/:slug` |
| GET    | `/api/designs/:id` | Yes | Owner/Admin | ✅ | ✅ | Fetch design by Mongo `_id`. FE dùng ở `/editor/:id` (re-edit) |
| PATCH  | `/api/designs/:id` | Yes | Owner | ✅ | ⏳ | Rename / change `config` / toggle `isPublic`. Re-validates via pricing (FE dùng khi re-edit) |
| DELETE | `/api/designs/:id` | Yes | Owner | ✅ | ⏳ | Delete design (preset cannot be deleted). FE dùng ở `/profile` (chưa wire) |
| POST   | `/api/designs/:id/duplicate` | Yes | Any | ✅ | ⏳ | Clone any design (own / public / preset). FE có thể dùng cho "Your 2026 Christmas" flow |
| **Cart** | | | | | | |
| GET    | `/api/cart` | Yes | Buyer | ✅ | ✅ | List cart items + live `currentUnitTotal` + `priceChanged` flag |
| POST   | `/api/cart/items` | Yes | Buyer | ✅ | ✅ | Add design or inline `DesignConfig`; validates via pricing |
| PATCH  | `/api/cart/items/:id` | Yes | Buyer | ✅ | ✅ | Update `quantity`, `checked`, or replace `config` |
| DELETE | `/api/cart/items/:id` | Yes | Buyer | ✅ | ✅ | Remove one item |
| DELETE | `/api/cart/clear` | Yes | Buyer | ✅ | ✅ | Empty cart |
| ~~POST~~ | ~~`/api/cart/merge`~~ | — | — | ❌ | — | Guest-cart merge removed |
| **Orders** | | | | | | |
| GET  | `/api/orders` | Yes | Buyer | ✅ | ✅ | List my orders; optional `?status=` filter |
| POST | `/api/orders` | Yes | Buyer | ✅ | ✅ | Create order. Accepts `items[]` or `cartItemIds[]`. Requires `designConfirmed: true`. HCM-only `79`. Snapshots price into order. |
| GET  | `/api/orders/:id` | Yes | Buyer/Admin | ✅ | ✅ | Accepts Mongo `_id` or `orderCode` |
| PATCH | `/api/orders/:id/status` | Yes | Buyer/Admin | ✅ | ✅ | State-machine transition. Buyer: `CANCELLED`/`CANCEL_REQUESTED`/`DELIVERED`/`COMPLETED`/`DISPUTED`. Personalization + `PACKING` blocks cancel-request. Restores stock on `CANCELLED`. |
| POST | `/api/orders/:id/shipment` | Yes | Admin | ✅ | ⏳ | Generate HCM delivery shipment, emits tracking events (FE buyer chỉ xem, chưa cần call) |
| GET  | `/api/orders/:id/shipment` | Yes | Buyer/Admin | ✅ | ⏳ | Live shipment + timeline events (FE buyer xem qua `/orders/:id` — có thể thêm tab) |
| ~~GET~~ | ~~`/api/orders/seller`~~ | — | — | ❌ | — | Marketplace endpoint removed |
| ~~PATCH~~ | ~~`/api/orders/:code/status`~~ | — | — | ❌ | — | Use `/api/orders/:id/status` instead |
| ~~POST~~ | ~~`/api/orders/:code/shipment`~~ | — | — | ❌ | — | Use `/api/orders/:id/shipment` instead |
| **Payments** | | | | | | |
| POST | `/api/payments/checkout` | Yes | Buyer | ✅ | ✅ | Online-payment advance: `PENDING_PAYMENT → PAID → CONFIRMED`. FE gọi ở OrderDetailPage khi `status === PENDING_PAYMENT` |
| ~~POST~~ | ~~`/api/payments/:code/cod-collect`~~ | — | — | ❌ | — | COD handled inside order creation (`paymentMethod: "COD"`) |
| **Notifications** | | | | | | |
| GET   | `/api/notifications` | Yes | Any | ✅ | ✅ | Last 50; auto-emitted on order create. FE render ở Layout dropdown |
| PATCH | `/api/notifications/:id/read` | Yes | Owner | ✅ | ⏳ | Mark one read; ownership enforced (FE hiện tại chỉ GET, chưa mark read) |
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
| GET    | `/api/admin/presets` | Yes | Admin | ✅ | ✅ | List admin presets (hydrated). FE render ở `/admin` tab "Mẫu có sẵn" |
| POST   | `/api/admin/presets` | Yes | Admin | ✅ | ✅ | Create preset. FE dùng PresetForm modal |
| PATCH  | `/api/admin/presets/:id` | Yes | Admin | ✅ | ✅ | Update preset. FE dùng PresetForm modal (chế độ edit) |
| DELETE | `/api/admin/presets/:id` | Yes | Admin | ✅ | ✅ | Delete preset. FE dùng ở nút xoá trong admin Preset grid |
| GET    | `/api/admin/orders` | Yes | Admin | ✅ | ⏳ | List all orders; optional `?status=` (FE admin tab Orders — chưa wire) |
| GET    | `/api/admin/stats` | Yes | Admin | ✅ | ✅ | Dashboard counts. FE render ở `/admin` tab Overview |
| GET    | `/api/admin/users` | Yes | Admin | ✅ | ⏳ | Paged + searchable (FE admin tab Users — chưa wire) |
| PATCH  | `/api/admin/users/:id/status` | Yes | Admin | ✅ | ⏳ | Ban / unban (FE admin Users page — chưa wire) |
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
| GET | `/api/addresses/provinces` | No | Public | ✅ | ✅ | Cached 24h; `?effectiveDate=YYYY-MM-DD` or `latest`. FE dùng ở CheckoutPage |
| GET | `/api/addresses/provinces/:provinceId/communes` | No | Public | ✅ | ✅ | Cached 24h. FE dùng ở CheckoutPage load communes cho HCM (id 79) |
| GET | `/api/addresses/communes` | No | Public | ✅ | ⏳ | Cached 24h (FE hiện tại không dùng — chỉ dùng province + communes) |
| **Support chat** | | | | | | |
| — | — | — | — | 🚧 | — | Not implemented yet (uses generic `chat` notification type, no live channel). Use Zalo/email integration post-MVP. |

---

## FE Integration Summary (2026-10-08)

**Đã integrate (✅ FE)** — có thể test end-to-end với BE deployed:

- **Auth flow**: register / login / updateAvatar + force-logout khi token hết hạn + suspended banner.
- **Catalog**: trees / styles / accessories / presets / delivery-options / live quote (EditorPage).
- **Designs**: tạo / lưu / share / getById (EditorPage + DesignSharePage + PresetsPage).
- **Cart**: get / add / update / remove / clear (CartPage).
- **Orders**: list / detail / create / status update (buyer actions) + payment checkout (OrdersPage + OrderDetailPage + CheckoutPage).
- **Notifications**: get (Layout dropdown).
- **Addresses (CAS)**: provinces + communes for HCM (CheckoutPage).
- **Admin**: stats + presets CRUD (AdminPage).

**Chưa integrate (⏳ FE) — backlog**:

- `GET /api/designs/mine` — chưa có trang "Thiết kế của tôi" (có thể thêm ở `/profile`).
- `PATCH/DELETE /api/designs/:id` — re-edit + delete design.
- `POST /api/designs/:id/duplicate` — "Your 2026 Christmas" clone flow.
- `GET /api/admin/orders` + `GET /api/admin/users` + `PATCH /:id/status` — admin moderation UI.
- `POST/GET /api/orders/:id/shipment` — shipment tab trong OrderDetailPage.
- `PATCH /api/notifications/:id/read` — mark read.
- `GET /api/addresses/communes` (chưa dùng — dùng variant province-scoped).
- **EditorPage UI polish (2026-10-08)**: bỏ sticky header, fix layout chồng chéo step indicator + price summary + sidebar preview. Thêm mock fallback cho catalog & quote khi BE fail/down → cho phép Editor demo UX end-to-end mà không cần BE ready.
- **Missing BE endpoint cần bổ sung**:
  - `GET /api/auth/me` (FE cần để refresh user state).
  - `PATCH /api/auth/me` (FE cần để update name ở ProfilePage).
  - `POST /api/uploads` (multipart) — để upload ảnh thay vì base64.

---

## Test Accounts (sau khi seed)

> **Xem chi tiết**: `docs/INTEGRATION_GUIDE.md` § Test Accounts.

| Role | Email | Password | Purpose |
| :--- | :--- | :--- | :--- |
| Admin | `admin@buildyourchristmas.vn` | value of `SEED_ADMIN_PASSWORD` env | Test `/api/admin/*` (CRUD trees/styles/accessories/presets, all orders, stats, users) |
| Buyer demo | `buyer@buildyourchristmas.vn` | value of `SEED_BUYER_PASSWORD` env | Test full flow: catalog → editor → save design → cart → checkout → orders |

> Password lấy từ env vars (`SEED_ADMIN_PASSWORD` / `SEED_BUYER_PASSWORD` trong `backend/.env`) — KHÔNG hard-code trong docs. Run `npm run seed -- --confirm-seed` để có data.