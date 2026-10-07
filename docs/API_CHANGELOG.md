# API CHANGELOG

Track changes to the API contract over time to ensure synchronization between Backend and Frontend.

---
## 2026-10-07 — 🎄 CHRISTMAS PIVOT (Breaking)

> **Domain shift**: dự án chuyển từ **thrift it! (vintage marketplace)** sang **Build Your Christmas** (single-brand Christmas tree e-commerce với tree editor + HCM-only delivery). Mọi endpoint thuộc marketplace bị xóa, mọi endpoint thuộc Christmas được thêm mới. FE PHẢI bám theo contract mới (single-source-of-truth = code thực tế trong `backend/src/`).

### Removed endpoints (BREAKING)

Nhóm **Sellers / Products / Reviews** (đã xóa file controller + route):
- `GET/POST/PATCH/DELETE /api/products/*` (tất cả)
- `GET/POST/PATCH /api/sellers/*` (tất cả)
- `POST /api/products/:id/reviews`
- `GET /api/sellers/:idOrHandle/reviews`

Nhóm **Marketplace cart merge**:
- `POST /api/cart/merge`
- `POST /api/auth/cart/merge`

Nhóm **Seller application flow**:
- `POST /api/auth/seller/apply`
- `GET /api/admin/pending-sellers`
- `PATCH /api/admin/sellers/:id/approve`
- `PATCH /api/admin/sellers/:id/reject`
- `PATCH /api/admin/sellers/:id/commission-rate`
- `PATCH /api/admin/users/:id/approve-seller` (legacy)
- `PATCH /api/admin/users/:id/reject-seller` (legacy)

Nhóm **Listing moderation**:
- `GET /api/admin/pending-listings`
- `PATCH /api/admin/listings/:id/approve`
- `PATCH /api/admin/listings/:id/reject`

Nhóm **AI** (Gemini endpoints — đã xóa):
- `POST /api/ai/search`
- `POST /api/ai/analyze-listing`
- `POST /api/ai/recommendations`

Nhóm **Legacy order**:
- `GET /api/orders/seller`
- `PATCH /api/orders/:code/status` (đổi thành `:id`)
- `POST /api/orders/:code/shipment` (đổi thành `:id`)
- `POST /api/payments/:code/cod-collect` (COD xử lý trong `POST /api/orders`)

### Removed error codes
- `SELLER_NOT_APPROVED`, `SELLER_HANDLE_TAKEN`, `SELLER_SHOP_NAME_TAKEN`, `SELLER_ALREADY_APPROVED`
- `PRODUCT_NOT_FOUND`, `PRODUCT_NOT_AVAILABLE`, `PRODUCT_OUT_OF_STOCK`, `PRODUCT_TITLE_REQUIRED`, `PRODUCT_PRICE_REQUIRED`, `PRODUCT_CONDITION_REQUIRED`, `PRODUCT_SIZE_REQUIRED`, `PRODUCT_QUANTITY_INVALID`, `PRODUCT_SIZE_DATA_INVALID`, `PRODUCT_ALREADY_NOT_FOR_SALE`
- `SELF_PURCHASE_NOT_ALLOWED`, `QUANTITY_EXCEEDS_STOCK`
- `ORDER_BUYER_NOT_PARTICIPANT`, `ORDER_SELLER_CANNOT_DELIVER`
- `REVIEW_RATING_INVALID`, `REVIEW_NOT_ALLOWED`, `REVIEW_ALREADY_EXISTS`
- `AI_NOT_CONFIGURED`, `AI_UPSTREAM_ERROR`, `AI_QUERY_INVALID_LENGTH`, `AI_IMAGE_INVALID`, `AI_IMAGE_TYPE_INVALID`, `AI_QUERY_OR_IMAGE_REQUIRED`, `AI_RECOMMENDATIONS_UNAVAILABLE`
- `COMMISSION_RATE_INVALID`, `SELLER_NOT_FOUND`

### Added endpoints

**Auth**:
- `PUT /api/auth/me/avatar` (giữ nguyên từ trước)

**Users / Saved addresses** (giữ nguyên):
- `GET/POST/PATCH/DELETE /api/users/me/addresses`

**Addresses (CAS proxy)** (giữ nguyên):
- `GET /api/addresses/provinces`
- `GET /api/addresses/provinces/:provinceId/communes`
- `GET /api/addresses/communes`

**Catalog (public, MỚI)**:
- `GET /api/catalog/trees` — 3 sizes S/M/L
- `GET /api/catalog/styles` — 6 concepts
- `GET /api/catalog/accessories?type=&group=&style=&size=` — filter nhiều chiều
- `GET /api/catalog/presets` — ready-made designs
- `GET /api/catalog/delivery-options` — READY_TO_DISPLAY vs FLAT_PACK
- `POST /api/catalog/quote` — live pricing

**Designs (MỚI)**:
- `POST /api/designs/quote` (public)
- `POST /api/designs` (auth) — save design
- `GET /api/designs/mine` (auth)
- `GET /api/designs/share/:slug` (public/owner)
- `GET /api/designs/:id` (owner/admin)
- `PATCH /api/designs/:id` (owner)
- `DELETE /api/designs/:id` (owner)
- `POST /api/designs/:id/duplicate` (auth)

**Cart** (refactored, không còn `productId`):
- `GET /api/cart`
- `POST /api/cart/items` — body: `{ config | designId, quantity }`
- `PATCH /api/cart/items/:id`
- `DELETE /api/cart/items/:id`
- `DELETE /api/cart/clear`

**Orders** (refactored, design snapshot thay cho product):
- `GET /api/orders`
- `POST /api/orders` — body mới: `{ designConfirmed: true (REQUIRED), shippingProvinceId: "79" (HARD-CODED), items[] | cartItemIds[], ... }`
- `GET /api/orders/:id` (path đổi từ `:code` → `:id`, hỗ trợ cả `_id` lẫn `orderCode`)
- `PATCH /api/orders/:id/status`
- `POST /api/orders/:id/shipment` (admin only — đổi từ seller)
- `GET /api/orders/:id/shipment`

**Payments**:
- `POST /api/payments/checkout` (giữ nguyên mock)

**Notifications** (giữ nguyên):
- `GET /api/notifications`
- `PATCH /api/notifications/:id/read`

**Admin (refactored — Christmas catalog + orders + users + stats)**:
- `GET/POST/PATCH /api/admin/trees`
- `GET/POST/PATCH /api/admin/styles`
- `GET/POST/PATCH /api/admin/accessories`
- `GET/POST/PATCH/DELETE /api/admin/presets`
- `GET /api/admin/orders?status=`
- `GET /api/admin/stats` (response shape mới — Christmas-specific)
- `GET /api/admin/users?page=&limit=&search=`
- `PATCH /api/admin/users/:id/status` (ban/unban — không phải seller approve)
- `GET /api/admin/users/:id/details`

**Health**:
- `GET /api/health`

### Added error codes (47 mới, thay cho 25 codes marketplace)

Catalog:
- `TREE_NOT_FOUND`, `STYLE_NOT_FOUND`, `ACCESSORY_NOT_FOUND`, `CATALOG_ITEM_UNAVAILABLE`
- `ACCESSORY_STYLE_MISMATCH`, `ACCESSORY_QUANTITY_INVALID`, `ACCESSORY_DUPLICATED`
- `OUT_OF_STOCK` (thay cho `PRODUCT_OUT_OF_STOCK`)

Design:
- `DESIGN_NOT_FOUND`, `DESIGN_CONFIG_INVALID`, `DESIGN_NOT_CONFIRMED`
- `DESIGN_NAME_REQUIRED`, `DESIGN_SLUG_TAKEN`

Personalization:
- `PERSONALIZATION_REQUIRED`, `PERSONALIZATION_INVALID`

Delivery:
- `DELIVERY_OPTION_INVALID`, `DELIVERY_AREA_NOT_SUPPORTED` (HCM-only — 422)

Cart:
- `CART_EMPTY`, `NO_ITEMS_CHECKED`, `CART_NOT_FOUND`, `CART_ITEM_NOT_FOUND`

Order:
- `ORDER_NOT_FOUND`, `ORDER_STATUS_REQUIRED`, `ORDER_ID_REQUIRED`
- `ORDER_INVALID_TRANSITION` (giữ từ marketplace)
- `ORDER_ALREADY_SHIPPED`, `ORDER_ALREADY_CANCELLED`, `ORDER_PAYMENT_INVALID_STATE`
- `ORDER_CANCEL_NOT_ALLOWED` (MỚI — personalization + PACKING block)

Address (giữ từ trước):
- `INVALID_EFFECTIVE_DATE`, `PROVINCE_NOT_FOUND`, `ADDRESS_UPSTREAM_TIMEOUT`, `ADDRESS_UPSTREAM_ERROR`

### Data model changes

- `User.roles`: chỉ còn `["buyer", "admin"]` (bỏ `seller`).
- `User.sellerProfile`: **XÓA** (không còn field này).
- `User.addresses`: giữ nguyên embedded subdoc.
- Bỏ models: `Product`, `Category`, `SellerProfile`, `Review`, `Ledger`, `PlatformFeeConfig`, `Conversation`, `Message`, `Favorite`, `UserView`, `UserLike`, `Dispute`.
- Thêm models: `Tree`, `Style`, `Accessory`, `TreeDesign`, `CartItem` (tách khỏi `Cart`).
- `Order.items[].OrderItem` shape hoàn toàn mới: `{ designId, designName, tree (snapshot), style (snapshot), lines[] (ACCESSORY + SERVICE), deliveryOption, unitTotal, quantity, lineTotal, hasPersonalization, productionDays }`. KHÔNG còn `productId` / `sellerId` / `commissionRate` / `commissionAmount`.
- `Order.status` mở rộng: thêm `CANCEL_REQUESTED` (đã có từ 2026-09-30, giữ nguyên).
- `Order.shippingProvinceId` bắt buộc = `"79"` (HCM only — HCM-only delivery đã thêm 2026-10-03, giữ nguyên).

### Business rule changes

- **HCM-only delivery**: `POST /api/orders` reject mọi `shippingProvinceId !== "79"` với `DELIVERY_AREA_NOT_SUPPORTED` (HTTP 422). Tỉnh khác TP.HCM không được phục vụ ở MVP.
- **Design confirmation required**: `POST /api/orders` bắt buộc `designConfirmed: true`. FE phải có checkbox "Tôi đồng ý với thiết kế này" trước nút checkout.
- **Atomic stock reservation**: BE chạy `reserveStock` atomic (`updateOne({ _id, stock: { $gte: qty } }, { $inc: { stock: -qty } })`) cho tất cả line items khi tạo order. Nếu fail ở bất kỳ item nào → rollback toàn bộ + trả `OUT_OF_STOCK` (409).
- **Stock restore on cancel**: khi order chuyển sang `CANCELLED` → restore stock cho cả tree + accessories (theo `quantity * item.quantity`).
- **Personalization + PACKING block**: order có `hasPersonalization: true` mà đã vào `PACKING` → buyer không thể gửi `CANCEL_REQUESTED` (nhận `ORDER_CANCEL_NOT_ALLOWED` 409).
- **Snapshot design vào order**: order giữ toàn bộ `tree / style / lines / pricing` snapshot, KHÔNG thay đổi khi admin sửa catalog. Catalog cũ bị soft-delete (`isActive: false`) nhưng order cũ vẫn render đúng.
- **No reviews / no chat / no AI**: 3 features marketplace đã bỏ. Christmas MVP chỉ có: design editor + cart + checkout + admin catalog.

### Response format

- Mọi success response: object bao bọc theo resource (`{ trees }`, `{ styles }`, `{ accessories }`, `{ design }`, `{ orders }`, `{ order }`, …).
- Mọi error response: `{ error: { code: string, message: string } }` — **KHÔNG ĐỔI** so với 2026-09-29 (đã được pivot giữ nguyên).
- HTTP status: 400/401/403/404/409/422/500/502/503/504 (giữ nguyên).

### Impact for FE

- Nếu FE đang gọi bất kỳ endpoint thuộc nhóm "Removed" → phải xóa khỏi codebase. Sẽ nhận `404 NOT_FOUND` nếu cố gọi.
- Nếu FE đang parse `error: string` (format cũ) → update sang `error.code` (xem `docs/ERROR_CODES.md`).
- Nếu FE đang check `user.roles.includes("seller")` → bỏ check, single-brand.
- Nếu FE đang render product detail với `sizeQuantities` / `sizePriceDeltas` → chuyển sang Christmas UI (Tree chooser + Style chooser + Accessory list với `maxQtyBySize`).

### Migration checklist cho FE

- [ ] Bỏ mọi import/state liên quan: Product, Category, SellerProfile, Review, AI, Disputes, Ledger, Favorite, View, Like
- [ ] Cập nhật API client để trỏ tới endpoints mới (xem `docs/API_CONTRACT.md`)
- [ ] Update error handler để branch trên `error.code` (47 codes mới)
- [ ] Update router/guard để check `user.roles.includes("admin")` thay cho `"seller"`
- [ ] Build lại UI: TreeSelector (3 sizes) → StyleSelector (6 concepts) → AccessoryPicker (4 groups × 10 types × qty bound) → Preview/Quote → Save/Share → Cart → Checkout
- [ ] Checkout page: thêm `designConfirmed` checkbox, hard-code `shippingProvinceId: "79"`, show province selector chỉ cho HCM
- [ ] Order detail: render snapshot từ `order.items[].tree / style / lines` (KHÔNG query catalog thêm)
- [ ] Admin: rebuild screens cho trees/styles/accessories/presets CRUD (xóa product/seller moderation)

### Verification

- ✅ `npx tsc --noEmit` pass
- ✅ `npm run build` pass
- ✅ `npm test` (errorContract) — **61/61 PASS** (47 codes mới)
- ✅ `npm run test:pricing` — **25/25 PASS** (cover full business rules)
- ✅ `npm run test:address` — **16/16 PASS**
- ✅ `npm run test:all` — **102/102 PASS**

---
## 2026-10-06

### Added — Per-size stock & price delta for Products

**`GET /api/products/:id`**, **`POST /api/products`**, **`GET /api/products`**, **`GET /api/products/mine`**, **`GET /api/sellers/:idOrHandle/products`** — every product response now includes:

- `sizeQuantities: Record<string, number>` — per-size stock. Falls back to `{ [product.size]: product.quantity }` for legacy products that don't have explicit per-size stock, so FE always receives a usable map (no more `undefined` causing stock = 0 on product detail).
- `sizePriceDeltas: Record<string, number>` — per-size price adjustments in VND added to `product.price`. Empty object `{}` if not set.

**New endpoint**:

**`PATCH /api/products/:id`** — Partial update for a product listing (owner seller or admin). Supports updating `title`, `name`, `description`, `price`, `condition`, `size`, `quantity`, `coverImage`, `location`, `categoryId`, `sizeQuantities`, `sizePriceDeltas`. All fields optional.

- `404 PRODUCT_NOT_FOUND` if the id is invalid / not found.
- `403 FORBIDDEN` if the caller is not the owner or admin.
- `400 PRODUCT_SIZE_DATA_INVALID` when `sizeQuantities` / `sizePriceDeltas` is not a plain object or contains non-numeric values (negative stock not allowed).

### New error code

- `PRODUCT_SIZE_DATA_INVALID` (HTTP 400) — see `docs/ERROR_CODES.md`.

### Backward compatibility

- `POST /api/products` — new fields are optional. Existing clients continue to work unchanged.
- `GET /api/products/:id` — `sizeQuantities` and `sizePriceDeltas` are always present in the response (synthesized when missing). Non-breaking.
- Inventory decrement semantics in `POST /api/orders` and `POST /api/payments/checkout` are NOT changed. `quantity` remains the aggregate counter; `sizeQuantities` is currently display-only.

---

## 2026-10-06 (commission)

### Added — Per-seller commission rate + admin endpoint

**`PATCH /api/admin/sellers/:id/commission-rate`** — Admin cập nhật tỉ lệ hoa hồng cho từng seller (`commissionRate ∈ [0, 1]`). Rate mới chỉ áp dụng cho đơn hàng tạo sau khi update; các đơn hàng đã tồn tại giữ nguyên rate đã snapshot trên `OrderItem.commissionRate` tại lúc checkout.

**`POST /api/orders` (logic change, contract preserved)**
- `orderController.ts` từng hardcode `unitPrice * quantity * 0.9` để tính `sellerAmount` và `Math.round(subtotal * 0.1)` cho `platformFee`. Giờ BE đọc `seller.sellerProfile.commissionRate` (default `0.1` nếu thiếu) và snapshot rate + commissionAmount vào từng `OrderItem`. Aggregate `order.platformFee` = tổng `commissionAmount` của các items.
- Đơn hàng cũ (đã tạo trước feature này) sẽ hiển thị `commissionRate = 0.1`, `commissionAmount = 0` trên items vì schema mới default là `0` cho `commissionAmount` — FE vẫn có thể tính ngược từ `unitPrice × quantity` nếu cần hiển thị.

**OrderItem response shape (extended, backward compat)**
- Mỗi item trong `ApiOrder.items` giờ có thêm:
  - `commissionRate: number` (0..1) — rate snapshotted tại lúc tạo order
  - `commissionAmount: number` (VND) — phí sàn tương ứng với line item

### New error codes

- `COMMISSION_RATE_INVALID` (HTTP 400)
- `SELLER_NOT_FOUND` (HTTP 404)

### Backward compatibility

- API contract cho `GET /api/orders` / `POST /api/orders` không breaking — chỉ **mở rộng** response shape.
- Tất cả error codes mới đều có HTTP status rõ ràng.

---
## [Template] YYYY-MM-DD

### Changed

**Method /api/endpoint**

**Added**:
- field: type

**Old**:
```json
{ }
```

**New**:
```json
{ }
```

## 2026-09-29

### Added — Admin Stats Endpoint

**`GET /api/admin/stats`** — Aggregated platform stats for Admin Dashboard.

**Response (200)**:
```json
{
  "stats": {
    "pendingListings": 12,
    "soldProducts": 240,
    "totalOrders": 1024,
    "totalUsers": 5000,
    "totalSellers": 87,
    "platformProfit": 12345678
  }
}
```

**Impact**: FE `AdminScreen` tab "Tổng quan thống kê" đã có sẵn call tới `/admin/stats` (đọc `res.stats`) — endpoint giờ hoạt động, fallback UI hiển thị `0` không còn cần thiết.

---

### Added — Product Reviews

**`POST /api/products/:id/reviews`** — Buyer submits a review for a product purchased via a delivered order.

**New model**: `Review.ts` (`productId`, `buyerId`, `orderId`, `rating`, `comment`, timestamps).
- Unique compound index `(orderId, productId, buyerId)` chống duplicate.

**Request**:
```json
{ "rating": 5, "comment": "...", "orderId": "..." }
```

**Validation**:
- `rating` integer 1–5.
- `orderId` thuộc user gọi request, status ∈ { DELIVERED, COMPLETED }, và chứa product id này.

**New ErrorCodes**:
- `REVIEW_RATING_INVALID` (400)
- `REVIEW_NOT_ALLOWED` (403)
- `REVIEW_ALREADY_EXISTS` (409)

**Impact**: FE `AccountScreen` tab "Đánh giá" đã có nút "Đánh giá ngay" gọi `POST /products/{productId}/reviews` — giờ submit thành công vào DB. Backend sẽ tự chuyển order sang `COMPLETED` qua flow hiện có (FE side effect).

---

### Changed — Admin Seller Moderation Paths (Breaking + Backward Compat)

Canonical paths đổi để match FE `AdminScreen`:

| Trước (deprecated) | Sau (canonical) |
|---|---|
| `PATCH /api/admin/users/:id/approve-seller` | `PATCH /api/admin/sellers/:id/approve` |
| `PATCH /api/admin/users/:id/reject-seller` | `PATCH /api/admin/sellers/:id/reject` |

**Backward compat**: Cả 2 paths cũ vẫn hoạt động, log warning mỗi lần gọi. Nên migrate FE sang canonical.

**`GET /api/admin/pending-sellers`** response shape đổi:

**Before**:
```json
{ "sellers": [...], "total": 5 }
```

**After**:
```json
{ "users": [...], "total": 5 }
```

**Impact**: FE `AdminScreen` đã đọc `res.users` — đã khớp. Nếu còn client nào đọc `res.sellers` cần update.

---

### Added — Seller Application Flow

**`POST /api/auth/seller/apply`** — User tự đăng ký trở thành seller.

**Before**: User muốn thành seller phải admin set thủ công trong DB.

**After**: User POST application với `{ shopName, handle?, description?, ... }`. BE auto-add role `"seller"` + set `sellerProfile.status = "pending_approval"`.

**New endpoints**:
- `POST /api/auth/seller/apply` (Buyer → pending_approval)
- `GET /api/admin/pending-sellers` (Admin)
- `PATCH /api/admin/users/:id/approve-seller` (Admin → active, gửi notification)
- `PATCH /api/admin/users/:id/reject-seller` (Admin → suspended + remove role, gửi notification kèm `reason`)

**New ErrorCodes**: `SELLER_HANDLE_TAKEN` (409), `SELLER_SHOP_NAME_TAKEN` (409), `SELLER_ALREADY_APPROVED` (409).

**Impact**:
- FE có thể build form "Đăng ký bán hàng" hoàn chỉnh (UI flow mới).
- FE check `user.sellerStatus` để show banner "Đang chờ duyệt" hoặc "Đã được duyệt".
- Admin dashboard có thêm section "Seller applications" (hiển thị list pending).

### Breaking Change — Unified Error Envelope

**ALL endpoints** (mọi response 4xx/5xx).

**Before**:
```json
{ "error": "MESSAGE_OR_CODE_STRING" }
```
Mixed format: một số endpoint trả business code (`"SELLER_NOT_APPROVED"`), một số trả Vietnamese message (`"Thiếu thông tin sản phẩm bắt buộc (title/name, price, condition, size)"`).

**After**:
```json
{
  "error": {
    "code": "PRODUCT_TITLE_REQUIRED",
    "message": "Thiếu tiêu đề sản phẩm (title hoặc name)"
  }
}
```

**Impact**:
- FE PHẢI update error handler để đọc `error.code` (string enum) thay vì `error` (string tự do).
- Toàn bộ error code mapping có trong `docs/ERROR_CODES.md` (~40 codes).
- HTTP status giữ nguyên semantics: 400 (client error), 401 (auth), 403 (forbidden), 404 (not found), 409 (conflict), 422 (state machine), 500 (server), 502 (upstream), 503 (unavailable).

### Breaking Change — Admin Listings Response Shape

**`PATCH /api/admin/listings/:id/approve`**, **`PATCH /api/admin/listings/:id/reject`**

**Before**:
```json
{ "product": { /* raw Mongoose document, fields không populate */ } }
```

**After**:
```json
{ "product": { /* ApiProduct — giống GET /api/products response */ } }
```

**Impact**:
- Response giờ qua `mapProduct` → có đầy đủ field aliases (`name`/`title`, `image`/`coverImage`, seller populated, category populated).
- FE có thể render trực tiếp vào product card mà không cần normalize.

### Breaking Change — Auth Response

**`POST /api/auth/login`**, **`POST /api/auth/register`**

**Added**:
- `user._id`: ObjectId của user (cho FE dùng khi cần gọi API theo id).
- `user.sellerStatus`: `"active" | "pending_approval" | "suspended" | null` (login only, null nếu user không có sellerProfile).

**Impact**:
- FE đã check `user._id` (trước đây không có field này) sẽ bắt đầu nhận được giá trị hợp lệ.
- FE có thể dùng `user.sellerStatus === "active"` để hiển thị UI seller (nút "Đăng sản phẩm").

### Deprecated — `/api/auth/cart/merge`

**`POST /api/auth/cart/merge`** is deprecated. Use **`POST /api/cart/merge`** instead.

Both endpoints delegate to the same handler. The auth variant logs a deprecation warning and will be removed in a future release. FE mới phải dùng `/api/cart/merge`.

### Security Fix — Notification Ownership

**`PATCH /api/notifications/:id/read`**

**Before**: Bất kỳ authenticated user nào cũng có thể mark notification của user khác là đã đọc (IDOR).

**After**: Endpoint chỉ mark notification thuộc về user gọi. Nếu notification không thuộc user → `404 NOT_FOUND`.

**Impact**: FE không cần đổi gì, behavior giống cũ. Bảo mật chặt hơn.

---

## 2026-09-28

### Security Fix

**POST /api/products**

Fixed seller authorization.

**Before**:
Any authenticated user (even buyers) could reach product creation.

**After**:
Only users with `roles` including `"seller"` and `sellerProfile.status = "active"` can create products.

**HTTP 403**:
```json
{
  "error": "SELLER_NOT_APPROVED"
}
```

### Authorization Audit Fixes

**GET /api/orders/:code/shipment**
Fixed IDOR (Insecure Direct Object Reference) and PII Leak.
**Before**: Publicly accessible, exposing buyer's shipping address to anyone with the order code.
**After**: Requires JWT (`requireAuth`). Only the buyer, a seller participating in the order, or an admin can access this endpoint.

**PATCH /api/orders/:code/status**
Fixed IDOR and State-Machine Bypass.
**Before**: Any authenticated user could change the status of any order to any state.
**After**:
- **IDOR Protection**: Only the buyer, a participating seller, or an admin can update the status.
- **State-Machine Protection**:
  - Buyers can only transition to `CANCELLED` or `COMPLETED`.
  - Sellers cannot directly transition to `DELIVERING`, `DELIVERED`, or `COMPLETED` (must be handled by shipment mock or buyer).
