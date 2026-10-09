# TÀI LIỆU HƯỚNG DẪN & ĐỀ XUẤT NÂNG CẤP BACKEND (BE IMPLEMENTATION GUIDE)
**Dự án**: Build Your Christmas — Rừng Trong Phố (Hệ thống E-Commerce Bán & Trang Trí Cây Thông Noel)  
**Tài liệu tham chiếu**: `API_CONTRACT.md`, `FE_API_REFERENCE.md`, `openapi.yaml`, `ERROR_CODES.md`  
**Dành cho**: Đội ngũ Backend (Node.js + Express + TypeScript + Mongoose)

---

## MỤC LỤC
1. [Bối cảnh & Mục tiêu đồng bộ FE-BE](#1-bối-cảnh--mục-tiêu-đồng-bộ-fe-be)
2. [Chi tiết Đặc tả API & Controller cần bổ sung](#2-chi-tiết-đặc-tả-api--controller-cần-bổ-sung)
   - [2.1. Module Auth & Profile (GET /me, PATCH /me)](#21-module-auth--profile)
   - [2.2. Module Cart & Khách vãng lai (Guest Cart & Merge)](#22-module-cart--khách-vãng-lai)
   - [2.3. Module Order & Tồn kho nguyên tử (Atomic Stock & Restock)](#23-module-order--tồn-kho-nguyên-tử)
   - [2.4. Module Vận chuyển & Địa chỉ (Mở rộng ngoài HCM)](#24-module-vận-chuyển--địa-chỉ)
   - [2.5. Module Khuyến mãi (Coupons & Discounts)](#25-module-khuyến-mãi)
   - [2.6. Module Tải tệp lên Cloud (Media Uploads)](#26-module-tải-tệp-lên-cloud)
   - [2.7. Module Webhook Thanh toán (PayOS / MoMo / VNPay)](#27-module-webhook-thanh-toán)
   - [2.8. Module Thông báo (Read-all) & Admin Analytics](#28-module-thông-báo--admin-analytics)
3. [Đề xuất Cập nhật Schema Mongoose](#3-đề-xuất-cập-nhật-schema-mongoose)
4. [Bổ sung Mã lỗi chuẩn (Error Codes)](#4-bổ-sung-mã-lỗi-chuẩn)
5. [Checklist Triển khai & Unit Test](#5-checklist-triển-khai--unit-test)

---

## 1. BỐI CẢNH & MỤC TIÊU ĐỒNG BỘ FE-BE
Frontend vừa hoàn tất đợt refactor toàn diện:
- Đã sửa các luồng tính giá nhân số lượng `quantity`, luồng thêm vào giỏ hàng (`cartApi.addItem`), luồng tùy biến cây thông từ mẫu có sẵn (`/editor?clone=...`), và giao diện quản trị đơn hàng/khách hàng.
- Tuy nhiên, một số tính năng hiện đang bị giới hạn bởi backend (ví dụ: khách vãng lai chưa đăng nhập không thể lưu giỏ hàng, chỉ cho phép giao hàng tại TP.HCM `provinceId: "79"`, ảnh snapshot preview cây chưa có API upload lưu trữ, thiếu endpoint lấy thông tin tài khoản hiện tại `GET /api/auth/me`).

Tài liệu này cung cấp **đặc tả kỹ thuật chuẩn xác** (Request/Response JSON, Mongoose code mẫu, Error codes) để BE dev có thể copy và áp dụng trực tiếp vào source code `backend/src/`.

---

## 2. CHI TIẾT ĐẶC TẢ API & CONTROLLER CẦN BỔ SUNG

### 2.1. Module Auth & Profile

#### A. `GET /api/auth/me`
- **Mục đích**: Đồng bộ thông tin người dùng mới nhất khi F5 trang, lấy danh sách địa chỉ đã lưu và kiểm tra quyền admin.
- **Auth**: `Buyer` (Bearer JWT).
- **Controller logic**:
  ```ts
  // req.user được gán từ authMiddleware
  const user = await User.findById(req.user.id).select('-password');
  if (!user) return res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'Không tìm thấy người dùng' } });
  return res.json({ user });
  ```
- **Response (200)**:
  ```json
  {
    "user": {
      "_id": "6704f123456789abcdef0123",
      "name": "Nguyễn Văn A",
      "email": "nguyenvana@example.com",
      "avatarUrl": "https://cdn.example.com/avatars/user.jpg",
      "roles": ["buyer"],
      "accountStatus": "active",
      "addresses": [
        {
          "_id": "6704f222222222abcdef0123",
          "name": "Nguyễn Văn A",
          "phone": "0901234567",
          "address": "Số 123 Đường Nguyễn Huệ",
          "province": "Thành phố Hồ Chí Minh",
          "district": "Quận 1",
          "ward": "Phường Bến Nghé",
          "isDefault": true
        }
      ],
      "createdAt": "2026-10-01T10:00:00.000Z"
    }
  }
  ```

#### B. `PATCH /api/auth/me` (hoặc `PATCH /api/users/profile`)
- **Mục đích**: Cho phép người dùng cập nhật thông tin cá nhân.
- **Auth**: `Buyer`.
- **Request Body**:
  ```json
  {
    "name": "Nguyễn Văn B (tùy chọn)",
    "phone": "0987654321 (tùy chọn)",
    "avatarUrl": "https://... (tùy chọn)"
  }
  ```
- **Response (200)**: `{ "user": { ... } }`

---

### 2.2. Module Cart & Khách vãng lai

#### Vấn đề Drop-off:
Khách hàng vào Canvas Editor tự phối cây thông và phụ kiện rất hào hứng. Khi bấm "Thêm vào giỏ hàng", nếu bắt đăng nhập ngay thì tỷ lệ bỏ trang lên tới 60-70%.

#### Giải pháp Đề xuất:
1. **Guest Session Header**: Hỗ trợ nhận diện qua header `X-Session-Id: guest_xxxxxxxx` đối với các request `GET /api/cart` và `POST /api/cart/items` khi chưa có JWT token.
2. **Endpoint Gộp giỏ hàng `POST /api/cart/merge`**:
   - **Auth**: `Buyer` (gọi ngay sau khi đăng nhập thành công).
   - **Request Body**:
     ```json
     {
       "guestSessionId": "guest_123456789"
       // HOẶC gửi trực tiếp mảng items tạm:
       // "items": [{ "config": { ... }, "quantity": 1 }]
     }
     ```
   - **Controller logic**:
     - Lấy giỏ hàng của `guestSessionId`.
     - Chuyển toàn bộ item từ guest sang user cart (`userId: req.user.id`). Nếu trùng cấu hình cây (`variantId` + phụ kiện giống nhau), cộng dồn `quantity`.
     - Xóa guest cart tạm để giải phóng tài nguyên.
   - **Response (200)**: `{ "cart": { ... }, "items": [ ... ] }`

---

### 2.3. Module Order & Tồn kho nguyên tử (Atomic Stock & Restock)

#### A. Trừ kho an toàn (Chống Overselling mùa cao điểm)
Khi tạo đơn hàng `POST /api/orders`, cần kiểm tra và trừ tồn kho trực tiếp qua MongoDB Atomic Update thay vì đọc ra rồi mới ghi lại (`read-modify-write` dễ dính race condition).

```ts
// Ví dụ trừ tồn kho TreeVariant
const updatedVariant = await TreeVariant.findOneAndUpdate(
  {
    _id: item.variantId,
    stockQuantity: { $gte: item.quantity } // Chỉ trừ khi còn đủ hàng
  },
  {
    $inc: { stockQuantity: -item.quantity }
  },
  { new: true }
);

if (!updatedVariant) {
  throw new AppError('OUT_OF_STOCK', `Sản phẩm ${item.name} đã hết hàng hoặc không đủ số lượng.`);
}
```

#### B. Cơ chế Tự động Hoàn kho (Auto-Restock)
Cần gắn hook hoàn kho khi:
1. Khách hàng bấm **Hủy đơn** (`CANCEL_REQUESTED` -> `CANCELLED`).
2. Admin bấm **Hủy đơn** trên Admin Dashboard.
3. Đơn hàng online hết hạn thanh toán (sau 30 phút mà chưa thanh toán qua MoMo/PayOS).

```ts
// Hàm helper hoàn kho:
export async function restockOrderItems(order: IOrder) {
  for (const item of order.items) {
    if (item.tree?.variantId) {
      await TreeVariant.findByIdAndUpdate(item.tree.variantId, {
        $inc: { stockQuantity: item.quantity }
      });
    }
    // Hoàn kho cho các phụ kiện đi kèm (nếu phụ kiện có quản lý tồn kho)
    for (const acc of item.accessories || []) {
      if (acc.accessoryId) {
        await Accessory.findByIdAndUpdate(acc.accessoryId, {
          $inc: { stockQuantity: (acc.quantity || 1) * item.quantity }
        });
      }
    }
  }
}
```

---

### 2.4. Module Vận chuyển & Địa chỉ (Mở rộng ngoài HCM)

#### Hiện trạng:
`orderController.ts` hoặc schema Order đang chặn cứng:
```ts
if (provinceId !== "79") {
  return res.status(400).json({ error: { code: "HCM_ONLY_DELIVERY", message: "Hiện tại chỉ hỗ trợ giao hàng tại TP.HCM" } });
}
```

#### Đề xuất Tối ưu:
Cây thông Noel có 3 hình thức đóng gói (`deliveryOption`):
1. `READY_TO_DISPLAY`: Cây đã dựng sẵn và gắn phụ kiện hoàn chỉnh (cồng kềnh, dễ đổ ngã -> **chỉ giao xe tải nội thành TP.HCM `provinceId: "79"`**).
2. `DIY_KIT`: Bộ combo bao gồm cây gấp gọn trong hộp carton + hộp phụ kiện tự trang trí (**giao toàn quốc qua ViettelPost / GHN**).
3. `SEPARATE`: Giao kiện hàng riêng lẻ (**giao toàn quốc**).

**Logic kiểm tra mới**:
```ts
if (deliveryOption === 'READY_TO_DISPLAY' && provinceId !== '79') {
  return res.status(400).json({
    error: {
      code: 'READY_TO_DISPLAY_HCM_ONLY',
      message: 'Hình thức giao cây trang trí sẵn (Ready-to-display) chỉ áp dụng tại khu vực TP.HCM. Quý khách ở tỉnh khác vui lòng chọn Bộ tự trang trí (DIY Kit).'
    }
  });
}
// Nếu là DIY_KIT hoặc SEPARATE -> Cho phép mọi tỉnh thành tại Việt Nam!
```

---

### 2.5. Module Khuyến mãi (Coupons & Discounts)

#### A. Schema đề xuất: `Coupon.ts`
```ts
import { Schema, model } from 'mongoose';

export interface ICoupon {
  code: string;               // VD: 'NOEL2026', 'XMAS10'
  discountType: 'PERCENT' | 'FIXED';
  value: number;              // 10 (cho 10%) hoặc 50000 (cho 50.000đ)
  minOrderValue: number;      // Đơn tối thiểu, ví dụ 500.000đ
  maxDiscount?: number;       // Giảm tối đa nếu là PERCENT, ví dụ 100.000đ
  startDate: Date;
  endDate: Date;
  usageLimit: number;         // Tổng lượt dùng tối đa
  usedCount: number;          // Số lượt đã dùng
  isActive: boolean;
}

const couponSchema = new Schema<ICoupon>({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  discountType: { type: String, enum: ['PERCENT', 'FIXED'], required: true },
  value: { type: Number, required: true },
  minOrderValue: { type: Number, default: 0 },
  maxDiscount: { type: Number },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  usageLimit: { type: Number, default: 1000 },
  usedCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

export const Coupon = model<ICoupon>('Coupon', couponSchema);
```

#### B. Endpoint: `POST /api/coupons/apply`
- **Auth**: `Buyer`.
- **Request Body**:
  ```json
  {
    "code": "XMAS2026",
    "orderTotal": 1250000
  }
  ```
- **Validation logic**:
  1. Tìm mã `code` trong DB (uppercase, `isActive: true`). Nếu không thấy -> lỗi `COUPON_NOT_FOUND`.
  2. Kiểm tra `now >= startDate` và `now <= endDate`. Nếu hết hạn -> lỗi `COUPON_EXPIRED`.
  3. Kiểm tra `usedCount >= usageLimit`. Nếu hết lượt -> lỗi `COUPON_LIMIT_REACHED`.
  4. Kiểm tra `orderTotal < minOrderValue`. Nếu chưa đủ -> lỗi `COUPON_MIN_ORDER_NOT_MET`.
  5. Tính toán số tiền giảm:
     - Nếu `FIXED`: `discountAmount = value`.
     - Nếu `PERCENT`: `discountAmount = Math.min((orderTotal * value) / 100, maxDiscount || Infinity)`.
- **Success Response (200)**:
  ```json
  {
    "valid": true,
    "code": "XMAS2026",
    "discountAmount": 125000,
    "finalTotal": 1125000,
    "message": "Áp dụng mã giảm giá 10% thành công!"
  }
  ```

---

### 2.6. Module Tải tệp lên Cloud (Media Uploads)

#### Endpoint: `POST /api/uploads`
- **Auth**: `Buyer` hoặc `Admin`.
- **Header**: `Content-Type: multipart/form-data`.
- **Payload**: FormData có field `file` (ảnh PNG, JPG, WebP tối đa 5MB).
- **Service**: Upload lên Cloudinary hoặc AWS S3 / Cloudflare R2.
- **Success Response (201)**:
  ```json
  {
    "url": "https://res.cloudinary.com/byc/image/upload/v1728500000/designs/tree-preview-123.webp",
    "publicId": "designs/tree-preview-123",
    "width": 800,
    "height": 1000,
    "format": "webp"
  }
  ```
- **Lợi ích**: Giúp trình Editor lưu ảnh preview cây nhẹ nhàng, không lưu chuỗi base64 hàng triệu ký tự gây phình to database MongoDB Atlas.

---

### 2.7. Module Webhook Thanh toán

#### Endpoint: `POST /api/payments/webhook`
- **Mục đích**: Nhận thông báo tự động từ cổng thanh toán (PayOS / Sepay / VNPay / MoMo) khi khách chuyển khoản thành công.
- **Auth**: Public (nhưng xác thực bằng Chữ ký điện tử HMAC `x-signature` hoặc API Key bảo mật).
- **Controller logic**:
  1. Kiểm tra chữ ký HMAC từ secret key cấu hình trong file `.env`. Nếu sai -> `401 Unauthorized`.
  2. Trích xuất mã đơn hàng `orderCode` (hoặc `BYC-########`).
  3. Cập nhật đơn hàng:
     ```ts
     const order = await Order.findOneAndUpdate(
       { code: orderCode, status: 'PENDING_PAYMENT' },
       {
         status: 'PAID',
         paidAt: new Date(),
         paymentTransactionId: transactionId,
         $push: {
           statusHistory: {
             status: 'PAID',
             note: `Thanh toán thành công qua ${gateway} (Mã GD: ${transactionId})`,
             updatedAt: new Date()
           }
         }
       },
       { new: true }
     );
     ```
  4. Tạo Notification báo cho người dùng: `Tài khoản đã thanh toán thành công đơn hàng ${order.code}`.

---

### 2.8. Module Thông báo & Admin Analytics

#### A. `PATCH /api/notifications/read-all`
- **Mục đích**: Đánh dấu đã đọc tất cả thông báo của người dùng hiện tại chỉ trong 1 request duy nhất.
- **Controller**:
  ```ts
  await Notification.updateMany({ userId: req.user.id, read: false }, { read: true, readAt: new Date() });
  return res.json({ success: true, message: 'Đã đánh dấu đọc tất cả thông báo' });
  ```

#### B. `GET /api/admin/analytics`
- **Mục đích**: Cung cấp dữ liệu trực quan cho Admin dashboard.
- **Query**: `?from=2026-10-01&to=2026-12-31`.
- **Kết quả trả về**:
  - Doanh thu theo ngày/tuần.
  - Tỷ lệ phong cách Giáng sinh được yêu thích nhất (Classic, Luxury, Minimal, Cute,...).
  - Top 5 phụ kiện (Ornament, Lights, Candy,...) được gắn nhiều nhất lên cây.

---

## 3. ĐỀ XUẤT CẬP NHẬT SCHEMA MONGOOSE

### Schema `Order.ts` bổ sung các trường:
```ts
// Thêm vào Order schema
const orderSchema = new Schema<IOrder>({
  // ... các trường cũ: code, userId, items, totalAmount ...
  
  // 1. Lưu vết lịch sử chuyển đổi trạng thái đơn
  statusHistory: [
    {
      status: { type: String, required: true },
      note: { type: String },
      updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }, // null nếu do hệ thống/webhook
      updatedAt: { type: Date, default: Date.now }
    }
  ],

  // 2. Ghi chú nội bộ cho admin / kho
  internalNotes: { type: String, default: '' },

  // 3. Thông tin khuyến mãi
  discountCode: { type: String },
  discountAmount: { type: Number, default: 0 },

  // 4. Mã giao dịch thanh toán ngân hàng / cổng thanh toán
  paymentTransactionId: { type: String }
}, { timestamps: true });
```

---

## 4. BỔ SUNG MÃ LỖI CHUẨN (ERROR CODES)

Đề xuất bổ sung các mã lỗi sau vào bảng mã lỗi hệ thống (`ERROR_CODES.md`):

| HTTP Status | Error Code | Mô tả tiếng Việt |
| :--- | :--- | :--- |
| `400` | `COUPON_EXPIRED` | Mã giảm giá đã hết thời gian áp dụng |
| `400` | `COUPON_MIN_ORDER_NOT_MET` | Giá trị đơn hàng chưa đạt mức tối thiểu của mã giảm |
| `400` | `COUPON_LIMIT_REACHED` | Mã giảm giá đã hết lượt sử dụng |
| `404` | `COUPON_NOT_FOUND` | Không tìm thấy mã giảm giá hoặc mã không hợp lệ |
| `409` | `OUT_OF_STOCK` | Cây hoặc phụ kiện đã hết hàng trong kho |
| `400` | `READY_TO_DISPLAY_HCM_ONLY` | Cây dựng sẵn chỉ giao nội thành TP.HCM |
| `401` | `WEBHOOK_INVALID_SIGNATURE` | Chữ ký xác thực webhook thanh toán không khớp |
| `400` | `FILE_TOO_LARGE` | Dung lượng tệp tải lên vượt quá giới hạn (5MB) |
| `415` | `UNSUPPORTED_MEDIA_TYPE` | Định dạng tệp không được hỗ trợ (chỉ nhận ảnh) |

---

## 5. CHECKLIST TRIỂN KHAI & UNIT TEST CHO BE DEVELOPER

- [ ] **Auth**: Viết test và router cho `GET /api/auth/me` và `PATCH /api/auth/me`.
- [ ] **Cart**: Viết hàm merge giỏ hàng khi user đăng nhập.
- [ ] **Order Stock**: Sửa câu lệnh update trong `orderController.ts` sang atomic `$inc` với điều kiện `$gte`.
- [ ] **Auto Restock**: Viết unit test kiểm tra hoàn kho khi order bị đổi sang `CANCELLED`.
- [ ] **Shipping**: Sửa điều kiện kiểm tra địa chỉ, cho phép các tỉnh khác TP.HCM nếu chọn `DIY_KIT`.
- [ ] **Coupon**: Tạo model `Coupon`, thêm controller `POST /api/coupons/apply`.
- [ ] **Upload**: Cài đặt `multer` + Cloudinary SDK hoặc S3 client cho endpoint `POST /api/uploads`.
- [ ] **Notification**: Thêm router `PATCH /api/notifications/read-all`.
- [ ] **Chạy kiểm thử**: Chạy `npm test` để xác nhận tất cả test suites (như `address.test.ts`, `order.test.ts`) đều pass 100%.

---
*Tài liệu này được tạo nhằm đảm bảo sự ăn khớp hoàn hảo giữa Frontend và Backend của nền tảng Build Your Christmas.*
