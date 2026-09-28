# Enums

> **Source of Truth:** Enums đồng bộ với code BE thực tế (`backend/src/models/`) và `API_CONTRACT.md`.
> Mọi string enum mà backend trả về PHẢI nằm trong file này. Nếu BE thêm giá trị mới, phải cập nhật file này trước khi release.

## Order Status

> Xem định nghĩa: `Order.ts` → `ORDER_STATUSES`. State machine: `VALID_TRANSITIONS`.

| Value | Ý nghĩa | Terminal? |
| :--- | :--- | :---: |
| `PENDING_PAYMENT` | Đơn online, chờ thanh toán (reserved 30 phút) | ❌ |
| `PAID` | Đã thanh toán online (chưa confirm vận chuyển) | ❌ |
| `CONFIRMED` | Đơn COD = confirmed ngay, hoặc sau khi `payments/checkout` thành công | ❌ |
| `PACKING` | Seller đang đóng gói | ❌ |
| `SHIPPING` | Đã tạo vận đơn, đang giao | ❌ |
| `DELIVERING` | Shipper đang giao đến buyer | ❌ |
| `DELIVERED` | Đã giao thành công | ❌ |
| `COMPLETED` | Buyer xác nhận hoàn tất (terminal revenue) | ✅ |
| `CANCELLED` | Hủy đơn (stock được restore nếu trước SHIPPING) | ✅ |
| `DISPUTED` | Buyer mở tranh chấp | ❌ |
| `REFUNDED` | Hoàn tiền sau tranh chấp | ✅ |

### State Machine

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

### Role-based restrictions (ngoài state machine)

- **Buyer-only**: chỉ được chuyển sang `CANCELLED` hoặc `COMPLETED` → nếu khác → `403 ORDER_BUYER_NOT_PARTICIPANT`.
- **Seller (non-admin)**: KHÔNG được chuyển sang `DELIVERING`/`DELIVERED`/`COMPLETED` → nếu vi phạm → `403 ORDER_SELLER_CANNOT_DELIVER`.
- **Admin**: bỏ qua role-based restriction (vẫn phải tuân state machine).

---

## Product Status

> Xem định nghĩa: `Product.ts` → enum field `status`.

| Value | Ý nghĩa |
| :--- | :--- |
| `pending` | Seller vừa tạo, chờ admin duyệt |
| `active` | Đang hiển thị trên shop — buyer có thể mua |
| `reserved` | Đang được giữ cho đơn online (chờ thanh toán 30 phút) |
| `sold` | Đã bán hết (quantity = 0) |
| `archived` | Bị admin từ chối hoặc chủ sở hữu archive |

---

## Product Condition

`condition` là **number 0–100** (integer hoặc float), đại diện % tình trạng sản phẩm.

- `0` = rách/hỏng nặng
- `100` = như mới

> FE nên hiển thị text mapping (vd: `90–100` = "Như mới", `70–89` = "Rất tốt", `50–69` = "Tốt", `<50` = "Đã qua sử dụng") ở UI — mapping này do FE tự quyết theo design system, không cần BE confirm.

---

## Seller Status

> Xem định nghĩa: `User.ts` → `SellerProfileSchema.status`.

| Value | Ý nghĩa |
| :--- | :--- |
| `active` | Được phép tạo sản phẩm, hiển thị trên `GET /api/sellers` |
| `pending_approval` | Đang chờ admin duyệt |
| `suspended` | Bị admin tạm khóa — bị ẩn khỏi `GET /api/sellers`, không thể tạo sản phẩm |

---

## Payment Methods

> Free-form string trong DB nhưng convention thống nhất (xem `createOrder` trong `orderController.ts`):

| Value | Ý nghĩa | Order status khi tạo |
| :--- | :--- | :--- |
| `COD` | Cash on Delivery — thanh toán khi nhận hàng | `CONFIRMED` ngay |
| `ONLINE` / `card` / `wallet` / `banking` | Thanh toán online qua gateway mock | `PENDING_PAYMENT` (reserved 30 phút) |

> **Lưu ý quan trọng**: code BE hiện chỉ test `paymentMethod.toUpperCase() === "COD"`. Mọi giá trị khác (case-insensitive) đều dẫn đến flow online payment → `PENDING_PAYMENT`. FE có thể gửi `card`, `ONLINE`, `WALLET`... đều OK về mặt logic, nhưng nên thống nhất dùng `"ONLINE"` cho rõ ràng trong API call.

> **`POST /api/payments/checkout`** dùng field `method` riêng (không phải `paymentMethod`):
> - `method` default = `"card"`
> - `cardLast4` default = `"1234"` (chỉ để log)

---

## Notification Type

> Xem định nghĩa: `Notification.ts` → field `type`.

| Value | Ý nghĩa |
| :--- | :--- |
| `order` | Liên quan đến đơn hàng (tạo mới, thanh toán, giao hàng, hủy, hoàn tất) |

> Hiện tại chỉ có `order`. BE có thể mở rộng thêm (`system`, `promotion`...) — khi đó phải update enum này.

---

## Shipment Status

> Derived từ `Order.status` trong `getOrderShipment`. KHÔNG lưu trong DB.

| Value | Mapping từ Order.status |
| :--- | :--- |
| `PENDING` | Order mới tạo, chưa có tracking |
| `CREATED` | Có `trackingNumber` nhưng status < `SHIPPING` |
| `PICKED_UP` | Order status = `PACKING` |
| `IN_TRANSIT` | Order status = `SHIPPING` |
| `DELIVERING` | Order status = `DELIVERING` |
| `DELIVERED` | Order status = `DELIVERED` hoặc `COMPLETED` |
| `CANCELLED` | Order status = `CANCELLED` |

---

## API Error Code

> Xem định nghĩa đầy đủ: `backend/src/utils/errors.ts` → `ErrorCode` constant.
> Mọi error response từ BE đều có dạng `{ error: { code, message } }`.

Danh sách đầy đủ xem `docs/ERROR_CODES.md`. Một số code chính:

- `INVALID_INPUT`, `MISSING_FIELD` — request body thiếu/sai
- `UNAUTHORIZED`, `TOKEN_INVALID`, `INVALID_CREDENTIALS` — auth issues
- `FORBIDDEN` — không đủ quyền
- `NOT_FOUND` — resource không tồn tại
- `CONFLICT` — xung đột (vd duplicate email)
- `SELLER_NOT_APPROVED` — user không phải seller active
- `PRODUCT_NOT_FOUND`, `PRODUCT_NOT_AVAILABLE`, `PRODUCT_OUT_OF_STOCK` — product issues
- `CART_EMPTY`, `NO_ITEMS_CHECKED`, `QUANTITY_EXCEEDS_STOCK`, `SELF_PURCHASE_NOT_ALLOWED` — cart issues
- `ORDER_NOT_FOUND`, `ORDER_INVALID_TRANSITION`, `ORDER_BUYER_NOT_PARTICIPANT`, `ORDER_SELLER_CANNOT_DELIVER`, `ORDER_ALREADY_SHIPPED`, `ORDER_ALREADY_CANCELLED`, `ORDER_PAYMENT_INVALID_STATE` — order issues
- `AI_NOT_CONFIGURED`, `AI_UPSTREAM_ERROR`, `AI_QUERY_INVALID_LENGTH`, `AI_IMAGE_TYPE_INVALID` — AI issues
- `INTERNAL_ERROR` — lỗi hệ thống chưa phân loại (HTTP 500)