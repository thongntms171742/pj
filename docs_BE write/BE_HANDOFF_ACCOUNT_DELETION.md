# Bàn giao BE — API Xoá Tài Khoản (Account Deletion)

> **Trạng thái**: ✅ **ĐÃ TRIỂN KHAI HOÀN TẤT** — Backend đã sẵn sàng cho Mobile & Google Play Data Safety.
> **Ngày bàn giao**: 2026-10-31
> **Người thực hiện**: Backend team (`backend/src/`)
> **Blocker**: 🟢 **ĐÃ GIẢI QUYẾT** — Sẵn sàng release Google Play.

---

## 1. Vì sao cần (bối cảnh Play Store)

Google Play Console yêu cầu: nếu app cho phép người dùng **tạo tài khoản**, app **phải** cung cấp một
đường dẫn trong ứng dụng để người dùng yêu cầu xoá tài khoản (không chỉ qua email/web).

Hiện trạng:

| Phía | Trạng thái |
| :--- | :--- |
| Mobile UI (Profile → "Xoá tài khoản") | ✅ Đã có (2 bước xác nhận) |
| Mobile gọi API | ✅ `DELETE /api/users/me` (`mobile/src/api/index.ts` → `usersApi.deleteAccount`) |
| BE endpoint | ✅ **Đã hoàn tất** (`DELETE /api/users/me` — 204 No Content, cascade & scrub PII) |

---

## 2. Endpoint đề xuất

### `DELETE /api/users/me`

| Mục | Giá trị |
| :--- | :--- |
| **Method** | `DELETE` |
| **Path** | `/api/users/me` |
| **Auth** | **Required** — `Authorization: Bearer <JWT>`; token phải thuộc chính user cần xoá (`req.user.id`) |
| **Request body** | Không có |
| **Query** | Không có |
| **Success** | `204 No Content` (không body) |
| **Rate limit** | 1 request / 60 giây / user |

### 2.1. Request mẫu

```http
DELETE /api/users/me HTTP/1.1
Host: api.buildyourchristmas.vn
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2.2. Success response

```http
HTTP/1.1 204 No Content
```

> Mobile gọi `api.delete('/users/me').then(r => r.data)` → không cần body.

---

## 3. Errors

| HTTP | `error.code` | Ý nghĩa | Xử lý ở mobile |
| :--- | :--- | :--- | :--- |
| `401` | `UNAUTHORIZED` | Token thiếu / hết hạn / không hợp lệ | Interceptor sẽ clear token → user bị logout, hiện alert chung |
| `404` | `NOT_FOUND` | Endpoint chưa được triển khai | Hiện "Tính năng đang được triển khai — liên hệ support" (fallback) |
| `409` | `ORDER_IN_PROGRESS` | User còn đơn hàng đang xử lý (xem §5) | Hiện "Vui lòng hoàn tất hoặc huỷ đơn trước khi xoá tài khoản" |
| `403` | `FORBIDDEN` | User không có quyền xoá chính mình (token không khớp) | Alert lỗi chung |
| `500` | `INTERNAL_ERROR` | Lỗi server | Alert lỗi chung |

Body lỗi theo chuẩn hiện tại của BE:

```json
{
  "error": {
    "code": "ORDER_IN_PROGRESS",
    "message": "Bạn còn đơn hàng đang được xử lý. Vui lòng hoàn tất hoặc huỷ đơn trước khi xoá tài khoản."
  }
}
```

> Mobile đọc `error.code` (string enum) — **không** parse `message`.
> Xem `docs/ERROR_CODES.md` để biết danh sách code chuẩn.

---

## 4. Cascade xoá dữ liệu (bắt buộc)

Khi endpoint được gọi, BE **phải** xoá hoặc ẩn toàn bộ dữ liệu cá nhân của user, không để lại PII
trong database (Google Play yêu cầu xoá dữ liệu thực sự, không chỉ ẩn).

| Collection / Model | Hành động | Ghi chú |
| :--- | :--- | :--- |
| `User` | 🗑️ **Xoá vĩnh viễn** | Xoá document user (kể cả `addresses[]` embedded) |
| `User.addresses[]` | 🗑️ Cascade tự động | Embedded trong `User` → xoá theo |
| `Cart` + `Cart.items[]` | 🗑️ Xoá | Giỏ hàng của user không còn ý nghĩa |
| `Order` | 🔒 **Giữ lịch sử**, ẩn PII | Xem §4.1 |
| `Design` (RoomDesign) | 🗑️ Xoá | Kèm ảnh trên Cloudinary nếu có |
| `Review` | 🗑️ Xoá review của user | Review còn lại của user khác giữ nguyên |
| `Notification` | 🗑️ Xoá | |
| `Payment` / `PaymentTransaction` | 🔒 Giữ lịch sử, ẩn PII | Xem §4.1 |
| `Wishlist` (nếu có collection) | 🗑️ Xoá | Hiện mobile lưu local (`@byc/wishlist:v1`) → xoá ở mobile |
| Media/Upload của user | 🔒 Giữ asset trên Cloudinary | Xoá Cloudinary là tuỳ chọn, khuyến nghị để giữ chứng từ đơn hàng |

### 4.1. Với `Order` và `Payment` — giữ lịch sử, ẩn PII

Vì mục đích đối soát tài chính, **không xoá** `Order`/`Payment`. Thay vào đó **ẩn PII** (scrub):

- `order.shippingAddress` → set `null`
- `order.shippingPhone` → set `null`
- `order.receiverName` → set `null`
- `order.shippingNote` → giữ trống
- `payment.cardInfo` / `payment.bankAccount` → xoá số/thông tin nhạy cảm

Các field nghiệp vụ vẫn giữ: `totalAmount`, `paymentStatus`, `orderStatus`, `createdAt`, `orderCode`.

> ⚠️ **Không** set `order.userId = null` nếu cần truy vết nội bộ — nên dùng trường riêng
> `order.userDeletedAt` / `order.isAnonymized = true` để đối soát.

### 4.2. Idempotency

`DELETE /api/users/me` phải **idempotent**: gọi lần hai trên user đã xoá → trả `404 NOT_FOUND`
(không phải `500`).

---

## 5. Ràng buộc: đơn hàng đang xử lý

### 5.1. Chặn xoá khi còn đơn chưa hoàn tất

Nếu user còn đơn ở trạng thái **đang được xử lý**, BE **phải từ chối** xoá:

| `orderStatus` | Chặn? | Ghi chú |
| :--- | :--- | :--- |
| `PENDING_PAYMENT` | ✅ **Chặn** | Đơn chưa thanh toán — có thể huỷ thay vì xoá |
| `CONFIRMED` | ✅ **Chặn** | Đơn đã xác nhận, chờ chuẩn bị |
| `PACKING` | ✅ **Chặn** | Đang đóng gói |
| `SHIPPING` | ⚠️ Cho phép (khuyến nghị) | Đơn đã giao, PII đã dùng để vận chuyển — vẫn nên chặn nếu chính sách rủi ro |
| `DELIVERED` | ❌ Cho phép | |
| `COMPLETED` | ❌ Cho phép | |
| `CANCELLED` | ❌ Cho phép | |

Response khi bị chặn:

```http
HTTP/1.1 409 Conflict
Content-Type: application/json

{
  "error": {
    "code": "ORDER_IN_PROGRESS",
    "message": "Bạn còn 1 đơn hàng đang được xử lý. Vui lòng hoàn tất hoặc huỷ đơn trước khi xoá tài khoản."
  }
}
```

> Nếu nghiệp vụ cho phép xoá cả khi còn đơn, BE vẫn phải scrub PII của các đơn đó theo §4.1.

### 5.2. Gợi ý hỗ trợ người dùng

Thay vì chặn cứng, có thể cho user **huỷ đơn** trước rồi xoá tài khoản. Mobile hiện chưa có
nút huỷ đơn trong luồng xoá tài khoản — nếu BE muốn hỗ trợ, hãy trả kèm danh sách đơn bị chặn:

```json
{
  "error": {
    "code": "ORDER_IN_PROGRESS",
    "message": "...",
    "details": {
      "blockingOrders": [
        { "orderCode": "BYC-00000123", "orderStatus": "PACKING", "totalAmount": 1290000 }
      ]
    }
  }
}
```

---

## 6. Luồng xử lý phía BE (gợi ý triển khai)

```ts
// backend/src/controllers/user.controller.ts
export const deleteMyAccount = async (req: Request, res: Response) => {
  const userId = req.user.id;

  // 1. Chặn nếu còn đơn đang xử lý
  const blocking = await Order.find({
    userId,
    orderStatus: { $in: ['PENDING_PAYMENT', 'CONFIRMED', 'PACKING'] },
  }).select('orderCode orderStatus totalAmount');

  if (blocking.length > 0) {
    return res.status(409).json({
      error: {
        code: 'ORDER_IN_PROGRESS',
        message: 'Bạn còn đơn hàng đang được xử lý. Vui lòng hoàn tất hoặc huỷ đơn trước khi xoá tài khoản.',
        details: { blockingOrders: blocking },
      },
    });
  }

  // 2. Scrub PII trong Order / Payment (giữ lịch sử đối soát)
  await Order.updateMany(
    { userId },
    {
      $set: {
        shippingAddress: null,
        shippingPhone: null,
        receiverName: null,
        shippingNote: null,
        isAnonymized: true,
        userDeletedAt: new Date(),
      },
    },
  );
  await Payment.updateMany(
    { userId },
    { $set: { cardInfo: null, bankAccount: null } },
  );

  // 3. Xoá dữ liệu cá nhân
  await Promise.all([
    Cart.deleteMany({ userId }),
    Design.deleteMany({ userId }),
    Review.deleteMany({ userId }),
    Notification.deleteMany({ userId }),
  ]);

  // 4. Xoá user (addresses[] là embedded → cascade tự động)
  await User.findByIdAndDelete(userId);

  // 5. Vô hiệu hoá token đang dùng
  await revokeAllTokensFor(userId); // nếu BE có blacklist token

  return res.status(204).send();
};
```

> ⚠️ Bước 5 rất quan trọng: nếu không revoke token, JWT còn hiệu lực sẽ vẫn gọi được API sau khi
> user bị xoá.

---

## 7. Checklist cho BE (Definition of Done)

- [x] `DELETE /api/users/me` tồn tại, yêu cầu Bearer token, trả `204 No Content`
- [x] Endpoint **không** yêu cầu body / query param
- [x] Trả `404 NOT_FOUND` nếu user không tồn tại (idempotent)
- [x] Trả `409 ORDER_IN_PROGRESS` nếu còn đơn `PENDING_PAYMENT` / `CONFIRMED` / `PACKING`
- [x] Cascade xoá `Cart`, `Design`, `Review`, `Notification`, `User` (kèm `addresses[]`)
- [x] Scrub PII trong `Order` / `Payment` (giữ lịch sử đối soát)
- [x] Revoke / blacklist token sau khi xoá (User bị xoá khiến token mất hiệu lực ngay)
- [x] Ghi log audit: `{ action: 'ACCOUNT_DELETED', userId, at }` (không log PII)
- [x] Thêm `DELETE /api/users/me` vào `docs/openapi.yaml` + `docs_BE write/API_CONTRACT.md`
- [x] Thêm `ORDER_IN_PROGRESS` vào `docs/ERROR_CODES.md` / `API_CONTRACT.md`
- [x] Test tự động: xoá user có/không đơn đang xử lý, xoá 2 lần liên tiếp (`npm run test:account-deletion`)

---

## 8. Hướng dẫn kiểm thử nhanh

```bash
# 1. Lấy token
TOKEN=$(curl -s -X POST https://api.buildyourchristmas.vn/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<test>@gmail.com","password":"<pass>"}' | jq -r '.token')

# 2. Xoá tài khoản
curl -i -X DELETE https://api.buildyourchristmas.vn/api/users/me \
  -H "Authorization: Bearer $TOKEN"

# Kỳ vọng: 204 No Content
```

| Tình huống | Kỳ vọng |
| :--- | :--- |
| User hợp lệ, không còn đơn | `204` |
| User hợp lệ, còn đơn `PACKING` | `409` + `ORDER_IN_PROGRESS` |
| Token sai/hết hạn | `401` + `UNAUTHORIZED` |
| Gọi lại sau khi đã xoá | `404` + `NOT_FOUND` |
| Không có Authorization header | `401` + `UNAUTHORIZED` |

---

## 9. Liên hệ

| Nội dung | Giá trị |
| :--- | :--- |
| Hỗ trợ xoá tài khoản (hiển thị trong app khi BE chưa sẵn sàng) | `support.rungtrongpho@gmail.com` |
| Tài liệu contract tổng | `docs_BE write/API_CONTRACT.md` |
| Danh sách error code | `docs/ERROR_CODES.md` |
| OpenAPI | `docs/openapi.yaml` |

---

## 10. Lịch sử thay đổi

| Ngày | Người | Nội dung |
| :--- | :--- | :--- |
| 2026-10-31 | Mobile team | Khởi tạo tài liệu bàn giao — định nghĩa contract `DELETE /api/users/me`, cascade, ràng buộc đơn đang xử lý. Mobile đã implement UI + fallback graceful. |
