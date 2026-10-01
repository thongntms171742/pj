# Authentication Specification

> **Source of Truth:** Spec này đồng bộ với `docs/API_CONTRACT.md` và code BE thực tế (`backend/src/controllers/authController.ts`, `backend/src/middleware/auth.ts`).
> Nếu có xung đột, tin `API_CONTRACT.md`.

## Register

**POST /api/auth/register**

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
    "_id": "string (ObjectId)",
    "name": "string",
    "email": "string",
    "roles": ["buyer"]
  }
}
```

**Errors**:
- `400` `MISSING_FIELD` — `Vui lòng điền đầy đủ thông tin`
- `409` `EMAIL_ALREADY_USED` — `Email đã được sử dụng`
- `500` `INTERNAL_ERROR` — `Lỗi hệ thống`

---

## Login

**POST /api/auth/login**

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
    "_id": "string (ObjectId)",
    "name": "string",
    "email": "string",
    "roles": ["buyer", "seller"],
    "sellerStatus": "active | pending_approval | suspended | null"
  }
}
```

> **`sellerStatus`**: trả về `user.sellerProfile.status` nếu user có seller profile, ngược lại `null`. FE dùng để quyết định có hiển thị nút "Tạo sản phẩm" không.

**Errors**:
- `400` `MISSING_FIELD` — `Vui lòng nhập email và mật khẩu`
- `401` `INVALID_CREDENTIALS` — `Email hoặc mật khẩu không đúng`
- `500` `INTERNAL_ERROR` — `Lỗi hệ thống`

---

## Cart Merge

**POST /api/auth/cart/merge**

> **Lưu ý**: endpoint này **DEPRECATED** — chỉ giữ để tương thích ngược. Endpoint chính thức là **`POST /api/cart/merge`** (xem `API_CONTRACT.md` § Cart).

---

## Seller Application Flow

**POST /api/auth/seller/apply**

User muốn trở thành seller đăng ký qua endpoint này. Trước đây phải admin set thủ công trong DB — giờ user tự apply qua UI.

**Request**:
```json
{
  "shopName": "string (3-100 chars, required)",
  "handle": "string (3-30 chars, optional - auto-gen từ email)",
  "description": "string (max 500 chars, optional)",
  "avatarUrl": "string (optional)",
  "coverImages": ["string"] (max 5, optional)
}
```

**Success (201 first-time / 200 idempotent)**:
```json
{
  "application": {
    "userId": "...",
    "shopName": "Minh Tú Vintage",
    "handle": "minhtu_vintage",
    "status": "pending_approval",
    "submittedAt": "ISO",
    "estimatedReviewDays": 3
  },
  "user": {
    "_id": "...",
    "name": "Minh Tú",
    "email": "minhtu@gmail.com",
    "roles": ["buyer", "seller"],
    "sellerStatus": "pending_approval"
  }
}
```

**Errors**:
- `400 INVALID_INPUT` — shopName/handle không hợp lệ
- `409 SELLER_ALREADY_APPROVED` — User đã là seller active
- `409 SELLER_HANDLE_TAKEN` — Handle đã được seller khác dùng
- `409 SELLER_SHOP_NAME_TAKEN` — Tên shop đã được seller khác dùng
- `500 INTERNAL_ERROR` — Lỗi hệ thống

**FE UI flow**:
1. Show form "Đăng ký bán hàng" cho user có `sellerStatus === null`.
2. Submit → success → redirect về dashboard với banner "Đang chờ admin duyệt".
3. Disable nút "Đăng sản phẩm" cho đến khi `sellerStatus === "active"` (sau khi admin duyệt).

**Admin approve flow**:
- `GET /api/admin/pending-sellers` — list applications.
- `PATCH /api/admin/users/:id/approve-seller` — duyệt (set status = active).
- `PATCH /api/admin/users/:id/reject-seller` — từ chối (set status = suspended + remove role).

## Token storage & usage

*(Frontend lưu token vào `localStorage` (key: `token`) và gửi kèm `Authorization: Bearer <token>` cho mọi request cần auth.)*

Token hết hạn sau `JWT_EXPIRES_IN` (mặc định `7d`, cấu hình qua env). Khi token hết hạn, backend trả `401 TOKEN_INVALID` — FE nên logout + redirect về trang login.

---

## Roles

Available roles: `buyer`, `seller`, `admin`.

User mới đăng ký luôn có `roles: ["buyer"]`. Role `seller` được cấp tự động khi user apply qua `POST /api/auth/seller/apply` (status = `pending_approval`, chờ admin duyệt). Role `admin` được set thủ công trong DB.

### Role-Based Access Matrix

| Endpoint | Buyer | Seller (active) | Admin |
| :--- | :---: | :---: | :---: |
| `GET /api/products` | ✅ | ✅ | ✅ |
| `POST /api/products` | ❌ | ✅ (status=active) | ❌ |
| `GET /api/orders/seller` | ❌ | ✅ | ✅ |
| `GET /api/admin/*` | ❌ | ❌ | ✅ |
| `PATCH /api/admin/listings/:id/approve` | ❌ | ❌ | ✅ |
| `PATCH /api/orders/:code/status` | ✅ (CAN/CR/DEL/COM/DIS) | ✅ (no COMPLETED) | ✅ |
| `POST /api/payments/checkout` | ✅ | ❌ | ❌ |
| `GET/POST/PATCH/DELETE /api/users/me/addresses` | ✅ | ✅ | ✅ |
| `POST /api/auth/seller/apply` | ✅ | N/A (already seller) | ❌ |

> **Lưu ý**: cột "Seller" yêu cầu `user.roles.includes("seller")` **VÀ** `user.sellerProfile.status === "active"`. Nếu seller bị `suspended` hoặc `pending_approval`, mọi endpoint chỉ-cho-seller sẽ trả `403 SELLER_NOT_APPROVED`.

> **Lưu ý (Order status)**: Buyer được dùng: `CANCELLED`, `CANCEL_REQUESTED`, `DELIVERED`, `COMPLETED`, `DISPUTED`. Buyer chỉ được trực tiếp `CANCELLED` khi order ở `PENDING_PAYMENT`/`PAID`; từ `CONFIRMED` trở đi phải dùng `CANCEL_REQUESTED`. Seller KHÔNG được tự chuyển sang `COMPLETED`.

> **Khuyến nghị cho FE**: bảng này dùng cho UI/UX rendering (ẩn/hiện nút, route guard). Backend vẫn enforce validation độc lập ở controller — không bao giờ chỉ dựa vào bảng này để bảo vệ route.

---

## Seller Status enum

`user.sellerProfile.status` (embedded subdocument trong `User`):

| Value | Ý nghĩa |
| :--- | :--- |
| `active` | Được phép tạo sản phẩm, đăng ký bán hàng thành công |
| `pending_approval` | Đang chờ admin duyệt (set qua `POST /api/auth/seller/apply`) |
| `suspended` | Bị admin tạm khóa — bị ẩn khỏi `GET /api/sellers` |

User mới đăng ký KHÔNG có `sellerProfile` (field không tồn tại). FE check `user.sellerProfile?.status === "active"` để biết user có quyền seller.