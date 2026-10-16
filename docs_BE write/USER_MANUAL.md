# 🎄 Build Your Christmas — User Manual

> Tài liệu hướng dẫn sử dụng dành cho **khách hàng** và **quản trị viên**.
> Phiên bản: `v1.0 · 2026-10-15`
> Website: `https://rungtrongpho.vercel.app`

---

## Mục lục slide

**Phần A — Khách hàng**
1. Tổng quan sản phẩm
2. Đăng ký & đăng nhập
3. Duyệt cây thông Noel (catalog)
5. Tạo thiết kế với AI Designer
6. Lưu & chia sẻ thiết kế
7. Thêm sản phẩm vào giỏ hàng
8. Checkout & thanh toán
9. Theo dõi đơn hàng
10. Đánh giá sản phẩm
11. FAQ khách hàng

**Phần B — Quản trị viên**
12. Đăng nhập admin
13. Quản lý danh mục cây (3 tầng)
14. Quản lý phụ kiện
15. Quản lý preset thiết kế
16. Quản lý banner
17. Xử lý đơn hàng
18. Phản hồi đánh giá
19. Thống kê doanh thu

**Phần C — Vận hành & sự cố**
20. Cấu hình Cloudinary (cho dev)
21. Xử lý sự cố thường gặp
22. Liên hệ hỗ trợ

---

# PHẦN A — KHÁCH HÀNG

---

## Slide 1 — Tổng quan Build Your Christmas

**Mục tiêu:** Giới thiệu hệ thống và các tính năng chính.

**Nội dung:**
- **Build Your Christmas** (Rừng Thông Phố) là nền tảng đặt cây thông Noel trang trí sẵn và bộ DIY tự trang trí.
- 3 dòng sản phẩm chính:
  - 🌲 **Cây trang trí sẵn** (`READY_TO_DISPLAY`) — giao nội thành TP.HCM, đội ngũ trang trí tận nơi.
  - 🎨 **Bộ tự trang trí** (`DIY_KIT`) — giao toàn quốc, khách tự trang trí theo preset.
  - 📦 **Giao riêng lẻ** (`SEPARATE`) — cây + phụ kiện đóng gói riêng.
- Công cụ **AI Designer** giúp khách mô tả ý tưởng bằng tiếng Việt, hệ thống tự động đề xuất cây + phụ kiện + style phù hợp và sinh ảnh preview.
- Thanh toán linh hoạt: **COD** (nhận hàng trả tiền) hoặc **chuyển khoản VietQR** qua SePay.

**Hình minh họa đề xuất:** Hero banner trang chủ + 3 icon mô tả 3 dòng sản phẩm.

---

## Slide 2 — Đăng ký & đăng nhập

**Mục tiêu:** Hướng dẫn tạo tài khoản.

**Bước thực hiện:**
1. Vào `https://rungtrongpho.vercel.app` → bấm **"Đăng ký"** (góc phải header).
2. Điền:
   - Họ tên (bắt buộc, sẽ hiển thị trên đánh giá)
   - Email (dùng để đăng nhập, không trùng email đã đăng ký)
   - Mật khẩu (≥ 8 ký tự, khuyến nghị có chữ hoa + số)
3. Bấm **"Tạo tài khoản"** → hệ thống trả về JWT token (hạn 7 ngày), tự động đăng nhập.
4. Đăng nhập lần sau: bấm **"Đăng nhập"** → nhập email + mật khẩu.

**Token & phiên đăng nhập:**
- Token lưu trong `localStorage("token")`, tự động gắn vào header `Authorization: Bearer <token>` cho mọi request sau đó.
- Khi token hết hạn → server trả lỗi `401 TOKEN_INVALID` → FE tự động logout, chuyển về trang `/login`.

**Đăng nhập không cần tài khoản (Guest):**
- Có thể xem catalog, dùng AI Designer mà không cần đăng nhập.
- Khi thêm sản phẩm vào giỏ, hệ thống tự tạo `X-Session-Id` (lưu `localStorage`).
- Sau khi đăng nhập → gọi `POST /api/cart/merge` để **gộp giỏ hàng guest vào tài khoản**.

**Hình minh họa đề xuất:** Form đăng ký/đăng nhập + screenshot lỗi `EMAIL_ALREADY_USED` khi trùng email.

---

## Slide 3 — Duyệt cây thông Noel

**Mục tiêu:** Hướng dẫn xem catalog 3 tầng (Product → Code → Variant).

**Khái niệm "3 tầng":**
| Tầng | Ý nghĩa | Ví dụ |
|---|---|---|
| **Product** (sản phẩm) | Cây thông | "Cây thông Noel trang trí" |
| **Code** (mã cây) | Phân loại màu / kiểu | "Xanh truyền thống", "Phủ tuyết", "Tuyết bạc" |
| **Variant** (biến thể) | Size × Code SKU | "Xanh — Size M — 1m5" |

**Các bước duyệt:**
1. Vào menu **"Sản phẩm"** → grid hiển thị tất cả `TreeProduct` đang active.
2. Click vào 1 cây → mở trang chi tiết, thấy các tab **"Phân loại"** (Code) và **"Kích thước"** (Variant).
3. Chọn **Code** (vd: Xanh truyền thống) → hiện size grid với giá + tồn kho.
4. Click **size** muốn mua → hiện giá, SKU, chiều cao (cmMin – cmMax), ảnh.

**Thông tin hiển thị trên mỗi variant:**
- Size (S / M / L / XL)
- Giá (VND)
- SKU (`TREE-GREEN-M`)
- Kho còn lại (`stockQuantity`)
- Chiều cao tối thiểu – tối đa (cm)
- Đường kính tán (`diameterCm`)
- Ảnh cây trơn (`bareImage`)

**Lỗi cần lưu ý:**
- Một số variant hiển thị "Hết hàng" → không thể thêm vào giỏ, hiện badge `OUT_OF_STOCK`.
- Catalog lấy từ `GET /api/catalog/tree-products` — endpoint công khai, không cần đăng nhập.

**Hình minh họa đề xuất:** Screenshot trang catalog + trang chi tiết cây với size grid.

---

## Slide 4 — Phụ kiện & phong cách

**Mục tiêu:** Hiểu hệ thống phụ kiện và phong cách (Style).

**4 nhóm phụ kiện (`AccessoryGroup`):**

| Nhóm | Mô tả | Ví dụ `type` |
|---|---|---|
| **LIGHTS** | Đèn trang trí | `LIGHT_STRING` (dây đèn) |
| **ORNAMENT** | Đồ treo cây | `BAUBLE` (bi), `BELL` (chuông), `STAR` (ngôi sao), `CANDY` (kẹo), `BOW` (nơ) |
| **DECOR** | Vật dụng trưng bày | `STOCKING` (tất), `FIGURINE` (figurine) |
| **PERSONAL** | Cá nhân hóa | `NAME_TAG`, `NAME_ORNAMENT` |

**6 phong cách (`StyleCode`):**
- `CLASSIC` — Cổ điển đỏ-xanh
- `MINIMAL` — Tối giản trắng-vàng
- `GINGERBREAD` — Phong cách bánh gừng
- `WINTER` — Mùa đông xanh băng
- `CUTE` — Dễ thương, nhiều màu
- `LUXURY` — Sang trọng vàng-đen

**Quy tắc tương thích:**
- Mỗi phụ kiện có `styleCodes[]` — danh sách style phù hợp.
- `styleCodes = []` nghĩa là **dùng được cho mọi style**.
- Ví dụ: phụ kiện "Bánh gừng" chỉ tương thích `GINGERBREAD`.

**Cá nhân hóa (`isPersonalizable`):**
- Một số phụ kiện (Name Tag, Name Ornament) cho phép nhập **tên riêng** (tối đa `personalizationMaxLength` ký tự).
- Bắt buộc nhập text trước khi lưu preset công khai (admin mới có thể tạo preset).

**Hình minh họa đề xuất:** Bảng icon 4 nhóm + 6 style với ảnh minh họa.

---

## Slide 5 — AI Designer: Tạo thiết kế bằng AI

**Mục tiêu:** Hướng dẫn dùng AI Designer sinh ý tưởng trang trí.

**Flow:**
1. Vào menu **"AI Designer"**.
2. **Ô nhập prompt** — gõ mô tả bằng tiếng Việt, ví dụ:
   > *"Cây thông cao 1m5, tông đỏ-vàng cổ điển, có dây đèn vàng ấm, nhiều quả bi đỏ và ngôi sao vàng trên đỉnh"*
3. Bấm **"Tạo gợi ý"** → backend gọi `POST /api/ai-designer/recommend`:
   - AI phân tích prompt → chọn `variantId` (cây + size), `styleId` (style phù hợp), và danh sách `accessories[]` phù hợp.
   - Trả về **bản nháp AIDesign** (lưu DB, có `id`).
4. **Xem bản nháp**:
   - Tên cây, size, style
   - Danh sách phụ kiện đề xuất + số lượng
   - **Preview ảnh** — bấm **"Tạo ảnh"** (`POST /api/ai-designer/:id/generate-image`):
     - Backend gọi KIE API (model `nano-banana-2`)
     - Sinh ảnh portrait 3:4, PNG 1K
     - Upload lên **Cloudinary** → lưu URL vào `imageUrl` + `imagePublicId`
     - Thời gian: ~ 30 giây – 8 phút (có timeout 8 phút)
5. **Điều chỉnh**:
   - Sửa số lượng phụ kiện → `POST /api/ai-designer/:id/quote` để BE tính lại giá + lợi nhuận dự kiến.
   - Đổi style, đổi size → quote lại.
6. **Lưu thiết kế** (`POST /api/ai-designer/:id/save`, cần đăng nhập):
   - Bản nháp trở thành **TreeDesign** chính thức, có slug để share.

**Lưu ý:**
- Có thể dùng AI Designer khi chưa đăng nhập (guest) — nhưng phải login trước khi lưu.
- Prompt càng chi tiết → đề xuất càng chính xác.
- Ảnh preview tạm thời nếu chưa generate — placeholder màu xám.

**Hình minh họa đề xuất:** Screenshot form nhập prompt + kết quả đề xuất + preview ảnh AI.

---

## Slide 6 — Lưu & chia sẻ thiết kế

**Mục tiêu:** Quản lý thiết kế cá nhân và chia sẻ công khai.

**Lưu thiết kế cá nhân:**
- Sau khi AI Designer trả về bản nháp ưng ý → bấm **"Lưu thiết kế"**.
- Thiết kế được lưu trong collection `TreeDesign`, gắn `ownerId = userId` của bạn.
- Truy cập **"Thiết kế của tôi"** → xem tất cả design đã lưu.

**Chia sẻ thiết kế:**
- Mỗi design có **slug** duy nhất (vd: `cay-giang-sinh-am-cung-2026`).
- URL chia sẻ: `https://rungtrongpho.vercel.app/tree/<slug>`
- Có 2 chế độ:
  - `isPublic = true` (mặc định) → bất kỳ ai có link đều xem được.
  - `isPublic = false` → chỉ mình bạn xem (cần đăng nhập đúng tài khoản).

**Duplicate (nhân bản) thiết kế:**
- Thấy thiết kế của người khác (public) → bấm **"Lưu bản sao"**.
- Hệ thống clone thành thiết kế mới thuộc sở hữu của bạn, kèm trường `duplicatedFrom` trỏ về thiết kế gốc.

**Preset thiết kế (do Admin tạo):**
- Hiển thị ở trang chủ / menu "Preset" / trong AI Designer làm gợi ý.
- Preset **không thể sửa / xóa** bởi khách (`403 FORBIDDEN` nếu cố).

**Hình minh họa đề xuất:** Trang "Thiết kế của tôi" + modal chia sẻ link.

---

## Slide 7 — Thêm sản phẩm vào giỏ hàng

**Mục tiêu:** Hướng dẫn thêm cây / phụ kiện vào giỏ.

**Cách 1 — Thêm trực tiếp từ catalog:**
1. Trang chi tiết cây → đã chọn size → bấm **"Thêm vào giỏ"**.
2. Modal hiện cho chọn:
   - **Phong cách** (Style) — optional
   - **Phụ kiện** — tick chọn từng món, kéo số lượng
   - **Hình thức giao**: `READY_TO_DISPLAY` / `DIY_KIT` / `SEPARATE`
3. Bấm **"Xác nhận"** → gọi `POST /api/cart/items` với `config: { variantId, accessories[], deliveryOption }`.

**Cách 2 — Thêm từ thiết kế AI:**
1. Trong AI Designer, sau khi lưu design → bấm **"Thêm vào giỏ"**.
2. Hệ thống lấy `config` từ design, gọi `POST /api/cart/items` với `designId`.

**Cấu trúc `DesignConfig` lưu trong cart item:**
```json
{
  "variantId": "65f1a2b3...",
  "styleId": "65f1a2b4...",
  "accessories": [
    { "accessoryId": "65f1a2b5...", "quantity": 12, "personalizationText": "Anh Thư" }
}
```
```json
  "deliveryOption": "READY_TO_DISPLAY"
}
```

**Quản lý giỏ (`GET /api/cart`):**
- Mỗi item hiển thị:
  - Ảnh preview (`previewImage`)
  - Tên variant + style
  - **Snapshot giá** tại thời điểm thêm (`priceSnapshot`)
  - **Giá hiện tại** (`currentUnitTotal`) — BE tự tính lại mỗi lần `GET`
  - Badge **"Giá đã thay đổi"** nếu `priceChanged = true`
  - Cảnh báo **"Cấu hình không hợp lệ"** nếu `warning` không rỗng

**Thao tác trong giỏ:**
- ✅ Tick chọn item để checkout (`PATCH /api/cart/items/:id` với `checked: true`)
- ✏️ Sửa số lượng
- 🗑️ Xóa item

**Lỗi thường gặp:**
- `OUT_OF_STOCK` — phụ kiện hoặc cây hết hàng giữa lúc add.
- `DELIVERY_AREA_NOT_SUPPORTED` — `READY_TO_DISPLAY` chỉ giao TP.HCM (`shippingProvinceId = "79"`).

**Hình minh họa:** Screenshot trang giỏ hàng + modal cấu hình.

---

## Slide 8 — Checkout & thanh toán

**Mục tiêu:** Hướng dẫn đặt hàng và thanh toán.

**Bước 1 — Xác nhận thiết kế:**
- Trước khi đặt hàng, FE bắt buộc hiển thị **preview** thiết kế cuối cùng.
- Khách phải tick ☑️ **"Tôi đồng ý với thiết kế này"** (`designConfirmed: true`).
- Nếu không tick → server trả `400 DESIGN_NOT_CONFIRMED`.

**Bước 2 — Điền địa chỉ giao hàng:**
- Họ tên + SĐT người nhận
- Địa chỉ (số nhà, tên đường)
- Chọn **Tỉnh / Phường** từ dropdown (`GET /api/addresses/provinces`, `.../communes`)
- Mặc định: `shippingProvinceId = "79"` (TP.HCM) nếu mua cây trang trí sẵn.

**Bước 3 — Chọn phương thức thanh toán:**

| Phương thức | Khi nào dùng | Status sau đặt |
|---|---|---|
| **COD** (nhận hàng trả tiền) | Mặc định, áp dụng toàn quốc | `CONFIRMED` ngay |
| **Chuyển khoản VietQR** (SePay) | Muốn thanh toán trước | `PENDING_PAYMENT` → chờ CK |

**Bước 4 — Đặt hàng:**
- Bấm **"Đặt hàng"** → gọi `POST /api/orders`.
- Server reserve kho atomically:
  - Trừ `stockQuantity` của variant + phụ kiện
  - Nếu bất kỳ item nào hết → rollback toàn bộ, trả `409 OUT_OF_STOCK`
- Snapshot toàn bộ `config + pricing` vào order (sau này catalog đổi giá không ảnh hưởng).

**Bước 5 — Thanh toán (chỉ với ONLINE):**
- Sau khi đặt, mở trang chi tiết đơn → bấm **"Xem QR thanh toán"**.
- Hiển thị:
  - Mã QR VietQR (sinh từ SePay, scan bằng app ngân hàng)
  - Số tài khoản, chủ tài khoản, ngân hàng
  - **Nội dung chuyển khoản**: `BYC 12345678` (mã đơn, copy đúng để đối chiếu tự động)
  - Số tiền chính xác
- Sau khi chuyển khoản thành công:
  - SePay gửi webhook về server → tự động cập nhật order sang `PAID` → `CONFIRMED`
  - Realtime notification qua Socket.io (`order:paid`, `payment:success`)

**Lưu ý quan trọng:**
- Nhập **đúng nội dung chuyển khoản** (chứa mã `BYC-XXXXXXXX`) để hệ thống tự nhận diện.
- Nếu nhập sai → đơn ở `PENDING_PAYMENT` mãi mãi → liên hệ admin xử lý tay.
- Có thể hủy đơn `PENDING_PAYMENT` bất kỳ lúc nào qua **"Đơn hàng của tôi"** → bấm "Hủy".

**Hình minh họa đề xuất:** Form checkout + QR code mẫu.

---

## Slide 9 — Theo dõi đơn hàng

**Mục tiêu:** Hiểu vòng đời đơn hàng.

**Trạng thái đơn (`OrderStatus`):**
```
PENDING_PAYMENT → PAID → CONFIRMED → PACKING → SHIPPING → DELIVERING → DELIVERED → COMPLETED
                                          ↓
                              CANCEL_REQUESTED → CANCELLED
```
                                    ↓
                              DISPUTED → REFUNDED
```

**Bảng trạng thái:**

| Trạng thái | Mô tả | Ai đặt được? |
|---|---|---|
| `PENDING_PAYMENT` | Chờ thanh toán (chỉ ONLINE) | Auto sau `POST /orders` |
| `PAID` | Đã nhận tiền | Auto từ webhook SePay |
| `CONFIRMED` | Đã xác nhận đơn | Auto (COD) hoặc sau `PAID` |
| `PACKING` | Đang đóng gói | Admin chuyển |
| `SHIPPING` | Đang giao (`SHIPPING` + trackingNumber) | Admin tạo shipment |
| `DELIVERING` | Đang giao đến | Hệ thống cập nhật |
| `DELIVERED` | Đã giao thành công | Auto |
| `COMPLETED` | Hoàn tất (đã đánh giá hoặc quá hạn) | Buyer hoặc Auto |
| `CANCELLED` | Đã hủy | Buyer (nếu `PENDING_PAYMENT`/`PAID`) hoặc Admin |
| `CANCEL_REQUESTED` | Yêu cầu hủy (khi ≥ `CONFIRMED`) | Buyer |
| `DISPUTED` | Tranh chấp | Buyer |
| `REFUNDED` | Hoàn tiền | Admin |

**Xem lịch sử đơn (`GET /api/orders`):**
- Trang **"Đơn hàng của tôi"** liệt kê tất cả đơn.
- Click vào đơn → thấy:
  - `statusHistory[]` — lịch sử chuyển trạng thái (ai, khi nào, lý do)
  - `trackingNumber` + `trackingUrl` — link theo dõi vận đơn
  - `shippingEvents[]` — log hành trình (`CREATED` → `IN_TRANSIT` → `DELIVERING` → `DELIVERED`)
  - `estimatedDeliveryAt` — ngày dự kiến giao

**Quy tắc buyer được chuyển trạng thái:**
- `CANCELLED` — chỉ khi `PENDING_PAYMENT` hoặc `PAID`
- `CANCEL_REQUESTED` — khi đã `CONFIRMED`
- `DELIVERED` — xác nhận đã nhận hàng
- `COMPLETED` — xác nhận hoàn tất (kích hoạt đánh giá)
- `DISPUTED` — mở tranh chấp

**Lưu ý:**
- Khi buyer submit review thành công → đơn `DELIVERED` tự động chuyển sang `COMPLETED`.
- Nếu `hasPersonalization = true` và đang ở `PACKING` → không thể yêu cầu hủy (`409 ORDER_CANCEL_NOT_ALLOWED`).

**Hình minh họa đề xuất:** Timeline trạng thái + trang chi tiết đơn.

---

## Slide 10 — Đánh giá sản phẩm

**Mục tiêu:** Hướng dẫn đánh giá sau khi nhận hàng.

**Điều kiện được đánh giá:**
1. Đơn hàng phải thuộc tài khoản đang đăng nhập.
2. Đơn ở trạng thái `DELIVERED` hoặc `COMPLETED`.
3. Mỗi sản phẩm trong 1 đơn chỉ được đánh giá **1 lần**.

**Bước thực hiện:**
1. Vào **"Đơn hàng của tôi"** → chọn đơn `DELIVERED`.
2. Hệ thống tự gọi `GET /api/orders/:orderId/reviewable-items` → liệt kê sản phẩm có thể đánh giá.
3. Click **"Đánh giá"** trên từng sản phẩm.
4. Modal form:
   - **Chọn số sao** (1 → 5, bắt buộc)
   - **Nhận xét** (text, optional)
   - **Upload ảnh** — bấm **"Thêm ảnh"**:
     - Tối đa 5MB/ảnh, định dạng PNG/JPG/WebP/SVG
     - Mỗi ảnh gọi `POST /api/uploads` trước → lấy `url` Cloudinary → truyền vào `images[]`
   - Bấm **"Gửi đánh giá"** → `POST /api/products/:productId/reviews`
5. Sau khi gửi:
   - Đơn tự động chuyển sang `COMPLETED`
   - Notification "Cảm ơn bạn đã đánh giá" gửi về tài khoản
   - Sản phẩm cập nhật `ratingAverage` + `reviewCount` ngay lập tức

**Xem đánh giá của tôi:**
- Menu **"Đánh giá của tôi"** → `GET /api/reviews/my` → liệt kê tất cả review đã gửi.

**Xem đánh giá trên trang sản phẩm:**
- Phần dưới trang chi tiết sản phẩm hiển thị:
  - Rating trung bình (1 chữ số thập phân)
  - Phân bố sao (5★ / 4★ / 3★ / 2★ / 1★)
  - Danh sách review có ảnh, có phản hồi admin

**Lỗi thường gặp:**
- `REVIEW_NOT_ALLOWED` — đơn chưa `DELIVERED`.
- `REVIEW_ALREADY_EXISTS` — đã đánh giá sản phẩm này trong đơn này rồi.
- `REVIEW_RATING_INVALID` — rating không phải số nguyên 1–5.

**Hình minh họa đề xuất:** Modal đánh giá + danh sách review trên trang sản phẩm.

---

## Slide 11 — FAQ khách hàng

**Mục tiêu:** Trả lời nhanh các câu hỏi thường gặp.

**1. Tôi muốn hủy đơn đã thanh toán online, hoàn tiền thế nào?**
- Đơn ở `PENDING_PAYMENT` hoặc `PAID` → vào chi tiết đơn → bấm **"Hủy đơn"**.
- Admin xử lý → tiền hoàn về tài khoản ngân hàng bạn đã CK trong 3–7 ngày làm việc.

**2. Đơn `CONFIRMED` rồi mà tôi đổi ý?**
- Bấm **"Yêu cầu hủy"** → admin sẽ xem xét. Nếu đồng ý → chuyển `CANCELLED`, hoàn tiền theo phương thức ban đầu.
- Lưu ý: nếu đơn đã `PACKING` hoặc có phụ kiện cá nhân hóa → có thể bị từ chối.

**3. Tôi chuyển khoản nhưng nội dung sai, làm sao?**
- Liên hệ admin qua fanpage hoặc hotline, cung cấp:
  - Mã đơn (`BYC-XXXXXXXX`)
  - Số tiền + thời gian CK + ảnh chụp bill
- Admin đối chiếu thủ công → cập nhật `PAID` cho đơn.

**4. Tôi ở tỉnh, có mua được cây trang trí sẵn không?**
- **Không.** `READY_TO_DISPLAY` chỉ phục vụ TP.HCM (vì đội ngũ đến tận nơi trang trí).
- Nếu ở tỉnh → chọn `DIY_KIT` (bộ tự trang trí) hoặc `SEPARATE` (giao riêng lẻ).

**5. Phụ kiện cá nhân hóa (Name Tag) đặt tên bao nhiêu ký tự?**
- Tối đa `personalizationMaxLength` ký tự (hiển thị trên trang phụ kiện).
- Tiếng Việt có dấu đều được, ký tự đặc biệt vui lòng hỏi trước admin.

**6. AI Designer có mất phí không?**
- **Miễn phí** lúc dùng thử. Sau khi sinh ảnh preview thành công → cần đăng nhập để lưu design.

**7. Ảnh tôi upload lên đánh giá có bị mất sau này không?**
- Ảnh upload qua `POST /api/uploads` được lưu trên **Cloudinary** (vĩnh viễn).
- Nếu server production cấu hình đúng → không bao giờ mất.

**8. Tôi quên mật khẩu?**
- Hiện chưa có flow "Quên mật khẩu" tự động. Liên hệ admin qua fanpage để reset.

---

# PHẦN B — QUẢN TRỊ VIÊN

---

## Slide 12 — Đăng nhập admin

**Mục tiêu:** Truy cập trang quản trị.

**Tài khoản admin mặc định (sau khi seed):**
- Email: `admin@buildyourchristmas.vn`
- Password: lấy từ `SEED_ADMIN_PASSWORD` trong `backend/.env`

**Đăng nhập:**
1. Vào `https://rungtrongpho.vercel.app/admin/login`.
2. Nhập email + password → bấm **"Đăng nhập"**.
3. Token JWT lưu vào `localStorage("adminToken")` (riêng biệt với token khách).
4. Vào dashboard admin tại `/admin`.

**Tạo thêm admin:**
- Vào MongoDB Atlas → collection `users` → tìm user muốn cấp quyền → sửa `roles` từ `["buyer"]` thành `["buyer", "admin"]`.

**Phân quyền:**
- `requireAuth` — bắt buộc đăng nhập.
- `requireAdmin` — bắt buộc role `admin` (middleware ở `backend/src/middleware/auth.ts`).
- API admin đều trả `403 FORBIDDEN` nếu không đúng quyền.

---

## Slide 13 — Quản lý danh mục cây (3 tầng)

**Mục tiêu:** CRUD Product → Code → Variant.

**⚠️ QUAN TRỌNG — Endpoint legacy đã chặn:**
- `POST /api/admin/trees` → **400 INVALID_INPUT** (đã chặn)
- `PATCH /api/admin/trees/:id` → **400 INVALID_INPUT** (đã chặn)
- Phải dùng **flow 3 bước** dưới đây.

**Bước 1 — Tạo Product (cây cha):**
```
POST /api/admin/tree-products
Body: { name, category?, density, coverImage?, images?, aspectRatio?, videoUrl? }
→ Trả về { treeProduct: { _id, name, slug, ... } }   ← CHỈ có product
```

**Bước 2 — Tạo Code (phân loại màu/kiểu):**
```
POST /api/admin/tree-products/:productId/codes
Body: { code, name, material?, image?, sortOrder? }
→ Trả về { treeCode: { _id, code, name, ... } }
```

**Bước 3 — Tạo Variant (size × code SKU):**
```
POST /api/admin/tree-codes/:codeId/variants
Body: { size, sku, price, stockQuantity, heightCmMin, heightCmMax,
        diameterCm?, images?, bareImage? }
→ Trả về { variant: { _id, sku, price, stockQuantity, ... } }
```

**Endpoint hỗ trợ:**
- `GET /api/admin/tree-products` — list grouped (product + codes + variants)
- `PATCH /api/admin/tree-products/:productId` — sửa product
- `DELETE /api/admin/tree-products/:productId` — xóa product (cascade codes + variants)
- `PATCH /api/admin/tree-codes/:codeId` — sửa code
- `DELETE /api/admin/tree-codes/:codeId` — xóa code
- `PATCH /api/admin/tree-variants/:variantId` — sửa variant
- `DELETE /api/admin/tree-variants/:variantId` — xóa variant
- **`PATCH /api/admin/tree-variants/bulk`** — sửa nhiều variant cùng lúc (vd: tăng giá 10% tất cả variant của 1 product)

**Best practice:**
- Luôn tạo Product → Code → Variant tuần tự. Không bỏ tầng nào.
- `code` phải unique trong cùng product (vd: `TREE-GREEN`, `TREE-SNOW`).
- `sku` phải unique toàn hệ thống (vd: `TREE-GREEN-M`).
- `price` > 0, `stockQuantity` ≥ 0.
- Tắt `isActive = false` thay vì xóa → giữ lịch sử order cũ.

---

## Slide 14 — Quản lý phụ kiện

**Mục tiêu:** CRUD phụ kiện trang trí.

**Endpoint:**
- `GET /api/admin/accessories` — list
- `POST /api/admin/accessories` — tạo
- `PATCH /api/admin/accessories/:id` — sửa
- `DELETE /api/admin/accessories/:id` — xóa

**Cấu trúc `Accessory`:**
```json
{
  "group": "LIGHTS" | "ORNAMENT" | "DECOR" | "PERSONAL",
  "type": "LIGHT_STRING" | "BAUBLE" | ...,
  "name": "Dây đèn LED vàng ấm 5m",
  "description": "...",
  "image": "https://res.cloudinary.com/.../acc.jpg",
  "price": 89000,
  "stock": 200,
  "styleCodes": ["CLASSIC", "LUXURY"],
  "maxQtyBySize": { "S": 5, "M": 8, "L": 12 },
  "isPersonalizable": false,
  "personalizationMaxLength": 0,
  "productionDays": 1
}
```

**Quy tắc:**
- `group` quyết định section hiển thị trong editor (LIGHTS / ORNAMENT / DECOR / PERSONAL).
- `type` cụ thể hơn — dùng để icon và filter.
- `styleCodes = []` nghĩa là dùng được cho mọi style.
- `maxQtyBySize` giới hạn số lượng tối đa theo size cây (vd: cây size S chỉ cho ≤ 5 dây đèn).
- `isPersonalizable = true` → khách phải nhập `personalizationText` (vd: tên trên Name Tag).
- `productionDays` cộng vào thời gian sản xuất đơn.

**Best practice:**
- Luôn upload ảnh phụ kiện qua `POST /api/uploads` (lấy Cloudinary URL) trước khi tạo record.
- Tên phụ kiện nên có size / chiều dài / thông số kỹ thuật (vd: "Dây đèn LED 5m — vàng ấm").

---

## Slide 15 — Quản lý preset thiết kế

**Mục tiêu:** Tạo thiết kế mẫu hiển thị ở trang chủ.

**Preset là gì?**
- Là `TreeDesign` với `isPreset = true` + `ownerId = null`.
- Hiển thị công khai, dùng làm gợi ý cho khách.
- Khách có thể duplicate preset về tài khoản của họ, nhưng **không thể sửa/xóa preset gốc**.

**Tạo preset:**
1. Mở AI Designer (`/admin/ai-designer`), gõ prompt hoặc chọn thủ công cây + style + phụ kiện.
2. Điền tên preset (vd: "Giáng Sinh Cổ Điển 2026").
3. Generate ảnh preview.
4. Trước khi save: **mọi phụ kiện `isPersonalizable` phải có `personalizationText`** (vd: Name Tag phải có tên mẫu "Gia đình Anh Minh").
5. Bấm **"Lưu preset"** → `POST /api/ai-designer/:id/save` với `asPreset: true`.

**Endpoint:**
- `GET /api/catalog/presets` — list preset public (catalog)
- `GET /api/admin/presets` — list toàn bộ preset (admin)
- `DELETE /api/admin/presets/:id` — xóa preset

**Best practice:**
- Mỗi mùa Giáng Sinh tạo ~ 5–10 preset đa dạng (cổ điển, hiện đại, sang trọng, dễ thương...).
- Ảnh preview **bắt buộc** — preset không có ảnh không hiển thị trên trang chủ.
- Test preset bằng cách vào trang chủ khách (ẩn admin) xem đã hiển thị đúng chưa.

---

## Slide 16 — Quản lý banner

**Mục tiêu:** Carousel hero trang chủ.

**Endpoint:**
- `GET /api/banners?position=home_hero` — public list
- `GET /api/admin/banners` — admin list (tất cả, kể cả inactive)
- `POST /api/admin/banners` — tạo
- `PATCH /api/admin/banners/:id` — sửa
- `DELETE /api/admin/banners/:id` — xóa

**Cấu trúc:**
```json
{
  "title": "Mừng Giáng Sinh Rộn Ràng 2026",
  "imageUrl": "https://res.cloudinary.com/.../banner1.jpg",
  "linkUrl": "/products",
  "position": "home_hero",
  "isActive": true,
  "sortOrder": 1
}
```

**Best practice:**
- Ảnh banner **luôn upload qua `/api/uploads`** trước → lấy `url` Cloudinary.
- Kích thước đề xuất: 1920×600 px (tỉ lệ 16:5), định dạng WebP để nhẹ.
- `sortOrder` càng nhỏ → hiển thị trước.
- Đặt `isActive = false` thay vì xóa → giữ lịch sử.

---

## Slide 17 — Xử lý đơn hàng

**Mục tiêu:** Vận hành đơn từ `CONFIRMED` → `DELIVERED`.

**Workflow admin mỗi ngày:**
1. **Vào "Đơn hàng"** → filter `status = CONFIRMED` hoặc `PACKING`.
2. **Đóng gói** (PACKING):
   - Đóng cây + phụ kiện theo `config`.
   - Nếu có `hasPersonalization = true` → kiểm tra `personalizationText` từng line.
3. **Tạo vận đơn** (`POST /api/orders/:id/shipment`):
   - Điền `pickup`: tên + SĐT shop, địa chỉ shop, tỉnh "79", phường xã.
   - Server gen `trackingNumber = BYC#######` và `trackingUrl`.
   - Order chuyển `PACKING → SHIPPING`.
4. **Theo dõi giao hàng**:
   - Mở chi tiết đơn → xem `shippingEvents[]` cập nhật realtime.
   - `CREATED` → `IN_TRANSIT` → `DELIVERING` → `DELIVERED`.
5. **Đã giao xong:**
   - Order auto chuyển `SHIPPING → DELIVERING → DELIVERED`.
   - Đợi khách xác nhận → `COMPLETED` (hoặc tự chuyển sau 7 ngày).
6. **Xử lý hủy đơn:**
   - Nếu khách gửi `CANCEL_REQUESTED` → admin review → chấp nhận (`CANCELLED`) hoặc từ chối (`CONFIRMED`).
   - Khi `CANCELLED` → tự động restore kho.

**Endpoint quan trọng:**
- `GET /api/admin/orders?status=CONFIRMED` — list đơn theo status
- `PATCH /api/orders/:id/status` — chuyển trạng thái
- `POST /api/orders/:id/shipment` — tạo vận đơn
- `POST /api/admin/orders/:id/notes` — ghi chú nội bộ

**Lưu ý:**
- Sau khi tạo shipment, nếu khách yêu cầu hủy → admin phải xử lý thủ công với đơn vị vận chuyển.
- Không thể chuyển ngược trạng thái (vd: `DELIVERED` → `SHIPPING`).

---

## Slide 18 — Phản hồi đánh giá

**Mục tiêu:** Quản lý đánh giá khách hàng.

**Endpoint:**
- `GET /api/admin/reviews?page=1&limit=20&status=APPROVED&rating=5&productId=...`
- `POST /api/admin/reviews/:id/reply` — phản hồi
- `PATCH /api/admin/reviews/:id/status` — ẩn/hiện (`APPROVED` / `HIDDEN`)
- `DELETE /api/admin/reviews/:id` — xóa

**Phản hồi đánh giá:**
```
POST /api/admin/reviews/:id/reply
Body: { "comment": "Dạ cảm ơn bạn đã ủng hộ shop ạ! 🎄" }
→ Hiển thị ngay dưới review trên trang sản phẩm**
```

**Ẩn đánh giá vi phạm:**
- Chứa ngôn từ thô tục, spam, hoặc không liên quan.
- `PATCH /api/admin/reviews/:id/status` với body `{ "status": "HIDDEN" }`.
- Review ẩn **không tính** vào `ratingAverage` và `reviewCount` của `TreeProduct`.

**Best practice:**
- Phản hồi **mọi review 1–3 sao** trong vòng 24h.
- Phản hồi review tích cực để tăng uy tín shop.
- Không xóa review trừ khi vi phạm nghiêm trọng — ưu tiên ẩn để giữ minh bạch.

---

## Slide 19 — Thống kê doanh thu

**Mục tiêu:** Dashboard tổng quan cho admin.

**Endpoint:**
- `GET /api/admin/stats/overview` — tổng quan doanh thu
- `GET /api/admin/stats/orders` — phân tích đơn hàng

**Số liệu hiển thị:**
- `totalRevenue` — tổng doanh thu (đơn `COMPLETED`)
- `totalOrders` — tổng số đơn
- `ordersByStatus[]` — phân bố theo trạng thái
- `topProducts[]` — sản phẩm bán chạy
- `totalSpent` — tổng chi tiêu của khách (đơn `COMPLETED`)
- Biểu đồ doanh thu theo ngày / tuần / tháng

**Cách dùng:**
1. Vào **"Thống kê"** (`/admin/stats`).
2. Chọn khoảng thời gian (7 ngày / 30 ngày / tùy chỉnh).
4. Xem dashboard — biểu đồ tự động render.
5. Export CSV (nếu có) → tải về máy.

**Lưu ý:**
- Doanh thu chỉ tính đơn `COMPLETED` — đơn đang giao chưa tính.
- Phí vận chuyển / trang trí đã tách riêng, có thể drill-down.

---

# PHẦN C — VẬN HÀNH & SỰ CỐ

---

## Slide 20 — Cấu hình Cloudinary (cho dev)

**Mục tiêu:** Đảm bảo môi trường local và production đều upload ảnh lên Cloudinary.

**Tại sao quan trọng:**
- Local không có Cloudinary → ảnh lưu vào `backend/uploads/` (ephemeral, mất khi restart).
- Production phải có Cloudinary → ảnh vĩnh viễn, CDN toàn cầu.

**Cấu hình `.env`:**
```bash
# Cách 1 (khuyên dùng): URL tổng hợp
CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>

# Cách 2: 3 biến rời rạc
CLOUDINARY_CLOUD_NAME=<cloud_name>
CLOUDINARY_API_KEY=<api_key>             ← SỐ, KHÔNG phải URL
CLOUDINARY_API_SECRET=<api_secret>
CLOUDINARY_FOLDER=buildyourchristmas

# Bắt buộc Cloudinary trên Production
REQUIRE_CLOUDINARY=true
```

**Sai lầm thường gặp (xem file `.env` hiện tại):**
```bash
CLOUDINARY_API_KEY=cloudinary://565185963225284:f9VN2ZUPg4p8CQPvPnraTDuPqws@wxqrg68a
                                                              ↑
                                              Sai! Nhét URL vào key → isCloudinaryEnabled() = false
```

**Setup:**
1. Đăng ký tài khoản miễn phí tại [cloudinary.com](https://cloudinary.com).
2. Vào **Dashboard** → copy **Cloud Name**, **API Key**, **API Secret**.
3. Điền vào `.env` theo **Cách 2** (3 biến rời rạc).
4. Restart backend → `isCloudinaryEnabled()` trả `true`.
5. Test upload 1 ảnh qua `POST /api/uploads` → response `url` phải bắt đầu bằng `https://res.cloudinary.com/`.

**Trên Render (production):**
- Vào **Environment** tab → thêm 4 biến `CLOUDINARY_URL` (hoặc 3 biến rời) + `REQUIRE_CLOUDINARY=true`.
- Restart service.
- **KHÔNG** để trống biến nào — nếu thiếu → upload sẽ 500.

---

## Slide 21 — Xử lý sự cố thường gặp

**Mục tiêu:** Troubleshoot nhanh các lỗi phổ biến.

**Bảng lỗi & cách xử lý:**

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| Upload ảnh trả `500 INTERNAL_ERROR` | Cloudinary chưa cấu hình đúng | Kiểm tra 3 biến env, xem Slide 20 |
| Ảnh trong review hiển thị "broken image" | Server restart → mất ảnh local | Fix Cloudinary + re-upload ảnh |
| Đơn `PENDING_PAYMENT` mãi không `PAID` | Sai nội dung CK | Liên hệ admin đối chiếu thủ công |
| Webhook SePay không gọi về | URL webhook sai hoặc chưa cấu hình | Kiểm tra `SEPAY_API_KEY` + URL `https://<domain>/api/payments/sepay/webhook` |
| Catalog trống | Chưa seed data | `npm run seed -- --confirm-seed` |
| AI Designer timeout | KIE API quá tải hoặc prompt quá phức tạp | Retry, hoặc đơn giản prompt |
| Frontend không gọi được API | CORS block | Kiểm tra origin có trong `ALLOWED_ORIGINS` của `app.ts` |
| Review submit lỗi `REVIEW_NOT_ALLOWED` | Đơn chưa `DELIVERED` | Đợi admin xác nhận đã giao |
| 401 TOKEN_INVALID liên tục | Token hết hạn (7 ngày) hoặc secret thay đổi | Logout → login lại |

**Checklist khi deploy production:**
- [ ] Đủ 4 biến Cloudinary (`CLOUDINARY_URL` hoặc 3 biến rời)
- [ ] `REQUIRE_CLOUDINARY=true`
- [ ] `JWT_SECRET` đã generate random (`openssl rand -base64 48`)
- [ ] `MONGODB_URI` trỏ đúng cluster production
- [ ] `SEPAY_API_KEY` + webhook URL đã đăng ký trên SePay dashboard
- [ ] CORS có chứa domain FE (`rungtrongpho.vercel.app`)
- [ ] Seed data đã chạy (`npm run seed -- --confirm-seed` qua Shell)
- [ ] Test `/api/health` trả `{ "status": "ok" }`

---

## Slide 22 — Liên hệ hỗ trợ

**Mục tiêu:** Kênh liên hệ khi cần trợ giúp.

**Khách hàng:**
- 📧 Email: `support@buildyourchristmas.vn`
- 💬 Fanpage Facebook: `fb.com/rungtrongpho`
- 📞 Hotline: `0901-XXX-XXX` (8h–22h mỗi ngày)

**Developer / Admin kỹ thuật:**
- 📁 Tài liệu API: `/docs_BE write/` trong repo
- 📁 API contract: `docs_BE write/API_CONTRACT.md`
- 📁 OpenAPI spec: `docs_BE write/openapi.yaml` (import Swagger UI)
- 🐛 Báo bug: tạo issue trong repo GitHub
- 💬 Chat nội bộ: Slack channel `#byc-dev`

**Production URLs:**
- 🌐 Web: `https://rungtrongpho.vercel.app`
- 🔌 API: `https://christmas-8ca4.onrender.com/api`
- 💚 Health check: `https://christmas-8ca4.onrender.com/api/health`

---

# PHỤ LỤC

## A. Bảng mã lỗi thường gặp (Error Codes)

| Code | HTTP | Ý nghĩa |
|---|---|---|
| `MISSING_FIELD` | 400 | Thiếu trường bắt buộc |
| `INVALID_INPUT` | 400 | Dữ liệu không hợp lệ |
| `UNAUTHORIZED` | 401 | Chưa đăng nhập |
| `INVALID_CREDENTIALS` | 401 | Sai email/password |
| `TOKEN_INVALID` | 401 | Token hết hạn hoặc sai |
| `FORBIDDEN` | 403 | Không có quyền |
| `NOT_FOUND` / `TREE_NOT_FOUND` / `ORDER_NOT_FOUND` / `DESIGN_NOT_FOUND` | 404 | Không tìm thấy resource |
| `EMAIL_ALREADY_USED` | 409 | Email đã đăng ký |
| `OUT_OF_STOCK` | 409 | Hết hàng |
| `ACCESSORY_DUPLICATED` | 409 | Trùng SKU |
| `DELIVERY_AREA_NOT_SUPPORTED` | 422 | Tỉnh không hỗ trợ `READY_TO_DISPLAY` |
| `DESIGN_NOT_CONFIRMED` | 400 | Chưa tick "đồng ý thiết kế" |
| `REVIEW_RATING_INVALID` | 400 | Rating không hợp lệ |
| `REVIEW_NOT_ALLOWED` | 422 | Đơn chưa đủ điều kiện review |
| `REVIEW_ALREADY_EXISTS` | 409 | Đã review sản phẩm này |
| `FILE_TOO_LARGE` | 413 | File quá 5MB (ảnh) hoặc 30MB (video) |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Định dạng không hỗ trợ |
| `INTERNAL_ERROR` | 500 | Lỗi server |

## B. Order Status State Machine

```
PENDING_PAYMENT ──→ PAID ──→ CONFIRMED ──→ PACKING ──→ SHIPPING ──→ DELIVERING ──→ DELIVERED ──→ COMPLETED
       │            │            │             │            │
       ↓            ↓            ↓             ↓            ↓
   CANCELLED    CANCELLED   CANCEL_REQUESTED  CANCEL_REQUESTED  CANCELLED
                                ↓                ↓
                            CANCELLED        CANCELLED
                            
DELIVERED ──→ DISPUTED ──→ REFUNDED
                ↓
            COMPLETED
```

## C. Tech Stack

- **Backend:** Node.js 20 + Express 4 + TypeScript 5 + Mongoose 8 + Socket.io 4
- **Frontend:** React + Vite + TypeScript (xem repo FE)
- **Database:** MongoDB Atlas (free tier)
- **Storage:** Cloudinary (ảnh + video)
- **Payment:** SePay (VietQR webhook)
- **AI Image:** KIE API (model `nano-banana-2`)
- **Deploy:** Render (backend) + Vercel (frontend)

---

> 📝 **Ghi chú cuối:** Tài liệu này được sinh tự động từ source code `backend/src/` ngày `2026-10-15`. Khi API thay đổi, cập nhật song song `docs_BE write/` + bản user manual này để tránh sai lệch.