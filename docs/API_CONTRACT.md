# API Contract

> **Source of Truth:** API Contract là source of truth cho giao tiếp giữa FE và BE; Backend implementation và automated tests phải được kiểm tra để bảo đảm contract phản ánh API thực tế. Backend chịu trách nhiệm cập nhật các document này trước khi đánh dấu một tính năng là DONE. Frontend dựa vào các document này để làm thay vì phải tự đoán API behavior.

## Mục lục

1. [Quy ước chung](#quy-ước-chung)
2. [Auth](#auth)
3. [Sellers](#sellers)
4. [Products](#products)
5. [Cart](#cart)
6. [Orders](#orders)
7. [Shipments](#shipments)
8. [Payments](#payments)
9. [Notifications](#notifications)
10. [Admin](#admin)
11. [AI](#ai)
12. [Health](#health)

---

## Quy ước chung

| Mục | Giá trị |
| :--- | :--- |
| Base URL (local) | `http://localhost:4000` |
| Base URL (production) | `https://api.thriftit.com` |
| API prefix | `/api` (không dùng versioning `/v1` ở MVP) |
| Content-Type | `application/json` |
| Auth header | `Authorization: Bearer <JWT>` |
| Date format | ISO 8601 (`createdAt`, `shippedAt`, ...) |
| ID format | MongoDB ObjectId (`24 hex chars`) hoặc business code (`ORD-...`, `GHTK...`) |
| User identification | JWT chứa `{ id, email, roles[] }` (xem `AUTH_SPEC.md`) |

### Quy ước Response

**Success** — đa số các endpoint trả về object bao bọc:

```json
{ "data": {} }
```

hoặc theo resource (`{ products, orders, sellers, notifications, items, cart, seller, product, order, shipment, item }`).

**Error** — chuẩn thực tế hiện nay của backend:

```json
{ "error": "MESSAGE_OR_CODE_STRING" }
```

> **Lưu ý quan trọng:** Hiện tại backend **CHƯA** trả về cấu trúc `{ error: { code, message } }` thống nhất (xem bảng `Error Code Mapping` trong `ERROR_CODES.md`). FE nên đọc `error` như một string và phân nhánh theo nội dung chuỗi, hoặc đối chiếu với bảng đó (một số endpoint đã trả về business code kiểu `"SELLER_NOT_APPROVED"` — những endpoint khác trả về message tiếng Việt).

### Quy ước phân quyền

- `Public` — không cần JWT.
- `Buyer` — yêu cầu JWT có role `buyer` (mặc định khi đăng ký).
- `Seller` — yêu cầu JWT có role `seller` VÀ `sellerProfile.status === "active"`.
- `Admin` — yêu cầu JWT có role `admin`.

---

## Auth

### POST `/api/auth/register`

**Mục đích**: Tạo tài khoản mới (mặc định role `buyer`).

**Auth**: Public.

**Request**:
```json
{
  "name": "string (required)",
  "email": "string (required, unique, lowercase)",
  "password": "string (required, plaintext — backend hash với bcrypt)"
}
```

**Success (201)**:
```json
{
  "token": "JWT",
  "user": {
    "name": "string",
    "email": "string",
    "roles": ["buyer"]
  }
}
```

**Errors**:
- `400` `Vui lòng điền đầy đủ thông tin`
- `409` `Email đã được sử dụng`
- `500` `Lỗi hệ thống`

---

### POST `/api/auth/login`

**Mục đích**: Đăng nhập, trả về JWT.

**Auth**: Public.

**Request**:
```json
{
  "email": "string (required)",
  "password": "string (required)"
}
```

**Success (200)**:
```json
{
  "token": "JWT",
  "user": {
    "name": "string",
    "email": "string",
    "roles": ["buyer", "seller"]
  }
}
```

**Errors**:
- `400` `Vui lòng nhập email và mật khẩu`
- `401` `Email hoặc mật khẩu không đúng`
- `500` `Lỗi hệ thống`

> **Token storage**: FE lưu token vào `localStorage` (key: `token`) và gửi kèm `Authorization: Bearer <token>` cho mọi request cần auth.

---

### POST `/api/auth/seller/apply`

**Mục đích**: User đăng ký trở thành người bán (seller application flow).

**Auth**: Required (Buyer — user chưa phải seller active).

**Request**:
```json
{
  "shopName": "string (required, 3–100 chars, unique)",
  "handle": "string (optional, 3–30 chars, alphanumeric + _ + .) — tự động sinh từ email nếu bỏ trống",
  "description": "string (optional, max 500 chars)",
  "avatarUrl": "string (optional, URL)",
  "coverImages": ["string"] // optional, max 5 URLs
}
```

**Success (201)** — first-time application:
```json
{
  "application": {
    "userId": "string",
    "shopName": "string",
    "handle": "string",
    "status": "pending_approval",
    "submittedAt": "ISO date",
    "estimatedReviewDays": 3
  },
  "user": {
    "_id": "string",
    "name": "string",
    "email": "string",
    "roles": ["buyer", "seller"],
    "sellerStatus": "pending_approval"
  }
}
```

**Success (200)** — idempotent update (user đã apply trước đó, vẫn pending):
```json
{ "application": { /* same shape */ }, "user": { /* same shape */ } }
```

**Errors**:
- `400` `INVALID_INPUT` — `shopName phải có độ dài từ 3 đến 100 ký tự`
- `400` `INVALID_INPUT` — `handle chỉ chấp nhận chữ cái, số, dấu _ và . (độ dài 3-30)`
- `401` `UNAUTHORIZED` — Chưa đăng nhập
- `404` `ACCOUNT_NOT_FOUND` — User không tồn tại
- `409` `SELLER_ALREADY_APPROVED` — User đã là seller active (không cần apply)
- `409` `SELLER_HANDLE_TAKEN` — `Handle "..." đã được sử dụng bởi người bán khác`
- `409` `SELLER_SHOP_NAME_TAKEN` — `Tên shop "..." đã được sử dụng`
- `500` `INTERNAL_ERROR` — Lỗi hệ thống

> **Side effects**:
> - Thêm role `"seller"` vào `user.roles` (FE có thể check `user.roles.includes("seller")` + `user.sellerStatus === "pending_approval"` để show banner "Đang chờ duyệt").
> - Set `user.sellerProfile = { ..., status: "pending_approval" }`.
> - User KHÔNG THỂ tạo sản phẩm cho đến khi admin duyệt (vẫn trả `403 SELLER_NOT_APPROVED`).

> **FE workflow**:
> 1. Show form "Đăng ký bán hàng" với các field trên.
> 2. Submit → gọi endpoint này.
> 3. Nhận `user.sellerStatus === "pending_approval"` → show banner "Đang chờ admin duyệt (~3 ngày)".
> 4. Disable nút tạo sản phẩm cho đến khi login lại và thấy `sellerStatus === "active"`.

---

### POST `/api/auth/cart/merge`

**Mục đích**: ⚠️ **DEPRECATED** — dùng `POST /api/cart/merge` thay thế.

**Auth**: Required (Buyer).

**Request**:
```json
{
  "items": [
    { "productId": "string (ObjectId)", "quantity": "number" }
  ]
}
```

**Success (200)**:
```json
{
  "items": [ /* ApiCartItem[] — cùng shape với /api/cart */ ]
}
```

**Errors**:
- `400` `ITEMS_REQUIRED` — `items array is required`
- `500` `INTERNAL_ERROR` — `Lỗi hệ thống`

> **Deprecation note (2026-09-29)**: Endpoint này giữ để tương thích ngược với FE clients cũ. BE đã log warning mỗi lần gọi để theo dõi traffic. Sẽ bị xóa trong release tiếp theo. FE mới **KHÔNG ĐƯỢC** gọi endpoint này — dùng `/api/cart/merge`.

---

## Sellers

### GET `/api/sellers`

**Mục đích**: Danh sách tất cả seller đang hoạt động (không bao gồm `suspended`).

**Auth**: Public.

**Success (200)**:
```json
{
  "sellers": [
    {
      "_id": "string",
      "id": "string (alias _id)",
      "shopName": "string",
      "name": "string (alias shopName)",
      "handle": "string",
      "description": "string",
      "avatarUrl": "string",
      "avatar": "string (alias avatarUrl)",
      "coverImages": ["string"],
      "thumbs": ["string (alias coverImages)"],
      "rating": 5.0,
      "totalTransactions": 0,
      "transactions": 0,
      "totalRevenue": 0,
      "commissionRate": 0.1,
      "status": "active",
      "email": "string"
    }
  ],
  "total": "number"
}
```

**Errors**:
- `500` `Lỗi hệ thống`

---

### GET `/api/sellers/me`

**Mục đích**: Lấy profile của seller đang đăng nhập.

**Auth**: Required (Any authenticated user — trả về seller object nếu user có role `seller`).

**Success (200)**:
```json
{ "seller": { /* ApiSeller — same shape như GET /api/sellers */ } }
```

**Errors**:
- `404` `Không tìm thấy tài khoản`
- `500` `Lỗi hệ thống`

---

### GET `/api/sellers/:idOrHandle`

**Mục đích**: Tra cứu seller theo ObjectId, handle (có/không có tiền tố `@`), email hoặc shopName.

**Auth**: Public.

**Path params**:
- `idOrHandle` — ObjectId 24 hex, hoặc `@handle`, hoặc `handle`, hoặc email, hoặc shopName (case-insensitive).

**Success (200)**:
```json
{ "seller": { /* ApiSeller */ } }
```

**Errors**:
- `404` `Không tìm thấy người bán`
- `500` `Lỗi hệ thống`

---

### GET `/api/sellers/:idOrHandle/products`

**Mục đích**: Danh sách sản phẩm `active` của một seller.

**Auth**: Public.

**Path params**: `idOrHandle` (giống trên).

**Success (200)**:
```json
{
  "products": [ /* ApiProduct[] — cùng shape với /api/products */ ],
  "total": "number"
}
```

**Errors**:
- `404` `Không tìm thấy người bán`
- `500` `Lỗi hệ thống`

---

## Products

### GET `/api/products`

**Mục đích**: Danh sách sản phẩm (mặc định chỉ trả về `active`).

**Auth**: Public.

**Query params**:
| Name | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `category` | string | No | Tên hoặc slug của category |
| `seller` | string | No | Handle (có/không `@`), email hoặc tên user của seller |
| `sellerId` | string | No | ObjectId của seller |
| `status` | string | No | Filter theo status — mặc định `active` |

**Success (200)**:
```json
{
  "products": [
    {
      "_id": "string",
      "id": "string (alias _id)",
      "title": "string",
      "name": "string (alias title — cho ProductCard FE)",
      "description": "string",
      "price": "number",
      "condition": "number (0–100, %)",
      "size": "string",
      "quantity": "number",
      "status": "active",
      "reservedUntil": "ISO date | null",
      "reservedByOrderId": "string | null",
      "coverImage": "string",
      "image": "string (alias coverImage)",
      "views": "number",
      "likes": "number",
      "location": "string",
      "seller": "string (handle, ví dụ 'minhtu.vintage')",
      "sellerName": "string (shopName)",
      "sellerAvatar": "string (avatarUrl)",
      "sellerId": {
        "_id": "string",
        "id": "string (alias _id)",
        "handle": "string",
        "shopName": "string",
        "name": "string (alias shopName)",
        "avatarUrl": "string",
        "avatar": "string (alias avatarUrl)",
        "rating": "number"
      },
      "categoryId": { "_id": "string", "name": "string", "slug": "string" } | null,
      "category": "string (name)"
    }
  ],
  "total": "number"
}
```

**Errors**:
- `500` `Lỗi hệ thống`

---

### GET `/api/products/mine`

**Alias**: `/api/products/seller` (cùng handler).

**Mục đích**: Sản phẩm của seller đang đăng nhập (mọi status) + stats dashboard.

**Auth**: Required (Any authenticated user — nhưng chỉ trả dữ liệu đúng của user gọi).

**Query params**:
- `status` — filter theo status (string). Không truyền hoặc truyền `all` thì trả tất cả.

**Success (200)**:
```json
{
  "products": [ /* ApiProduct[] */ ],
  "stats": {
    "totalProducts": "number",
    "activeProducts": "number",
    "pendingProducts": "number",
    "soldProducts": "number",
    "totalViews": "number",
    "totalLikes": "number",
    "estimatedRevenue": "number (sum của price các sp sold)"
  },
  "total": "number"
}
```

**Errors**:
- `500` `Lỗi hệ thống`

---

### POST `/api/products`

**Mục đích**: Tạo sản phẩm mới. Mặc định status = `pending` (chờ admin duyệt).

**Auth**: Required (JWT).

**Authorization**: User phải có `roles.includes("seller")` VÀ `sellerProfile.status === "active"`.

**Request**:
```json
{
  "title": "string (hoặc 'name')",
  "name": "string (alias title)",
  "price": "number (required, ≥ 0)",
  "condition": "number (required, 0–100, % tình trạng)",
  "size": "string (required)",
  "quantity": "number (default 1, min 1)",
  "description": "string (optional)",
  "coverImage": "string (hoặc 'image', optional)",
  "image": "string (alias coverImage)",
  "categoryId": "string (ObjectId, optional)",
  "category": "string (tên category, fallback nếu không có categoryId)"
}
```

**Success (201)**:
```json
{ "product": { /* ApiProduct */ } }
```

**Errors**:
- `400` `Thiếu thông tin sản phẩm bắt buộc (title/name, price, condition, size)`
- `400` `Số lượng sản phẩm phải lớn hơn hoặc bằng 1`
- `401` `Chưa đăng nhập` hoặc `Token không hợp lệ hoặc đã hết hạn`
- `403` `SELLER_NOT_APPROVED` — user không có role seller hoặc `sellerProfile.status !== "active"`
- `500` `Lỗi hệ thống`

---

## Cart

> **Auth**: Required (Buyer) cho toàn bộ endpoints trong section này.

### GET `/api/cart`

**Mục đích**: Lấy cart hiện tại của user.

**Success (200)**:
```json
{
  "cart": { "_id": "string (cart ObjectId)" },
  "items": [
    {
      "_id": "string (cart item ObjectId)",
      "cartId": "string",
      "productId": {
        "_id": "string",
        "title": "string",
        "description": "string",
        "price": "number",
        "condition": "number",
        "size": "string",
        "quantity": "number (stock hiện tại)",
        "status": "active",
        "coverImage": "string",
        "views": "number",
        "likes": "number",
        "sellerId": { /* seller info inline */ },
        "categoryId": { "_id": "string", "name": "string", "slug": "string" } | null
      },
      "quantity": "number (số lượng trong giỏ)",
      "priceSnapshot": "number (giá lúc add vào giỏ)",
      "checked": "boolean (true = chọn để checkout)"
    }
  ]
}
```

**Errors**:
- `500` `Lỗi hệ thống`

---

### POST `/api/cart/items`

**Mục đích**: Thêm sản phẩm vào giỏ (upsert — nếu đã có thì cộng dồn `quantity`).

**Request**:
```json
{
  "productId": "string (ObjectId, required)",
  "quantity": "number (default 1, min 1)"
}
```

**Success (201)**:
```json
{ "item": { /* ApiCartItem */ } }
```

**Errors**:
- `400` `productId is required`
- `400` `Sản phẩm hiện không mở bán hoặc đã được giữ/bán` (status !== `active`)
- `400` `Sản phẩm đã hết hàng` (quantity <= 0)
- `400` `Bạn không thể thêm sản phẩm của chính mình vào giỏ hàng`
- `400` `Số lượng yêu cầu (X) vượt quá số lượng còn lại trong kho (Y)`
- `404` `Sản phẩm không tồn tại`
- `500` `Lỗi hệ thống`

---

### PATCH `/api/cart/items/:id`

**Mục đích**: Cập nhật `quantity` hoặc `checked`. Nếu `quantity <= 0` thì backend tự xóa item.

**Request**:
```json
{
  "quantity": "number (optional)",
  "checked": "boolean (optional)"
}
```

**Success (200)** — khi quantity > 0:
```json
{ "item": { /* ApiCartItem */ } }
```

**Success (200)** — khi quantity <= 0 (auto-delete):
```json
{
  "message": "Đã xóa sản phẩm khỏi giỏ hàng",
  "deleted": true,
  "_id": "string (item id đã xóa)"
}
```

**Errors**:
- `400` `Số lượng vượt quá số lượng trong kho (X)`
- `404` `Giỏ hàng không tồn tại` / `Sản phẩm không có trong giỏ hàng`
- `500` `Lỗi hệ thống`

---

### DELETE `/api/cart/items/:id`

**Success**: `204 No Content`

**Errors**:
- `404` `Giỏ hàng không tồn tại` / `Sản phẩm không có trong giỏ hàng`
- `500` `Lỗi hệ thống`

---

### DELETE `/api/cart/clear`

**Alias**: `DELETE /api/cart` (cùng handler).

**Mục đích**: Xóa tất cả cart items.

**Success (200)**:
```json
{ "success": true, "message": "Đã làm trống giỏ hàng" }
```

---

### POST `/api/cart/merge`

**Mục đích**: Gộp cart từ client (vd: guest cart trong localStorage) vào cart user khi đăng nhập.

**Request**:
```json
{ "items": [{ "productId": "string", "quantity": "number" }] }
```

**Success (200)**:
```json
{ "items": [ /* ApiCartItem[] */ ] }
```

> **Lưu ý**: Có 2 endpoint cùng chức năng. **`/api/cart/merge` là CHÍNH THỨC**, `/api/auth/cart/merge` (legacy) sẽ bị xóa. FE chỉ nên dùng `/api/cart/merge`.

---

## Orders

> **Auth**: Required (JWT) cho toàn bộ section này.

### GET `/api/orders`

**Mục đích**: Buyer lấy tất cả đơn hàng của mình.

**Query params**:
- `status` (string, uppercase) — filter theo order status.

**Success (200)**:
```json
{
  "orders": [ /* ApiOrder[] */ ],
  "total": "number"
}
```

---

### GET `/api/orders/seller`

**Mục đích**: Seller lấy tất cả đơn hàng có chứa sản phẩm của mình.

> **Quan trọng**: route này được đăng ký TRƯỚC `/:id` trong `routes/orders.ts` để tránh bị match nhầm thành `id="seller"`.

**Query params**: `status` (string, uppercase).

**Success (200)**:
```json
{ "orders": [ /* ApiOrder[] */ ], "total": "number" }
```

---

### POST `/api/orders`

**Mục đích**: Tạo đơn hàng từ cart items đã `checked` hoặc từ payload trực tiếp.

**Authorization**: Buyer.

**Request** (một trong hai dạng):
```json
{
  "shippingName": "string",
  "shippingPhone": "string",
  "shippingAddress": "string",
  "paymentMethod": "COD | ONLINE | card (default COD)",
  "idempotencyKey": "string (optional, recommended)",
  "items": [
    {
      "productId": "string (hoặc 'id')",
      "id": "string (alias productId)",
      "quantity": "number (hoặc 'qty', default 1)"
    }
  ]
}
```
Nếu `items` rỗng/không có, backend tự lấy các cart items có `checked: true`.

**Success (201)**:
```json
{
  "order": {
    "_id": "string",
    "orderCode": "ORD-XXXXXXXX",
    "buyerId": "string",
    "items": [
      {
        "productId": "string",
        "sellerId": "string",
        "productName": "string",
        "productImageUrl": "string",
        "unitPrice": "number",
        "quantity": "number",
        "conditionSnapshot": "number",
        "sellerAmount": "number (unitPrice × quantity × 0.9)"
      }
    ],
    "subtotal": "number",
    "shippingFee": 30000,
    "platformFee": "number (10% subtotal)",
    "discount": 0,
    "totalAmount": "number (subtotal + shippingFee)",
    "status": "CONFIRMED (COD) | PENDING_PAYMENT (online)",
    "statusHistory": [
      {
        "status": "string",
        "by": "string (email | 'system' | 'payment_gateway')",
        "at": "ISO date",
        "reason": "string (optional)"
      }
    ],
    "paymentMethod": "string",
    "paymentId": "string",
    "paidAt": "ISO date | null",
    "shippingName": "string",
    "shippingPhone": "string",
    "shippingAddress": "string",
    "trackingNumber": "string (empty khi mới tạo)",
    "shippingProvider": "string",
    "trackingUrl": "string",
    "pickupInfo": "object | null",
    "shippedAt": "ISO date | null",
    "estimatedDeliveryAt": "ISO date | null",
    "deliveredAt": "ISO date | null",
    "idempotencyKey": "string",
    "createdAt": "ISO date"
  }
}
```

**Errors**:
- `400` `Giỏ hàng trống`
- `400` `Không có sản phẩm nào được chọn trong giỏ hàng`
- `400` `Sản phẩm "X" hiện không còn mở bán (status)`
- `400` `Sản phẩm "X" chỉ còn lại Y cái`
- `400` `Bạn không thể tự mua sản phẩm của chính mình ("X")`
- `404` `Sản phẩm không tồn tại: <id>`
- `500` `Lỗi hệ thống`

> **Side effects khi tạo đơn**:
> - **COD**: status = `CONFIRMED` ngay. Stock được trừ ngay (`product.quantity -= item.quantity`; nếu =0 thì `status = "sold"`). Notification gửi buyer + mọi seller trong đơn.
> - **Online (card/ONLINE)**: status = `PENDING_PAYMENT`. Stock tạm reserve: `product.status = "reserved"`, `reservedUntil = now + 30m`, `reservedByOrderId = order._id`.

---

### GET `/api/orders/:id`

**Mục đích**: Lấy chi tiết đơn hàng theo `orderCode` hoặc ObjectId.

**Authorization**: Buyer của đơn, seller có item trong đơn, hoặc admin.

**Success (200)**:
```json
{ "order": { /* ApiOrder */ } }
```

**Errors**:
- `403` `Bạn không có quyền truy cập đơn hàng này`
- `404` `Không tìm thấy đơn hàng`
- `500` `Lỗi hệ thống`

---

### PATCH `/api/orders/:code/status`

**Mục đích**: Chuyển trạng thái đơn hàng (theo state machine `VALID_TRANSITIONS` trong `Order.ts`).

**Authorization**: Buyer / participating Seller / Admin (xem role-based restrictions bên dưới).

**Request**:
```json
{
  "status": "OrderStatus (string, uppercase)",
  "reason": "string (optional)"
}
```

**Valid transitions**:
```
PENDING_PAYMENT → PAID, CONFIRMED, CANCELLED
PAID            → CONFIRMED, PACKING, CANCELLED, REFUNDED
CONFIRMED       → PACKING, SHIPPING, CANCELLED
PACKING         → SHIPPING, CANCELLED
SHIPPING        → DELIVERING, DELIVERED, CANCELLED
DELIVERING      → DELIVERED, COMPLETED
DELIVERED       → COMPLETED, DISPUTED
COMPLETED       → (terminal)
CANCELLED       → (terminal)
DISPUTED        → REFUNDED, COMPLETED
REFUNDED        → (terminal)
```

**Role-based restrictions** (ngoài state machine):
- **Buyer-only** (không phải seller/admin): chỉ được chuyển sang `CANCELLED` hoặc `COMPLETED`.
- **Seller** (không phải admin): KHÔNG được tự chuyển sang `DELIVERING`, `DELIVERED`, `COMPLETED` — các bước này phải do shipment mock hoặc buyer thực hiện.
- **Admin**: bỏ qua mọi role-based restriction (vẫn phải tuân state machine).

**Success (200)**:
```json
{ "order": { /* ApiOrder (đã cập nhật status) */ } }
```

**Errors**:
- `400` `Thiếu trạng thái mới`
- `403` `Bạn không có quyền cập nhật đơn hàng này`
- `403` `Người mua chỉ có thể HỦY hoặc HOÀN TẤT đơn hàng`
- `403` `Người bán không thể tự cập nhật trạng thái Giao hàng hoặc Hoàn tất`
- `404` `Không tìm thấy đơn hàng`
- `422` `Không thể chuyển từ trạng thái A sang B` (state machine violation)

---

## Shipments

### POST `/api/orders/:code/shipment`

**Mục đích**: Seller tạo vận đơn (mock GHTK). Sinh tracking number, estimated delivery, timeline khởi tạo.

**Authorization**: Seller có item trong đơn hoặc Admin.

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
    "note": "string (optional)"
  }
}
```

**Success (201)**:
```json
{
  "shipment": {
    "id": "string (order ObjectId)",
    "orderId": "string (orderCode)",
    "provider": "Giao hàng tiết kiệm",
    "trackingNumber": "GHTK9XXXXXXXX",
    "trackingUrl": "https://i.ghtk.vn/<tracking>",
    "status": "IN_TRANSIT",
    "shippedAt": "ISO date",
    "estimatedDeliveryAt": "ISO date",
    "events": [
      { "status": "CREATED",   "description": "...", "timestamp": "ISO", "location": "..." },
      { "status": "PICKED_UP", "description": "...", "timestamp": "ISO", "location": "..." },
      { "status": "IN_TRANSIT","description": "...", "timestamp": "ISO", "location": "..." }
    ]
  }
}
```

**Side effects**:
- Order status chuyển sang `SHIPPING`.
- Ghi `shippingProvider`, `trackingNumber`, `trackingUrl`, `pickupInfo`, `shippedAt`, `estimatedDeliveryAt`, `shippingEvents`.
- Gửi notification cho buyer.

**Errors**:
- `400` `Đơn hàng này đã được tạo vận đơn trước đó` (status đã là `SHIPPING`/`DELIVERING`/`DELIVERED`)
- `400` `Không thể tạo vận đơn cho đơn hàng đã hủy`
- `403` `Bạn không có quyền tạo vận đơn cho đơn hàng này`
- `404` `Không tìm thấy đơn hàng`
- `500` `Lỗi hệ thống`

---

### GET `/api/orders/:code/shipment`

**Mục đích**: Lấy thông tin vận đơn và timeline giao hàng.

**Authorization**: Buyer của đơn, participating Seller, hoặc Admin (chống PII leak — sửa sau security audit 2026-09-28).

**Success (200)**:
```json
{
  "shipment": {
    "id": "string",
    "orderId": "string (orderCode)",
    "provider": "Giao hàng tiết kiệm",
    "trackingNumber": "string",
    "trackingUrl": "string",
    "status": "PENDING | CREATED | PICKED_UP | IN_TRANSIT | DELIVERING | DELIVERED | CANCELLED",
    "shippedAt": "ISO date | undefined",
    "estimatedDeliveryAt": "ISO date",
    "deliveredAt": "ISO date | undefined",
    "events": [
      {
        "status": "CREATED | PICKED_UP | IN_TRANSIT | DELIVERING | DELIVERED | CANCELLED",
        "description": "string",
        "timestamp": "ISO date",
        "location": "string"
      }
    ]
  }
}
```

> **Mapping**: shipment status được derive từ order status (xem `getOrderShipment` trong `orderController.ts`):
> - Order `DELIVERED`/`COMPLETED` → shipment `DELIVERED`
> - Order `DELIVERING` → shipment `DELIVERING`
> - Order `SHIPPING` → shipment `IN_TRANSIT`
> - Order `PACKING` → shipment `PICKED_UP`
> - Order `CANCELLED` → shipment `CANCELLED`
> - Có `trackingNumber` nhưng status khác → shipment `CREATED`
> - Mặc định: `PENDING`

**Errors**:
- `403` `Bạn không có quyền xem thông tin vận chuyển của đơn hàng này`
- `404` `Không tìm thấy đơn hàng`
- `500` `Lỗi hệ thống`

---

## Payments

### POST `/api/payments/checkout`

**Mục đích**: Mock thanh toán online. Đẩy order `PENDING_PAYMENT` → `PAID` → `CONFIRMED`, trừ stock, gửi notification.

**Auth**: Required (Buyer — buyerId của order phải khớp user gọi).

**Request**:
```json
{
  "orderId": "string (ObjectId hoặc orderCode)",
  "method": "string (default 'card')",
  "cardLast4": "string (default '1234', chỉ để log)"
}
```

**Success (200)** — trả về `ApiOrder` đã cập nhật:
```json
{ "order": { /* ApiOrder */ } }
```

**Idempotent**: nếu order đã ở `PAID` hoặc `CONFIRMED`, trả về state hiện tại mà không xử lý lại.

**Errors**:
- `400` `orderId is required`
- `404` `Không tìm thấy đơn hàng`
- `422` `Đơn hàng đang ở trạng thái X, không thể thanh toán` (chỉ nhận `PENDING_PAYMENT`)
- `500` `Lỗi hệ thống`

---

## Notifications

### GET `/api/notifications`

**Mục đích**: Lấy 50 notification mới nhất của user đang đăng nhập.

**Auth**: Required (Any authenticated user).

**Success (200)**:
```json
{
  "notifications": [
    {
      "_id": "string",
      "userId": "string",
      "type": "order",
      "title": "string",
      "message": "string",
      "isRead": "boolean",
      "createdAt": "ISO date"
    }
  ]
}
```

---

### PATCH `/api/notifications/:id/read`

**Mục đích**: Đánh dấu notification đã đọc.

**Success (200)**:
```json
{ "success": true }
```

> **Lưu ý**: hiện tại handler `markAsRead` không kiểm tra ownership của notification (luôn `findByIdAndUpdate`). Nếu cần bảo mật chặt hơn, báo BE cập nhật.

---

## Admin

> **Auth**: Required + role `admin` (middleware `requireAdmin`).

### GET `/api/admin/pending-listings`

**Mục đích**: Danh sách sản phẩm `pending` chờ duyệt.

**Success (200)**:
```json
{
  "products": [
    {
      "_id": "string",
      "title": "string",
      "description": "string",
      "price": "number",
      "condition": "number",
      "size": "string",
      "quantity": "number",
      "status": "pending",
      "coverImage": "string",
      "views": "number",
      "likes": "number",
      "location": "string",
      "sellerId": {
        "_id": "string",
        "handle": "string",
        "shopName": "string",
        "avatarUrl": "string",
        "rating": "number"
      },
      "categoryId": { "_id": "string", "name": "string", "slug": "string" } | null
    }
  ]
}
```

---

### PATCH `/api/admin/listings/:id/approve`

**Mục đích**: Duyệt sản phẩm — set status = `active`.

**Success (200)**:
```json
{ "product": { /* ApiProduct — cùng shape với GET /api/products */ } }
```

**Errors**:
- `404` `PRODUCT_NOT_FOUND` — `Sản phẩm không tồn tại`
- `500` `INTERNAL_ERROR` — `Lỗi hệ thống`

---

### PATCH `/api/admin/listings/:id/reject`

**Mục đích**: Từ chối sản phẩm — set status = `archived`.

**Success (200)**:
```json
{ "product": { /* ApiProduct — cùng shape với GET /api/products */ } }
```

**Errors**:
- `404` `PRODUCT_NOT_FOUND` — `Sản phẩm không tồn tại`
- `500` `INTERNAL_ERROR` — `Lỗi hệ thống`

---

### GET `/api/admin/pending-sellers`

**Mục đích**: Danh sách user đang chờ admin duyệt để trở thành seller.

**Auth**: Required + role `admin`.

**Success (200)**:
```json
{
  "users": [ /* ApiSeller — same shape với GET /api/sellers */ ],
  "total": "number"
}
```

> **Note**: Response key đổi từ `sellers` (cũ) thành `users` để khớp FE `AdminScreen` (`res.users`). Backward-compat: key `sellers` không còn được trả — FE nào đang đọc key này cần update.

**Errors**:
- `500` `INTERNAL_ERROR` — Lỗi hệ thống

---

### PATCH `/api/admin/sellers/:id/approve`

**Mục đích**: Phê duyệt seller application — set `sellerProfile.status = "active"`. User có thể tạo sản phẩm ngay sau khi login lại.

**Auth**: Required + role `admin`.

> **Path alias**: `/api/admin/users/:id/approve-seller` vẫn hoạt động nhưng **deprecated** — log warning mỗi lần gọi. Nên chuyển sang canonical path `/api/admin/sellers/:id/approve`.

**Success (200)** — newly approved:
```json
{
  "seller": { /* ApiSeller */ },
  "alreadyApproved": false
}
```

**Success (200)** — idempotent (đã active sẵn):
```json
{
  "seller": { /* ApiSeller */ },
  "alreadyApproved": true
}
```

**Side effects**:
- Set `sellerProfile.status = "active"`.
- Gửi notification cho user thông báo đã được phê duyệt.

**Errors**:
- `400` `INVALID_INPUT` — User chưa đăng ký seller (chưa có `sellerProfile`)
- `404` `ACCOUNT_NOT_FOUND` — User không tồn tại
- `500` `INTERNAL_ERROR` — Lỗi hệ thống

---

### PATCH `/api/admin/sellers/:id/reject`

**Mục đích**: Từ chối seller application — set `sellerProfile.status = "suspended"` + xóa role `"seller"` khỏi `user.roles`.

**Auth**: Required + role `admin`.

> **Path alias**: `/api/admin/users/:id/reject-seller` vẫn hoạt động nhưng **deprecated** — log warning mỗi lần gọi. Nên chuyển sang canonical path `/api/admin/sellers/:id/reject`.

**Request**:
```json
{
  "reason": "string (optional) — lý do từ chối sẽ gửi qua notification"
}
```

**Success (200)**:
```json
{
  "seller": { /* ApiSeller — status = "suspended" */ },
  "rejected": true
}
```

**Side effects**:
- Set `sellerProfile.status = "suspended"`.
- Xóa `"seller"` khỏi `user.roles`.
- Gửi notification cho user (kèm `reason` nếu có).

**Errors**:
- `400` `INVALID_INPUT` — User chưa đăng ký seller (chưa có `sellerProfile`)
- `404` `ACCOUNT_NOT_FOUND` — User không tồn tại
- `500` `INTERNAL_ERROR` — Lỗi hệ thống

---

### GET `/api/admin/stats`

**Mục đích**: Thống kê tổng quan cho Admin Dashboard — số liệu đếm theo collection + tổng platform profit.

**Auth**: Required + role `admin`.

**Success (200)**:
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

**Field meaning**:
- `pendingListings` — số sản phẩm đang `status = "pending"` chờ duyệt.
- `soldProducts` — số sản phẩm đã `status = "sold"`.
- `totalOrders` — tổng số đơn hàng (mọi trạng thái).
- `totalUsers` — tổng số user trong hệ thống.
- `totalSellers` — số user có role `"seller"`.
- `platformProfit` — tổng `platformFee` (VND) từ tất cả orders, dùng cho dashboard tính hoa hồng C2C.

**Errors**:
- `401` `UNAUTHORIZED` — Thiếu JWT
- `403` `FORBIDDEN` — Không phải admin
- `500` `INTERNAL_ERROR` — Lỗi hệ thống

---

## Reviews

### POST `/api/products/:id/reviews`

**Mục đích**: Buyer đánh giá sản phẩm sau khi đơn hàng được giao thành công. Mỗi (orderId, productId, buyerId) chỉ được review 1 lần.

**Auth**: Required (JWT, role `buyer`).

**Request**:
```json
{
  "rating": 5,
  "comment": "Sản phẩm đẹp, đúng mô tả",
  "orderId": "65f0a1b2c3d4e5f6a7b8c9d0"
}
```

**Validation**:
- `rating`: integer 1–5 (bắt buộc).
- `orderId`: ObjectId của order đã mua sản phẩm (bắt buộc).
- `comment`: string tối đa 1000 ký tự (optional).
- Order phải thuộc về user gọi request (`buyerId` match).
- Order phải có `status ∈ { DELIVERED, COMPLETED }`.
- Product phải nằm trong `order.items`.

**Success (201)**:
```json
{
  "review": {
    "_id": "65f0a2b3c4d5e6f7a8b9c0d1",
    "productId": "65e9a0b1c2d3e4f5a6b7c8d9",
    "buyerId": "65d8c9d0e1f2a3b4c5d6e7f8",
    "orderId": "65f0a1b2c3d4e5f6a7b8c9d0",
    "rating": 5,
    "comment": "Sản phẩm đẹp, đúng mô tả",
    "createdAt": "2026-09-29T10:30:00.000Z"
  }
}
```

**Errors**:
- `400` `REVIEW_RATING_INVALID` — Rating không phải integer 1–5.
- `400` `ORDER_ID_REQUIRED` — Thiếu `orderId`.
- `403` `REVIEW_NOT_ALLOWED` — Order không thuộc user, hoặc chưa giao, hoặc product không có trong order.
- `404` `PRODUCT_NOT_FOUND` — Sản phẩm không tồn tại.
- `404` `ORDER_NOT_FOUND` — Đơn hàng không tồn tại.
- `409` `REVIEW_ALREADY_EXISTS` — Đã review (orderId, productId, buyerId) này rồi.
- `500` `INTERNAL_ERROR` — Lỗi hệ thống.

---

## AI

> **Auth**: Public (cả 3 endpoint). Yêu cầu backend có cấu hình `GEMINI_API_KEY`; nếu thiếu sẽ trả `503`.

### POST `/api/ai/search`

**Mục đích**: Phân tích truy vấn text/ảnh thành `{ searchText, category, styles[] }` để FE dùng làm filter hint cho `GET /api/products`.

**Request**:
```json
{
  "query": "string (optional, 2–500 chars)",
  "image": {
    "mimeType": "image/jpeg | image/png | image/webp",
    "data": "string (base64, có/không có prefix 'data:image/...;base64,')"
  }
}
```
- Phải có ít nhất một trong `query` hoặc `image`.
- Ảnh base64 ≤ ~6MB.

**Success (200)**:
```json
{
  "searchText": "string (từ khóa gợi ý)",
  "category": "Áo | Quần | Váy | Áo khoác | Phụ kiện | ''",
  "styles": ["string (tối đa 5)"]
}
```

**Errors**:
- `400` `Mô tả tìm kiếm cần từ 2 đến 500 ký tự`
- `400` `Ảnh tìm kiếm không hợp lệ`
- `400` `Ảnh cần là JPG, PNG hoặc WebP và tối đa 6MB`
- `400` `Hãy nhập mô tả hoặc chọn ảnh tham khảo`
- `502` Lỗi upstream AI (response.message chứa chi tiết)
- `503` `GEMINI_API_KEY chưa được cấu hình trên backend`

---

### POST `/api/ai/analyze-listing`

**Mục đích**: Phân tích ảnh sản phẩm seller upload — gợi ý title, description, category, condition.

**Request**:
```json
{
  "image": {
    "mimeType": "image/jpeg | image/png | image/webp",
    "data": "string (base64)"
  }
}
```

**Success (200)**:
```json
{
  "title": "string (≤ 120 chars)",
  "description": "string (≤ 1000 chars)",
  "category": "string (phải nằm trong danh sách category đang có trong DB)",
  "condition": "number (30–100)",
  "conditionNotes": "string (≤ 300 chars)"
}
```

**Errors**:
- `400` `Ảnh cần là JPG, PNG hoặc WebP và tối đa 6MB`
- `502` Lỗi upstream AI
- `503` Thiếu `GEMINI_API_KEY`

---

### POST `/api/ai/recommendations`

**Mục đích**: Gợi ý sản phẩm dựa trên lịch sử viewed/liked.

**Request**:
```json
{
  "viewed": ["string (ObjectId)"],
  "liked": ["string (ObjectId)"]
}
```
Mỗi array tối đa 30 id (ObjectId hợp lệ).

**Success (200)**:
```json
{
  "products": [ /* ApiProduct[] (tối đa 20, đã loại trừ viewed+liked) */ ],
  "personalized": "boolean (true nếu history.length > 0)"
}
```

**Errors**:
- `500` `Không thể tải gợi ý sản phẩm`

---

## Health

### GET `/api/health`

**Auth**: Public.

**Success (200)**:
```json
{
  "status": "ok",
  "timestamp": "ISO date"
}
```

### Wildcard 404

Mọi request tới `/api/*` không match route sẽ trả:
```json
{ "error": "Endpoint không tồn tại" }
```
với HTTP 404.