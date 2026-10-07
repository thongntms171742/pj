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
      "code": "FLAT_PACK",
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
    "treeId": "ObjectId (required — Tree._id)",
    "styleId": "ObjectId (required — Style._id)",
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
          "deliveryOption": "READY_TO_DISPLAY | FLAT_PACK",
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
