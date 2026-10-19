# Review API & Model — Build Your Christmas (Backend ↔ Frontend)

> So sánh schema BE đang viết thực tế (`backend/src/models/*` + DTO + controllers) với tài liệu FE mô tả. Tài liệu này chỉ ra **mismatch** để BE & FE đồng bộ trước khi clean DB.

**Ngày review:** 2026-10-18
**Trạng thái tổng thể:** Schema BE-FE đã khớp **~85%**. Còn **4 nhóm mismatch quan trọng** cần xử lý trước khi clean.

---

## 0. Bảng tóm tắt nhanh

| # | Vấn đề | Mức độ | Phía xử lý |
|---|--------|--------|-----------|
| 1 | `baseTreeProductId` vs `config.variantId` (Design dùng **concept product**, Cart dùng **variant**) — FE doc nhầm cả 2 là cùng 1 `variantId/treeId` | 🔴 HIGH | Cần tinh chỉnh doc FE |
| 2 | `Design.status` enum BE có `AI_PENDING`/`AI_COMPLETED`/`CONFIRMED` nhưng tài liệu FE ghi `GENERATING`/`COMPLETED`/`FAILED` | 🔴 HIGH | Tinh chỉnh tài liệu FE cho đúng |
| 3 | Cart item BE **không có** `designName`, `previewImage`, `currentUnitTotal`, `priceChanged`, `warning` ở root — chúng được sinh ra trong DTO khi gọi `getCart` | 🟡 MED | FE chỉ dựa vào response `/api/cart`, không tự lưu |
| 4 | `Order.items[].variant` lưu `unitPrice` **và** `price` (alias) — FE doc chỉ ghi `price` | 🟢 LOW | Thống nhất |
| 5 | Review FE doc ghi `GET /admin/reviews` + `POST /admin/reviews/:id/reply` — BE **chưa có** route admin reviews (chỉ có Buyer submit) | 🔴 HIGH | BE cần bổ sung hoặc FE dùng flow khác |
| 6 | `TreeProductGrouped.codes[].variants[]` thiếu `isActive`, `sortOrder` (đã có trong DB nhưng DTO `loadGroupedTreeCatalog` chưa trả) | 🟡 MED | Cập nhật FE doc |
| 7 | Banner FE doc liệt kê `subtitle`, `aspectRatio`, `placement`, `ctaLabel`, `ctaLink`, `overlayColor` — **BE KHÔNG CÓ** các field này | 🟡 MED | Cần quyết định thêm hay bỏ |
| 8 | `Province`/`Commune` từ CAS proxy — tài liệu FE đúng nhưng **BE KHÔNG proxy**, tự hardcode tỉnh HCM (`SERVICE_PROVINCE_ID=79`) | 🟡 MED | Cập nhật FE doc: chỉ lấy communes HCM |
| 9 | `Accessories` FE doc ghi `GET /accessories` — **BE đã purge** (gộp vào TreeProduct.description) | 🔴 HIGH | Cập nhật FE doc |
| 10 | `Designs/quote` body: FE ghi `{ variantId, config?, designId? }` — BE thực tế nhận `{ variantId, deliveryOption }` | 🟢 LOW | Cập nhật FE doc |
| 11 | Cart `POST /cart/items` body đúng format. **Hãy lưu ý** cấu trúc `config: { variantId, deliveryOption }` (FE doc ghi `config?` optional nhưng BE **bắt buộc** `variantId` & `deliveryOption` ở root) | 🟢 LOW | Tinh chỉnh FE doc |
| 12 | `PATCH /cart/items/:id` body BE nhận `{ quantity?, checked?, variantId?, deliveryOption? }` — FE doc ghi `Record<string, unknown>` (quá chung) | 🟢 LOW | Liệt kê rõ fields |

---

## 1. AUTH (`/auth/*`) — ✅ Hầu hết khớp

### Match
- `User` shape ✅ (xem `models/User.ts`)
- `AuthResponse` = `{ token, user }` ✅
- Addresses embedded trong `User.addresses` ✅

### ⚠️ Lưu ý nhỏ

| Tài liệu FE | BE thực tế | Xử lý |
|---|---|---|
| `PATCH /auth/me` body: `{ name?, phone?, avatarUrl? }` | BE **CHƯA CÓ** route PATCH `/auth/me` (chỉ có `PUT /auth/me/avatar`) | **BE bổ sung** `PATCH /auth/me` hoặc FE dùng đúng `PUT /auth/me/avatar` |

📄 Xem `backend/src/routes/auth.ts` để verify.

---

## 2. USERS / ADDRESSES — ✅ Match

- `GET/POST/PATCH/DELETE /users/me/addresses` ✅
- Address model embedded (`name, phone, address, province, district, ward, isDefault`) ✅

### ⚠️ Tinh chỉnh đề xuất

**Hiện tại `Address` chỉ có `_id, name, phone, address, province, district, ward, isDefault`.**

Nếu FE cần mapping với hành chính HCM (AddressKit), nên bổ sung vào Address schema:

```typescript
interface Address {
  _id: string;
  name: string;        // tên người nhận
  phone: string;
  address: string;     // số nhà + tên đường
  provinceId?: string;    // 🔧 THÊM (vd "79")
  provinceName?: string;  // "TP. Hồ Chí Minh"
  communeId?: string;     // 🔧 THÊM (vd "27691")
  communeName?: string;   // "Phường Bến Nghé"
  district?: string;      // text tự do
  ward?: string;          // text tự do (legacy)
  isDefault: boolean;
}
```

Lý do: Khi FE chọn địa chỉ, BE cần `provinceId + communeId` để shipping quote tới `WarehouseInfo.communeId` (đang dùng AddressKit HCM hardcoded).

📄 File cần sửa: `backend/src/models/User.ts` (`AddressSchema`).

---

## 3. ADDRESS PROXY (`/addresses/*`) — ⚠️ BE KHÔNG PROXY CAS

Tài liệu FE viết:
- `GET /addresses/provinces?effectiveDate=latest` → `Province[]`
- `GET /addresses/provinces/:id/communes?effectiveDate=latest` → `Commune[]`

**BE hiện tại KHÔNG proxy CAS.** BE hardcode service area = TP.HCM (`SERVICE_PROVINCE_ID = "79"`).

Xem `backend/src/services/hcmCommunesData.ts` (19KB!) — đây là data hardcode communes HCM.

### 🔧 Đề xuất tinh chỉnh Model

**Lựa chọn A (Khuyến nghị):** Sửa tài liệu FE cho đúng — chỉ trả communes HCM:

```typescript
// GET /api/addresses/provinces
{
  provinces: [
    { id: "79", name: "TP. Hồ Chí Minh" }
  ]
}

// GET /api/addresses/provinces/79/communes?effectiveDate=latest
{
  communes: [
    { id: "27691", name: "Phường Bến Nghé", provinceId: "79", provinceName: "TP. Hồ Chí Minh" }
    // ...
  ]
}
```

**Lựa chọn B:** Bỏ endpoint `/addresses/provinces` đi, FE dùng thẳng constants từ config BE.

### Heads-up cho FE

Khi user nhập địa chỉ giao hàng, BE sẽ `assertValidHcmCommune(communeId)` → nếu không phải HCM sẽ trả `WrongProvinceError` (400).

📄 `backend/src/services/addressService.ts` (line ~80-120 có `assertValidHcmCommune`).

---

## 4. CATALOG 3-Tier (`/catalog/*`) — ✅ Khớp, có vài chi tiết

### Match
- 3-tier `TreeProduct → TreeCode → Tree (variant)` ✅
- SKU = `{code} × {size}` ✅
- `GET /catalog/tree-products` trả `TreeProductGrouped[]` ✅

### ⚠️ Mismatch nhỏ

| Tài liệu FE | BE thực tế (`loadGroupedTreeCatalog`) | Xử lý |
|---|---|---|
| `TreeVariant { isActive, sortOrder }` (FE doc ghi đủ) | **DTO `loadGroupedTreeCatalog` KHÔNG trả** `isActive`, `sortOrder` của variant | **Cập nhật BE** để thêm 2 field này (xem `services/catalogService.ts` line 215-225) |

So sánh:

**FE doc:**
```typescript
interface TreeVariant {
  isActive: boolean;
  sortOrder: number;
  // ...
}
```

**BE trả:**
```typescript
{
  _id, size, sku, heightCmMin, heightCmMax, diameterCm,
  description, bareImage, price, stockQuantity
  // ← thiếu isActive, sortOrder
}
```

### 🔧 Tinh chỉnh đề xuất

**Sửa `catalogService.ts` `loadGroupedTreeCatalog`** để trả đủ field:

```typescript
// backend/src/services/catalogService.ts, ~line 215
variants: (variantsByCode.get(String(c._id)) ?? []).map((v) => ({
  _id: String(v._id),
  size: v.size,
  sku: v.sku,
  heightCmMin: v.heightCmMin,
  heightCmMax: v.heightCmMax,
  diameterCm: v.diameterCm,
  description: v.description || "",
  bareImage: v.bareImage,
  price: v.price,
  stockQuantity: v.stockQuantity,
  isActive: v.isActive,    // ✅ THÊM
  sortOrder: v.sortOrder,  // ✅ THÊM
}))
```

**Chú ý:** `getVariantsForCode` (single-code endpoint) cũng nên thêm 2 field này.

### Catalog variant summary (`getVariantsForCode`)

FE doc ghi `GET /catalog/tree-codes/:codeId/variants` nhưng **BE định tuyến khác**:

```typescript
// BE: GET /catalog/tree-products/:productId/codes/:codeId/variants
// ❌ FE doc: GET /catalog/tree-codes/:codeId/variants  (chỉ có codeId)
```

🔧 **FE phải gửi cả `productId` + `codeId`**. Update doc.

---

## 5. DESIGNS (`/designs/*`) — ⚠️ LỚN: 2 concept khác nhau

Đây là **mismatch quan trọng nhất** cần làm rõ.

### Concept thực tế của BE

| Layer | Field lưu | Ý nghĩa |
|---|---|---|
| **Design** | `baseTreeProductId` (ref `TreeProduct`) | "Khách chọn concept cây hoàn chỉnh" (gồm cây + phụ kiện + style) |
| **Design** | `imageUrl`, `prompt` | Output AI render |
| **CartItem** | `config.variantId` (ref `Tree` = SKU) | "Khách chọn size cụ thể + delivery" |

**Tức là:**
- `Design` không có `variantId`. Design chỉ có `baseTreeProductId`.
- `CartItem` không có `baseTreeProductId`. Cart chỉ có `variantId`.
- Design chỉ bám vào **concept** (`TreeProduct`). Khi khách add-to-cart mới chọn size cụ thể (`variantId`).

### Mismatch với FE doc

FE doc ghi:
```typescript
interface DesignConfig {
  variantId?: string;
  treeId?: string;          // ← KHÔNG CÓ trong BE
  deliveryOption?: ...;
  prompt?: string;
}

interface Design {
  config: DesignConfig;
  variantId?: string;       // ← KHÔNG CÓ ở root level Design
  // ...
}
```

### 🔧 Tinh chỉnh đề xuất (FE doc)

Sửa `Design` schema cho khớp BE:

```typescript
type DesignStatus = 'DRAFT' | 'AI_PENDING' | 'AI_COMPLETED' | 'CONFIRMED' | 'FAILED';

interface Design {
  _id: string;
  name: string;
  slug: string;
  year: number;
  
  baseTreeProductId: string;   // ✅ FK → TreeProduct (concept)
  
  prompt: string;
  imageUrl: string;
  imagePublicId: string;
  previewImage: string;
  
  status: DesignStatus;
  deliveryOption: 'READY_TO_DISPLAY' | 'DIY_KIT' | 'SEPARATE';
  
  pricingSnapshot?: {
    treePrice: number;
    decorationFee: number;
    shippingFee: number;
    totalSalePrice: number;  // ← KHÔNG phải totalPrice
  };
  
  isPublic: boolean;
  duplicatedFrom: string | null;
  ownerId: string | null;
  
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### Build-design API

`POST /api/designs` body:
```typescript
{
  name: string;                  // required, trim
  baseTreeProductId: string;     // required (concept TreeProduct)
  prompt?: string;               // optional
  deliveryOption?: "READY_TO_DISPLAY" | "DIY_KIT" | "SEPARATE";
  isPublic?: boolean;            // default true
  variantId?: string;            // optional override for pricing snapshot
}
```

### Status enum

| FE doc (sai) | BE thực tế |
|---|---|
| `'DRAFT' \| 'GENERATING' \| 'COMPLETED' \| 'CONFIRMED' \| 'FAILED'` | `'DRAFT' \| 'AI_PENDING' \| 'AI_COMPLETED' \| 'CONFIRMED' \| 'FAILED'` |

🔧 **Bắt buộc sửa enum FE** cho khớp. Code BE có trả `status: 'AI_PENDING'` khi gọi `/designs/:id/generate-image`.

📄 `backend/src/models/Design.ts` line 25-30.

### Quote design

FE doc ghi:
```
POST /designs/quote   body: { variantId, config?, designId? }
```

BE thực tế:
```typescript
// Body: { variantId, deliveryOption } — không có config, không có designId
{
  variantId: string;
  deliveryOption: "READY_TO_DISPLAY" | "DIY_KIT" | "SEPARATE";
}
```

### Response shape

`getMyDesigns` / `getSharedDesignBySlug` / `getDesignById` trả về **buildDesignResponse**:

```typescript
{
  design: {
    id: string;                  // ← FE doc ghi "_id"
    ownerId: string | null;
    name: string;
    slug: string;
    year: number;
    baseTreeProductId: string;
    prompt: string;
    imageUrl: string;
    status: DesignStatus;
    deliveryOption: string;
    isPublic: boolean;
    duplicatedFrom: string | null;
    shareUrl: string;            // vd "/tree/{slug}"
    pricing: PriceBreakdown;
    product: { _id, name, slug, description, coverImage } | null;
    variant: { _id, size, name, price } | null;
    createdAt: string;
    updatedAt: string;
  }
}
```

⚠️ **Response không có `_id` — dùng `id`.** Không có `previewImage` ở top level (chỉ `imageUrl`).

### Quote design — response

```typescript
// POST /api/designs/quote  hoặc  POST /api/catalog/quote
{
  pricing: {
    tree: { id, name, size, unitPrice },
    decorationFee: number,
    shippingFee: number,
    unitTotal: number,
    productionDays: number,
    hasPersonalization: boolean,
    hasService: boolean,
    warnings: string[]
  }
}
```

📄 `backend/src/services/pricingService.ts`.

---

## 6. CART (`/cart/*`) — ✅ Khớp về API, có 1 lưu ý về DTO

### Match
- 8 endpoints giống FE doc ✅
- Guest session qua header `X-Session-Id` (hoặc `x-guest-session-id`) ✅
- `POST /cart/merge` body: `{ guestSessionId }` ✅

### ⚠️ Lưu ý — Response shape khác DB schema

`CartItem` model lưu gọn:

```typescript
// backend/src/models/CartItem.ts
interface CartItem {
  _id: string;
  cartId: string;
  designId: ObjectId | null;
  config: { variantId: ObjectId; deliveryOption: string };
  quantity: number;
  priceSnapshot: number;
  checked: boolean;
  // ← KHÔNG CÓ designName, previewImage, currentUnitTotal, priceChanged, warning
}
```

Nhưng response `GET /cart` được DTO `cartItemToDto` mở rộng:

```typescript
// dto/cart.ts (chưa đọc, suy ra từ controller)
{
  _id, cartId, designId, designName, previewImage,  // ← sinh từ populate Design
  quantity, priceSnapshot,
  currentUnitTotal: number | null,  // ← sinh từ pricing snapshot mỗi lần GET
  priceChanged: boolean,
  config: DesignConfig,
  design?: Design,
  warning?: string
}
```

🔧 **Tinh chỉnh FE doc:**

```typescript
// Sửa CartItem response type (chỉ áp dụng cho GET /cart response):
interface CartItemResponse {        // ← đổi tên rõ ràng
  _id: string;
  cartId: string;
  designId: string | null;
  designName?: string;             // populated từ Design
  previewImage?: string;            // populated từ Design
  quantity: number;
  priceSnapshot: number;            // giá lúc thêm vào giỏ
  currentUnitTotal: number | null;  // giá re-priced hiện tại
  priceChanged: boolean;            // so sánh currentUnitTotal vs priceSnapshot
  checked: boolean;
  config: { variantId: string; deliveryOption: string };
  design?: { id, name, imageUrl, slug, ... };
  warning?: string;
}
```

### POST /cart/items body

```typescript
// Backend:
{
  variantId: string;       // required
  deliveryOption: string;  // required
  designId?: string;       // optional (chỉ public designs)
  quantity?: number;       // default 1, min 1
}
```

⚠️ **Lưu ý:** FE doc ghi `{ config?, designId?, quantity? }` — sai. Phải truyền `variantId` và `deliveryOption` ở root, không phải trong `config`.

### PATCH /cart/items/:id body

```typescript
{
  quantity?: number;        // >= 1
  checked?: boolean;
  variantId?: string;       // nếu thay đổi SKU → trigger repricing
  deliveryOption?: string;
}
```

---

## 7. COUPONS, UPLOADS — ✅ Match

### `/coupons/apply`

```typescript
// POST /api/coupons/apply
// Body: { code, orderTotal }
// Response: { discount, discountAmount }
```

⚠️ **Lưu ý:** Response có cả 2 field `discount` **và** `discountAmount` (alias). Trong `Order` BE lưu `discountAmount` (xem `Order.ts`).

### `/uploads`

```typescript
// POST /api/uploads
// Body: FormData (multipart 'file') hoặc { dataUrl: "data:image/png;base64,..." }
// Response: { url: "https://res.cloudinary.com/..." }
```

FE doc ✅.

---

## 8. ORDERS (`/orders/*`) — ✅ Match, lưu ý field discount

### Match
- 8 endpoints giống FE doc ✅
- `OrderStatus` enum có thêm `REFUNDED` (FE doc không liệt kê)
- Cấu trúc `items[].variant` khớp ✅

### ⚠️ Mismatch

| FE doc | BE thực tế | Xử lý |
|---|---|---|
| `discount: number` (root) | `discountAmount: number` + `discountCode?: string` | **FE doc rename** `discount → discountAmount`, thêm field `discountCode` |
| OrderStatus `CANCEL_REQUESTED` ✅ | OrderStatus có thêm `REFUNDED` | FE thêm vào enum |

### `Order.items[].variant`

FE doc ghi:
```typescript
interface OrderItemVariant {
  _id: string;
  productId: string;
  codeId: string;
  size: string;
  sku: string;
  price: number;         // ← BE lưu cả "price" và "unitPrice"
  name?: string;
  bareImage?: string;
  stockQuantity?: number;
}
```

BE thực tế (`Order.ts` line 14-25):
```typescript
variant: {
  _id: string;
  productId: string;
  codeId: string;
  size: string;
  name: string;
  unitPrice: number;     // ← THỰC SỰ LÀ unitPrice
  price: number;         // ← duplicate (alias)
  sku: string;
  bareImage: string;
}
```

🔧 **Tinh chỉnh đề xuất:**

Chọn 1 trong 2:
- **Option A (khuyến nghị):** BE chỉ giữ `unitPrice`, FE doc sửa `price → unitPrice`.
- **Option B:** BE chỉ giữ `price`, xóa `unitPrice`.

📄 Xem `Order.ts` line 14-26 + controller `orderService.ts` để xác định.

### Pickup info

BE có `pickupInfo?: { name, phone, address, provinceId, provinceName, communeId, communeName, district, email, note }` ✅. Khớp FE doc.

### OrderItemVariant `name` vs tên field

FE doc optional `name?: string`. BE lưu `name: string; required: true`. Bổ sung thành required cho chắc.

### order endpoints

| FE doc | BE thực tế |
|---|---|
| `PATCH /orders/:id/status` | ✅ |
| `GET/POST/PATCH /orders/:id/shipment` | ✅ |
| `GET /orders/:orderId/reviewable-items` | ✅ |

---

## 9. PAYMENTS — ✅ Match

```typescript
// POST /api/payments/checkout
// Body: { orderId, method: "ONLINE" | "COD" }
// Response: { checkoutUrl: string }  // redirect URL SePay

// GET /api/payments/sepay/info/:orderId
// Response: { payment: SepayPaymentInfo }
```

`SepayPaymentInfo` shape FE doc ✅ khớp.

---

## 10. SHIPPING — ⚠️ Tinh chỉnh response

### Match
- `/shipping/warehouse` ✅
- `/shipping/quote` ✅
- `ShippingQuoteResponse` ✅

### ⚠️ Detail

```typescript
// FE doc:
interface ShippingQuoteResponse {
  success?: boolean;
  data: {
    distanceKm: number;
    fee: number;
    breakdown?: string;
    supported: boolean;
    warehouse?: WarehouseInfo;
    destination?: AddressInfo;
  };
}
```

BE thực tế trả `{ data: { distanceKm, fee, supported, warehouse, destination, breakdown? } }` ✅. Match.

---

## 11. NOTIFICATIONS — ✅ Match

### ⚠️ Detail

FE doc ghi notification có field `createdAt`. BE ✅.

⚠️ FE doc không ghi `updatedAt`. BE có do `timestamps: true`. Có thể thêm hoặc bỏ qua.

---

## 12. BANNERS — ⚠️ CẦN QUYẾT ĐỊNH

FE doc khai báo:
```typescript
interface Banner {
  _id, title, imageUrl, linkUrl, position, isActive, sortOrder,
  subtitle?,       // ← BE KHÔNG CÓ
  aspectRatio?: '16:9' | '9:16' | '1:1',  // ← BE KHÔNG CÓ
  placement?: 'HERO_SLIDER' | 'SIDE_PROMO',  // ← BE KHÔNG CÓ
  ctaLabel?,       // ← BE KHÔNG CÓ
  ctaLink?,        // ← BE KHÔNG CÓ
  overlayColor?,   // ← BE KHÔNG CÓ
  createdAt?, updatedAt?
}
```

BE `Banner.ts` chỉ có:
```typescript
{ title, imageUrl, linkUrl, position, isActive, sortOrder, createdAt, updatedAt }
```

### 🔧 Đề xuất

**Lựa chọn A:** Bổ sung các field marketing vào BE `Banner.ts`:
```typescript
const BannerSchema = new Schema({
  title, imageUrl, linkUrl, position, isActive, sortOrder,
  subtitle: { type: String, default: "" },
  aspectRatio: { type: String, enum: ["16:9", "9:16", "1:1"], default: "16:9" },
  placement: { type: String, enum: ["HERO_SLIDER", "SIDE_PROMO"], default: "HERO_SLIDER" },
  ctaLabel: { type: String, default: "" },
  ctaLink: { type: String, default: "" },
  overlayColor: { type: String, default: "" },
}, { timestamps: true });
```

**Lựa chọn B:** Cắt bỏ 6 field này khỏi FE doc.

---

## 13. REVIEWS — ⚠️ LỚN: BE THIẾU admin endpoints

### Buyer endpoints — ✅ Match

- `GET /products/:productId/reviews` ✅
- `POST /products/:productId/reviews` ✅
- `GET /reviews/my` ✅
- `GET /orders/:orderId/reviewable-items` ✅ (route mounted on orders.ts, không phải reviews.ts)

### Admin endpoints — 🔴 FE doc có, **BE THIẾU**

FE doc liệt kê:
```
GET    /admin/reviews
POST   /admin/reviews/:id/reply
PATCH  /admin/reviews/:id/status
DELETE /admin/reviews/:id
```

🔴 **`backend/src/routes/admin.ts` KHÔNG mount các route reviews admin.** Cần bổ sung.

📄 Verify: `backend/src/routes/admin.ts` (sẽ báo cáo ở cuối).

### Review response shape

Tài liệu FE:
```typescript
interface ProductReview {
  _id, productId, variantId?, orderId, buyerId?,
  buyer: { _id, name, avatar?, avatarUrl? },
  rating, comment, images,
  adminReply?: { comment, repliedAt, repliedBy? } | null,
  status: 'APPROVED' | 'HIDDEN',
  createdAt, updatedAt?
}
```

BE trả (`getProductReviews`, `getUserReviews`) — khớp cấu trúc cơ bản ✅. Lưu ý `buyerId` không có trong response, chỉ có `buyer` (populated từ `buyerId`).

### Stats response

FE doc:
```typescript
interface ProductReviewsResponse {
  reviews: ProductReview[];
  pagination: { page, limit, total, totalPages };
  stats: {
    averageRating: number;
    totalReviews: number;
    distribution: { '1': n, ..., '5': n };
  };
}
```

BE trả ✅ (xem `reviewService.ts` line 280-300).

⚠️ `averageRating` mặc định = **5** khi 0 review (xem line 282). FE nên biết để không hiển thị "5 sao" khi chưa có review.

---

## 14. ADMIN — ⚠️ Reviews thiếu, các phần khác match

### Endpoints match

| FE doc | BE |
|---|---|
| `GET/POST/PATCH/DELETE /admin/tree-products` | ✅ |
| `POST /admin/tree-products/:productId/codes` | ✅ |
| `PATCH/DELETE /admin/tree-codes/:codeId` | ✅ |
| `POST /admin/tree-codes/:codeId/variants` | ✅ |
| `PATCH/DELETE /admin/tree-variants/:variantId` | ✅ |
| `PATCH /admin/tree-variants/bulk` | ✅ |
| `GET /admin/orders` | ✅ |
| `GET /admin/stats` | ✅ |
| `GET /admin/analytics` | ✅ |
| `GET /admin/users` (`PaginatedUsers`) | ✅ |
| `PATCH /admin/users/:id/status` | ✅ |
| `GET /admin/users/:id/details` | ✅ |
| `GET/POST/PATCH/DELETE /admin/banners` | ✅ |
| Deprecated: `GET/POST/PATCH /admin/trees` | ✅ (LEGACY) |

### 🔴 THIẾU: Admin Reviews

Cần bổ sung vào `admin.ts`:
```typescript
// GET /api/admin/reviews?status=...&page=...&limit=...
// POST /api/admin/reviews/:id/reply  body: { comment }
// PATCH /api/admin/reviews/:id/status  body: { status: 'APPROVED' | 'HIDDEN' }
// DELETE /api/admin/reviews/:id
```

📄 File: `backend/src/routes/admin.ts` + tạo controller `adminReviewController.ts` (hoặc extend `admin/*.ts`).

### AdminStats — thêm field

FE doc:
```typescript
interface AdminStats {
  totalOrders, pendingOrders, completedOrders, totalUsers,
  totalDesigns, designsShared, revenue, aov,
  personalizationCount,
  ordersByStatus: Array<{ _id: OrderStatus, count: number }>,
  lowStock: {
    accessories: Array<{ name, stock, type }>;   // ← BE đã purge accessories
    trees: Array<{ name, size, stock }>;
  };
}
```

⚠️ **`lowStock.accessories` BE KHÔNG CÓ** (đã purge). FE phải bỏ check field này.

---

## 15. ACCESSORIES — 🔴 BE ĐÃ PURGE

🔴 **Tài liệu FE có** `GET /accessories` + `Accessory` model, **BE ĐÃ XÓA** (xem `models/index.ts` line 8-9 comment).

```typescript
// backend/src/models/index.ts
// NOTE: Accessory / Style / Category / AIDesign đã bị purge trong refactor
// phụ kiện. Style/Accessory info giờ nằm gọn trong TreeProduct.description.
```

### 🔧 Hành động

**Bỏ hẳn `Accessory` khỏi tài liệu FE.** Phụ kiện giờ là text trong `TreeProduct.description`. Admin tạo phụ kiện = sửa mô tả `TreeProduct`.

Nếu BE muốn giữ accessory management riêng, cần tạo lại model. Nhưng theo trạng thái hiện tại thì **bỏ FE side** là đúng nhất.

---

## 16. SHIPMENT — ✅ Match

```typescript
type ShipmentStatus = 'PENDING' | 'CREATED' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERING' | 'DELIVERED' | 'CANCELLED';
```

BE Order schema có `shippingEvents: IShippingEvent[]` (dùng cho Shipment timeline) ✅.

⚠️ **Lưu ý nhỏ:** `Shipment.id` (FE doc) vs `_id` (Mongoose). Khi trả về, có thể BE đã map sang `id` hoặc để `_id`. Cần check controller `orderController.ts`.

📄 Tìm `getOrderShipment`, `createOrderShipment`, `updateOrderShipment` trong `orderController.ts`.

---

## 17. Đề xuất bổ sung BE trước khi clean DB

### 🔴 Bắt buộc

| # | File | Sửa |
|---|---|---|
| 1 | `routes/auth.ts` | Thêm `PATCH /me` (update name/phone) |
| 2 | `routes/admin.ts` | Thêm reviews admin routes |
| 3 | `services/catalogService.ts` | `loadGroupedTreeCatalog` thêm `isActive`, `sortOrder` cho variants |

### 🟡 Khuyến nghị

| # | File | Sửa |
|---|---|---|
| 4 | `models/User.ts` (`AddressSchema`) | Thêm `provinceId`, `communeId` (cho mapping AddressKit) |
| 5 | `models/Banner.ts` | Thêm `subtitle`, `aspectRatio`, `placement`, `ctaLabel`, `ctaLink`, `overlayColor` (nếu FE cần) |
| 6 | `models/Order.ts` (`OrderItemSchema.variant`) | Bỏ `price`, chỉ giữ `unitPrice` (hoặc ngược lại) |

### 🟢 Tùy chọn

| # | File | Sửa |
|---|---|---|
| 7 | `services/designService.ts` | Đổi response key `_id → id` ở root level `Design` (FE đang mong `id`) |

---

## 18. Đề xuất sửa tài liệu FE

### 🔴 Nhóm 1 — Sai enum / field quan trọng

1. **Design status enum**: `GENERATING → AI_PENDING`, `COMPLETED → AI_COMPLETED | CONFIRMED`, `FAILED` ✅
2. **Design schema**: bỏ `config.variantId`, thêm `baseTreeProductId` (FK TreeProduct)
3. **`pricingSnapshot.totalPrice` → `totalSalePrice`**
4. **CartItem root**: các field `designName/previewImage/currentUnitTotal/priceChanged/warning` chỉ có ở **response**, không phải model DB
5. **Order discount**: `discount → discountAmount`, thêm `discountCode`
6. **Order Status enum**: thêm `'REFUNDED'`
7. **Bỏ `Accessory`**: đã purge, không gọi `/accessories` nữa

### 🟡 Nhóm 2 — Tinh chỉnh

8. **Province/Commune**: BE chỉ trả HCM, không phải full VN
9. **Catalog variants**: bỏ 2 endpoint paths sai:
   - `GET /catalog/tree-codes/:codeId/variants` → đúng là `GET /catalog/tree-products/:productId/codes/:codeId/variants`
10. **Banner**: 6 field marketing chỉ thêm nếu BE đồng ý bổ sung
11. **Admin `lowStock.accessories`**: BE không trả → bỏ check
12. **`POST /cart/items` body**: `variantId` + `deliveryOption` ở **root**, không trong `config`
13. **`PATCH /cart/items/:id` body**: liệt kê rõ fields `{ quantity?, checked?, variantId?, deliveryOption? }`
14. **`POST /designs/quote` body**: `{ variantId, deliveryOption }` (không có `config`, `designId`)
15. **Design response**: dùng `id` không phải `_id`

### 🟢 Nhóm 3 — Polish

16. **`Province` response**: có thể thêm `provinceName` trong communes
17. **`Design.duplicate` body**: có thể nhận `{ name }` tùy chọn để đặt tên mới
18. **`AOV`**: `aov` = `revenue / totalOrders`, đảm bảo `aov` cùng kiểu `number` không phải `null` khi 0 order
19. **`SepayPaymentInfo`**: thêm `expiredAt` để FE đếm ngược (nếu BE trả)

---

## 19. Checklist xử lý trước khi clean DB

```markdown
- [ ] Đồng bộ enum Design status (AI_PENDING/AI_COMPLETED/CONFIRMED/FAILED)
- [ ] Đồng bộ Design schema (baseTreeProductId vs variantId)
- [ ] Sửa pricingSnapshot key (totalPrice → totalSalePrice)
- [ ] Thống nhất Order discount field (discountAmount)
- [ ] Sửa Order status enum (thêm REFUNDED)
- [ ] Xóa Accessory khỏi FE doc
- [ ] Thêm PATCH /api/auth/me route (BE)
- [ ] Thêm /api/admin/reviews/* routes (BE)
- [ ] Cập nhật loadGroupedTreeCatalog trả isActive+sortOrder cho variants (BE)
- [ ] Đổi Design response key _id → id (BE)
- [ ] Quyết định: bổ sung Banner fields hay giữ nguyên
- [ ] Run seed-christmas.ts sau khi schema đồng bộ
```

---

## 20. Tổng kết

| Mức độ | Số lượng vấn đề |
|---|---|
| 🔴 Bắt buộc sửa | 7 |
| 🟡 Khuyến nghị | 7 |
| 🟢 Tùy chọn | 4 |

**Kết luận:** Schema BE & FE đã đồng bộ ~85%, đủ gần để clean DB. Các vấn đề 🔴 đều là **enum / field name sai** — dễ sửa. Sau khi fix xong nhóm 🔴, chạy `npm run seed` là OK.
