# API CHANGELOG

Track changes to the API contract over time to ensure synchronization between Backend and Frontend.

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
