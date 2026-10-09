# BE Implementation & Handoff Summary — Build Your Christmas

> **Cập nhật ngày**: 2026-10-09  
> **Source of Truth**: `backend/src/`  
> **Dành cho**: Frontend & Backend Pair Programming

---

## 1. Triết lý Thiết kế Kiến trúc (Architectural Alignment)

- **Cây thông là Product (sản phẩm cốt lõi):**
  - Cây thông được quản lý theo mô hình 3-tier chuẩn Shopee: `TreeProduct` (Sản phẩm cha) $\rightarrow$ `TreeCode` (Phân loại 1: Mã cây / Màu sắc) $\rightarrow$ `Tree` / `TreeVariant` (Phân loại 2: Kích thước S/M/L mang SKU, giá, tồn kho).
- **Phụ kiện & Mẫu trang trí là Category / Danh mục sản phẩm vệ tinh:**
  - `Accessory` (Phụ kiện: Đèn, Quả châu, Nơ, Vớ, Sao, Chuông, Cá nhân hóa) và `Style` (Phong cách Giáng Sinh) được liên kết chặt chẽ vào cây thông qua cấu hình `DesignConfig`.
  - Khách hàng có thể mua nguyên cây hoàn chỉnh, tự phối trên Canvas Editor, hoặc mua lẻ trực tiếp từng phụ kiện/cây thông trên Catalog.
  - Gom về một luồng quản lý thống nhất giữa giỏ hàng (`CartItem`) và đơn hàng (`OrderItem`), không tách rời nhiều mảng dữ liệu gây phân mảnh.

---

## 2. Toàn bộ Endpoint Backend Đang Hoạt Động (Active API Matrix)

### 2.1. Auth & Profile
| Method | Endpoint | Quyền | Mục đích |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Public | Đăng ký tài khoản buyer |
| `POST` | `/api/auth/login` | Public | Đăng nhập lấy JWT Bearer token |
| `GET` | `/api/auth/me` | Buyer / Admin | Lấy profile đầy đủ, địa chỉ, quyền hạn |
| `PATCH` | `/api/auth/me` | Buyer / Admin | Cập nhật tên, số điện thoại, avatarUrl |
| `PUT` | `/api/auth/me/avatar` | Buyer / Admin | Cập nhật avatar |

### 2.2. Cart & Khách Vãng Lai
| Method | Endpoint | Quyền | Mục đích |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/cart` | Optional / Buyer | Lấy giỏ hàng (hỗ trợ `X-Session-Id` cho khách vãng lai) |
| `POST` | `/api/cart/items` | Optional / Buyer | Thêm cây thông (`variantId`) hoặc phụ kiện vào giỏ |
| `PATCH` | `/api/cart/items/:id` | Optional / Buyer | Cập nhật số lượng / trạng thái checked |
| `DELETE` | `/api/cart/items/:id` | Optional / Buyer | Xóa item khỏi giỏ |
| `DELETE` | `/api/cart/clear` | Optional / Buyer | Xóa sạch giỏ hàng |
| `POST` | `/api/cart/merge` | Buyer | Gộp giỏ khách vãng lai (`guestSessionId`) sau khi login |

### 2.3. Catalog (Public)
| Method | Endpoint | Quyền | Mục đích |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/catalog/tree-products` | Public | Danh sách cây thông 3-tier (Product + Codes + Variants) |
| `GET` | `/api/catalog/tree-products/:pid/codes/:cid/variants` | Public | Lưới kích thước & tồn kho của 1 mã cây |
| `GET` | `/api/catalog/styles` | Public | 6 concept phong cách Giáng Sinh |
| `GET` | `/api/catalog/accessories` | Public | Danh sách phụ kiện (filter group, type, style) |
| `GET` | `/api/catalog/presets` | Public | Mẫu thiết kế có sẵn |
| `GET` | `/api/catalog/delivery-options` | Public | Các hình thức đóng gói giao hàng |
| `POST` | `/api/catalog/quote` | Public | Báo giá thời gian thực từ DesignConfig |

### 2.4. Orders & Vận Chuyển
| Method | Endpoint | Quyền | Mục đích |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/orders` | Buyer | Tạo đơn hàng (trừ kho atomic, áp coupon, mở rộng tỉnh ngoài HCM cho DIY Kit) |
| `GET` | `/api/orders` | Buyer / Admin | Danh sách đơn hàng |
| `GET` | `/api/orders/:id` | Buyer / Admin | Chi tiết đơn hàng theo `_id` hoặc `orderCode` |
| `PATCH` | `/api/orders/:id/status` | Buyer / Admin | Chuyển đổi trạng thái đơn (tự động hoàn kho khi hủy) |
| `POST` | `/api/orders/:id/shipment` | Admin | Tạo vận đơn giao hàng |
| `GET` | `/api/orders/:id/shipment` | Buyer / Admin | Tra cứu hành trình vận đơn |

### 2.5. Khuyến Mãi (Coupons)
| Method | Endpoint | Quyền | Mục đích |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/coupons/apply` | Buyer / Admin | Áp dụng mã giảm giá và tính toán số tiền chiết khấu |

### 2.6. Tải Tệp (Uploads)
| Method | Endpoint | Quyền | Mục đích |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/uploads` | Optional / Buyer / Admin | Tải ảnh (tối đa 5MB) hoặc video MP4 (tối đa 30MB, nhận Base64 hoặc Multipart) |

### 2.7. Thanh Toán & Webhook
| Method | Endpoint | Quyền | Mục đích |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/payments/checkout` | Buyer | Mock thanh toán online |
| `POST` | `/api/payments/webhook` | Public (HMAC) | Webhook tự động cập nhật đơn sang `PAID` và `CONFIRMED` |

### 2.8. Thông Báo
| Method | Endpoint | Quyền | Mục đích |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/notifications` | Buyer / Admin | Lấy danh sách thông báo |
| `PATCH` | `/api/notifications/:id/read` | Buyer / Admin | Đánh dấu đã đọc 1 thông báo |
| `PATCH` | `/api/notifications/read-all` | Buyer / Admin | Đánh dấu đã đọc tất cả thông báo |

### 2.9. Admin Dashboard & Quản Trị
| Method | Endpoint | Quyền | Mục đích |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/stats` | Admin | Thống kê tổng quan nền tảng |
| `GET` | `/api/admin/analytics` | Admin | Biểu đồ doanh thu theo ngày, xu hướng concept, top phụ kiện |
| `POST` | `/api/admin/tree-products` | Admin | Tạo cây thông cha (hỗ trợ `aspectRatio` 1:1/3:4, `videoUrl`) |
| `PATCH` | `/api/admin/tree-products/:pid` | Admin | Sửa cây thông cha (hỗ trợ `aspectRatio`, `videoUrl`) |
| `DELETE`| `/api/admin/tree-products/:pid` | Admin | Xóa sản phẩm cây thông |
| `POST` | `/api/admin/tree-products/:pid/codes` | Admin | Thêm mã cây (Phân loại 1) |
| `PATCH` | `/api/admin/tree-codes/:cid` | Admin | Sửa mã cây |
| `DELETE`| `/api/admin/tree-codes/:cid` | Admin | Xóa mã cây |
| `POST` | `/api/admin/tree-codes/:cid/variants` | Admin | Thêm size variant (Phân loại 2, hỗ trợ single-tier fallback) |
| `PATCH` | `/api/admin/tree-variants/:vid` | Admin | Sửa giá / kho / SKU của biến thể |
| `DELETE`| `/api/admin/tree-variants/:vid` | Admin | Xóa biến thể |
| `PATCH` | `/api/admin/tree-variants/bulk` | Admin | Áp dụng nhanh giá/kho cho tất cả biến thể |
| `GET` | `/api/admin/users` | Admin | Quản lý danh sách người dùng |
| `PATCH` | `/api/admin/users/:id/status` | Admin | Khóa / Kích hoạt tài khoản người dùng |
| `GET` | `/api/admin/users/:id/details` | Admin | Xem lịch sử chi tiêu của người dùng |

---

## 3. Quy tắc Nghiệp vụ Trọng tâm

1. **Vận chuyển:**
   - Cây dựng sẵn trang trí hoàn thiện (`READY_TO_DISPLAY`): Chỉ hỗ trợ giao nội thành TP.HCM (`province: "79"`).
   - Bộ tự trang trí (`DIY_KIT`) và kiện riêng lẻ (`SEPARATE`): Hỗ trợ giao hàng **toàn quốc**.
2. **Kho hàng:**
   - Trừ kho nguyên tử (`$gte` + `$inc: -quantity`) tại thời điểm tạo đơn (`POST /api/orders`).
   - Tự động hoàn kho khi đơn chuyển sang `CANCELLED`.
3. **Mã giảm giá:**
   - Áp dụng khi tạo đơn hoặc gọi endpoint tính giá. Tự động kiểm tra thời hạn, số lượt sử dụng và giá trị đơn hàng tối thiểu.
4. **Shopee Seller Centre UI & TreeDetailModal Alignment:**
   - **Chế độ Không phân loại (`hasTiers=false`)**: Khi admin xóa hết nhóm phân loại, backend lưu trữ 1 biến thể duy nhất (`size: "STANDARD"`), tự sinh SKU, giá và tồn kho đơn lẻ mà không đòi hỏi thêm phân loại phụ.
   - **Media quản lý đa định dạng**: Cho phép tải ảnh tỷ lệ 1:1 và 3:4 (tối đa 9 ảnh, ảnh bìa 1:1, tối đa 5MB) và video giới thiệu sản phẩm MP4 (tối đa 30MB).
   - **Quick-View Modal (`TreeDetailModal`)**: Dữ liệu từ `GET /api/catalog/tree-products` cung cấp đầy đủ chi tiết cho khách hàng xem nhanh, kiểm tra tồn kho, đổi mã cây/kích thước và mua ngay lập tức.
