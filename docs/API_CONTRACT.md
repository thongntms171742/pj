# API Contract

> **Source of Truth:** API Contract là source of truth cho giao tiếp giữa FE và BE; Backend implementation và automated tests phải được kiểm tra để bảo đảm contract phản ánh API thực tế. Backend chịu trách nhiệm cập nhật các document này trước khi đánh dấu một tính năng là DONE. Frontend dựa vào các document này để làm thay vì phải tự đoán API behavior.

## Products

### POST `/api/products`

**Purpose**: Create a new product listing.

**Authentication**: Required (JWT).

**Authorization**: Seller with `sellerStatus === "active"` (Note: Enforced by checking `user.sellerProfile.status` and `roles.includes("seller")`).

**Request Body**:
```json
{
  "title": "string (or name)",
  "price": "number",
  "condition": "number (0-100 percentage)",
  "size": "string",
  "quantity": "number (default 1)",
  "description": "string (optional)",
  "coverImage": "string (or image, optional)",
  "categoryId": "string (optional, or category name)"
}
```

**Success**: HTTP 201

**Response**:
```json
{
  "product": {
    "_id": "string",
    "title": "string",
    "price": "number",
    "status": "pending",
    "...": "mapped product fields"
  }
}
```

**Errors**:
- `400` Thiếu thông tin sản phẩm bắt buộc (title/name, price, condition, size)
- `400` Số lượng sản phẩm phải lớn hơn hoặc bằng 1
- `401` Chưa đăng nhập
- `500` Lỗi hệ thống

---

## Orders

### POST `/api/orders`

**Purpose**: Creates an order from checked cart items or direct items payload.

**Authentication**: Required (JWT).

**Authorization**: Buyer.

**Request Body**:
```json
{
  "shippingName": "string",
  "shippingPhone": "string",
  "shippingAddress": "string",
  "paymentMethod": "string (default 'COD')",
  "idempotencyKey": "string (optional)",
  "items": [
    {
      "productId": "string (or id)",
      "quantity": "number (or qty, default 1)"
    }
  ]
}
```
*Note: If `items` is not provided, the backend will fetch checked items from the user's cart.*

**Success**: HTTP 201

**Response**:
```json
{
  "order": {
    "_id": "string",
    "orderCode": "string",
    "status": "CONFIRMED (for COD) or PENDING_PAYMENT",
    "...": "mapped order fields"
  }
}
```

**Errors**:
- `400` Giỏ hàng trống
- `400` Không có sản phẩm nào được chọn trong giỏ hàng
- `400` Sản phẩm "[Title]" hiện không còn mở bán
- `400` Sản phẩm "[Title]" chỉ còn lại [X] cái
- `400` Bạn không thể tự mua sản phẩm của chính mình
- `404` Sản phẩm không tồn tại

### GET `/api/orders/:code/shipment`

**Purpose**: Retrieves shipment and live delivery tracking timeline for a specific order.

**Authentication**: Not strictly required in routes (Public), but typically called by authenticated users viewing their order.

**Authorization**: Any user with the order code.

**Request Body**: None

**Success**: HTTP 200

**Response**:
```json
{
  "shipment": {
    "id": "string",
    "orderId": "string (orderCode)",
    "provider": "string",
    "trackingNumber": "string",
    "trackingUrl": "string",
    "status": "PENDING | CREATED | PICKED_UP | IN_TRANSIT | DELIVERING | DELIVERED | CANCELLED",
    "shippedAt": "ISO date string",
    "estimatedDeliveryAt": "ISO date string",
    "deliveredAt": "ISO date string",
    "events": [
      {
        "status": "string",
        "description": "string",
        "timestamp": "ISO date string",
        "location": "string"
      }
    ]
  }
}
```

**Errors**:
- `404` Không tìm thấy đơn hàng
