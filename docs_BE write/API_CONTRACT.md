# API Contract — Build Your Christmas

> **Source of Truth:** File này mô tả 7 contract fields/endpoint (Method, Auth, Request, Path/Query, Success response, Errors, Side effects) cho mọi endpoint BE đang chạy. Đồng bộ với code (`backend/src/`) và `docs/openapi.yaml`. Nếu có xung đột, **tin code thực tế**.

## Mục lục

1. [Quy ước chung](#quy-ước-chung)
2. [Auth](#auth)
3. [Users (Saved addresses)](#users-saved-addresses)
4. [Addresses (CAS proxy)](#addresses-cas-proxy)
5. [Catalog (public)](#catalog-public)
6. [Designs](#designs)
7. [Cart](#cart)
8. [Orders](#orders)
9. [Shipments](#shipments)
10. [Payments](#payments)
11. [Notifications](#notifications)
12. [Admin](#admin)
13. [Health](#health)

### Tài liệu liên quan — Context-aware Compositing (4 lớp, 2026-11-13)

| Tài liệu | Nội dung |
|---|---|
| [`BE_HANDOFF_COMPOSITING.md`](BE_HANDOFF_COMPOSITING.md) | Hợp đồng handoff BE cho hệ thống ghép 4 lớp: schema Mongoose đề xuất, payload mẫu, bảng fallback, checklist triển khai |
| [`ASSET_PREPARATION_GUIDE.md`](ASSET_PREPARATION_GUIDE.md) | Hướng dẫn chuẩn bị ảnh cho đội designer/ops: cây trơn, mask cành trước, PNG phụ kiện, checklist theo nhóm phụ kiện |

**Tóm tắt các field MỚI (đều `optional`, BE chưa triển khai ⇒ FE tự fallback):**

| Nơi | Field | Mục đích |
|---|---|---|
| `TreeVariant` | `foregroundMask` | Ảnh cành trước cảnh (PNG alpha) — lớp 4 che phụ kiện `behind` |
| `Accessory` / `DesignAccessory` | `anchor`, `shadow`, `defaultScale` | Điểm neo, kiểu bóng, kích thước authored |
| `SlotMap.slots[]` | `depth`, `scaleHint` | Lớp chiều sâu & kích thước gợi ý của slot |
| `Design.configuration.placements[]` | `depth` | Snapshot lớp chiều sâu tại lúc khách gắn |

---

## Quy ước chung

| Mục | Giá trị |
| :--- | :--- |
| Base URL (local) | `http://localhost:4000` |
| Base URL (production) | `https://api.buildyourchristmas.vn` (TBD khi deploy) |
| API prefix | `/api` (không versioning ở MVP) |
| Content-Type | `application/json` |
| Auth header | `Authorization: Bearer <JWT>` |
| Date format | ISO 8601 (`createdAt`, `shippedAt`, …) |
| ID format | MongoDB ObjectId (24 hex) hoặc business code (`BYC-########` cho order, slug cho design) |
| User identification | JWT chứa `{ id, email, roles[] }` |

### Quy ước Response

**Success** — đa số endpoint trả object bao bọc theo resource:
```json
{ "trees": [...] }
{ "styles": [...] }
{ "accessories": [...] }
{ "presets": [...] }
{ "design": {...} }
{ "designs": [...] }
{ "shareUrl": "/tree/slug-here" }
{ "cart": {...}, "items": [...] }
{ "item": {...} }
{ "order": {...} }
{ "orders": [...] }
{ "shipment": {...} }
{ "notifications": [...] }
{ "stats": {...} }
{ "users": [...] }
{ "options": [...] }
{ "pricing": {...} }
{ "data": [...], "effectiveDate": "latest" }
{ "success": true }
```

**Error** — chuẩn format:
```json
{
  "error": {
    "code": "TREE_NOT_FOUND",
    "message": "Không tìm thấy cây thông"
  }
}
```

> **Quan trọng**: FE branch logic dựa trên `error.code` (string enum), KHÔNG dựa trên `message`. Danh sách 47 codes Christmas xem `docs/ERROR_CODES.md`.

### Quy ước phân quyền

- `Public` — không cần JWT.
- `Buyer` — yêu cầu JWT có role `buyer` (default khi đăng ký).
- `Admin` — yêu cầu JWT có role `admin` (set thủ công trong DB).
- `Owner` — yêu cầu JWT và resource thuộc user đó (vd: design của mình, order của mình).
- `Optional auth` — middleware `optionalAuth` chỉ gắn `req.user` nếu token hợp lệ, không reject (vd: share design public).

---

## Auth

### POST `/api/auth/register`

**Mục đích**: Tạo tài khoản mới (mặc định role `buyer`).

**Auth**: Public.

**Request**:
```json
{
  "name": "string (required, trim)",
  "email": "string (required, unique, lowercase)",
  "password": "string (required, plaintext — BE hash với bcrypt)"
}
```

**Success (201)**:
```json
{
  "token": "JWT (7d)",
  "user": {
    "_id": "string (ObjectId)",
    "name": "string",
    "email": "string",
    "avatarUrl": "string",
    "roles": ["buyer"],
    "accountStatus": "active",
    "addresses": []
  }
}
```

**Errors**:
- `400 MISSING_FIELD`
- `409 EMAIL_ALREADY_USED`
- `500 INTERNAL_ERROR`

---

### POST `/api/auth/login`

**Auth**: Public.

**Request**:
```json
{ "email": "string", "password": "string" }
```

**Success (200)**: Same shape as register response.

**Errors**:
- `400 MISSING_FIELD`
- `401 INVALID_CREDENTIALS`
- `403 FORBIDDEN` — Tài khoản bị suspended
- `500 INTERNAL_ERROR`

---

### GET `/api/auth/me`

**Mục đích**: Lấy thông tin tài khoản người dùng hiện tại (profile, địa chỉ, quyền hạn).

**Auth**: Buyer / Admin.

**Success (200)**:
```json
{
  "user": {
    "_id": "6704f123456789abcdef0123",
    "name": "Nguyễn Văn A",
    "email": "nguyenvana@example.com",
    "phone": "0901234567",
    "avatarUrl": "https://cdn.example.com/avatars/user.jpg",
    "roles": ["buyer"],
    "accountStatus": "active",
    "accountStatusReason": "",
    "addresses": [...],
    "createdAt": "2026-10-01T10:00:00.000Z"
  }
}
```

**Errors**:
- `401 UNAUTHORIZED`
- `404 USER_NOT_FOUND`

---

### PATCH `/api/auth/me`

**Mục đích**: Cập nhật thông tin cá nhân.

**Auth**: Buyer / Admin.

**Request**:
```json
{
  "name": "string (optional)",
  "phone": "string (optional)",
  "avatarUrl": "string (optional)"
}
```

**Success (200)**: `{ "user": { ... } }`

**Errors**:
- `400 INVALID_INPUT`
- `401 UNAUTHORIZED`
- `404 USER_NOT_FOUND`

---

### PUT `/api/auth/me/avatar`

**Auth**: Required.

**Request**:
```json
{ "avatarUrl": "https://..." }
```

**Success (200)**: `{ "user": { /* updated */ } }`

**Errors**:
- `400 INVALID_INPUT`
- `401 UNAUTHORIZED`
- `404 ACCOUNT_NOT_FOUND`

---

## Users (Saved addresses)

> Embedded trong `User.addresses[]`. Không tách collection riêng.

### GET `/api/users/me/addresses`

**Auth**: Required.

**Success (200)**:
```json
{
  "addresses": [
    {
      "_id": "string",
      "name": "string",
      "phone": "string",
      "address": "string",
      "province": "string",
      "district": "string",
      "ward": "string",
      "isDefault": "boolean"
    }
  ]
}
```

**Errors**: `401 UNAUTHORIZED`, `500 INTERNAL_ERROR`

---

### POST `/api/users/me/addresses`

**Auth**: Required.

**Request**:
```json
{
  "name": "string",
  "phone": "string",
  "address": "string",
  "province": "string",
  "district": "string",
  "ward": "string",
  "isDefault": "boolean (optional)"
}
```

**Success (201)**:
```json
{ "address": { /* IAddress mới, _id được assign */ } }
```

**Errors**: `400 MISSING_FIELD`, `401 UNAUTHORIZED`

---

### PATCH `/api/users/me/addresses/:id`

**Auth**: Required (owner).

**Request**: tất cả fields optional.

**Success (200)**:
```json
{ "address": { /* updated */ } }
```

**Errors**: `401 UNAUTHORIZED`, `404 NOT_FOUND`

---

### DELETE `/api/users/me/addresses/:id`

**Auth**: Required (owner).

**Success (200)**: `{ "success": true }`

**Errors**: `401 UNAUTHORIZED`, `404 NOT_FOUND`

---

## Addresses (CAS proxy)

> Proxy tới `https://production.cas.so/address-kit` với 24h in-memory cache + 5s timeout.

### GET `/api/addresses/provinces`

**Auth**: Public.

**Query params**: `effectiveDate` (default `"latest"`, format `YYYY-MM-DD` hoặc `"latest"`)

**Success (200)**:
```json
{
  "data": [
    { "id": "01", "name": "Thành phố Hà Nội" },
    { "id": "79", "name": "Thành phố Hồ Chí Minh" }
  ],
  "effectiveDate": "latest"
}
```

**Errors**:
- `400 INVALID_EFFECTIVE_DATE`
- `502 ADDRESS_UPSTREAM_ERROR`
- `504 ADDRESS_UPSTREAM_TIMEOUT`

---

### GET `/api/addresses/provinces/:provinceId/communes`

**Auth**: Public.

**Path**: `provinceId` (vd `"79"`)
**Query**: `effectiveDate`

**Success (200)**:
```json
{
  "data": [{ "id": "25747", "name": "Phường Thủ Dầu Một" }],
  "effectiveDate": "latest"
}
```

**Errors**:
- `400 INVALID_INPUT` / `INVALID_EFFECTIVE_DATE`
- `404 PROVINCE_NOT_FOUND`
- `502 ADDRESS_UPSTREAM_ERROR`
- `504 ADDRESS_UPSTREAM_TIMEOUT`

---

### GET `/api/addresses/communes`

**Auth**: Public.

**Query**: `effectiveDate`

**Success (200)**:
```json
{
  "data": [{ "id": "00004", "name": "Phường Ba Đình", "provinceId": "01" }],
  "effectiveDate": "latest"
}
```

---

## Catalog (public)

> **Refactor 2026-10-09**: Tree catalog chuyển sang cấu trúc **3-tier chuẩn Shopee** (Product → Code → Variant). Endpoint cũ `/api/catalog/trees` (flat list) vẫn hoạt động cho backward-compat nhưng KHÔNG khuyến nghị cho FE mới. Customer flow chuẩn: xem danh sách Product → click → xem codes → chọn size → add cart (với `variantId`).

### GET /api/catalog/tree-products

Trả về danh sách active tree products, mỗi product kèm codes (Phân loại 1) và variants (Phân loại 2 — size × code).

- **Auth**: không yêu cầu
- **Response 200**:
```json
{
  "treeProducts": [
    {
      "product": {
        "_id": "P1",
        "name": "Cây thông Noel trang trí",
        "slug": "cay-thong-noel-trang-tri",
        "category": "Cây thông Noel",
        "description": "...",
        "coverImage": "/images/trees/cover.jpg",
        "images": ["/images/trees/img1.jpg", "/images/trees/img2.jpg"],
        "aspectRatio": "1:1",
        "videoUrl": "/uploads/vid_1728500000_tree_intro.mp4",
        "density": "Dày (380-820 cành)",
        "isActive": true,
        "sortOrder": 1
      },
      "codes": [
        {
          "_id": "C1",
          "productId": "P1",
          "code": "TREE-GREEN",
          "name": "Xanh truyền thống",
          "image": "/images/trees/code-green.jpg",
          "material": "PVC cao cấp",
          "isActive": true,
          "sortOrder": 1,
          "variants": [
            {
              "_id": "V1",
              "size": "S",
              "sku": "TREE-GREEN-S",
              "price": 169000,
              "stockQuantity": 100,
              "bareImage": "..."
            }
          ]
        }
      ]
    }
  ]
}
```

### GET /api/catalog/tree-products/:productId/codes/:codeId/variants

Trả về active variants (sizes) cho 1 code cụ thể. Dùng khi customer chọn xong code và FE cần render size grid.

- **Auth**: không yêu cầu
- **Response 200**:
```json
{
  "code": {
    "_id": "C1",
    "code": "TREE-GREEN",
    "name": "Xanh truyền thống",
    "image": "...",
    "material": "PVC cao cấp"
  },
  "variants": [
    {
      "_id": "V1",
      "size": "M",
      "sku": "TREE-GREEN-M",
      "price": 249000,
      "stockQuantity": 80,
      "heightCmMin": 140,
      "heightCmMax": 160,
      "diameterCm": 100,
      "bareImage": "..."
    }
  ]
}
```
- **Lỗi**: 404 `TREE_NOT_FOUND` nếu code không tồn tại / không active.

### GET /api/catalog/trees (LEGACY — flat list)

Trả về danh sách variants phẳng (flat). Giữ lại cho back-compat, KHÔNG khuyến nghị dùng cho FE mới.

### GET `/api/catalog/trees`

**Auth**: Public.

**Success (200)**:
```json
{
  "trees": [
    {
      "_id": "string",
      "size": "S | M | L",
      "name": "string",
      "heightCmMin": "number",
      "heightCmMax": "number",
      "diameterCm": "number",
      "material": "string",
      "density": "string",
      "description": "string",
      "images": ["string"],
      "bareImage": "string",
      "price": "number (VND)",
      "stock": "number"
    }
  ]
}
```

**Errors**: `500 INTERNAL_ERROR`

---

### GET `/api/catalog/styles`

**Auth**: Public.

**Success (200)**:
```json
{
  "styles": [
    {
      "_id": "string",
      "code": "CLASSIC | MINIMAL | GINGERBREAD | WINTER | CUTE | LUXURY",
      "name": "string",
      "description": "string",
      "palette": ["hex colors"],
      "coverImage": "string"
    }
  ]
}
```

---

### GET `/api/catalog/accessories`

**Auth**: Public.

**Query params** (tất cả optional):
- `type` — `LIGHT_STRING` | `CANDLE` | `BAUBLE` | `BELL` | `CANDY` | `FIGURINE` | `BOW` | `STAR` | `STOCKING` | `NAME_TAG` | `NAME_ORNAMENT`
- `group` — `LIGHTS` | `ORNAMENT` | `DECOR` | `PERSONAL`
- `style` — filter theo `styleCodes` (nếu `styleCodes` rỗng → tương thích mọi style)
- `size` — `S` | `M` | `L`. Nếu có → `maxQty` trả về là `maxQtyBySize[size]`

**Success (200)**:
```json
{
  "accessories": [
    {
      "_id": "string",
      "group": "LIGHTS | ORNAMENT | DECOR | PERSONAL",
      "type": "string",
      "name": "string",
      "description": "string",
      "image": "string",
      "price": "number (VND)",
      "stock": "number",
      "styleCodes": ["string"],
      "maxQty": "number | { S, M, L }",
      "isPersonalizable": "boolean",
      "personalizationMaxLength": "number",
      "productionDays": "number"
    }
  ]
}
```

> **Note cho FE**: Khi `size` query param có giá trị → `maxQty` là number (cho size đó). Khi không có `size` → `maxQty` là object `{S, M, L}`. Dùng để bound input ngay khi user chọn size cây.

---

### ★ GET `/api/design-accessories` (Tree Customizer — Design Catalog)

**Auth**: Public.

> **Bổ sung 2026-11-13** — endpoint này đã có trong FE (`frontend/src/lib/api.ts` → `getDesignAccessories()`) nhưng **thiếu mô tả trong contract**. Đây là collection phụ kiện riêng cho Customizer: phụ kiện **thiết kế** (không phải hàng hóa thương mại) ⇒ **KHÔNG có tồn kho**, giá tính **theo từng slot** (mỗi placement = 1 slot = 1 lần phí).
>
> ✅ **BE đã triển khai** (2026-11-13) — `backend/src/routes/designAccessories.ts`.

**Query params** (optional):
- `slotType` — lọc theo loại slot, ví dụ `ball`, `bow`, `star`, `garland`.

**Success (200)**:
```json
{
  "accessories": [
    {
      "_id": "string",
      "code": "BAUBLE-RED-01",
      "name": "Quả châu đỏ",
      "description": "string",
      "image": "https://res.cloudinary.com/.../bauble-red.png",
      "previewImage": "https://res.cloudinary.com/.../bauble-red-hi.png",
      "decorationPrice": 25000,
      "slotTypes": ["ball"],
      "isActive": true,
      "sortOrder": 10,

      "anchor": { "x": 0.5, "y": 0.06 },
      "shadow": "contact",
      "defaultScale": 1.2
    }
  ]
}
```

**Field mapping** (collection mới ↔ collection cũ) — FE tự chuẩn hoá qua `normalizeDesignAccessory()`:

| Collection mới (`/design-accessories`) | Collection cũ (`/catalog/accessories`) | Ghi chú |
|---|---|---|
| `code` | `sku` | Mã phụ kiện |
| `decorationPrice` | `unitPrice` | Giá cho **1 slot** |
| *(không có)* | `stock` | Phụ kiện thiết kế ⇒ không giới hạn tồn kho |
| `image` | `image` | Ảnh PNG alpha được KÉO lên cây |

**★ Field metadata ghép ảnh (optional — bổ sung 2026-11-13):**

| Field | Kiểu | Ý nghĩa | Bắt buộc? |
|---|---|---|---|
| `anchor` | `{ x: number; y: number }` | Điểm neo chuẩn hoá **0–1 trong bbox của `image`** — móc treo / nút thắt nơ / tâm vật. Khi render, điểm này được đặt **trùng vị trí slot** ⇒ phụ kiện "móc" vào cành thay vì lơ lửng. | Không (default `{ x: 0.5, y: 0.5 }`) |
| `shadow` | `'none' \| 'soft' \| 'contact'` | Kiểu bóng: `contact` = có bóng tiếp xúc (ellipse tố dưới vật) + bóng đổ nhẹ; `soft` = chỉ bóng đổ; `none` = không bóng (vật phẳng như dây đèn neon). | Không (default `'soft'`) |
| `defaultScale` | `number` | Tỉ lệ mặc định khi gắn (0.3–3). Nhân với `scaleHint` của slot ⇒ kích thước authored sát ảnh thật. | Không (default `1`) |

> ⚠️ **`anchor` đo trên `image`, KHÔNG phải `previewImage`.** Nếu 2 ảnh khác tỉ lệ ⇒ neo sẽ lệch.

**Fallback phía FE (đã triển khai):** nếu endpoint trả `404 / 403 / 405` ⇒ FE tự gọi `GET /api/catalog/accessories` (collection cũ). ⇒ **Endpoint này KHÔNG bắt buộc phải có**; thiếu thì FE vẫn chạy bình thường.

---

### ★ GET `/api/catalog/variants/:variantId/slotmap` (Tree Customizer)

**Auth**: Public.

**Success (200)**:
```json
{
  "variantId": "string",
  "version": 7,
  "slots": [
    {
      "slotId": "ball-left-01",
      "slotType": "ball",
      "x": 0.32,
      "y": 0.44,
      "radius": 0.05,
      "z": 10,
      "allowedAccessoryTypes": ["BAUBLE"],
      "depth": "behind",
      "scaleHint": 1.15
    }
  ]
}
```

**★ Field mới (optional — bổ sung 2026-11-13):**

| Field | Kiểu | Ý nghĩa | Bắt buộc? |
|---|---|---|---|
| `depth` | `'behind' \| 'front'` | Lớp chiều sâu của slot. `behind` ⇒ phụ kiện nằm **sau tán cây**, bị cành trước che (chỉ có tác dụng khi variant có `foregroundMask`). `front` ⇒ nằm trước tán cây. | Không (default `'front'`) |
| `scaleHint` | `number` | Gợi ý kích thước authored của phụ kiện tại slot này (mặc định `1`). Nhân với `defaultScale` của phụ kiện ⇒ kích thước thực tế trên cây. | Không (default `1`) |

> **Lưu ý về `z`:** trước đây `z` là field không ai đọc. Từ 2026-11-13 nó là **thứ tự vẽ thật** — trong mỗi nhóm lớp (`behind` / `front`), slot có `z` nhỏ hơn được vẽ trước. SlotMap cũ (không khai `z`) vẫn hợp lệ.

---

### ★ GET `/api/catalog/customizer/base-trees` (Tree Customizer)

**Auth**: Public.

Trả về danh sách cây **BASE** (ảnh trơn, có SlotMap đang phát hành). Cây thương mại (`isCustomizerBase !== true`) không xuất hiện.

**Success (200)**:
```json
{
  "baseTrees": [
    {
      "_id": "string",
      "sku": "TREE-GREEN-M",
      "size": "M",
      "name": "Cây thông Noel trang trí",
      "price": 249000,
      "stockQuantity": 80,
      "bareImage": "https://res.cloudinary.com/.../tree-green-m.png",
      "foregroundMask": "https://res.cloudinary.com/.../tree-green-m-mask.png",
      "productId": "string",
      "productName": "string",
      "codeId": "string",
      "codeName": "string",
      "hasSlotMap": true,
      "slotCount": 24,
      "slotMapVersion": 7
    }
  ]
}
```

**★ Field mới (optional — bổ sung 2026-11-13):**

| Field | Kiểu | Ý nghĩa | Bắt buộc? |
|---|---|---|---|
| `foregroundMask` | `string` | URL ảnh **cành tiền cảnh** (PNG alpha) — lớp overlay che phụ kiện `depth: 'behind'` ⇒ tạo cảm giác phụ kiện nằm TRONG tán cây. **Phải cùng pixel size với `bareImage`** và **KHÔNG** áp `e_background_removal` khi phục vụ (đây là PNG đã cắt sẵn). | Không (thiếu ⇒ không có lớp che ⇒ hành vi cũ) |

**Fallback phía FE (đã triển khai):** nếu endpoint trả `404 / 403 / 405` ⇒ FE gọi `GET /api/catalog/tree-products` và lọc `isCustomizerBase === true`.

---

### GET `/api/catalog/presets`

**Auth**: Public.

**Success (200)**:
```json
{
  "presets": [
    {
      "_id": "string",
      "name": "string",
      "slug": "string",
      "year": "number",
      "config": { /* DesignConfig */ },
      "previewImage": "string",
      "isPublic": true,
      "isPreset": true,
      "shareUrl": "/tree/slug-here",
      "pricing": { /* PriceBreakdown */ }
    }
  ]
}
```

> Mỗi preset đã được hydrate (catalog loaded + pricing computed) — FE render trực tiếp.

---

### GET `/api/catalog/delivery-options`

**Auth**: Public.

**Success (200)**:
```json
{
  "options": [
    {
      "code": "READY_TO_DISPLAY",
      "shippingFee": 30000,
      "decorationFeeBySize": { "S": 50000, "M": 80000, "L": 120000 }
    },
    {
      "code": "DIY_KIT",
      "shippingFee": 30000,
      "decorationFeeBySize": { "S": 0, "M": 0, "L": 0 }
    },
    {
      "code": "SEPARATE",
      "shippingFee": 30000,
      "decorationFeeBySize": { "S": 0, "M": 0, "L": 0 }
    }
  ]
}
```

---

### POST `/api/catalog/quote`

**Mục đích**: Live price preview từ `DesignConfig` (không cần login, dùng cho editor preview).

**Auth**: Public.

**Request**:
```json
{
  "config": {
    "variantId": "ObjectId (required — Tree._id)",
    "styleId": "ObjectId (optional — Style._id, chỉ dùng khi custom qua Editor)",
    "accessories": [
      { "accessoryId": "ObjectId", "quantity": 1, "personalizationText": "string (optional, required if accessory.isPersonalizable)" }
    ],
    "deliveryOption": "READY_TO_DISPLAY | DIY_KIT | SEPARATE"
  }
}
```

> **Note cho FE**: FE nên cache `Tree._id`, `Style._id`, `Accessory._id` từ các endpoint catalog (`/api/catalog/trees`, `/styles`, `/accessories`) thay vì gửi `treeSize`/`styleCode`. Design snapshot vào Order cần ObjectId ổn định.

**Success (200)**:
```json
{
  "pricing": {
    "tree": { "id": "ObjectId", "name": "string", "size": "S|M|L", "unitPrice": "number (VND)" },
    "style": { "id": "ObjectId", "code": "string", "name": "string" },
    "lines": [
      { "accessoryId": "ObjectId", "name": "string", "type": "string", "group": "string", "image": "string", "unitPrice": "number", "quantity": "number", "lineTotal": "number", "isPersonalizable": "boolean", "personalizationMaxLength": "number", "productionDays": "number" }
    ],
    "decorationFee": "number (VND — 0 unless READY_TO_DISPLAY)",
    "shippingFee": 30000,
    "unitTotal": "number (VND — full price for 1 set)",
    "productionDays": "number",
    "hasPersonalization": "boolean",
    "hasService": "boolean (true if decorationFee > 0)",
    "warnings": ["string (validation hints)"]
  }
}
```

**Errors**:
- `400 MISSING_FIELD`
- `404 TREE_NOT_FOUND` / `STYLE_NOT_FOUND` / `ACCESSORY_NOT_FOUND`
- `400 ACCESSORY_STYLE_MISMATCH` / `ACCESSORY_QUANTITY_INVALID` / `ACCESSORY_DUPLICATED`
- `400 DELIVERY_OPTION_INVALID`
- `400 PERSONALIZATION_REQUIRED` / `PERSONALIZATION_INVALID`
- `400 DESIGN_CONFIG_INVALID`

---

## Designs

### POST `/api/designs/quote`

Same as `POST /api/catalog/quote`. Alias cho editor UX.

---

### POST `/api/designs`

**Auth**: Required.

**Request**:
```json
{
  "name": "string (required, trim)",
  "config": { /* DesignConfig (same as catalog/quote) */ },
  "previewImage": "string (optional)",
  "isPublic": "boolean (default true)"
}
```

**Success (201)**:
```json
{
  "design": {
    "_id": "string",
    "name": "string",
    "slug": "string (URL-safe unique)",
    "year": "number",
    "config": { /* DesignConfig */ },
    "previewImage": "string",
    "isPublic": "boolean",
    "isPreset": false,
    "duplicatedFrom": "string | null",
    "ownerId": "string",
    "shareUrl": "/tree/slug-here",
    "pricing": { /* PriceBreakdown */ }
  },
  "shareUrl": "/tree/slug-here"
}
```

**Errors**:
- `400 MISSING_FIELD`
- `400 DESIGN_NAME_REQUIRED`
- `400 DESIGN_CONFIG_INVALID` (validation fail)
- Mọi error code từ `catalog/quote`

---

### ★ `Design.configuration` — Tree Customizer (bổ sung 2026-11-13)

`POST /api/designs`, `PATCH /api/designs/:id` và `POST /api/designs/quote` nhận `configuration` theo shape sau (thay cho `config` cũ khi dùng Customizer):

```json
{
  "configuration": {
    "configVersion": 1,
    "slotMapVersion": 7,
    "variantSnapshot": {
      "variantId": "string",
      "sku": "TREE-GREEN-M",
      "name": "Cây thông Noel trang trí",
      "price": 249000
    },
    "placements": [
      {
        "slotId": "ball-left-01",
        "accessoryId": "string",
        "x": 0.32,
        "y": 0.44,
        "rotation": 0,
        "scale": 1,
        "depth": "behind"
      }
    ]
  }
}
```

**★ Field mới trong `placements[]` (optional):**

| Field | Kiểu | Ý nghĩa | Bắt buộc? |
|---|---|---|---|
| `depth` | `'behind' \| 'front'` | **Snapshot lớp chiều sâu tại lúc khách gắn phụ kiện.** `undefined` ⇒ FE fallback về `depth` của slot trong SlotMap hiện tại. | Không |

**Vì sao cần snapshot:** admin có thể đổi `depth` của slot **sau khi** khách đã đặt hàng. Nếu không snapshot, bản đơn sẽ render khác hình khách đã chọn ⇒ sai ảnh giao hàng.

**Yêu cầu cho BE:**

1. Lưu mảng `placements` **nguyên vẹn** (kể cả field lạ như `depth`) — không cần validate.
2. Khi tạo `OrderItem.frozenConfig` / đóng băng cấu hình trong giỏ, **copy nguyên vẹn** `placements[]` ⇒ giữ `depth`.
3. `depth` **không ảnh hưởng giá** — logic tính phí trang trí giữ nguyên (mỗi placement = 1 slot = 1 lần phí).

> Toàn bộ hợp đồng chi tiết (kèm schema Mongoose đề xuất & checklist): [`BE_HANDOFF_COMPOSITING.md`](BE_HANDOFF_COMPOSITING.md)

---

### GET `/api/designs/mine`

**Auth**: Required.

**Success (200)**:
```json
{ "designs": [/* hydrated design[] */], "total": "number" }
```

---

### GET `/api/designs/share/:slug`

**Auth**: Optional. Public nếu `isPublic=true`; owner/admin nếu private.

**Success (200)**:
```json
{ "design": { /* hydrated design */ } }
```

**Errors**:
- `404 DESIGN_NOT_FOUND`
- `403 FORBIDDEN` — design private + không phải owner/admin

---

### GET `/api/designs/:id`

**Auth**: Required (owner/admin).

**Success (200)**:
```json
{ "design": { /* hydrated design */ } }
```

**Errors**:
- `404 DESIGN_NOT_FOUND`
- `403 FORBIDDEN`

---

### PATCH `/api/designs/:id`

**Auth**: Required (owner).

**Request**:
```json
{
  "name": "string (optional)",
  "config": { /* DesignConfig (optional) */ },
  "previewImage": "string (optional)",
  "isPublic": "boolean (optional)"
}
```

**Success (200)**:
```json
{ "design": { /* hydrated, updated */ } }
```

**Errors**:
- `404 DESIGN_NOT_FOUND`
- `403 FORBIDDEN` — preset không thể edit, hoặc không phải owner
- `400 DESIGN_NAME_REQUIRED` (nếu name rỗng)
- Mọi error code từ `catalog/quote` (khi update config)

---

### DELETE `/api/designs/:id`

**Auth**: Required (owner).

**Success (200)**:
```json
{ "success": true }
```

**Errors**:
- `404 DESIGN_NOT_FOUND`
- `403 FORBIDDEN` — preset không thể xóa, hoặc không phải owner

---

### POST `/api/designs/:id/duplicate`

**Auth**: Required.

**Mục đích**: Clone bất kỳ design (own / public / preset).

**Request**:
```json
{ "name": "string (optional — default '<src.name> (copy)')" }
```

**Success (201)**:
```json
{
  "design": { /* hydrated, mới — duplicatedFrom = src._id */ },
  "shareUrl": "/tree/slug-here"
}
```

**Errors**:
- `404 DESIGN_NOT_FOUND`
- `403 FORBIDDEN` — src private + không phải owner/admin
- `400 DESIGN_CONFIG_INVALID`

---

## Cart

> Tất cả endpoints trong section này **require auth**.

### GET `/api/cart`

**Success (200)**:
```json
{
  "cart": { "_id": "string" },
  "items": [
    {
      "_id": "string (item ObjectId)",
      "cartId": "string",
      "designId": "string | null",
      "quantity": "number (số bộ)",
      "priceSnapshot": "number (giá tại thời điểm add)",
      "currentUnitTotal": "number (recompute live)",
      "priceChanged": "boolean (true nếu priceSnapshot !== currentUnitTotal)",
      "checked": "boolean (true = chọn để checkout)",
      "config": { /* DesignConfig */ },
      "design": { /* hydrated design nếu designId — optional */ },
      "warning": "string (optional — cảnh báo nếu config invalid)"
    }
  ]
}
```

> **Quan trọng**: FE dùng `priceChanged` + `warning` để hiển thị cảnh báo "Giá đã thay đổi" và yêu cầu user xác nhận trước khi checkout.

**Errors**: `401 UNAUTHORIZED`, `500 INTERNAL_ERROR`

---

### POST `/api/cart/items`

**Request** (một trong hai dạng):
```json
{ "config": { /* DesignConfig inline */ }, "quantity": "number (default 1, min 1)" }
```
hoặc
```json
{ "designId": "string", "quantity": "number (default 1, min 1)" }
```

**Success (201)**:
```json
{ "item": { /* ApiCartItem */ } }
```

**Errors**:
- `400 MISSING_FIELD` — thiếu cả `config` và `designId`
- `404 DESIGN_NOT_FOUND` — khi dùng `designId` không tồn tại
- `400 DESIGN_CONFIG_INVALID`
- Mọi error code từ `catalog/quote`

---

### PATCH `/api/cart/items/:id`

**Request**:
```json
{
  "quantity": "number (optional, ≥ 1)",
  "checked": "boolean (optional)",
  "config": { /* DesignConfig (optional) */ }
}
```

**Success (200)**:
```json
{ "item": { /* ApiCartItem */ } }
```

**Errors**:
- `400 INVALID_INPUT` — quantity < 1
- `404 CART_ITEM_NOT_FOUND`
- Mọi error code từ `catalog/quote`

---

### DELETE `/api/cart/items/:id`

**Success (204)**: No content.

**Errors**:
- `404 CART_NOT_FOUND` / `CART_ITEM_NOT_FOUND`

---

### DELETE `/api/cart/clear`

**Success (200)**:
```json
{ "success": true }
```

---

### POST `/api/cart/merge`

**Mục đích**: Gộp giỏ hàng khách vãng lai (guest session) vào tài khoản người dùng sau khi đăng nhập.

**Auth**: Buyer.

**Request**:
```json
{
  "guestSessionId": "guest_123456789"
}
```

**Success (200)**:
```json
{
  "cart": { "_id": "string" },
  "items": [ /* Danh sách items sau khi đã gộp */ ]
}
```

**Errors**:
- `401 UNAUTHORIZED`
- `500 INTERNAL_ERROR`

---

## Orders

> Tất cả require auth.

### GET `/api/orders`

**Auth**: Required. Buyer lấy orders của mình; admin lấy tất cả.

**Query params**: `status` (optional, uppercase)

**Success (200)**:
```json
{
  "orders": [
    {
      "_id": "string",
      "orderCode": "BYC-########",
      "buyerId": "string",
      "items": [
        {
          "designId": "string | null",
          "designName": "string",
          "previewImage": "string",
          "tree": { "_id": "string", "size": "S|M|L", "name": "string", "price": "number" },
          "style": { "_id": "string", "code": "string", "name": "string" },
          "lines": [
            { "kind": "ACCESSORY", "refId": "string", "type": "string", "name": "string", "unitPrice": "number", "quantity": "number", "lineTotal": "number", "personalizationText": "string" },
            { "kind": "SERVICE", "type": "DECORATION_SERVICE", "name": "string", "unitPrice": "number", "quantity": 1, "lineTotal": "number" }
          ],
          "deliveryOption": "READY_TO_DISPLAY | DIY_KIT | SEPARATE",
          "unitTotal": "number",
          "quantity": "number (số bộ)",
          "lineTotal": "number",
          "hasPersonalization": "boolean",
          "productionDays": "number"
        }
      ],
      "subtotal": "number",
      "shippingFee": 30000,
      "decorationFee": "number",
      "discount": 0,
      "totalAmount": "number",
      "status": "OrderStatus (xem ENUMS.md)",
      "statusHistory": [
        { "status": "string", "by": "string", "at": "ISO", "reason": "string" }
      ],
      "paymentMethod": "COD | ONLINE",
      "paymentId": "string",
      "paidAt": "ISO | null",
      "designConfirmedAt": "ISO",
      "designLockedAt": "ISO",
      "shippingName": "string",
      "shippingPhone": "string",
      "shippingAddress": "string",
      "shippingProvinceId": "string",
      "shippingProvinceName": "string",
      "shippingCommuneId": "string",
      "shippingCommuneName": "string",
      "addressEffectiveDate": "string",
      "trackingNumber": "string",
      "shippingProvider": "string",
      "trackingUrl": "string",
      "pickupInfo": { /* object | null */ },
      "shippedAt": "ISO | null",
      "estimatedDeliveryAt": "ISO | null",
      "deliveredAt": "ISO | null",
      "cancelReason": "string",
      "cancelRequestedAt": "ISO | null",
      "idempotencyKey": "string",
      "createdAt": "ISO"
    }
  ]
}
```

---

### POST `/api/orders`

**Auth**: Required.

**Request**:
```json
{
  "shippingName": "string",
  "shippingPhone": "string",
  "shippingAddress": "string",
  "shippingProvinceId": "string (HARD-CODED '79' cho HCM)",
  "shippingProvinceName": "string",
  "shippingCommuneId": "string",
  "shippingCommuneName": "string",
  "addressEffectiveDate": "string",
  "paymentMethod": "COD | ONLINE (default COD)",
  "idempotencyKey": "string (optional, recommended)",
  "designConfirmed": "true (REQUIRED — phải xác nhận đồng ý với thiết kế)",
  "items": [
    { "config": { /* DesignConfig */ }, "designId": "string (optional)", "quantity": "number (default 1)" }
  ]
}
```

> **Nguồn hàng**: (1) `items[]` inline, hoặc (2) `cartItemIds: string[]` cụ thể, hoặc (3) tất cả `checked: true` items trong cart.

**Success (201)**:
```json
{ "order": { /* ApiOrder */ } }
```

**Side effects**:
- Atomic stock reservation cho tất cả tree + accessories. Nếu fail → rollback toàn bộ.
- Snapshot toàn bộ design config + pricing vào order (sau đó catalog đổi không ảnh hưởng order cũ).
- COD → `status: CONFIRMED` ngay.
- ONLINE → `status: PENDING_PAYMENT`.
- Notification cho buyer.
- Auto-cleanup cart items đã dùng.

**Errors**:
- `400 DESIGN_NOT_CONFIRMED` — phải bật `designConfirmed: true`
- `422 DELIVERY_AREA_NOT_SUPPORTED` — `shippingProvinceId !== "79"`
- `400 CART_EMPTY` / `NO_ITEMS_CHECKED` / `ITEMS_REQUIRED`
- `409 OUT_OF_STOCK`
- Mọi error code từ `catalog/quote` (validation)

---

### GET `/api/orders/:id`

**Auth**: Required (buyer của order hoặc admin).

**Path**: `id` là Mongo `_id` (24 hex) hoặc `orderCode` (vd `BYC-12345678`).

**Success (200)**:
```json
{ "order": { /* ApiOrder */ } }
```

**Errors**:
- `404 ORDER_NOT_FOUND`
- `403 FORBIDDEN` — không phải buyer/admin

---

### PATCH `/api/orders/:id/status`

**Auth**: Required.

**Request**:
```json
{ "status": "OrderStatus", "reason": "string (optional)" }
```

**State machine** — xem `docs/ENUMS.md` § OrderStatus.

**Role-based**:
- **Buyer** được: `CANCELLED` (chỉ khi `PENDING_PAYMENT`/`PAID`), `CANCEL_REQUESTED` (khi ≥ `CONFIRMED`), `DELIVERED`, `COMPLETED`, `DISPUTED`.
- **Admin** được: mọi valid transition.

**Special**: Nếu `hasPersonalization && currentStatus === PACKING` → buyer `CANCEL_REQUESTED` bị block với `ORDER_CANCEL_NOT_ALLOWED`.

**Side effects**:
- Khi `CANCELLED` → restore stock (cả tree + accessories, theo `quantity * item.quantity`).
- Khi `DELIVERED` → set `deliveredAt = now`.
- Khi `CANCEL_REQUESTED` → set `cancelReason` + `cancelRequestedAt`.

**Success (200)**:
```json
{ "order": { /* ApiOrder updated */ } }
```

**Errors**:
- `400 ORDER_STATUS_REQUIRED`
- `404 ORDER_NOT_FOUND`
- `403 FORBIDDEN` — không phải buyer/admin, hoặc buyer cố gọi status không được phép
- `422 ORDER_INVALID_TRANSITION` — state machine violation
- `409 ORDER_CANCEL_NOT_ALLOWED` — personalization + PACKING

---

## Shipments

### POST `/api/orders/:id/shipment`

**Auth**: Required (admin only).

**Request**:
```json
{
  "pickup": {
    "name": "string",
    "phone": "string",
    "address": "string",
    "province": "string",
    "district": "string",
    "ward": "string",
    "email": "string (optional)",
    "note": "string (optional)"
  },
  "trackingUrl": "string (optional — override default)"
}
```

**Side effects**:
- Status → `SHIPPING`.
- Gen tracking number `BYC#######`.
- Set `shippingProvider = "Build Your Christmas - HCM Delivery"`.
- Khởi tạo 2 events: `CREATED` + `IN_TRANSIT`.

**Success (201)**:
```json
{
  "shipment": {
    "id": "string",
    "orderId": "BYC-########",
    "provider": "Build Your Christmas - HCM Delivery",
    "trackingNumber": "BYC#######",
    "trackingUrl": "https://buildyourchristmas.vn/track/BYC#######",
    "status": "IN_TRANSIT",
    "shippedAt": "ISO",
    "estimatedDeliveryAt": "ISO",
    "events": [
      { "status": "CREATED", "description": "...", "timestamp": "ISO", "location": "..." },
      { "status": "IN_TRANSIT", "description": "...", "timestamp": "ISO", "location": "HCM Delivery Hub" }
    ]
  }
}
```

**Errors**:
- `403 FORBIDDEN` — không phải admin
- `404 ORDER_NOT_FOUND`
- `400 ORDER_ALREADY_CANCELLED`
- `400 ORDER_ALREADY_SHIPPED`

---

### GET `/api/orders/:id/shipment`

**Auth**: Required (buyer của order hoặc admin).

**Success (200)**:
```json
{
  "shipment": {
    "id": "string",
    "orderId": "BYC-########",
    "provider": "Build Your Christmas - HCM Delivery",
    "trackingNumber": "string",
    "trackingUrl": "string",
    "status": "PENDING | CREATED | PICKED_UP | IN_TRANSIT | DELIVERING | DELIVERED | CANCELLED",
    "shippedAt": "ISO | undefined",
    "estimatedDeliveryAt": "ISO | undefined",
    "deliveredAt": "ISO | undefined",
    "events": [
      { "status": "string", "description": "string", "timestamp": "ISO", "location": "string" }
    ]
  }
}
```

> `shipment.status` được derive từ `order.status` (xem `docs/ENUMS.md` § ShipmentStatus).

**Errors**:
- `404 ORDER_NOT_FOUND`
- `403 FORBIDDEN`

---

## Payments

### POST `/api/payments/checkout`

**Mục đích**: Mock online payment. Advance order `PENDING_PAYMENT → PAID → CONFIRMED`.

**Auth**: Required (buyer của order).

**Request**:
```json
{ "orderId": "string (ObjectId or orderCode)" }
```

**Success (200)**:
```json
{ "order": { /* ApiOrder đã update */ } }
```

> Idempotent: nếu order đã ở `PAID`/`CONFIRMED` → trả về state hiện tại, không xử lý lại.

**Side effects**:
- Stock đã được reserve lúc `POST /api/orders` — KHÔNG trừ thêm.
- Notification cho buyer.

**Errors**:
- `400 ORDER_ID_REQUIRED`
- `404 ORDER_NOT_FOUND`
- `422 ORDER_PAYMENT_INVALID_STATE` — order không phải `PENDING_PAYMENT`

> **Note**: COD orders KHÔNG cần gọi endpoint này. COD đã handle ở `POST /api/orders` (status = `CONFIRMED` ngay).

---

### POST `/api/payments/webhook`

**Mục đích**: Nhận thông báo tự động từ cổng thanh toán (PayOS / Sepay / VNPay / MoMo) để cập nhật đơn hàng thành `PAID` và `CONFIRMED`.

**Auth**: Public (xác thực qua chữ ký HMAC `X-Signature` nếu cấu hình `PAYMENT_WEBHOOK_SECRET` hoặc tự động điều hướng sang xử lý SePay nếu phát hiện payload SePay).

**Request**:
```json
{
  "orderCode": "BYC-12345678",
  "transactionId": "TXN-998877",
  "gateway": "PayOS",
  "amount": 1250000
}
```

**Success (200)**:
```json
{
  "success": true,
  "message": "Cập nhật thanh toán thành công",
  "order": { /* ApiOrder đã cập nhật */ }
}
```

**Errors**:
- `400 MISSING_FIELD`
- `401 WEBHOOK_INVALID_SIGNATURE`
- `404 ORDER_NOT_FOUND`

---

### GET `/api/payments/sepay/info/:orderId`

**Mục đích**: Lấy thông tin tài khoản ngân hàng, cú pháp chuyển khoản và URL ảnh mã VietQR sinh từ SePay cho đơn hàng.

**Auth**: Required (Buyer sở hữu đơn hàng hoặc Admin).

**Params**: `orderId` (MongoDB ObjectId hoặc `orderCode`).

**Success (200)**:
```json
{
  "payment": {
    "orderId": "670c...",
    "orderCode": "BYC-12345678",
    "totalAmount": 1250000,
    "bankAccount": "0123456789",
    "bankName": "MBBank",
    "accountHolder": "CONG TY CP BUILD YOUR CHRISTMAS",
    "transferContent": "BYC 12345678",
    "qrUrl": "https://qr.sepay.vn/img?acc=0123456789&bank=MBBank&amount=1250000&des=BYC+12345678&template=compact2",
    "isConfigured": true
  },
  "order": { /* ApiOrder */ }
}
```

**Errors**:
- `400 ORDER_ID_REQUIRED`
- `403 FORBIDDEN`
- `404 ORDER_NOT_FOUND`

---

### POST `/api/payments/sepay/webhook`

**Mục đích**: Webhook nhận dữ liệu từ SePay khi khách hàng chuyển khoản ngân hàng qua VietQR. Tự động kiểm tra số tiền, bóc tách mã đơn `BYC-XXXXXXXX`, cập nhật đơn hàng sang `PAID` / `CONFIRMED`, tạo thông báo và bắn sự kiện realtime Socket.io (`order:paid` & `payment:success`).

**Auth**: Header `Authorization: Apikey <SEPAY_API_KEY>` hoặc `Authorization: Bearer <SEPAY_API_KEY>`.

**Request Body (Format chuẩn SePay)**:
```json
{
  "id": 92704,
  "gateway": "MBBank",
  "transactionDate": "2026-10-14 14:02:37",
  "accountNumber": "0123456789",
  "subAccount": null,
  "transferType": "in",
  "transferAmount": 1250000,
  "accumulated": 10500000,
  "code": null,
  "content": "BYC 12345678 chuyen khoan",
  "referenceCode": "FT24080...",
  "description": "Thanh toan don hang BYC"
}
```

**Success (200)**:
```json
{
  "success": true,
  "message": "Cập nhật thanh toán thành công qua SePay",
  "orderCode": "BYC-12345678",
  "status": "CONFIRMED"
}
```

**Errors / Handled responses**:
- `401 WEBHOOK_INVALID_SIGNATURE`: Header Authorization không khớp với `SEPAY_API_KEY`.
- `200 { success: false, message: "..." }`: Khi nội dung không có mã đơn hàng hoặc chuyển thiếu tiền (trả 200 kèm ghi chú để SePay không retry dồn dập).

---

### GET `/api/payments/sepay/check/:orderCode`

**Mục đích**: Kiểm tra nhanh trạng thái đơn hàng đã thanh toán hay chưa (dành cho frontend fallback polling).

**Auth**: Public.

**Success (200)**:
```json
{
  "orderCode": "BYC-12345678",
  "status": "CONFIRMED",
  "isPaid": true,
  "paidAt": "2026-10-14T07:15:30.000Z",
  "paymentMethod": "SEPAY"
}
```

---


## Notifications

### GET `/api/notifications`

**Auth**: Required.

**Success (200)**:
```json
{
  "notifications": [
    {
      "_id": "string",
      "userId": "string",
      "type": "order | chat | promo | system | review",
      "title": "string",
      "message": "string",
      "isRead": "boolean",
      "createdAt": "ISO"
    }
  ]
}
```

> Limit 50 mới nhất, sort by `createdAt: -1`.

**Errors**: `401 UNAUTHORIZED`

---

### PATCH `/api/notifications/:id/read`

**Auth**: Required (owner).

**Success (200)**:
```json
{ "success": true }
```

**Errors**:
- `404 NOT_FOUND` — notification không tồn tại hoặc không thuộc user
- `401 UNAUTHORIZED`

---

### PATCH `/api/notifications/read-all`

**Mục đích**: Đánh dấu đã đọc tất cả thông báo của người dùng hiện tại trong 1 request duy nhất.

**Auth**: Required.

**Success (200)**:
```json
{
  "success": true,
  "message": "Đã đánh dấu đọc tất cả thông báo"
}
```

**Errors**: `401 UNAUTHORIZED`

---

## Admin

> Tất cả endpoints trong section này **require admin role**.

### Trees CRUD

#### GET `/api/admin/trees`

**Query**: `?isActive=true|false`

**Success (200)**:
```json
{
  "trees": [
    {
      "_id": "string",
      "size": "S | M | L",
      "name": "string",
      "price": "number",
      "stock": "number",
      "isActive": "boolean",
      "images": ["string"],
      "heightCmMin": "number",
      "heightCmMax": "number"
    }
  ]
}
```

#### POST `/api/admin/trees`

**Request**: Full tree object.

**Success (201)**:
```json
{ "tree": { /* Tree */ } }
```

**Errors**: `400 MISSING_FIELD` (thiếu size/name/price), `403 FORBIDDEN`

#### PATCH `/api/admin/trees/:id`

**Request**: Partial tree object.

**Success (200)**:
```json
{ "tree": { /* updated */ } }
```

**Errors**: `404 TREE_NOT_FOUND`, `403 FORBIDDEN`

---

### Styles CRUD

#### GET `/api/admin/styles`

**Success (200)**:
```json
{ "styles": [/* Style[] */] }
```

#### POST `/api/admin/styles`

**Request**: `{ code, name, description, palette, coverImage, isActive, sortOrder }`

**Errors**: `400 MISSING_FIELD` (thiếu code/name)

#### PATCH `/api/admin/styles/:id`

**Errors**: `404 STYLE_NOT_FOUND`

---

### Accessories CRUD

#### GET `/api/admin/accessories`

**Success (200)**:
```json
{ "accessories": [/* Accessory[] — full fields */] }
```

#### POST `/api/admin/accessories`

**Request**: `{ group, type, name, price, stock, styleCodes, maxQtyBySize, isPersonalizable, personalizationMaxLength, productionDays, image, description, isActive, sortOrder }`

**Errors**: `400 MISSING_FIELD` (thiếu group/type/name/price)

#### PATCH `/api/admin/accessories/:id`

**Errors**: `404 ACCESSORY_NOT_FOUND`

#### ★ Metadata 3D (mở rộng 2026-11-11)

`POST /api/admin/accessories` và `PATCH /api/admin/accessories/:id` **nhận thêm 4 field optional**:

| Field | Kiểu | Ý nghĩa | Bắt buộc? |
|---|---|---|---|
| `previewImage` | `string` | URL ảnh preview chất lượng cao (render từ model 3D hoặc chụp tay) | Không |
| `model3dUrl` | `string` | URL file model 3D (`.glb` / `.gltf`) | Không |
| `model3dScale` | `number` | Tỉ lệ hiển thị mặc định của model 3D | Không (default `1`) |
| `model3dRotation` | `number` | Góc xoay hiển thị mặc định của model 3D (độ) | Không (default `0`) |

**Quy tắc quan trọng — KHÔNG đánh đồng `image` với `previewImage`:**

- `image` = ảnh 2D dùng khi **KÉO** phụ kiện trong kệ ⇒ **BẮT BUỘC**, thiếu ⇒ khách hàng không thấy phụ kiện trong kệ.
- `previewImage` = ảnh preview chất lượng cao ⇒ **tuỳ chọn**, KHÔNG thay thế được `image`.
- `model3dUrl` = URL file model 3D ⇒ **tuỳ chọn** ở phase này.

**GET `/api/design-accessories`** (endpoint public của Customizer) trả về 4 field trên; khi thiếu thì FE tự áp dụng fallback `model3dScale = 1`, `model3dRotation = 0` ⇒ **BE cũ (chưa có schema 3D) vẫn chạy bình thường, không lỗi**.

**Lưu ý tải trọng**: `model3dUrl` **không** được dùng ở phía khách hàng trong phase này ⇒ không tăng tải (bundle/thời gian tải) cho người dùng. Chỉ trang Admin đọc field này để preview & kiểm tra asset.

---

#### ★ Metadata ghép ảnh — context-aware compositing (bổ sung 2026-11-13)

`POST /api/admin/accessories` và `PATCH /api/admin/accessories/:id` **nhận thêm 3 field optional**:

| Field | Kiểu | Ý nghĩa | Bắt buộc? |
|---|---|---|---|
| `anchor` | `{ x: number; y: number }` | **Điểm neo** chuẩn hoá 0–1 trong bbox của ảnh `image` — điểm sẽ **móc** vào cành (móc treo quả châu, nút thắt nơ, tâm vật). | Không (default `{ x: 0.5, y: 0.5 }`) |
| `shadow` | `'none' \| 'soft' \| 'contact'` | **Kiểu bóng**: `contact` = bóng tiếp xúc (ellipse tố dưới vật) + bóng đổ nhẹ; `soft` = chỉ bóng đổ; `none` = không bóng. | Không (default `'soft'`) |
| `defaultScale` | `number` | **Scale mặc định** khi gắn (0.3–3). Nhân với `scaleHint` của slot ⇒ kích thước authored sát ảnh thật. | Không (default `1`) |

**Ví dụ payload PATCH:**

```json
{
  "anchor": { "x": 0.5, "y": 0.06 },
  "shadow": "contact",
  "defaultScale": 1.2
}
```

**⚠️ Yêu cầu quan trọng — `PATCH` phải hỗ trợ PARTIAL UPDATE:** FE gửi **từng field riêng** (mỗi lần admin sửa 1 input ⇒ 1 request PATCH với đúng 1 field). Nếu BE `Object.assign` toàn bộ model ⇒ các field khác bị xoá. Chỉ `set` những field có mặt trong body.

**Giá trị `anchor` gợi ý theo loại phụ kiện:**

| Loại | `anchor` | `shadow` |
|---|---|---|
| Quả châu (móc treo ở trên) | `{ x: 0.5, y: 0.06 }` | `contact` |
| Nơ satin (nút thắt ở giữa) | `{ x: 0.5, y: 0.45 }` | `contact` |
| Quả thông / bông (tâm) | `{ x: 0.5, y: 0.5 }` | `contact` |
| Ngôi sao đỉnh | `{ x: 0.5, y: 0.5 }` | `soft` |
| Dây đèn neon (vật phẳng) | `{ x: 0.5, y: 0.5 }` | `none` |

> Hướng dẫn chi tiết cho đội ảnh: [`ASSET_PREPARATION_GUIDE.md`](ASSET_PREPARATION_GUIDE.md)

---

### ★ Tree variants — `foregroundMask` (bổ sung 2026-11-13)

#### PATCH `/api/admin/tree-variants/:id`

**Request** (partial — chỉ gửi field cần đổi):
```json
{
  "foregroundMask": "https://res.cloudinary.com/<cloud>/image/upload/v1730000000/tree-green-m-mask.png"
}
```

| Field | Kiểu | Ý nghĩa | Bắt buộc? |
|---|---|---|---|
| `foregroundMask` | `string` | URL ảnh **cành tiền cảnh** (PNG alpha) — lớp overlay che phụ kiện `depth: 'behind'` ⇒ tạo cảm giác phụ kiện nằm TRONG tán cây. | Không (thiếu ⇒ không có lớp che ⇒ hành vi cũ) |

**Quy tắc bắt buộc cho `foregroundMask`:**

1. **Cùng pixel size (W×H) với `bareImage`** của cùng variant.
2. Phải là **PNG có kênh alpha** (đã khoét sẵn).
3. **KHÔNG** áp transformation `e_background_removal` khi phục vụ ảnh này (khác với `bareImage`) — làm vậy sẽ phá hỏng alpha.
4. Chồng khít với cành ở `bareImage` (lệch 1–2 px là chấp nhận được).

**Success (200)**:
```json
{ "treeVariant": { "_id": "string", "bareImage": "...", "foregroundMask": "..." } }
```

**Errors**: `404 TREE_VARIANT_NOT_FOUND`, `403 FORBIDDEN`

---

### ★ SlotMap — `depth` & `scaleHint` (bổ sung 2026-11-13)

#### POST `/api/admin/tree-variants/:variantId/slotmaps/publish`

**Request**:
```json
{
  "slots": [
    {
      "slotId": "ball-left-01",
      "slotType": "ball",
      "x": 0.32,
      "y": 0.44,
      "radius": 0.05,
      "z": 10,
      "allowedAccessoryTypes": ["BAUBLE"],
      "depth": "behind",
      "scaleHint": 1.15
    }
  ]
}
```

**★ Field mới (optional):**

| Field | Kiểu | Ý nghĩa | Bắt buộc? |
|---|---|---|---|
| `depth` | `'behind' \| 'front'` | Lớp chiều sâu của slot. `behind` ⇒ phụ kiện nằm **sau tán cây**, bị cành trước che (chỉ có tác dụng khi variant có `foregroundMask`). `front` ⇒ nằm trước tán cây. | Không (default `'front'`) |
| `scaleHint` | `number` | Gợi ý kích thước authored của phụ kiện tại slot này (mặc định `1`). Nhân với `defaultScale` của phụ kiện ⇒ kích thước thực tế trên cây. | Không (default `1`) |

**Yêu cầu cho BE:**

1. Persist 2 field mới khi publish.
2. **Tăng `version`** của SlotMap sau mỗi lần publish (để design đã lưu biết cần re-validate).
3. Validate nhẹ: `depth` sai giá trị ⇒ bỏ qua field (không reject request); `scaleHint` không phải số > 0 ⇒ bỏ qua.
4. Trả lại **đầy đủ** `depth` / `scaleHint` ở cả endpoint public (`GET /api/catalog/variants/:variantId/slotmap`) và admin (`GET /api/admin/tree-variants/:variantId/slotmaps`).

**Success (200)**:
```json
{ "slotMap": { "variantId": "string", "version": 8, "slots": [/* đã lưu */] } }
```

---

### ★ Upload file nhị phân (model 3D `.glb` / `.gltf`)

#### POST `/api/uploads`

Hiện tại endpoint này theo [FE_MEDIA_INTEGRATION_GUIDE.md](FE_MEDIA_INTEGRATION_GUIDE.md) chỉ xử lý **image / audio / video**.

**Yêu cầu mới cho phase 3D — BE cần hỗ trợ `resource_type: 'raw'`**:

```
POST /api/uploads
Content-Type: multipart/form-data

file: <binary .glb hoặc .gltf>
resource_type: "raw"        // ← field MỚI (optional, mặc định "auto")
```

**Kỳ vọng khi `resource_type: "raw"`**:

```json
{
  "url": "https://res.cloudinary.com/<cloud>/raw/upload/v1234/abc123/model.glb",
  "publicId": "raw/upload/v1234/abc123/model",
  "format": "glb",
  "size": 2097152,
  "kind": "raw"
}
```

**Phương án thay thế** (nếu BE chưa muốn đụng `resource_type`): tạo endpoint riêng `POST /api/uploads/model` với cùng shape trả về.

**Fallback phía FE (đã triển khai)**: nếu BE từ chối upload `.glb`, Admin sẽ hiện ô **"Dán URL model 3D"** kèm thông báo rõ ràng thay vì báo lỗi chung chung. Khi dùng `.gltf` (có file phụ `.bin` / texture), **bắt buộc bật CORS** trên nơi lưu trữ, nếu không FE sẽ báo lỗi rõ ràng:

> "model dùng external dependency không tải được, hãy dùng .glb gói trọn"

**Khuyến nghị**: dùng `.glb` (gói trọn) để không phụ thuộc file phụ.

---

### Presets (TreeDesign với `isPreset: true`)

#### GET `/api/admin/presets`

**Success (200)**:
```json
{ "presets": [/* hydrated preset[] */] }
```

#### POST `/api/admin/presets`

**Request**: `{ name, config, previewImage }`

**Success (201)**:
```json
{ "preset": { /* hydrated */ } }
```

#### PATCH `/api/admin/presets/:id`

**Request**: `{ name?, config?, previewImage? }`

**Success (200)**:
```json
{ "preset": { /* hydrated, updated */ } }
```

#### DELETE `/api/admin/presets/:id`

**Success (200)**:
```json
{ "success": true }
```

---

### Orders (admin overview)

#### GET `/api/admin/orders`

**Query**: `?status=PENDING_PAYMENT|...`

**Success (200)**:
```json
{ "orders": [/* ApiOrder[] — all users */] }
```

---

### Stats

#### GET `/api/admin/stats`

**Success (200)**:
```json
{
  "stats": {
    "totalOrders": "number",
    "pendingOrders": "number",
    "completedOrders": "number",
    "totalUsers": "number",
    "totalDesigns": "number",
    "designsShared": "number",
    "revenue": "number (VND)",
    "aov": "number (VND per order)",
    "personalizationCount": "number",
    "ordersByStatus": [{ "_id": "OrderStatus", "count": "number" }],
    "lowStock": {
      "accessories": [{ "name": "string", "stock": "number", "type": "string" }],
      "trees": [{ "name": "string", "size": "S|M|L", "stock": "number" }]
    }
  }
}
```

---

### Users

#### GET `/api/admin/users`

**Query**: `?page=1&limit=20&search=...`

**Success (200)**:
```json
{
  "users": [
    {
      "_id": "string",
      "name": "string",
      "email": "string",
      "avatarUrl": "string",
      "roles": ["buyer | admin"],
      "accountStatus": "active | suspended",
      "accountStatusReason": "string",
      "addresses": [],
      "createdAt": "ISO"
    }
  ],
  "total": "number",
  "page": "number",
  "limit": "number",
  "totalPages": "number"
}
```

> KHÔNG trả `passwordHash` (đã strip).

#### PATCH `/api/admin/users/:id/status`

**Request**:
```json
{ "status": "active | suspended", "reason": "string (optional)" }
```

**Success (200)**:
```json
{
  "success": true,
  "user": {
    "_id": "string",
    "accountStatus": "string",
    "accountStatusReason": "string"
  }
}
```

**Errors**:
- `400 INVALID_INPUT` — status không hợp lệ
- `403 FORBIDDEN` — không thể self-suspend
- `404 ACCOUNT_NOT_FOUND`

#### GET `/api/admin/users/:id/details`

**Success (200)**:
```json
{
  "user": { /* user (no passwordHash) */ },
  "stats": {
    "totalOrders": "number",
    "cancelledOrders": "number",
    "totalSpent": "number (VND — orders COMPLETED)"
  }
}
```

**Errors**: `404 ACCOUNT_NOT_FOUND`

---

### Analytics (xu hướng & biểu đồ)

#### GET `/api/admin/analytics`

**Query**: `?from=2026-10-01&to=2026-12-31` (optional)

**Success (200)**:
```json
{
  "analytics": {
    "from": "ISO",
    "to": "ISO",
    "revenueByDay": [
      { "date": "2026-10-01", "revenue": 2500000, "orderCount": 5 }
    ],
    "stylesBreakdown": [
      { "styleCode": "CLASSIC", "name": "Cổ điển", "count": 25 }
    ],
    "deliveryOptions": [
      { "deliveryOption": "READY_TO_DISPLAY", "count": 15 },
      { "deliveryOption": "DIY_KIT", "count": 30 }
    ],
    "topAccessories": [
      { "name": "Quả châu đỏ", "type": "BAUBLE", "totalCount": 120 }
    ]
  }
}
```

---

## Coupons

### POST `/api/coupons/apply`

**Mục đích**: Kiểm tra và tính chiết khấu mã giảm giá mùa Noel.

**Auth**: Required (Buyer / Admin).

**Request**:
```json
{
  "code": "NOEL2026",
  "orderTotal": 1250000
}
```

**Success (200)**:
```json
{
  "valid": true,
  "code": "NOEL2026",
  "discountType": "PERCENT",
  "value": 10,
  "discountAmount": 125000,
  "finalTotal": 1125000,
  "message": "Áp dụng mã giảm giá NOEL2026 thành công! Giảm 125.000đ"
}
```

**Errors**:
- `400 MISSING_FIELD`
- `400 COUPON_EXPIRED`
- `400 COUPON_LIMIT_REACHED`
- `400 COUPON_MIN_ORDER_NOT_MET`
- `404 COUPON_NOT_FOUND`

---

## Uploads

### POST `/api/uploads`

**Mục đích**: Tải ảnh preview cây từ Canvas Editor, hình ảnh phụ kiện, ảnh gallery sản phẩm và video giới thiệu sản phẩm MP4 chuẩn Shopee.

**Auth**: Optional (hoặc Buyer / Admin).

**Request**:
- `Content-Type: application/json` với `{ file: "data:image/png;base64,..." }` hoặc `{ file: "data:video/mp4;base64,..." }`.
- HOẶC `Content-Type: multipart/form-data` với trường `file`.

**Quy định giới hạn dung lượng & định dạng**:
- **Hình ảnh**: `.png`, `.jpg`, `.jpeg`, `.webp`, `.svg` — Dung lượng tối đa: **5MB**.
- **Video sản phẩm**: `.mp4` — Dung lượng tối đa: **30MB** (Khuyến nghị độ dài 10s–60s).

**Success (201) — Hình ảnh**:
```json
{
  "url": "http://localhost:4000/uploads/img_1728500000_abc123.webp",
  "path": "/uploads/img_1728500000_abc123.webp",
  "publicId": "uploads/img_1728500000_abc123",
  "format": "webp",
  "size": 245100
}
```

**Success (201) — Video**:
```json
{
  "url": "http://localhost:4000/uploads/vid_1728500000_def456.mp4",
  "path": "/uploads/vid_1728500000_def456.mp4",
  "publicId": "uploads/vid_1728500000_def456",
  "format": "mp4",
  "size": 15420000
}
```

**Errors**:
- `400 MISSING_FIELD` (Thiếu file trong request)
- `400 FILE_TOO_LARGE` (Ảnh > 5MB hoặc Video > 30MB)
- `415 UNSUPPORTED_MEDIA_TYPE` (Chỉ chấp nhận PNG, JPG, WebP, SVG hoặc MP4)

---

## Health

### GET `/api/health`

**Auth**: Public.

**Success (200)**:
```json
{ "status": "ok", "timestamp": "ISO" }
```

### Wildcard 404

Mọi request tới `/api/*` không match route sẽ trả:
```json
{ "error": { "code": "NOT_FOUND", "message": "Endpoint không tồn tại" } }
```
với HTTP 404.
