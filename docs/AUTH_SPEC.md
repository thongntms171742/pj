# Authentication Specification — Build Your Christmas

> **Source of Truth:** Spec này đồng bộ với `docs/API_CONTRACT.md` và code BE thực tế (`backend/src/controllers/authController.ts`, `backend/src/middleware/auth.ts`).
> Nếu có xung đột, tin `API_CONTRACT.md`.

---

## Register

**POST /api/auth/register**

**Auth**: Public.

**Request**:
```json
{
  "name": "string (required, trim)",
  "email": "string (required, unique, lowercase, trim)",
  "password": "string (required, plaintext — BE hash với bcrypt)"
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
    "avatarUrl": "string",
    "roles": ["buyer"],
    "accountStatus": "active",
    "addresses": []
  }
}
```

**Errors**:
- `400 MISSING_FIELD` — Thiếu name/email/password
- `409 EMAIL_ALREADY_USED` — Email đã tồn tại
- `500 INTERNAL_ERROR`

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
  "token": "JWT (expires 7d)",
  "user": {
    "_id": "string",
    "name": "string",
    "email": "string",
    "avatarUrl": "string",
    "roles": ["buyer"],
    "accountStatus": "active",
    "addresses": [/* IAddress[] */]
  }
}
```

> **Single-brand Christmas**: response KHÔNG có `sellerStatus` / `sellerProfile` (đã bỏ hẳn role seller từ 2026-10-07).

**Errors**:
- `400 MISSING_FIELD` — Thiếu email hoặc password
- `401 INVALID_CREDENTIALS` — Email hoặc mật khẩu không đúng
- `403 FORBIDDEN` — Tài khoản bị suspended → "Tài khoản của bạn đã bị khóa"
- `500 INTERNAL_ERROR`

---

## Update avatar

**PUT /api/auth/me/avatar**

**Auth**: Required.

**Request**:
```json
{
  "avatarUrl": "https://example.com/avatar.jpg"
}
```

**Success (200)**:
```json
{ "user": { /* updated user shape */ } }
```

**Errors**:
- `400 INVALID_INPUT` — Thiếu `avatarUrl`
- `401 UNAUTHORIZED`
- `404 ACCOUNT_NOT_FOUND`
- `500 INTERNAL_ERROR`

---

## Token storage & usage

FE lưu `token` vào `localStorage` (key: `token`) và gửi kèm `Authorization: Bearer <token>` cho mọi request cần auth.

- Token hết hạn sau `JWT_EXPIRES_IN` (default `7d`, configurable via env).
- Khi token hết hạn → BE trả `401 TOKEN_INVALID` → FE phải `localStorage.removeItem("token")` + redirect về `/login`.

---

## Roles

Chỉ 2 roles duy nhất trong Christmas:

| Role | Mô tả |
| :--- | :--- |
| `buyer` | Default — mọi user mới đăng ký |
| `admin` | Nhân viên Build Your Christmas (set thủ công trong DB) |

> ❌ KHÔNG còn role `seller` (single-brand, đã pivot 2026-10-07).

### Role-based access matrix

| Endpoint | Buyer | Admin |
| :--- | :---: | :---: |
| `GET /api/catalog/*` (public) | ✅ | ✅ |
| `GET /api/addresses/*` (public) | ✅ | ✅ |
| `POST /api/auth/register` (public) | ✅ | ✅ |
| `POST /api/auth/login` (public) | ✅ | ✅ |
| `GET /api/cart` | ✅ | ✅ |
| `POST /api/cart/items` | ✅ | ✅ |
| `POST /api/designs/quote` (public) | ✅ | ✅ |
| `POST /api/designs` | ✅ | ✅ |
| `GET /api/designs/mine` | ✅ | ✅ |
| `PATCH /api/designs/:id` | ✅ (owner) | ✅ |
| `DELETE /api/designs/:id` | ✅ (owner) | ✅ |
| `POST /api/orders` | ✅ | ✅ |
| `GET /api/orders` | ✅ (own) | ✅ (all) |
| `PATCH /api/orders/:id/status` | ✅ (own: CAN/CANCEL_REQ/DELIVERED/COMPLETED/DISPUTED) | ✅ (any valid transition) |
| `POST /api/orders/:id/shipment` | ❌ | ✅ |
| `POST /api/payments/checkout` | ✅ (own order) | ❌ |
| `GET /api/notifications` | ✅ (own) | ✅ (own) |
| `GET /api/users/me/addresses` | ✅ | ✅ |
| `GET /api/admin/*` | ❌ | ✅ |
| `GET /api/admin/stats` | ❌ | ✅ |
| `GET /api/admin/users` | ❌ | ✅ |
| `PATCH /api/admin/users/:id/status` | ❌ | ✅ |

> **Khuyến nghị FE**: dùng bảng này cho UI/UX rendering (ẩn/hiện nút, route guard). BE vẫn enforce validation độc lập ở controller — không bao giờ chỉ dựa bảng này để bảo vệ route.

---

## Account Status

`user.accountStatus` (enum trên `User`):

| Value | Ý nghĩa | FE action |
| :--- | :--- | :--- |
| `active` | Hoạt động bình thường | Allow login + mọi action |
| `suspended` | Bị admin khóa | BE trả `403 FORBIDDEN` với message "Tài khoản của bạn đã bị khóa" → FE nên logout + show banner |

User mới đăng ký luôn `accountStatus = "active"`.
