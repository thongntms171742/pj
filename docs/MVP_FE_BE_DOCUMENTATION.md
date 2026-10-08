# MVP UI/UX Implementation Report
## Build Your Christmas — Frontend ↔ Backend Coverage

> **Generated:** 2026-10-07
> **Author:** FE Team
> **Status:** Frontend MVP implementation ~95% complete
> **Target:** Backend team — BE cần implement theo spec này

---

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [FE đã làm xong — Ready for BE integration](#2-fe-đã-làm-xong--ready-for-be-integration)
3. [BE Priority Checklist](#3-be-priority-checklist)
4. [API Endpoints Summary](#4-api-endpoints-summary)
5. [Pages & Components Coverage](#5-pages--components-coverage)
6. [MVP Data Requirements](#6-mvp-data-requirements)
7. [Design/Share Flow (FE → BE)](#7-designshare-flow-fe--be)
8. [HCM Address Hard-code Spec](#8-hcm-address-hard-code-spec)
11. [Error Handling Contract](#11-error-handling-contract)
12. [Env & CORS](#12-env--cors)
13. [BE Development Priority Order](#13-be-development-priority-order)

---

## 1. Tổng quan

**MVP Flow:**
```
CREATE → CUSTOMIZE → PREVIEW → ORDER
```

**Scope:**
- TP. Hồ Chí Minh only (province ID = `79`)
- 3 tree sizes: S / M / L
- 6 styles: Classic / Minimal / Gingerbread / Winter / Cute / Luxury
- 4 accessory groups: LIGHTS / ORNAMENT / DECOR / PERSONAL
- 3 delivery options: READY_TO_DISPLAY / DIY_KIT / SEPARATE
- Auth: JWT (7d expiry)
- Cart → Checkout → Order → Tracking
- Design save & share (public URL `/tree/:slug`)
- Admin: stats, CRUD trees/styles/accessories/presets/orders/users

**Frontend repo:** `frontend/src/`
**API base:** `/api` (dev proxy → `http://localhost:4000/api`)

---

## 2. FE đã làm xong — Ready for BE integration

### ✅ Pages (14 trang — 100% done)

| # | Page | Route | Status | BE API |
|---|------|-------|--------|--------|
| 1 | HomePage | `/` | ✅ Done | Static (banner slides, no API call) |
| 2 | CatalogPage | `/catalog` | ✅ Done | `GET /catalog/trees`, `GET /catalog/styles` |
| 3 | PresetsPage | `/presets` | ✅ Done | `GET /catalog/presets` |
| 4 | EditorPage | `/editor` | ✅ Done | Trees, Styles, Accessories, `POST /catalog/quote`, `POST /designs`, `POST /designs/:id/duplicate` |
| 5 | DesignSharePage | `/tree/:slug` | ✅ Done | `GET /designs/share/:slug` |
| 6 | CartPage | `/cart` | ✅ Done | `GET /cart`, `DELETE /cart/items/:id`, `POST /cart/items` |
| 7 | CheckoutPage | `/checkout` | ✅ Done | `GET /cart`, `POST /orders`, Address APIs |
| 8 | OrderSuccessPage | `/order/success/:orderId` | ✅ Done | Frontend only |
| 9 | OrdersPage | `/orders` | ✅ Done | `GET /orders` |
| 10 | OrderDetailPage | `/orders/:id` | ✅ Done | `GET /orders/:id`, `GET /orders/:id/shipment` |
| 11 | AuthPage | `/auth` | ✅ Done | `POST /auth/register`, `POST /auth/login` |
| 12 | ProfilePage | `/profile` | ✅ Done | Address APIs |
| 13 | AdminPage | `/admin` | ✅ Done | Stats, Orders, Users, Catalog CRUD |
| 14 | NotFoundPage | `*` | ✅ Done | — |

### ✅ Components

| Component | File | Status | Notes |
|-----------|------|--------|-------|
| Layout + Navbar + Footer | `components/Layout.tsx` | ✅ Done | |
| Hero Banner Slider | `components/HeroBanner.tsx` | ✅ Done | Auto-play, dots, arrows, progress bar |
| Auth Context | `store/AuthContext.tsx` | ✅ Done | JWT |
| Toast Context | `store/ToastContext.tsx` | ✅ Done | |
| Cart (localStorage) | `store/CartContext.tsx` | ✅ Done | Syncs with BE cart |
| API client | `lib/api.ts` | ✅ Done | Axios + interceptors |

### ✅ Features mapped to API

| Feature | FE File | API Called | BE Status |
|---------|---------|------------|--------|
| Catalog | `CatalogPage.tsx` | `GET /catalog/trees` | ⚠️ BE implement |
| Catalog | `CatalogPage.tsx` | `GET /catalog/styles` | ⚠️ BE implement |
| Catalog | `CatalogPage.tsx` | `GET /catalog/accessories` | ⚠️ BE implement |
| Editor pricing | `EditorPage.tsx` | `POST /catalog/quote` | ⚠️ BE implement |
| Editor delivery options | `EditorPage.tsx` | `GET /catalog/delivery-options` | ⚠️ BE implement |
| Save design | `EditorPage.tsx` | `POST /designs` | ⚠️ BE implement |
| Clone design (clone param) | `EditorPage.tsx` | `GET /designs/:id` | ⚠️ BE implement |
| Duplicate preset | `PresetsPage.tsx` | `POST /designs/:id/duplicate` | ⚠️ BE implement |
| Share page | `DesignSharePage.tsx` | `GET /designs/share/:slug` | ⚠️ BE implement |
| Cart add | `EditorPage.tsx` | `POST /cart/items` | ⚠️ BE implement |
| Cart view | `CartPage.tsx` | `GET /cart` | ⚠️ BE implement |
| Cart remove | `CartPage.tsx` | `DELETE /cart/items/:id` | ⚠️ BE implement |
| Checkout | `CheckoutPage.tsx` | `POST /orders` | ⚠️ BE implement |
| Orders list | `OrdersPage.tsx` | `GET /orders` | ⚠️ BE implement |
| Order detail | `OrderDetailPage.tsx` | `GET /orders/:id` | ⚠️ BE implement |
| Shipment tracking | `OrderDetailPage.tsx` | `GET /orders/:id/shipment` | ⚠️ BE implement |
| Register | `AuthPage.tsx` | `POST /auth/register` | ⚠️ BE implement |
| Login | `AuthPage.tsx` | `POST /auth/login` | ⚠️ BE implement |
| User profile | `ProfilePage.tsx` | Profile info tu `POST /api/auth/login` response (BE ready) | ✅ BE ready |
| Addresses | `ProfilePage.tsx` | `GET /users/me/addresses`, `POST/DELETE` | ⚠️ BE implement |
| Admin stats | `AdminPage.tsx` | `GET /admin/stats` | ⚠️ BE implement |
| Admin orders | `AdminPage.tsx` | `GET /admin/orders` | ⚠️ BE implement |
| Admin users | `AdminPage.tsx` | `GET /admin/users` | ⚠️ BE implement |
| Admin catalog CRUD | `AdminPage.tsx` | Trees/Styles/Accessories/Presets | ⚠️ BE implement |

---

## 3. BE Priority Checklist

### ✅ P0 — Must have (MVP launch blocker) - ALL DONE

- [x] `GET /api/catalog/trees` - 3 records S/M/L (BE ready)
- [x] `GET /api/catalog/styles` - 6 records (BE ready)
- [x] `GET /api/catalog/accessories` - 20+ records across 4 groups (BE ready)
- [x] `GET /api/catalog/delivery-options` - 3 options: READY_TO_DISPLAY / DIY_KIT / SEPARATE (BE ready)
- [x] `POST /api/catalog/quote` - Live pricing engine (BE ready)
- [x] `POST /api/auth/register` - Register + JWT (BE ready)
- [x] `POST /api/auth/login` - Login + JWT (BE ready)
- [x] `POST /api/orders` - Create order (BE ready)
- [x] `GET /api/orders` - List user orders (BE ready)
- [x] `GET /api/orders/:id` - Order detail (BE ready)
- [x] `GET /api/orders/:id/shipment` - Shipment tracking (BE ready)

### ✅ P1 — Core MVP (FE fully done, BE ready)

- [x] `POST /api/designs` - Save design (BE ready)
- [x] `GET /api/designs/:id` - Get design by ID (for clone) (BE ready)
- [x] `GET /api/designs/share/:slug` - Public share page (BE ready)
- [x] `POST /api/designs/:id/duplicate` - Duplicate preset as new design (BE ready)
- [x] `GET /api/catalog/presets` - Presets gallery (BE ready)
- [x] `GET /api/cart` - Get cart (BE ready)
- [x] `POST /api/cart/items` - Add to cart (BE ready)
- [x] `DELETE /api/cart/items/:id` - Remove from cart (BE ready)
- [x] `GET/POST/PATCH/DELETE /api/users/me/addresses` - Address management (BE ready)
- [x] `GET /api/admin/stats` - Dashboard stats (BE ready)
- [x] `GET /api/admin/orders` - Admin order list (BE ready)
- [x] `GET /api/admin/users` - Admin user list (BE ready)
- [x] `GET/POST/PATCH /api/admin/trees` - Tree CRUD (BE ready, soft-delete via PATCH `isActive: false`)
- [x] `GET/POST/PATCH /api/admin/styles` - Style CRUD (BE ready, soft-delete via PATCH `isActive: false`)
- [x] `GET/POST/PATCH /api/admin/accessories` - Accessory CRUD (BE ready, soft-delete via PATCH `isActive: false`)
- [x] `GET/POST/PATCH/DELETE /api/admin/presets` - Preset CRUD (BE ready, presets have DELETE)

### ⚠️ NOT IN MVP SCOPE (giu lai tham khao, CHUA co BE)

> **Luu y quan trong**: Cac endpoint duoi day duoc MVP_FE_BE_DOCUMENTATION.md (ban cu) liet ke, nhung **CHUA CO** trong BE. FE khong nen call khi chua co BE.

- **Banner**: `GET /api/banners` + admin CRUD - dung placeholder tinh tu FE, khong goi API.
- **Newsletter**: `POST /api/newsletter/subscribe` - thay bang form gui Zalo/email that hoac bo qua.
- **User profile (khong phai addresses)**: `GET /api/users/me` - dung thong tin tu `POST /api/auth/login` response thay vi call rieng.
- **Admin DELETE trees/styles/accessories**: BE chi co PATCH (soft-delete qua `isActive=false`), KHONG co DELETE. Dung PATCH `{ isActive: false }` thay.

---

## 4. API Endpoints Summary

### 4.1 Catalog APIs

```
GET    /api/catalog/trees           → List trees (S/M/L)
GET    /api/catalog/styles          → List 6 styles
GET    /api/catalog/accessories     → List accessories (by group)
GET    /api/catalog/delivery-options → 3 delivery options
POST   /api/catalog/quote           → Live pricing
GET    /api/catalog/presets        → Presets gallery
```

### 4.2 Auth APIs

```
POST   /api/auth/register           → Register
POST   /api/auth/login              → Login
POST   /api/auth/logout             → Logout (optional)
GET    /api/auth/me                 → Current user
```

### 4.3 Design APIs

```
POST   /api/designs                 → Save design → { design, shareUrl }
GET    /api/designs/:id             → Get design (for clone)
GET    /api/designs/share/:slug     → Public share page
POST   /api/designs/:id/duplicate  → Duplicate design
GET    /api/designs/mine            → User's designs
```

### 4.4 Cart APIs

```
GET    /api/cart                   → Get cart
POST   /api/cart/items             → Add to cart
DELETE /api/cart/items/:id         → Remove item
PATCH  /api/cart/items/:id         → Update quantity
```

### 4.5 Order APIs

```
POST   /api/orders                 → Create order
GET    /api/orders                 → List user orders
GET    /api/orders/:id             → Order detail
GET    /api/orders/:id/shipment    → Shipment tracking
```

### 4.6 User Address APIs (User profile dung thong tin tu /auth/login response)

```
GET    /api/users/me/addresses     → List saved addresses
POST   /api/users/me/addresses     → Add address (first one becomes default)
PATCH  /api/users/me/addresses/:id → Update address, supports isDefault swap
DELETE /api/users/me/addresses/:id → Delete address
```

> **Luu y**: `GET /api/users/me` KHONG ton tai trong BE. Profile info nen lay tu response cua `POST /api/auth/login` hoac `POST /api/auth/register` (fields: `user._id`, `user.name`, `user.email`, `user.roles`, `user.avatarUrl`).

### 4.7 Admin APIs

```
GET    /api/admin/stats            → Dashboard stats
GET    /api/admin/orders           → All orders
GET    /api/admin/users            → All users
GET    /api/admin/trees            → List trees
POST   /api/admin/trees            → Create tree
PATCH  /api/admin/trees/:id        → Update tree
# DELETE /api/admin/trees/:id KHONG co - dung PATCH { isActive: false }
GET    /api/admin/styles           → List styles
POST   /api/admin/styles           → Create style
PATCH  /api/admin/styles/:id       → Update style
# DELETE /api/admin/styles/:id KHONG co - dung PATCH { isActive: false }
GET    /api/admin/accessories      → List accessories
POST   /api/admin/accessories      → Create accessory
PATCH  /api/admin/accessories/:id  → Update accessory
# DELETE /api/admin/accessories/:id KHONG co - dung PATCH { isActive: false }
GET    /api/admin/presets          → List presets
POST   /api/admin/presets          → Create preset
PATCH  /api/admin/presets/:id      → Update preset
DELETE /api/admin/presets/:id      → Delete preset
```

```

### 4.10 Address APIs (External)

```
GET    /api/addresses/provinces?effectiveDate=latest
GET    /api/addresses/communes?effectiveDate=latest
```

> FE filter provinces để lấy `provinceId === "79"` (TP.HCM).
> FE gọi `/communes` và filter `provinceId === "79"`, tự group theo district.

---

## 5. Pages & Components Coverage

### 5.1 HomePage (`/`) — ✅ Done

**Sections:**
- `HeroBanner` component → dung placeholder tinh tu FE (no BE call)
- Category nav (6 items, static links) → FE only
- Features bar (4 features, static) → FE only
- Featured products (4 cards, static) → FE only
- 4-step process (static) → FE only
- Styles grid (6 styles, static) → FE only
- CTA banner (static) → FE only
- Newsletter form → optional (Zalo/email integration or skip for MVP)
- Delivery notice → FE only

### 5.2 CatalogPage (`/catalog`) — ✅ Done

- Trees grid → `GET /catalog/trees`
- Styles grid → `GET /catalog/styles`
- Each tree card links to `/editor?tree=S|M|L`
- Each style card links to `/editor?style=CLASSIC|MINIMAL|...`

### 5.3 EditorPage (`/editor`) — ✅ Done

**4-step editor:**

| Step | Tab Label | Data Source | Notes |
|------|-----------|------------|-------|
| 1 | Chọn cây | `GET /catalog/trees` | Tree cards |
| 2 | Phong cách | `GET /catalog/styles` | Style cards |
| 3 | Phụ kiện | `GET /catalog/accessories` | 4 group tabs: LIGHTS, ORNAMENT, DECOR, PERSONAL |
| 4 | Xem & Lưu | `POST /catalog/quote` | Live pricing + save |

**Key behaviors:**
- Accessories filtered by `selectedStyle.code` + `groupFilter`
- `POST /catalog/quote` called on every config change (debounced)
- `POST /designs` saves → navigates to `/tree/{slug}`
- `GET /designs/:id` loaded when `?clone=ID` param present
- Delivery options: `GET /catalog/delivery-options`
- Add to cart: `POST /cart/items` with `{ treeId, styleId, accessories, deliveryOption }`

### 5.4 DesignSharePage (`/tree/:slug`) — ✅ Done

- `GET /api/designs/share/:slug` → render shared design
- Copy link button (clipboard)
- "Dùng làm base" → navigates to `/editor?clone={designId}`
- OG meta tags needed for FB/IG share (SSR or redirect page)

### 5.5 PresetsPage (`/presets`) — ✅ Done

- `GET /api/catalog/presets` → grouped by `year`
- Each preset: "Xem chi tiết" → `/tree/{slug}`
- "Dùng làm base" → `POST /api/designs/:id/duplicate` → `/editor?clone={newId}`

### 5.6 CartPage (`/cart`) — ✅ Done

- `GET /api/cart` → cart items
- `DELETE /api/cart/items/:id` → remove item
- Total calculation on FE (for display only, final total from checkout)

### 5.7 CheckoutPage (`/checkout`) — ✅ Done

- Load cart: `GET /api/cart`
- Address form: province hard-coded as TP.HCM (ID: `79`)
  - Districts/wards: filter from `/api/addresses/communes` (provinceId === `79`)
- Payment: COD or ONLINE (mock)
- Submit: `POST /api/orders`
- Redirect to `/order/success/:orderId`

### 5.8 OrdersPage (`/orders`) — ✅ Done

- `GET /api/orders` → order list with status badges

### 5.9 OrderDetailPage (`/orders/:id`) — ✅ Done

- `GET /api/orders/:id` → full order detail
- `GET /api/orders/:id/shipment` → shipment status

### 5.10 AuthPage (`/auth`) — ✅ Done

- Login: `POST /api/auth/login` → JWT stored
- Register: `POST /api/auth/register`
- After login → redirect to `?redirect=` param or `/`

### 5.11 ProfilePage (`/profile`) — ✅ Done

- Profile info → lay tu `POST /api/auth/login` response (khong co `GET /api/users/me`)
- `GET/POST/PATCH/DELETE /api/users/me/addresses` (BE ready)
- Address picker: filter communes by provinceId `79`

### 5.12 AdminPage (`/admin`) — ✅ Done

**4 tabs:**
- Overview: `GET /api/admin/stats`
- Orders: `GET /api/admin/orders` + `PATCH /admin/orders/:id`
- Catalog: CRUD trees/styles/accessories/presets
- Users: `GET /api/admin/users`

---

## 6. MVP Data Requirements

### 6.1 Trees (3 records)

| field | S | M | L |
|-------|---|---|---|
| `name` | Cây Thông Mini | Cây Thông Vừa | Cây Thông Lớn |
| `size` | S | M | L |
| `price` | 149000 | 249000 | 449000 |
| `heightCmMin` | 30 | 80 | 150 |
| `heightCmMax` | 60 | 120 | 180 |
| `stock` | 50 | 80 | 30 |
| `description` | (text) | (text) | (text) |
| `images` | (array) | (array) | (array) |

### 6.2 Styles (6 records)

| `code` | `name` | `palette` (hex array) |
|--------|--------|----------------------|
| CLASSIC | Classic Christmas | #C41E3A, #2D6A4F, #C49A3A |
| MINIMAL | Minimal | #F5F1EC, #2D6A4F, #718096 |
| GINGERBREAD | Gingerbread | #8B4513, #C41E3A, #D2691E |
| WINTER | Winter | #F0F8FF, #B0C4DE, #5A9AB8 |
| CUTE | Cute | #FFB6C1, #E8CB7A, #B7E4C7 |
| LUXURY | Luxury | #C49A3A, #F5DEB3, #722F37 |

### 6.3 Accessories (min 20 records)

**Group: LIGHTS**
- Dây đèn 100 bóng: price=59000, type=LIGHT_STRING, group=LIGHTS
- Dây đèn 200 bóng: price=89000, type=LIGHT_STRING, group=LIGHTS

**Group: ORNAMENT**
- Quả châu đỏ: price=19000, type=BAUBLE, group=ORNAMENT
- Quả châu vàng: price=19000, type=BAUBLE, group=ORNAMENT
- Quả châu xanh: price=19000, type=BAUBLE, group=ORNAMENT
- Chuông vàng: price=29000, type=BELL, group=ORNAMENT
- Kẹo candy: price=15000, type=CANDY, group=ORNAMENT
- Mô hình Santa: price=49000, type=FIGURINE, group=ORNAMENT

**Group: DECOR**
- Nơ đỏ lớn: price=39000, type=BOW, group=DECOR
- Tất Noel: price=29000, type=STOCKING, group=DECOR
- Ngôi sao vàng: price=59000, type=STAR, group=DECOR

**Group: PERSONAL**
- Name tag (tên): price=29000, type=NAME_TAG, group=PERSONAL, isPersonalizable=true, maxLength=20
- Ornament tên: price=49000, type=NAME_ORNAMENT, group=PERSONAL, isPersonalizable=true, maxLength=15

### 6.4 Delivery Options

```json
[
  {
    "code": "READY_TO_DISPLAY",
    "label": "Trang trí sẵn",
    "description": "Giao cây đã trang trí hoàn chỉnh",
    "shippingFee": 30000,
    "decorationFeeBySize": { "S": 50000, "M": 80000, "L": 120000 }
  },
  {
    "code": "DIY_KIT",
    "label": "DIY Kit",
    "description": "Giao cây + phụ kiện, tự trang trí",
    "shippingFee": 30000,
    "decorationFeeBySize": { "S": 0, "M": 0, "L": 0 }
  },
  {
    "code": "SEPARATE",
    "label": "Giao riêng",
    "description": "Cây và phụ kiện đóng riêng",
    "shippingFee": 30000,
    "decorationFeeBySize": { "S": 0, "M": 0, "L": 0 }
  }
]
```


## 7. Design/Share Flow (FE → BE)

```
User designs in EditorPage
    │
    ├─ "Lưu thiết kế" → POST /api/designs
    │                      Request: { name, config: DesignConfig }
    │                      Response: { design: {...}, shareUrl: "/tree/slug-abc" }
    │                      FE navigates to: /tree/slug-abc
    │
    ├─ "Chia sẻ" → Web Share API (mobile) or clipboard.copy(link)
    │
    └─ DesignSharePage (/tree/:slug)
           GET /api/designs/share/:slug
           Response: { design: { name, config, pricing, previewImage, shareUrl, isPublic, year } }
           FE renders: name + preview + config summary + pricing + share buttons
           "Dùng làm base" → POST /api/designs/:id/duplicate
                               → { design: {...} }
                               → FE navigates to /editor?clone={newId}

    PresetsPage: "Dùng làm base"
           POST /api/designs/:id/duplicate
           → { design: { _id } }
           → FE navigates to /editor?clone={_id}
```

**DesignConfig sent to BE:**
```typescript
interface DesignConfig {
  treeId: string;           // Tree._id (ObjectId string)
  styleId: string;          // Style._id (ObjectId string)
  accessories: DesignAccessoryLine[];
  deliveryOption: 'READY_TO_DISPLAY' | 'DIY_KIT' | 'SEPARATE';
}
interface DesignAccessoryLine {
  accessoryId: string;       // Accessory._id
  quantity: number;
  personalizationText?: string; // required if accessory.isPersonalizable
}
```

**PriceBreakdown returned by `POST /catalog/quote`:**
```typescript
interface PriceBreakdown {
  tree: { id: string; name: string; size: 'S'|'M'|'L'; unitPrice: number };
  style: { id: string; code: string; name: string };
  lines: PriceLine[];         // accessories breakdown
  decorationFee: number;      // 0 unless READY_TO_DISPLAY
  shippingFee: number;        // 30000
  unitTotal: number;          // full total
  productionDays: number;     // personalization = +2 days
  hasPersonalization: boolean;
  hasService: boolean;
  warnings: string[];
}
```

---

## 8. HCM Address Hard-code Spec

**Frontend hard-codes:**
```typescript
const HCM_PROVINCE_ID = '79';
const HCM_PROVINCE_NAME = 'Thành phố Hồ Chí Minh';
```

**Flow in CheckoutPage & ProfilePage:**
1. Load communes: `GET /api/addresses/communes?effectiveDate=latest`
2. Filter: `communes.filter(c => c.provinceId === '79')`
3. Group by `districtId` (FE groups)
4. User selects District → Phường/Xã

**Province selector:** Hidden/hard-coded — no province selection UI needed.

**BE Validation:**
- `POST /api/orders`: validate `shippingProvinceId === '79'` → `422 DELIVERY_AREA_NOT_SUPPORTED`

---



## 11. Error Handling Contract

### 11.1 FE Toast Usage

FE uses `toast.error(title, message)` and `toast.success()` for all API responses.
FE **never** hard-codes error messages — always displays `error.message` from BE.

### 11.2 Error Codes FE Handles

| Code | FE Behavior |
|------|------------|
| `OUT_OF_STOCK` | Toast error + disable "Add to cart" |
| `ACCESSORY_STYLE_MISMATCH` | Filter out accessory (FE already filters) |
| `PERSONALIZATION_REQUIRED` | Focus input + inline error |
| `DESIGN_CONFIG_INVALID` | Warning in pricing panel |
| `DELIVERY_AREA_NOT_SUPPORTED` | Disable checkout, show message |
| `UNAUTHORIZED` | Redirect `/auth?mode=login&redirect=<current>` |
| `FORBIDDEN` | Redirect `/` + toast |
| `DESIGN_NOT_FOUND` | Show NotFoundPage |
| `ORDER_NOT_FOUND` | Show NotFoundPage |

### 11.3 Standard Error Response Format

```json
{
  "code": "ERROR_CODE",
  "message": "Human-readable message for user",
  "details": {}  // optional
}
```

---

## 12. Env & CORS

### 12.1 Backend .env

```env
PORT=4000
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster0.jkkqqk7.mongodb.net/christmas?retryWrites=true&w=majority
JWT_SECRET=<generate-64-char-random-string>
JWT_EXPIRES_IN=7d
CAS_ADDRESS_KIT_URL=https://production.cas.so/address-kit
CAS_ADDRESS_TIMEOUT_MS=5000
FRONTEND_ORIGIN=http://localhost:5173
NODE_ENV=development
SEED_ADMIN_PASSWORD=Admin@BYC2026
SEED_BUYER_PASSWORD=Buyer@BYC2026
```

### 12.2 CORS

```typescript
// Allow:
// - http://localhost:5173 (dev FE)
// - https://buildyourchristmas.vn (prod FE — TBD)
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:4173',
  'https://buildyourchristmas.vn',  // prod FE
];
```

### 12.3 Vite Proxy (dev)

```typescript
// frontend/vite.config.ts
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:4000',
      changeOrigin: true,
    },
  },
},
```

---

## 13. BE Development Priority Order

### Week 1 — Foundation + Auth + Catalog
1. Setup project + MongoDB + seed data
2. `GET /catalog/trees|styles|accessories|delivery-options`
3. `POST /catalog/quote` (pricing engine)
4. `POST /auth/register|login` + JWT middleware
5. Test with FE CatalogPage + EditorPage

### Week 2 — Core Flows
6. `POST /designs` + `GET /designs/share/:slug`
7. `GET /catalog/presets`
8. `POST /designs/:id/duplicate` + `GET /designs/:id`
9. Cart: `GET/POST/DELETE /cart`
10. Test with FE EditorPage + PresetsPage + DesignSharePage

### Week 3 — Orders + Users
11. `POST /orders` + `GET /orders`
12. `GET /orders/:id` + `GET /orders/:id/shipment`
13. `GET/PATCH/POST/DELETE /users/me/addresses`
14. Address API integration (CAS or static data)
15. Test with FE CartPage + CheckoutPage + OrdersPage

### Week 4 — Admin catalog
16. `GET /admin/stats`
17. `GET /admin/orders` + `PATCH /admin/orders/:id`
18. `GET /admin/users`
19. Admin CRUD: trees, styles, accessories, presets
22. Final integration test

---

## Appendix A: JWT Structure

```json
{
  "id": "user ObjectId",
  "email": "user email",
  "roles": ["buyer"],
  "iat": 1234567890,
  "exp": 1235167890
}
```

> Admin users have `roles: ["admin"]` or `roles: ["buyer", "admin"]`.

---

## Appendix B: CORS Config Reference

```typescript
// Express CORS middleware
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
```

---

## Appendix C: FE File Structure Reference

```
frontend/src/
├── components/
│   ├── Layout.tsx / Layout.css      ← Navbar + Footer
│   └── HeroBanner.tsx / .css        ← Auto-play banner slider
├── pages/
│   ├── HomePage.tsx / .css         ← Landing
│   ├── CatalogPage.tsx / .css       ← Trees + Styles catalog
│   ├── EditorPage.tsx / .css        ← 4-step designer
│   ├── PresetsPage.tsx / .css       ← Gallery
│   ├── DesignSharePage.tsx / .css   ← /tree/:slug
│   ├── CartPage.tsx / .css          ← Cart
│   ├── CheckoutPage.tsx / .css      ← Checkout
│   ├── OrderSuccessPage.tsx / .css  ← Success
│   ├── OrdersPage.tsx / .css        ← Order list
│   ├── OrderDetailPage.tsx / .css   ← Order detail
│   ├── AuthPage.tsx / .css          ← Login/Register
│   ├── ProfilePage.tsx / .css       ← Profile
│   ├── AdminPage.tsx / .css         ← Admin panel
│   └── NotFoundPage.tsx             ← 404
├── lib/
│   └── api.ts                       ← Axios client + all API functions
├── store/
│   ├── AuthContext.tsx              ← JWT auth state
│   ├── CartContext.tsx              ← Cart (localStorage + BE sync)
│   └── ToastContext.tsx             ← Toast notifications
├── types/
│   └── index.ts                     ← All TypeScript interfaces
└── index.css                        ← Evergreen Design System
```
