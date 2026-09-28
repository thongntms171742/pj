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

## Token storage & usage

*(Frontend lưu token vào `localStorage` (key: `token`) và gửi kèm `Authorization: Bearer <token>` cho mọi request cần auth.)*

Token hết hạn sau `JWT_EXPIRES_IN` (mặc định `7d`, cấu hình qua env). Khi token hết hạn, backend trả `401 TOKEN_INVALID` — FE nên logout + redirect về trang login.

---

## Roles

Available roles: `buyer`, `seller`, `admin`.

User mới đăng ký luôn có `roles: ["buyer"]`. Role `seller` được cấp qua admin script (chưa có endpoint API public cho việc này). Role `admin` được set thủ công trong DB.

### Role-Based Access Matrix

| Endpoint | Buyer | Seller (active) | Admin |
| :--- | :---: | :---: | :---: |
| `GET /api/products` | ✅ | ✅ | ✅ |
| `POST /api/products` | ❌ | ✅ (status=active) | ❌ |
| `GET /api/orders/seller` | ❌ | ✅ | ✅ |
| `GET /api/admin/*` | ❌ | ❌ | ✅ |
| `PATCH /api/admin/listings/:id/approve` | ❌ | ❌ | ✅ |
| `PATCH /api/orders/:code/status` | ✅ (CAN only) | ✅ (limited) | ✅ |
| `POST /api/payments/checkout` | ✅ | ❌ | ❌ |

> **Lưu ý**: cột "Seller" yêu cầu `user.roles.includes("seller")` **VÀ** `user.sellerProfile.status === "active"`. Nếu seller bị `suspended` hoặc `pending_approval`, mọi endpoint chỉ-cho-seller sẽ trả `403 SELLER_NOT_APPROVED`.

> **Khuyến nghị cho FE**: bảng này dùng cho UI/UX rendering (ẩn/hiện nút, route guard). Backend vẫn enforce validation độc lập ở controller — không bao giờ chỉ dựa vào bảng này để bảo vệ route.

---

## Seller Status enum

`user.sellerProfile.status` (embedded subdocument trong `User`):

| Value | Ý nghĩa |
| :--- | :--- |
| `active` | Được phép tạo sản phẩm, đăng ký bán hàng thành công |
| `pending_approval` | Đang chờ admin duyệt (chưa có endpoint API để set status này) |
| `suspended` | Bị admin tạm khóa — bị ẩn khỏi `GET /api/sellers` |

User mới đăng ký KHÔNG có `sellerProfile` (field không tồn tại). FE check `user.sellerProfile?.status === "active"` để biết user có quyền seller.