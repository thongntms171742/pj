# Error Codes

> **Source of Truth:** Enums đồng bộ với `backend/src/utils/errors.ts` → `ErrorCode` constant.
> Mọi error response từ BE đều theo format dưới đây. FE branch logic dựa trên `code`, **không** dựa trên `message` (message có thể đổi ngôn ngữ / cụm từ trong tương lai).

## Error Response Format

```json
{
  "error": {
    "code": "PRODUCT_NOT_FOUND",
    "message": "Không tìm thấy sản phẩm"
  }
}
```

## HTTP Status Code Conventions

- `400` — Request body/query sai (thiếu field, validation fail, business rule fail trước khi xử lý)
- `401` — Chưa đăng nhập / token sai / token hết hạn
- `403` — Đã đăng nhập nhưng không đủ quyền
- `404` — Resource không tồn tại
- `409` — Xung đột (duplicate, conflict state)
- `422` — Request hợp lệ về mặt cú pháp nhưng vi phạm business rule (vd: state machine)
- `500` — Lỗi hệ thống chưa phân loại
- `502` — Lỗi upstream (vd: Google Gemini API fail)
- `503` — Service không khả dụng (vd: thiếu API key)

## Error Code Mapping

### Generic

| Code | HTTP | Mô tả | FE action |
| :--- | :---: | :--- | :--- |
| `INTERNAL_ERROR` | 500 | Lỗi hệ thống chưa rõ nguyên nhân | Hiển thị "Đã có lỗi xảy ra, vui lòng thử lại" |
| `INVALID_INPUT` | 400 | Request body sai schema | Show field error |
| `MISSING_FIELD` | 400 | Thiếu field bắt buộc | Highlight field bị thiếu |
| `UNAUTHORIZED` | 401 | Không có token | Redirect login |
| `TOKEN_INVALID` | 401 | Token sai / hết hạn | Clear token + redirect login |
| `FORBIDDEN` | 403 | Không đủ quyền | Show permission error |
| `NOT_FOUND` | 404 | Resource không tồn tại (generic) | Show not found |
| `CONFLICT` | 409 | Xung đột dữ liệu | Show conflict message |
| `UPSTREAM_ERROR` | 502 | Upstream service fail | Show retry-able error |
| `SERVICE_UNAVAILABLE` | 503 | Service tạm thời offline | Show "Đang bảo trì" |

### Auth

| Code | HTTP | Mô tả | FE action |
| :--- | :---: | :--- | :--- |
| `EMAIL_ALREADY_USED` | 409 | Email đã tồn tại | Show "Email đã được sử dụng" |
| `INVALID_CREDENTIALS` | 401 | Email/password sai | Show "Email hoặc mật khẩu không đúng" |
| `ITEMS_REQUIRED` | 400 | Cart merge thiếu items array | Highlight items field |

### Seller

| Code | HTTP | Mô tả | FE action |
| :--- | :---: | :--- | :--- |
| `SELLER_NOT_APPROVED` | 403 | User không phải seller active | Ẩn nút "Đăng sản phẩm" + thông báo "Bạn chưa đăng ký bán hàng" |

### Product

| Code | HTTP | Mô tả | FE action |
| :--- | :---: | :--- | :--- |
| `PRODUCT_NOT_FOUND` | 404 | Sản phẩm không tồn tại | Show 404 product |
| `PRODUCT_NOT_AVAILABLE` | 400 | Status ≠ active (đã bán / đang giữ) | Refresh product list, show "Sản phẩm không khả dụng" |
| `PRODUCT_OUT_OF_STOCK` | 400 | quantity ≤ 0 | Show "Hết hàng" |
| `PRODUCT_TITLE_REQUIRED` | 400 | Thiếu title khi tạo SP | Highlight title field |
| `PRODUCT_PRICE_REQUIRED` | 400 | Thiếu price | Highlight price field |
| `PRODUCT_CONDITION_REQUIRED` | 400 | Thiếu condition | Highlight condition field |
| `PRODUCT_SIZE_REQUIRED` | 400 | Thiếu size | Highlight size field |
| `PRODUCT_QUANTITY_INVALID` | 400 | quantity < 1 | Highlight quantity field |

### Cart

| Code | HTTP | Mô tả | FE action |
| :--- | :---: | :--- | :--- |
| `CART_EMPTY` | 400 | Giỏ hàng trống khi checkout | Redirect về cart page |
| `NO_ITEMS_CHECKED` | 400 | Không có item nào được check | Hiển thị "Vui lòng chọn sản phẩm" |
| `CART_NOT_FOUND` | 404 | User chưa có cart (hiếm) | Refresh cart |
| `CART_ITEM_NOT_FOUND` | 404 | Item không thuộc cart của user | Refresh cart |
| `SELF_PURCHASE_NOT_ALLOWED` | 400 | Không thể mua SP của chính mình | Disable button + thông báo |
| `QUANTITY_EXCEEDS_STOCK` | 400 | Yêu cầu nhiều hơn stock | Đề xuất giảm quantity |
| `PRODUCT_ALREADY_NOT_FOR_SALE` | 400 | SP đã được reserve/sold | Refresh stock |

### Order

| Code | HTTP | Mô tả | FE action |
| :--- | :---: | :--- | :--- |
| `ORDER_NOT_FOUND` | 404 | Không tìm thấy đơn | Show 404 |
| `ORDER_ID_REQUIRED` | 400 | Thiếu orderId khi checkout | Retry với orderId |
| `ORDER_STATUS_REQUIRED` | 400 | Thiếu status khi PATCH | Disable button |
| `ORDER_INVALID_TRANSITION` | 422 | Chuyển trạng thái không hợp lệ theo state machine | Refresh order, disable nút |
| `ORDER_BUYER_NOT_PARTICIPANT` | 403 | Buyer cố chuyển sang status không được phép | Chỉ hiển thị nút "Hủy" / "Hoàn tất" |
| `ORDER_SELLER_CANNOT_DELIVER` | 403 | Seller cố set DELIVERED/COMPLETED | Ẩn nút, giải thích |
| `ORDER_ALREADY_SHIPPED` | 400 | Đơn đã được ship | Ẩn nút "Tạo vận đơn" |
| `ORDER_ALREADY_CANCELLED` | 400 | Đơn đã bị hủy | Ẩn mọi action |
| `ORDER_PAYMENT_INVALID_STATE` | 422 | Checkout khi order không phải PENDING_PAYMENT | Refresh order status |

### AI

| Code | HTTP | Mô tả | FE action |
| :--- | :---: | :--- | :--- |
| `AI_NOT_CONFIGURED` | 503 | Backend thiếu GEMINI_API_KEY | Disable nút "Tìm bằng AI" + thông báo |
| `AI_UPSTREAM_ERROR` | 502 | Google Gemini API lỗi | Show retry-able error |
| `AI_QUERY_INVALID_LENGTH` | 400 | Query text quá ngắn/dài | Highlight input |
| `AI_IMAGE_INVALID` | 400 | Ảnh không hợp lệ format | Show format error |
| `AI_IMAGE_TYPE_INVALID` | 400 | Ảnh không phải JPG/PNG/WebP hoặc quá 6MB | Highlight image upload |
| `AI_QUERY_OR_IMAGE_REQUIRED` | 400 | Phải có ít nhất 1 trong query/image | Highlight input |
| `AI_RECOMMENDATIONS_UNAVAILABLE` | 500 | Lỗi không load được recommendations | Fallback về "Sản phẩm nổi bật" |

### Account

| Code | HTTP | Mô tả | FE action |
| :--- | :---: | :--- | :--- |
| `ACCOUNT_NOT_FOUND` | 404 | Không tìm thấy user | Logout + redirect login |

---

## Mẹo cho FE

```typescript
// Ví dụ: error handler thống nhất
async function apiCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    const code = err?.response?.data?.error?.code;
    const message = err?.response?.data?.error?.message;

    switch (code) {
      case "TOKEN_INVALID":
      case "UNAUTHORIZED":
        localStorage.removeItem("token");
        window.location.href = "/login";
        break;
      case "SELLER_NOT_APPROVED":
        showToast("Tài khoản chưa được duyệt làm người bán");
        break;
      case "PRODUCT_OUT_OF_STOCK":
      case "QUANTITY_EXCEEDS_STOCK":
        refreshCart();
        showToast("Sản phẩm không đủ hàng");
        break;
      // ... các case khác
      default:
        // Fallback cho error chưa map
        showToast(message || "Đã có lỗi xảy ra");
    }
    throw err;
  }
}
```

> **Lưu ý**: Tất cả các code ở trên PHẢI được BE đảm bảo trả về. Nếu FE switch trên một code mà BE không bao giờ trả → rơi vào default → show generic message. Ngược lại, nếu FE phát hiện BE trả code không có trong bảng này → báo BE để cập nhật cả docs lẫn `ErrorCode` enum.