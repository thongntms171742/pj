# Error Codes — Build Your Christmas

> **Source of Truth:** Đồng bộ với `backend/src/utils/errors.ts` → `ErrorCode` constant (47 codes).
> Mọi error response từ BE đều theo format bên dưới. **FE branch logic dựa trên `code`, KHÔNG dựa trên `message`** (message có thể đổi ngôn ngữ trong tương lai).

## Error Response Format

```json
{
  "error": {
    "code": "TREE_NOT_FOUND",
    "message": "Không tìm thấy cây thông"
  }
}
```

> Verify ở BE: `npm test` (61/61 PASS — covers toàn bộ 47 codes + verify HTTP status mapping).

## HTTP Status Conventions

| Status | Meaning |
| :---: | :--- |
| `400` | Request body/query sai (thiếu field, validation fail) |
| `401` | Chưa đăng nhập / token sai / token hết hạn |
| `403` | Đã đăng nhập nhưng không đủ quyền |
| `404` | Resource không tồn tại |
| `409` | Xung đột (duplicate, conflict state, out of stock) |
| `422` | Request hợp lệ về cú pháp nhưng vi phạm business rule (state machine, HCM-only) |
| `500` | Lỗi hệ thống chưa phân loại |
| `502` | Lỗi upstream service (CAS Address Kit) |
| `503` | Service không khả dụng (reserved) |
| `504` | Upstream timeout |

---

## Generic (10)

| Code | HTTP | Mô tả | FE action |
| :--- | :---: | :--- | :--- |
| `INTERNAL_ERROR` | 500 | Lỗi hệ thống chưa rõ | Hiển thị "Đã có lỗi xảy ra, vui lòng thử lại" |
| `INVALID_INPUT` | 400 | Body sai schema | Highlight field lỗi |
| `MISSING_FIELD` | 400 | Thiếu field bắt buộc | Highlight field bị thiếu |
| `UNAUTHORIZED` | 401 | Không có token | Redirect login |
| `TOKEN_INVALID` | 401 | Token sai / hết hạn | Clear token + redirect login |
| `FORBIDDEN` | 403 | Không đủ quyền | Hiển thị "Bạn không có quyền thực hiện" |
| `NOT_FOUND` | 404 | Resource không tồn tại (generic) | Show not found UI |
| `CONFLICT` | 409 | Xung đột dữ liệu | Show conflict message |
| `UPSTREAM_ERROR` | 502 | Upstream service fail | Show retry-able error |
| `SERVICE_UNAVAILABLE` | 503 | Service tạm thời offline | Show "Đang bảo trì" |

---

## Auth (4)

| Code | HTTP | Mô tả | FE action |
| :--- | :---: | :--- | :--- |
| `EMAIL_ALREADY_USED` | 409 | Email đã tồn tại | Highlight email field |
| `INVALID_CREDENTIALS` | 401 | Email/password sai | Show "Email hoặc mật khẩu không đúng" |
| `ITEMS_REQUIRED` | 400 | Body thiếu items array | Highlight field |
| `ACCOUNT_NOT_FOUND` | 404 | User không tồn tại | Logout + redirect login |

---

## Address (CAS proxy) (4)

| Code | HTTP | Mô tả | FE action |
| :--- | :---: | :--- | :--- |
| `INVALID_EFFECTIVE_DATE` | 400 | `effectiveDate` không hợp lệ (phải `"latest"` hoặc `YYYY-MM-DD`) | Reset về `"latest"` |
| `PROVINCE_NOT_FOUND` | 404 | CAS không tìm thấy tỉnh | Hiển thị "Không tìm thấy tỉnh/thành" |
| `ADDRESS_UPSTREAM_TIMEOUT` | 504 | CAS timeout (5s) | Show retry |
| `ADDRESS_UPSTREAM_ERROR` | 502 | CAS lỗi khác | Show retry + offer manual entry |

---

## Catalog (7)

| Code | HTTP | Mô tả | FE action |
| :--- | :---: | :--- | :--- |
| `TREE_NOT_FOUND` | 404 | Tree SKU không tồn tại / không active | Disable bước "Chọn cây" |
| `STYLE_NOT_FOUND` | 404 | Style concept không tồn tại / không active | Disable bước "Chọn style" |
| `ACCESSORY_NOT_FOUND` | 404 | Accessory SKU không tồn tại / không active | Remove khỏi editor |
| `CATALOG_ITEM_UNAVAILABLE` | 409 | Catalog item không khả dụng (admin vừa tắt) | Refresh + show banner |
| `ACCESSORY_STYLE_MISMATCH` | 400 | Accessory không thuộc style đã chọn | Bỏ accessory khỏi lines |
| `ACCESSORY_QUANTITY_INVALID` | 400 | `quantity < 1` hoặc vượt `maxQtyBySize` | Bounded input hint |
| `ACCESSORY_DUPLICATED` | 400 | 2 lines cùng `accessoryId` | Gộp quantity |
| `OUT_OF_STOCK` | 409 | Stock không đủ khi checkout | Refresh cart, show "Hết hàng" |

---

## Design (5)

| Code | HTTP | Mô tả | FE action |
| :--- | :---: | :--- | :--- |
| `DESIGN_NOT_FOUND` | 404 | Design `_id` hoặc `slug` không tồn tại | Show 404 design |
| `DESIGN_CONFIG_INVALID` | 400 | `config` không validate được (thiếu tree/style/lines) | Disable nút "Save design" |
| `DESIGN_NOT_CONFIRMED` | 400 | `designConfirmed: true` chưa được gửi khi POST /orders | Bật checkbox "Tôi đồng ý" trước khi checkout |
| `DESIGN_NAME_REQUIRED` | 400 | Tên design rỗng khi save | Highlight name field |
| `DESIGN_SLUG_TAKEN` | 409 | Auto-gen slug đã trùng (hiếm) | Retry với suffix |

---

## Personalization (2)

| Code | HTTP | Mô tả | FE action |
| :--- | :---: | :--- | :--- |
| `PERSONALIZATION_REQUIRED` | 400 | Accessory `isPersonalizable` mà thiếu `personalizationText` | Show text input |
| `PERSONALIZATION_INVALID` | 400 | Text vượt `maxLength` hoặc sai regex (`^[A-Za-z0-9 ]{1,20}$`) | Show format hint |

---

## Delivery (2)

| Code | HTTP | Mô tả | FE action |
| :--- | :---: | :--- | :--- |
| `DELIVERY_OPTION_INVALID` | 400 | `deliveryOption` không phải `READY_TO_DISPLAY` / `FLAT_PACK` | Reset về mặc định |
| `DELIVERY_AREA_NOT_SUPPORTED` | 422 | `shippingProvinceId !== "79"` (ngoài TP.HCM) | Disable checkout ngoài HCM + show banner |

---

## Cart (4)

| Code | HTTP | Mô tả | FE action |
| :--- | :---: | :--- | :--- |
| `CART_EMPTY` | 400 | Cart trống khi checkout | Redirect về cart |
| `NO_ITEMS_CHECKED` | 400 | Không có item nào `checked: true` | Show "Vui lòng chọn sản phẩm" |
| `CART_NOT_FOUND` | 404 | User chưa có cart (hiếm) | Refresh cart |
| `CART_ITEM_NOT_FOUND` | 404 | Item không thuộc cart của user | Refresh cart |

---

## Order (8)

| Code | HTTP | Mô tả | FE action |
| :--- | :---: | :--- | :--- |
| `ORDER_NOT_FOUND` | 404 | Order không tồn tại (theo `_id` hoặc `orderCode`) | Show 404 order |
| `ORDER_ID_REQUIRED` | 400 | Thiếu `orderId` khi checkout | Retry với orderId |
| `ORDER_STATUS_REQUIRED` | 400 | Thiếu `status` khi PATCH | Disable button |
| `ORDER_INVALID_TRANSITION` | 422 | Chuyển trạng thái không hợp lệ theo state machine | Refresh order, disable nút |
| `ORDER_ALREADY_SHIPPED` | 400 | Order đã có vận đơn (`SHIPPING`/`DELIVERING`/`DELIVERED`) | Ẩn nút "Tạo vận đơn" (admin) |
| `ORDER_ALREADY_CANCELLED` | 400 | Order đã bị hủy | Ẩn mọi action |
| `ORDER_PAYMENT_INVALID_STATE` | 422 | Checkout khi order không phải `PENDING_PAYMENT` | Refresh order status |
| `ORDER_CANCEL_NOT_ALLOWED` | 409 | Personalization + `PACKING` → không cho `CANCEL_REQUESTED` | Show banner "Đơn đã vào sản xuất, không thể hủy" |

---

## Tổng kết

**47 codes Christmas-specific**, đối chiếu với `backend/src/utils/errors.ts`:
- Generic: 10
- Auth: 4
- Address: 4
- Catalog: 8 (gồm `OUT_OF_STOCK` thay cho `PRODUCT_OUT_OF_STOCK`)
- Design: 5
- Personalization: 2
- Delivery: 2
- Cart: 4
- Order: 8

Không còn codes marketplace: `SELLER_*`, `PRODUCT_*`, `REVIEW_*`, `AI_*`, `COMMISSION_*`, `SELF_PURCHASE_NOT_ALLOWED`, `ORDER_BUYER_NOT_PARTICIPANT`, `ORDER_SELLER_CANNOT_DELIVER`, `PRODUCT_ALREADY_NOT_FOR_SALE`, `QUANTITY_EXCEEDS_STOCK`, `INTERNAL_ERROR` đã giữ lại.

---

## FE Implementation Tips

```typescript
// Error handler thống nhất
async function apiCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    const code = err?.response?.data?.error?.code;
    const message = err?.response?.data?.error?.message;

    switch (code) {
      // Auth
      case "UNAUTHORIZED":
      case "TOKEN_INVALID":
        localStorage.removeItem("token");
        window.location.href = "/login";
        break;
      case "INVALID_CREDENTIALS":
        showToast("Email hoặc mật khẩu không đúng");
        break;
      // Catalog
      case "OUT_OF_STOCK":
        showToast("Sản phẩm đã hết hàng trong lúc bạn đặt");
        refreshCart();
        break;
      // Personalization
      case "PERSONALIZATION_REQUIRED":
        showToast("Vui lòng nhập tên cá nhân hóa");
        break;
      case "PERSONALIZATION_INVALID":
        showToast("Tên chỉ chứa chữ cái, số, khoảng trắng (tối đa 20 ký tự)");
        break;
      // Delivery
      case "DELIVERY_AREA_NOT_SUPPORTED":
        showToast("Hiện Build Your Christmas chỉ giao tại TP.HCM");
        break;
      // Order
      case "ORDER_CANCEL_NOT_ALLOWED":
        showToast("Đơn có món cá nhân hóa đã vào sản xuất — không thể hủy");
        break;
      case "DESIGN_NOT_CONFIRMED":
        showToast("Bạn cần xác nhận đồng ý với thiết kế trước khi đặt");
        break;
      // Generic
      default:
        showToast(message || "Đã có lỗi xảy ra");
    }
    throw err;
  }
}
```

> **Quy ước bắt buộc**: Mọi code trong bảng PHẢI được BE đảm bảo trả về. Nếu FE switch trên code mà BE không bao giờ trả → rơi vào default → show generic message. Nếu FE phát hiện code BE trả không có trong bảng này → báo BE để update cả docs lẫn `ErrorCode` enum.
