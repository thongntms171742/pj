# Enums — Build Your Christmas

> **Source of Truth:** Enums đồng bộ với code BE thực tế (`backend/src/models/`, `backend/src/config/business.ts`) và `docs/API_CONTRACT.md`.
> Mọi string enum BE trả về PHẢI nằm trong file này. Nếu BE thêm giá trị mới → update file này trước khi release.

---

## TreeSize (S/M/L)

> Xem `backend/src/models/Tree.ts` → `TreeSize`. Unique.

| Value | Ý nghĩa | Approx. dimension (FE hint) |
| :--- | :--- | :--- |
| `S` | Cây nhỏ | height ~80–120cm, max decoration fee 50k |
| `M` | Cây vừa | height ~150cm, max decoration fee 80k |
| `L` | Cây lớn | height ~180–220cm, max decoration fee 120k |

Decoration fee per size: `{ S: 50_000, M: 80_000, L: 120_000 }` (chỉ áp dụng khi `deliveryOption = READY_TO_DISPLAY`).

---

## StyleCode (6 concepts)

> Xem `backend/src/models/Style.ts` → `Style.code`. Unique.

| Value | Name (VI) | Description hint |
| :--- | :--- | :--- |
| `CLASSIC` | Classic | Đỏ + xanh + vàng truyền thống |
| `MINIMAL` | Minimal | Trắng + be + tự nhiên |
| `GINGERBREAD` | Gingerbread | Nâu + trắng + đỏ, mood cookie |
| `WINTER` | Winter Wonderland | Xanh nhạt + bạc + trắng |
| `CUTE` | Cute | Pastel + hồng + tím nhẹ |
| `LUXURY` | Luxury Luxury | Đỏ ruby + vàng champagne + đen |

---

## AccessoryGroup (4 nhóm)

> Xem `backend/src/models/Accessory.ts` → `Accessory.group`. Filter UI: tabs.

| Value | Ý nghĩa |
| :--- | :--- |
| `LIGHTS` | Đèn trang trí (dây đèn, LED, candle lights) |
| `ORNAMENT` | Quả cầu, chuông, candy, figurine, bow |
| `DECOR` | Sao đỉnh, stocking, snowflake, ribbon |
| `PERSONAL` | Name tag, custom ornament — có personalization text |

---

## AccessoryType (10 loại cụ thể)

> Xem `backend/src/models/Accessory.ts` → `Accessory.type`. Cùng thuộc 1 `group` có thể có nhiều `type`.

| Type | Group | Ví dụ |
| :--- | :--- | :--- |
| `LIGHT_STRING` | LIGHTS | Dây LED warm/cool white |
| `CANDLE` | LIGHTS | LED candles |
| `BAUBLE` | ORNAMENT | Quả cầu nhiều màu/size |
| `BELL` | ORNAMENT | Chuông vàng/bạc |
| `CANDY` | ORNAMENT | Gậy candy cane |
| `FIGURINE` | ORNAMENT | Ông già Noel, tuần lộc, người tuyết |
| `BOW` | ORNAMENT | Nơ ruy băng |
| `STAR` | DECOR | Sao đỉnh cây |
| `STOCKING` | DECOR | Tất treo quà |
| `NAME_TAG` | PERSONAL | Thẻ tên cá nhân hóa (yêu cầu personalization text) |
| `NAME_ORNAMENT` | PERSONAL | Quả cầu khắc tên (yêu cầu personalization text) |

> Cập nhật đầy đủ từ catalog. BE filter qua `?type=`, FE render từ catalog response.

---

## DeliveryOption (3 lựa chọn)

> Xem `backend/src/config/business.ts` → `DELIVERY_OPTIONS`.

| Value | Ý nghĩa | Decoration fee |
| :--- | :--- | :---: |
| `READY_TO_DISPLAY` | Đội ngũ Build Your Christmas trang trí sẵn, giao tận nơi | 50k/80k/120k theo size |
| `DIY_KIT` | Giao cây + phụ kiện rời, khách tự trang trí | 0 |
| `SEPARATE` | Giao cây trước, phụ kiện giao sau (cho trường hợp muốn setup theo từng giai đoạn) | 0 |

> Shipping fee = `30_000 VND` flat cho cả 3 option.

---

## OrderStatus (state machine — 11 values)

> Xem `backend/src/models/Order.ts` → `ORDER_STATUSES` + `VALID_TRANSITIONS`.

| Value | Ý nghĩa | Terminal? |
| :--- | :--- | :---: |
| `PENDING_PAYMENT` | Đơn online, chờ thanh toán | ❌ |
| `PAID` | Đã thanh toán online (chưa xác nhận) | ❌ |
| `CONFIRMED` | Đơn COD = confirmed ngay, hoặc sau khi `payments/checkout` thành công | ❌ |
| `PACKING` | Đội BYC đang đóng gói | ❌ |
| `SHIPPING` | Đã tạo vận đơn, đang giao | ❌ |
| `DELIVERING` | Shipper đang giao đến buyer | ❌ |
| `DELIVERED` | Đã giao thành công | ❌ |
| `COMPLETED` | Buyer xác nhận hoàn tất | ✅ |
| `CANCEL_REQUESTED` | Buyer yêu cầu hủy (chờ admin accept) | ❌ |
| `CANCELLED` | Hủy đơn (stock được restore) | ✅ |
| `DISPUTED` | Buyer mở tranh chấp | ❌ |

### State machine

```
PENDING_PAYMENT  → PAID, CONFIRMED, CANCELLED
PAID             → CONFIRMED, PACKING, CANCELLED
CONFIRMED        → PACKING, SHIPPING, CANCEL_REQUESTED, CANCELLED
PACKING          → SHIPPING, CANCELLED
SHIPPING         → DELIVERING, DELIVERED, CANCELLED
DELIVERING       → DELIVERED, COMPLETED
DELIVERED        → COMPLETED, DISPUTED
COMPLETED        → (terminal)
CANCELLED        → (terminal)
CANCEL_REQUESTED → CANCELLED, CONFIRMED
DISPUTED         → COMPLETED
```

### Role-based restrictions (ngoài state machine)

- **Buyer** (non-admin): được phép chuyển sang `CANCELLED` (chỉ khi `PENDING_PAYMENT`/`PAID`), `CANCEL_REQUESTED` (khi ≥ `CONFIRMED`), `DELIVERED`, `COMPLETED`, `DISPUTED`. Nếu `hasPersonalization && currentStatus === PACKING` → `ORDER_CANCEL_NOT_ALLOWED`.
- **Admin**: bỏ qua role-based restriction (vẫn phải tuân state machine).
- **Seller**: KHÔNG tồn tại (single-brand — không có seller concept).

---

## ShipmentStatus (derived từ OrderStatus — KHÔNG lưu DB)

> Xem `getOrderShipment` trong `orderController.ts`.

| Value | Mapping từ `Order.status` |
| :--- | :--- |
| `PENDING` | Order mới tạo, chưa có tracking |
| `CREATED` | Có `trackingNumber` nhưng status < `SHIPPING` |
| `PICKED_UP` | Order status = `PACKING` |
| `IN_TRANSIT` | Order status = `SHIPPING` |
| `DELIVERING` | Order status = `DELIVERING` |
| `DELIVERED` | Order status = `DELIVERED` hoặc `COMPLETED` |
| `CANCELLED` | Order status = `CANCELLED` |

---

## PaymentMethod

| Value | Ý nghĩa | Initial order status |
| :--- | :--- | :--- |
| `COD` | Cash on Delivery — thanh toán khi nhận | `CONFIRMED` ngay |
| `ONLINE` | Thanh toán online (mock — chưa integrate gateway) | `PENDING_PAYMENT` |

> Code BE: `if (paymentMethod.toUpperCase() === "COD")` → COD; mọi giá trị khác → online. Nên thống nhất dùng `"COD"` hoặc `"ONLINE"` trong API call.

---

## NotificationType (5 values)

> Xem `backend/src/models/Notification.ts` → `type`. Hiện chỉ thực sự emit `order`.

| Value | Ý nghĩa | Hiện trạng |
| :--- | :--- | :--- |
| `order` | Liên quan đến đơn hàng | ✅ Đang emit khi tạo order |
| `chat` | Tin nhắn từ support (placeholder) | 🚧 Chưa có channel thật |
| `promo` | Khuyến mãi | 🚧 Reserved |
| `system` | Thông báo hệ thống | 🚧 Reserved |
| `review` | Phản hồi review (placeholder) | 🚧 Chưa dùng |

> FE có thể show generic icon cho mỗi type; chỉ cần handle thực tế `order` cho MVP.

---

## UserRole

> Xem `backend/src/models/User.ts` → `roles`. Single-brand: chỉ 2 roles.

| Value | Ý nghĩa |
| :--- | :--- |
| `buyer` | Default — mọi user mới đăng ký |
| `admin` | Nhân viên Build Your Christmas (set thủ công trong DB) |

> KHÔNG còn role `seller` (single-brand marketplace đã được pivot bỏ 2026-10-07).

---

## AccountStatus

> Xem `backend/src/models/User.ts` → `accountStatus`.

| Value | Ý nghĩa |
| :--- | :--- |
| `active` | Tài khoản hoạt động bình thường |
| `suspended` | Admin khóa — không thể login / call protected API |

---

## Province / Commune (HCM focus)

> Xem `backend/src/services/addressService.ts` (CAS Address Kit proxy). Province `id = "79"` là TP.HCM (service area duy nhất).

| Province ID | Name | Service? |
| :--- | :--- | :---: |
| `79` | Thành phố Hồ Chí Minh | ✅ |
| Other | All other 62 provinces | ❌ → `DELIVERY_AREA_NOT_SUPPORTED` (422) |

---

## Christmas-specific Enums (Customization)

> Xem `backend/src/models/Accessory.ts` → `isPersonalizable` + `personalizationMaxLength`.

- `isPersonalizable: boolean` — nếu true → bắt buộc nhập `personalizationText` (1–20 chars, chỉ chữ cái + số + space, regex `^[A-Za-z0-9 ]{1,20}$`).
- `productionDays: number` — số ngày sản xuất. `max(productionDays)` của tất cả line items → `order.items[].productionDays` → `order.estimatedDeliveryAt` (placeholder).

---

## API Error Code (47 codes)

> Xem `backend/src/utils/errors.ts` → `ErrorCode` constant. Mọi error response từ BE đều có dạng `{ error: { code, message } }`. Danh sách đầy đủ + FE action mapping xem `docs/ERROR_CODES.md`.

Một số code chính:

- `INVALID_INPUT`, `MISSING_FIELD` — request body thiếu/sai
- `UNAUTHORIZED`, `TOKEN_INVALID`, `INVALID_CREDENTIALS` — auth issues
- `FORBIDDEN`, `NOT_FOUND` — permission / resource
- `EMAIL_ALREADY_USED` — registration conflict
- `TREE_NOT_FOUND`, `STYLE_NOT_FOUND`, `ACCESSORY_NOT_FOUND`, `CATALOG_ITEM_UNAVAILABLE` — catalog issues
- `ACCESSORY_STYLE_MISMATCH`, `ACCESSORY_QUANTITY_INVALID`, `ACCESSORY_DUPLICATED` — design config issues
- `PERSONALIZATION_REQUIRED`, `PERSONALIZATION_INVALID` — personalization validation
- `DESIGN_NOT_FOUND`, `DESIGN_CONFIG_INVALID`, `DESIGN_NOT_CONFIRMED`, `DESIGN_NAME_REQUIRED`, `DESIGN_SLUG_TAKEN` — design management
- `DELIVERY_OPTION_INVALID`, `DELIVERY_AREA_NOT_SUPPORTED` — checkout validation
- `CART_EMPTY`, `NO_ITEMS_CHECKED`, `CART_NOT_FOUND`, `CART_ITEM_NOT_FOUND` — cart issues
- `OUT_OF_STOCK` — inventory exhausted
- `ORDER_NOT_FOUND`, `ORDER_STATUS_REQUIRED`, `ORDER_INVALID_TRANSITION`, `ORDER_ALREADY_SHIPPED`, `ORDER_ALREADY_CANCELLED`, `ORDER_PAYMENT_INVALID_STATE`, `ORDER_ID_REQUIRED`, `ORDER_CANCEL_NOT_ALLOWED` — order issues
- `INTERNAL_ERROR` — lỗi hệ thống chưa phân loại (HTTP 500)
- `UPSTREAM_ERROR`, `SERVICE_UNAVAILABLE`, `ADDRESS_UPSTREAM_TIMEOUT`, `ADDRESS_UPSTREAM_ERROR` — upstream CAS issues
- `ACCOUNT_NOT_FOUND` — user lookup
