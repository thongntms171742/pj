# API CHANGELOG

Track changes to the API contract over time to ensure synchronization between Backend and Frontend.

> **Đọc thế nào**: Entries **MỚI NHẤT Ở TRÊN**. Source of truth cho FE = `backend/src/`.

---
## 2026-11-17 🚚 DYNAMIC WAREHOUSE & FLEXIBLE HCM SHIPPING ADDRESS

> **Feature added**: Bỏ hoàn toàn hardcode địa chỉ kho dưới BE; cho phép FE/Admin cấu hình kho động vào DB và cho phép khách nhập địa chỉ giao hàng linh hoạt trong phạm vi TP.HCM (`provinceId = "79"`).

### Added endpoints
- `PUT / PATCH / POST /api/shipping/warehouse` & `GET / PUT / PATCH / POST /api/admin/warehouse` — Cập nhật & đọc cấu hình kho gửi hàng (`WarehouseConfig` trong MongoDB, tự suy ra `communeName` & toạ độ `lat`/`lng`).
- `PATCH /api/orders/:id/shipping-address` (alias: `PATCH /api/orders/:id/address`) — Khách (khi đơn chưa xuất kho) hoặc Admin cập nhật địa chỉ giao hàng trên đơn và tự tính lại phí ship nếu chưa thanh toán.

### Changed endpoints
- `POST /api/users/me/addresses` & `PATCH /api/users/me/addresses/:id` — Chỉ bắt buộc `name`, `phone`, `address`; hỗ trợ cả 2 cấp (`communeId`, `communeName`) lẫn 3 cấp (`district`, `ward`) hoặc địa chỉ tự do; mặc định `provinceId = "79"`, trả `422 DELIVERY_AREA_NOT_SUPPORTED` nếu ngoài TP.HCM.
- `POST /api/shipping/quote` — Chấp nhận linh hoạt `address`/`toAddress`, `communeId`/`toCommuneId`, `communeName`/`ward`/`toCommuneName`, nhận diện phường/xã từ text tự do, trả `supported: false` nếu ngoài TP.HCM (`79`).
- `POST /api/orders` — Nhận trực tiếp các trường `shipping*`, nested `shipping`/`deliveryAddress`, hoặc `addressId` từ sổ địa chỉ.
- `POST /api/orders/:id/shipment` — Nếu Admin không truyền `pickup`, tự động lấy địa chỉ kho đang cấu hình (`WarehouseConfig`).

---
## 2026-11-13 🎨 CONTEXT-AWARE COMPOSITING (4 LỚP) — BE HANDOFF ĐÃ TRIỂN KHAI

> **Feature added**: Hệ thống ghép ảnh 4 lớp cho Tree Customizer: cây trơn → phụ kiện **sau cành** → phụ kiện **trước cành** → cành trước cảnh (che phụ kiện).
> **Hợp đồng đầy đủ**: `docs_BE write/BE_HANDOFF_COMPOSITING.md` · **Hướng dẫn ảnh**: `docs_BE write/ASSET_PREPARATION_GUIDE.md`.
>
> ⚠️ **Tất cả field mới đều `optional`** ⇒ dữ liệu cũ chạy nguyên vẹn, FE fallback về hành vi cũ khi BE chưa có field.

### Added endpoints
- `GET /api/design-accessories` — Public catalog phụ kiện **riêng cho Customizer** (query: `slotType`). Phụ kiện thiết kế ⇒ không tồn kho, giá tính theo từng slot.
  - Response: `{ "accessories": [{ _id, code, name, description, image, previewImage, decorationPrice, slotTypes, isActive, sortOrder, model3dUrl, model3dScale, model3dRotation, anchor, shadow, defaultScale }] }`
  - Field mapping: `code` ↔ `sku`, `decorationPrice` ↔ `unitPrice` (collection cũ `/api/catalog/accessories`).

### Added fields (optional — toàn bộ có fallback an toàn)

| Model / Endpoint | Field | Mục đích | Fallback khi thiếu |
|---|---|---|---|
| `TreeVariant` | `foregroundMask` | Ảnh **cành trước cảnh** (PNG alpha) — lớp 4 che phụ kiện `depth: 'behind'` | Không có lớp 4 ⇒ mọi phụ kiện nằm trước cây (hành vi cũ) |
| `Accessory` | `anchor` | Điểm neo chuẩn hoá 0–1 trong bbox của `image` (móc treo / nút thắt nơ / tâm vật) | `{ x: 0.5, y: 0.5 }` |
| `Accessory` | `shadow` | Kiểu bóng: `none` \| `soft` \| `contact` | `'soft'` |
| `Accessory` | `defaultScale` | Tỉ lệ mặc định khi gắn (0.3–3) | `1` |
| `SlotMap.slots[]` | `depth` | Lớp chiều sâu của slot: `behind` \| `front` | `'front'` |
| `SlotMap.slots[]` | `scaleHint` | Gợi ý kích thước authored tại slot | `1` |
| `Design.configuration.placements[]` | `depth` | **Snapshot** lớp chiều sâu tại lúc khách gắn | Lấy `depth` hiện tại của slot |
| `CartItem.config.frozenConfig.placements[]` | `depth` | Copy nguyên vẹn snapshot từ `Design` | — |

> **Vì sao cần snapshot `depth` trong `placements[]`:** admin có thể đổi `depth` của slot **sau khi** khách đã đặt hàng. Không snapshot ⇒ bản đơn render khác hình khách đã chọn ⇒ sai ảnh giao hàng.

### Changed endpoints
- `GET /api/catalog/variants/:variantId/slotmap` — Mỗi slot giờ trả kèm `depth` + `scaleHint`.
- `GET /api/admin/tree-variants/:variantId/slotmaps` — Mỗi slot trả kèm `depth` + `scaleHint`.
- `POST /api/admin/tree-variants/:variantId/slotmaps/publish` — Nhận & persist `depth` / `scaleHint`. Giá trị sai ⇒ **bỏ qua field, không reject request**. `version` tăng sau mỗi lần publish.
- `GET /api/catalog/customizer/base-trees` — Mỗi variant trả kèm `foregroundMask`.
- `GET /api/catalog/tree-products` & `GET /api/catalog/tree-products/:productId/codes/:codeId/variants` & `GET /api/catalog/trees` — Variant trả kèm `foregroundMask`.
- `POST /api/designs` — Nhận thêm `configuration` (optional) kèm `placements[]` (bao gồm `depth`).
- `PATCH /api/admin/accessories/:id` — Nhận thêm `anchor`, `shadow`, `defaultScale`, `previewImage`, `model3dUrl`, `model3dScale`, `model3dRotation`. **Partial update**: chỉ set field có mặt trong body (FE gửi từng field riêng).
- `POST /api/admin/accessories` — Nhận thêm 7 field metadata ở trên.
- `PATCH /api/admin/tree-variants/:id` — Nhận thêm `foregroundMask`.

### Changed — Upload file nhị phân (model 3D)
- `POST /api/uploads` — Hỗ trợ `.glb` / `.gltf` với `resource_type: "raw"` (Cloudinary không transform, giữ nguyên binary). Response có `kind: "raw"`.
  - Giới hạn 30MB. Khuyến nghị dùng `.glb` (gói trọn) để không phụ thuộc file phụ.
  - Không áp `e_background_removal` cho `foregroundMask` (PNG alpha đã cắt sẵn).

### Added error codes
- Không có error code mới. Các lỗi dùng chung: `INVALID_INPUT` (metadata sai giá trị), `UNSUPPORTED_MEDIA_TYPE` (định dạng file không hỗ trợ), `FILE_TOO_LARGE`.

### Notes
- `foregroundMask` **phải cùng pixel size** với `bareImage` của cùng variant (admin UI đã cảnh báo khi lệch).
- `anchor` đo trên `image`, **KHÔNG** phải `previewImage` — nếu 2 ảnh khác tỉ lệ thì neo sẽ lệch.
- Deploy an toàn: FE đã triển khai đầy đủ & chạy đúng khi BE chưa có field nào trong bảng trên.

---
## 2026-10-30 🎬 MEDIA ASSETS (VIDEO HERO / STORY FEED / NHẠC NỀN)

> **Feature added**: Nền tảng media để tăng cảm xúc người dùng — video nền Hero, story dọc kiểu Reels, nhạc nền toàn app. BE đã hoàn tất; FE (web) và Mobile cần triển khai theo hướng dẫn trong `docs_BE write/FE_MEDIA_INTEGRATION_GUIDE.md`.

### Added endpoints
- `GET /api/media` — Danh sách media active (query: `placement`, `limit`). Public.
- `GET /api/media/hero` — Media hero (video/ảnh nền). Public.
- `GET /api/media/background-music` — Nhạc nền active đầu tiên. Public.
- `GET /api/admin/media` — List toàn bộ (kể cả `isActive: false`). Admin.
- `POST /api/admin/media` — Tạo `MediaAsset`. Admin.
- `PATCH /api/admin/media/:id` — Cập nhật `MediaAsset`. Admin.
- `DELETE /api/admin/media/:id` — Xóa `MediaAsset`. Admin.

### Changed
- `POST /api/uploads` — Mở rộng hỗ trợ **audio** (mp3/mp4/m4a/aac/wav/ogg), giới hạn 15MB (ảnh 5MB, video 30MB). Response có thêm trường `kind: "audio"` và `duration`. Audio upload lên Cloudinary dùng `resourceType: "video"` (Cloudinary xử lý audio như video).
- `POST /api/admin/banners` & `PATCH /api/admin/banners/:id` — **Fix bug**: trước đây các field `subtitle`, `aspectRatio`, `placement`, `ctaLabel`, `ctaLink`, `overlayColor` bị bỏ qua khi lưu. Giờ đã persist đầy đủ.

### New model
- `MediaAsset` — `kind` (VIDEO/AUDIO/IMAGE), `placement` (HERO_BACKGROUND/STORY_FEED/MUSIC_TRACK/PROMO), `title`, `caption`, `url`, `publicId`, `posterUrl`, `format`, `size`, `duration`, `ctaLabel`, `ctaLink`, `linkType` (PRODUCT/CATEGORY/NONE), `linkId`, `musicArtist`, `isLoop`, `volume`, `isActive`, `sortOrder`.

### Notes for FE / Mobile
- Tất cả endpoint `/api/media/*` là **public**, không cần token.
- Placement không hợp lệ → trả `{ "assets": [] }` chứ không lỗi 500.
- `GET /api/media/hero` fallback sang `PROMO` nếu không có `HERO_BACKGROUND`.
- Nhạc nền: dùng `volume` (0–100) từ BE, FE tự nhân với `Audio.volume` / `Sound.setVolumeAsync`.

---
## 2026-10-15 — 🌟 IMPLEMENT PRODUCT REVIEW FLOW (ĐÁNH GIÁ SẢN PHẨM)

> **Feature added**: Xây dựng hoàn chỉnh luồng Đánh giá sản phẩm (Product Review) cho dự án Christmas e-commerce.

### Added endpoints
- `GET /api/products/:productId/reviews` — Lấy danh sách review của sản phẩm kèm phân phối sao (1-5★), điểm trung bình và phân trang.
- `POST /api/products/:productId/reviews` (hoặc `POST /api/reviews`) — Khách hàng gửi đánh giá kèm sao (1-5), nội dung và danh sách ảnh cho đơn hàng đã nhận/hoàn thành. Tự động chuyển đơn hàng `DELIVERED` sang `COMPLETED`.
- `GET /api/reviews/my` — Lịch sử đánh giá của người dùng.
- `GET /api/orders/:orderId/reviewable-items` — Kiểm tra các món trong đơn hàng đã đánh giá hay chưa.
- `GET /api/admin/reviews` — Admin duyệt danh sách đánh giá.
- `POST /api/admin/reviews/:id/reply` — Admin phản hồi đánh giá của khách hàng (kèm gửi thông báo).
- `PATCH /api/admin/reviews/:id/status` — Admin ẩn/hiện đánh giá (`APPROVED` / `HIDDEN`).
- `DELETE /api/admin/reviews/:id` — Admin xóa đánh giá.

### Added error codes
- `REVIEW_NOT_FOUND` (404)
- `REVIEW_RATING_INVALID` (400)
- `REVIEW_NOT_ALLOWED` (403)
- `REVIEW_ALREADY_EXISTS` (409)

---
## 2026-10-10 — 🚨 BREAKING: LEGACY `/api/admin/trees` WRITES BLOCKED + DEAD CODE CLEANUP

> **Breaking change** — FE phải migrate trước khi endpoint bị xoá hẳn (`2026-12-01`).
> Chi tiết + code mẫu: `docs_BE/FE_API_REFERENCE.md` §0.

### Removed endpoints (writes only)

| Endpoint | Trạng thái | Thay bằng |
| :--- | :--- | :--- |
| `POST /api/admin/trees` | ❌ `400 INVALID_INPUT` | `POST /api/admin/tree-products` → `POST /api/admin/tree-products/:productId/codes` → `POST /api/admin/tree-codes/:codeId/variants` |
| `PATCH /api/admin/trees/:id` | ❌ `400 INVALID_INPUT` | `PATCH /api/admin/tree-products/:productId` (hoặc `PATCH /api/admin/tree-variants/:variantId`) |

Error response:

```json
{
  "error": {
    "code": "INVALID_INPUT",
    "message": "POST/PATCH /api/admin/trees đã bị vô hiệu hoá (create). Hãy dùng luồng 3 bước: POST /api/admin/tree-products → POST /api/admin/tree-products/:productId/codes → POST /api/admin/tree-codes/:codeId/variants"
  }
}
```

**Root cause**: handler cũ forward thẳng `req.body` vào `Tree.create(body)`, bỏ qua
toàn bộ cấu trúc 3 tầng. `productId` / `codeId` không được validate → tạo được
**variant mồ côi**. Variant mồ côi không nằm trên đường duyệt
product → code → variant của `GET /api/catalog/tree-products`, nên nó vô hình
trên catalog nhưng vẫn là dòng live trong collection `Tree`.

### Deprecated (read-only, vẫn hoạt động)

| Endpoint | Thay bằng | Ghi chú |
| :--- | :--- | :--- |
| `GET /api/admin/trees` | `GET /api/admin/tree-products` | Log `warn` mỗi lần gọi |
| `GET /api/catalog/trees` | `GET /api/catalog/tree-products` | Log `warn` mỗi lần gọi |

Cả hai log mức `warn` với `ctx` `[legacy] ...` → dùng Render logs để phát hiện
client cũ trước ngày xoá.

### Bug fix (không breaking)

- **`Order.discountAmount`**: interface khai báo trùng field 2 lần → `tsc` fail
  (`TS2300`) và runtime crash (`Cannot overwrite 'discount' model option`).
  Đã gộp còn 1 field + 1 schema entry. Virtual `discount` bị xoá vì ghi đè
  real path `discountAmount`.
  → **FE không cần đổi**: `dto/order.ts` vẫn fallback `o.discountAmount || o.discount || 0`.

### Internal cleanup (no API surface change)

- Xoá `backend/src/routes/_archive/` (2 router file, không được import ở đâu).
- Xoá `backend/src/scripts/migrate-tree-products.ts` (no-op sau 3-tier refactor).
- `controllers/admin/treeCodes.ts`: static import thay cho `await import()`.
- `controllers/catalogController.ts`: bỏ re-export marker thừa `_ReservedTreeSize`.
- Header 3 model (`TreeProduct` / `TreeCode` / `Tree`) ghi rõ tầng nào chứa giá.

### Verification

- ✅ `npm run build` (`tsc`) — pass
- ✅ `npm run test:all` — **201/201 PASS** (61 errorContract + 25 pricing + 16 address + 87 authValidation + 12 presetsResilience)
- ⚠️ **NOT VERIFIED**: chưa smoke-test trên Render (cần deploy). Breaking change → cần báo FE trước khi merge.

---
## 2026-10-09 — 🛒 SHOPEE SELLER CENTRE: SINGLE-TIER FALLBACK, FULL MEDIA MANAGEMENT & MP4 VIDEO (FE Pass 9 Sync)

> **FE-BE Synchronization Pass 9**:
> - **FE Update**:
>   - **Chế độ Không phân loại (`hasTiers=false`)**: Khi xóa hết phân loại, form Thông tin bán hàng tự động chuyển về chế độ sản phẩm đơn lẻ (Nút `+ Thêm nhóm phân loại`, ô `* Giá` `₫`, ô `* Kho hàng` `🛈`, `Mua nhiều giảm giá` với `+ Thêm khoảng giá`).
>   - **Khu vực Quản lý Media & Thông tin cơ bản**: Tùy chọn tỷ lệ ảnh `1:1` / `3:4`, Gallery tối đa 9 ảnh kèm cảnh báo chất lượng, Ảnh bìa 1:1, Video sản phẩm MP4 (tối đa 30MB, độ dài 10s-60s), Tên sản phẩm có bộ đếm ký tự `(X/120)`.
> - **BE Updates & Adaptations**:
>   - **Media Upload Mở rộng (`POST /api/uploads`)**: Bổ sung hỗ trợ tệp Video MP4 (`.mp4`, MIME `video/mp4`) dung lượng tối đa lên đến **30MB** (song song với ảnh 5MB), hỗ trợ cả Multipart form-data và Base64 Data URL.
>   - **Model `TreeProduct`**: Bổ sung trường `aspectRatio` (`"1:1" | "3:4"`, default `"1:1"`) và `videoUrl?: string`.
>   - **Admin Controllers (`adminController.ts`)**:
>     - `createTreeProduct` & `updateTreeProduct`: Tiếp nhận và lưu trữ `aspectRatio` và `videoUrl` (hoặc alias `video`).
>     - `createTreeVariant`: Hỗ trợ fallback linh hoạt cho sản phẩm đơn lẻ không phân loại (Single-tier mode) — tự động gán `size: "STANDARD"` và tự sinh `sku` duy nhất (`${code}-${size}`) nếu FE không truyền vào, tránh lỗi `MISSING_FIELD`.

---
## 2026-10-09 — 🛍️ PRODUCT DETAIL MODAL & SHOPEE SELLER CENTRE VARIATION MATRIX FORM (FE Pass 8 Sync)

> **FE-BE Synchronization Pass 8**:
> - **FE Update**:
>   - **Quick-View / Detail Modal (`TreeDetailModal`)**: Khách hàng xem nhanh chi tiết cây thông tại Catalog (ảnh zoom, gallery thumbnails, chọn Phân loại 1 Mã cây & Phân loại 2 Kích thước, kiểm tra tồn kho real-time, bộ chọn số lượng `quantity`, nút Thêm giỏ và Mua ngay).
>   - **Form Phân loại hàng kiểu Shopee**: Phân loại 1 (upload ảnh riêng cho từng option), Phân loại 2, thanh công cụ cam `#ee4d2d` "Áp dụng cho tất cả", bảng ma trận phân loại gộp hàng `rowSpan`.
>   - **Đa năng**: Hỗ trợ thêm cả Cây thông Noel (`TreeProduct`) và Phụ kiện trang trí (`Accessory`).
> - **BE Updates & Adaptations**:
>   - `GET /api/catalog/tree-products`: Cung cấp đầy đủ `treeCodes` và `variants` chi tiết với dữ liệu tồn kho thực tế để FE render tức thì `TreeDetailModal`.
>   - `POST /api/cart/items`: Nhận trực tiếp `variantId` từ modal và xử lý tồn kho nguyên tử.
>   - `PATCH /api/admin/tree-variants/bulk`: Xử lý áp dụng hàng loạt giá/kho cho tất cả biến thể khi bấm nút màu cam Shopee.

> **FE-BE Synchronization Pass**:
> - **FE Shift**: Frontend chuyển đổi Catalog sang thuần **TreeProducts (3-tier)** & **Accessories (Phụ kiện)**. Bỏ 3 kích thước tĩnh tách rời, bỏ điều hướng Presets; bổ sung `TreeDetailModal` (chọn mã cây, chọn size, gallery ảnh, thêm giỏ / mua ngay).
> - **BE Compatibility**: Backend đáp ứng hoàn hảo:
>   - `GET /api/catalog/tree-products`: Cung cấp danh sách cây dạng nhóm (Product → Codes → Variants) kèm giá, SKU và tồn kho nguyên tử.
>   - `POST /api/cart/items`: Cho phép thêm trực tiếp 1 variant cây (`config.variantId`) hoặc thêm phụ kiện lẻ (`config.accessories`) mà không bắt buộc phải qua Canvas Editor.
>   - `POST /api/orders`: Tự động nhận diện `DIY_KIT` và `SEPARATE` cho phép giao toàn quốc (chỉ hạn chế HCM đối với `READY_TO_DISPLAY`).

---
## 2026-10-09 — 🚀 FE PROPOSALS ALIGNMENT & SYSTEM UPGRADE

> **Đồng bộ toàn diện đề xuất FE**: Triển khai các module theo `BE_RECOMMENDATIONS.md` và thống nhất triết lý: **Cây thông là Product (sản phẩm cốt lõi)**, còn **Phụ kiện & Mẫu trang trí là Category / Danh mục sản phẩm vệ tinh**, gom về 1 luồng cấu hình thống nhất, tránh phân mảnh cấu trúc.

### Added endpoints

**Auth & Profile**
- `GET /api/auth/me` → lấy profile người dùng hiện tại (addresses, roles, phone, avatar)
- `PATCH /api/auth/me` → cập nhật thông tin cá nhân (`name`, `phone`, `avatarUrl`)

**Cart & Guest Session**
- `POST /api/cart/merge` → gộp giỏ hàng khách vãng lai (`guestSessionId`) vào tài khoản sau khi đăng nhập
- Header `X-Session-Id` hỗ trợ khách vãng lai thao tác giỏ hàng trước khi đăng nhập

**Coupons**
- `POST /api/coupons/apply` → áp dụng mã giảm giá và tính toán số tiền chiết khấu

**Uploads**
- `POST /api/uploads` → upload file ảnh hoặc base64 data URL lưu trữ static (/uploads), phục vụ preview cây thông Canvas Editor

**Payments Webhook**
- `POST /api/payments/webhook` → nhận webhook tự động cập nhật đơn sang `PAID` và `CONFIRMED`

**Notifications & Analytics**
- `PATCH /api/notifications/read-all` → đánh dấu đọc tất cả thông báo trong 1 request
- `GET /api/admin/analytics` → thống kê doanh thu theo ngày, tỷ lệ concept/style, top phụ kiện

### Changed

- **Vận chuyển liên tỉnh**: `POST /api/orders` chỉ giới hạn khu vực TP.HCM (`provinceId: "79"`) đối với đơn chứa cây trang trí sẵn `READY_TO_DISPLAY`. Đơn hàng `DIY_KIT` và `SEPARATE` hỗ trợ giao hàng toàn quốc!
- **Model `Order`**: bổ sung `discountCode`, `discountAmount`, `paymentTransactionId`, `internalNotes`.
- **Model `User`**: bổ sung trường `phone`.
- **Model `Cart`**: hỗ trợ cả `userId` và guest `sessionId`.
- **Model `Coupon`**: tạo mới (`code`, `discountType`, `value`, `minOrderValue`, `maxDiscount`, `startDate`, `endDate`, `usageLimit`, `usedCount`, `isActive`).

---
## 2026-10-09 — 🌲 3-TIER TREE CATALOG REFACTOR (Breaking)

> **Domain shift**: Catalog cây thông chuyển từ 2-tier (Product + Variant có `color` field) sang **3-tier chuẩn Shopee Seller Centre** (Product → Code → Variant). Customer nhìn thấy 1 sản phẩm, chọn mã cây (Phân loại 1), chọn size (Phân loại 2) rồi thêm giỏ. Mỗi (code × size) là 1 SKU riêng với giá + tồn kho + SKU nội bộ duy nhất.

### Added endpoints

**Public (Customer) — Catalog browse 3-tier**
- `GET /api/catalog/tree-products` → trả về danh sách Product + codes + variants
- `GET /api/catalog/tree-products/:productId/codes/:codeId/variants` → size grid cho 1 code

**Admin — 3-tier CRUD**
- `POST /api/admin/tree-products` → tạo sản phẩm cha
- `PATCH /api/admin/tree-products/:productId` → sửa thông tin chung
- `POST /api/admin/tree-products/:productId/codes` → thêm mã cây (Phân loại 1)
- `PATCH /api/admin/tree-codes/:codeId` → sửa mã cây
- `POST /api/admin/tree-codes/:codeId/variants` → thêm 1 size variant (Phân loại 2)
- `PATCH /api/admin/tree-variants/:variantId` → sửa giá / tồn kho / ảnh / SKU
- `PATCH /api/admin/tree-variants/bulk` → "Áp dụng cho tất cả"

### Removed / Deprecated

- `POST /api/admin/tree-products` body `colors[]` (2D matrix) — bỏ. Thay bằng tạo Product → Code → Variant tuần tự.
- `upsertTreeProduct` controller — bỏ. Tách thành 3-tier CRUD riêng.

### Changed

- `DesignConfig.treeId` → `DesignConfig.variantId` (mọi cart, order, preset, design đều dùng variantId)
- `Tree.stock` → `Tree.stockQuantity` (cây dùng `stockQuantity`, phụ kiện vẫn `stock`)
- `Tree` schema bỏ `color`, `material`, `density` — các thuộc tính này chuyển lên `TreeCode` (material) hoặc `TreeProduct` (density).
- `OrderItem.tree` → `OrderItem.variant` (có thêm `productId`, `codeId`, `sku`)
- `TreeProduct.colors[]` (enum cố định) → bỏ. Admin tự tạo Code với tên tự do.

### Migration

Chạy 1 lần: `npx ts-node src/scripts/migrate-to-3tier.ts` (an toàn, idempotent — chỉ xử lý docs cũ còn field `colors`).

### Example flow

```
# Tạo sản phẩm cha
POST /api/admin/tree-products { name: "Cây thông Noel trang trí" }
# → { treeProduct: { _id: "P1", ... } }

# Thêm mã cây
POST /api/admin/tree-products/P1/codes { code: "TREE-GREEN", name: "Xanh truyền thống" }
# → { treeCode: { _id: "C1", ... } }

# Thêm size variants cho mã
POST /api/admin/tree-codes/C1/variants { size: "M", sku: "TREE-GREEN-M", price: 249000, stockQuantity: 80 }
# → { variant: { _id: "V1", ... } }

# Customer xem
GET /api/catalog/tree-products
# → [{ product: { _id: "P1", name, ... }, codes: [{ _id: "C1", variants: [{ _id: "V1", ... }] }] }]
```

---
## 2026-10-07 — 🎄 CHRISTMAS PIVOT (Breaking)

> **Domain shift**: dự án chuyển từ **thrift it! (vintage marketplace)** sang **Build Your Christmas** (single-brand Christmas tree e-commerce với tree editor + HCM-only delivery). Mọi endpoint thuộc marketplace bị xóa, mọi endpoint thuộc Christmas được thêm mới. FE PHẢI bám theo contract mới (single-source-of-truth = code thực tế trong `backend/src/`).

### Removed endpoints (BREAKING)

Nhóm **Sellers / Products / Reviews** (đã xóa file controller + route):
- `GET/POST/PATCH/DELETE /api/products/*` (tất cả)
- `GET/POST/PATCH /api/sellers/*` (tất cả)
- `POST /api/products/:id/reviews`
- `GET /api/sellers/:idOrHandle/reviews`

Nhóm **Marketplace cart merge**:
- `POST /api/cart/merge`
- `POST /api/auth/cart/merge`

Nhóm **Seller application flow**:
- `POST /api/auth/seller/apply`
- `GET /api/admin/pending-sellers`
- `PATCH /api/admin/sellers/:id/approve`
- `PATCH /api/admin/sellers/:id/reject`
- `PATCH /api/admin/sellers/:id/commission-rate`
- `PATCH /api/admin/users/:id/approve-seller` (legacy)
- `PATCH /api/admin/users/:id/reject-seller` (legacy)

Nhóm **Listing moderation**:
- `GET /api/admin/pending-listings`
- `PATCH /api/admin/listings/:id/approve`
- `PATCH /api/admin/listings/:id/reject`

Nhóm **AI** (Gemini endpoints — đã xóa):
- `POST /api/ai/search`
- `POST /api/ai/analyze-listing`
- `POST /api/ai/recommendations`

Nhóm **Legacy order**:
- `GET /api/orders/seller`
- `PATCH /api/orders/:code/status` (đổi thành `:id`)
- `POST /api/orders/:code/shipment` (đổi thành `:id`)
- `POST /api/payments/:code/cod-collect` (COD xử lý trong `POST /api/orders`)

### Removed error codes
- `SELLER_NOT_APPROVED`, `SELLER_HANDLE_TAKEN`, `SELLER_SHOP_NAME_TAKEN`, `SELLER_ALREADY_APPROVED`
- `PRODUCT_NOT_FOUND`, `PRODUCT_NOT_AVAILABLE`, `PRODUCT_OUT_OF_STOCK`, `PRODUCT_TITLE_REQUIRED`, `PRODUCT_PRICE_REQUIRED`, `PRODUCT_CONDITION_REQUIRED`, `PRODUCT_SIZE_REQUIRED`, `PRODUCT_QUANTITY_INVALID`, `PRODUCT_SIZE_DATA_INVALID`, `PRODUCT_ALREADY_NOT_FOR_SALE`
- `SELF_PURCHASE_NOT_ALLOWED`, `QUANTITY_EXCEEDS_STOCK`
- `ORDER_BUYER_NOT_PARTICIPANT`, `ORDER_SELLER_CANNOT_DELIVER`
- `REVIEW_RATING_INVALID`, `REVIEW_NOT_ALLOWED`, `REVIEW_ALREADY_EXISTS`
- `AI_NOT_CONFIGURED`, `AI_UPSTREAM_ERROR`, `AI_QUERY_INVALID_LENGTH`, `AI_IMAGE_INVALID`, `AI_IMAGE_TYPE_INVALID`, `AI_QUERY_OR_IMAGE_REQUIRED`, `AI_RECOMMENDATIONS_UNAVAILABLE`
- `COMMISSION_RATE_INVALID`, `SELLER_NOT_FOUND`

### Added endpoints

**Auth**:
- `PUT /api/auth/me/avatar` (giữ nguyên từ trước)

**Users / Saved addresses** (giữ nguyên):
- `GET/POST/PATCH/DELETE /api/users/me/addresses`

**Addresses (CAS proxy)** (giữ nguyên):
- `GET /api/addresses/provinces`
- `GET /api/addresses/provinces/:provinceId/communes`
- `GET /api/addresses/communes`

**Catalog (public, MỚI)**:
- `GET /api/catalog/trees` — 3 sizes S/M/L
- `GET /api/catalog/styles` — 6 concepts
- `GET /api/catalog/accessories?type=&group=&style=&size=` — filter nhiều chiều
- `GET /api/catalog/presets` — ready-made designs
- `GET /api/catalog/delivery-options` — READY_TO_DISPLAY / DIY_KIT / SEPARATE
- `POST /api/catalog/quote` — live pricing

**Designs (MỚI)**:
- `POST /api/designs/quote` (public)
- `POST /api/designs` (auth) — save design
- `GET /api/designs/mine` (auth)
- `GET /api/designs/share/:slug` (public/owner)
- `GET /api/designs/:id` (owner/admin)
- `PATCH /api/designs/:id` (owner)
- `DELETE /api/designs/:id` (owner)
- `POST /api/designs/:id/duplicate` (auth)

**Cart** (refactored, không còn `productId`):
- `GET /api/cart`
- `POST /api/cart/items` — body: `{ config | designId, quantity }`
- `PATCH /api/cart/items/:id`
- `DELETE /api/cart/items/:id`
- `DELETE /api/cart/clear`

**Orders** (refactored, design snapshot thay cho product):
- `GET /api/orders`
- `POST /api/orders` — body mới: `{ designConfirmed: true (REQUIRED), shippingProvinceId: "79" (HARD-CODED), items[] | cartItemIds[], ... }`
- `GET /api/orders/:id` (path đổi từ `:code` → `:id`, hỗ trợ cả `_id` lẫn `orderCode`)
- `PATCH /api/orders/:id/status`
- `POST /api/orders/:id/shipment` (admin only — đổi từ seller)
- `GET /api/orders/:id/shipment`

**Payments**:
- `POST /api/payments/checkout` (giữ nguyên mock)

**Notifications** (giữ nguyên):
- `GET /api/notifications`
- `PATCH /api/notifications/:id/read`

**Admin (refactored — Christmas catalog + orders + users + stats)**:
- `GET/POST/PATCH /api/admin/trees`
- `GET/POST/PATCH /api/admin/styles`
- `GET/POST/PATCH /api/admin/accessories`
- `GET/POST/PATCH/DELETE /api/admin/presets`
- `GET /api/admin/orders?status=`
- `GET /api/admin/stats` (response shape mới — Christmas-specific)
- `GET /api/admin/users?page=&limit=&search=`
- `PATCH /api/admin/users/:id/status` (ban/unban — không phải seller approve)
- `GET /api/admin/users/:id/details`

**Health**:
- `GET /api/health`

### Added error codes (47 mới, thay cho 25 codes marketplace)

Catalog:
- `TREE_NOT_FOUND`, `STYLE_NOT_FOUND`, `ACCESSORY_NOT_FOUND`, `CATALOG_ITEM_UNAVAILABLE`
- `ACCESSORY_STYLE_MISMATCH`, `ACCESSORY_QUANTITY_INVALID`, `ACCESSORY_DUPLICATED`
- `OUT_OF_STOCK` (thay cho `PRODUCT_OUT_OF_STOCK`)

Design:
- `DESIGN_NOT_FOUND`, `DESIGN_CONFIG_INVALID`, `DESIGN_NOT_CONFIRMED`
- `DESIGN_NAME_REQUIRED`, `DESIGN_SLUG_TAKEN`

Personalization:
- `PERSONALIZATION_REQUIRED`, `PERSONALIZATION_INVALID`

Delivery:
- `DELIVERY_OPTION_INVALID`, `DELIVERY_AREA_NOT_SUPPORTED` (HCM-only — 422)

Cart:
- `CART_EMPTY`, `NO_ITEMS_CHECKED`, `CART_NOT_FOUND`, `CART_ITEM_NOT_FOUND`

Order:
- `ORDER_NOT_FOUND`, `ORDER_STATUS_REQUIRED`, `ORDER_ID_REQUIRED`
- `ORDER_INVALID_TRANSITION` (giữ từ marketplace)
- `ORDER_ALREADY_SHIPPED`, `ORDER_ALREADY_CANCELLED`, `ORDER_PAYMENT_INVALID_STATE`
- `ORDER_CANCEL_NOT_ALLOWED` (MỚI — personalization + PACKING block)

Address (giữ từ trước):
- `INVALID_EFFECTIVE_DATE`, `PROVINCE_NOT_FOUND`, `ADDRESS_UPSTREAM_TIMEOUT`, `ADDRESS_UPSTREAM_ERROR`

### Data model changes

- `User.roles`: chỉ còn `["buyer", "admin"]` (bỏ `seller`).
- `User.sellerProfile`: **XÓA** (không còn field này).
- `User.addresses`: giữ nguyên embedded subdoc.
- Bỏ models: `Product`, `Category`, `SellerProfile`, `Review`, `Ledger`, `PlatformFeeConfig`, `Conversation`, `Message`, `Favorite`, `UserView`, `UserLike`, `Dispute`.
- Thêm models: `Tree`, `Style`, `Accessory`, `TreeDesign`, `CartItem` (tách khỏi `Cart`).
- `Order.items[].OrderItem` shape hoàn toàn mới: `{ designId, designName, tree (snapshot), style (snapshot), lines[] (ACCESSORY + SERVICE), deliveryOption, unitTotal, quantity, lineTotal, hasPersonalization, productionDays }`. KHÔNG còn `productId` / `sellerId` / `commissionRate` / `commissionAmount`.
- `Order.status` mở rộng: thêm `CANCEL_REQUESTED` (đã có từ 2026-09-30, giữ nguyên).
- `Order.shippingProvinceId` bắt buộc = `"79"` (HCM only — HCM-only delivery đã thêm 2026-10-03, giữ nguyên).

### Business rule changes

- **HCM-only delivery**: `POST /api/orders` reject mọi `shippingProvinceId !== "79"` với `DELIVERY_AREA_NOT_SUPPORTED` (HTTP 422). Tỉnh khác TP.HCM không được phục vụ ở MVP.
- **Design confirmation required**: `POST /api/orders` bắt buộc `designConfirmed: true`. FE phải có checkbox "Tôi đồng ý với thiết kế này" trước nút checkout.
- **Atomic stock reservation**: BE chạy `reserveStock` atomic (`updateOne({ _id, stock: { $gte: qty } }, { $inc: { stock: -qty } })`) cho tất cả line items khi tạo order. Nếu fail ở bất kỳ item nào → rollback toàn bộ + trả `OUT_OF_STOCK` (409).
- **Stock restore on cancel**: khi order chuyển sang `CANCELLED` → restore stock cho cả tree + accessories (theo `quantity * item.quantity`).
- **Personalization + PACKING block**: order có `hasPersonalization: true` mà đã vào `PACKING` → buyer không thể gửi `CANCEL_REQUESTED` (nhận `ORDER_CANCEL_NOT_ALLOWED` 409).
- **Snapshot design vào order**: order giữ toàn bộ `tree / style / lines / pricing` snapshot, KHÔNG thay đổi khi admin sửa catalog. Catalog cũ bị soft-delete (`isActive: false`) nhưng order cũ vẫn render đúng.
- **No reviews / no chat / no AI**: 3 features marketplace đã bỏ. Christmas MVP chỉ có: design editor + cart + checkout + admin catalog.

### Response format

- Mọi success response: object bao bọc theo resource (`{ trees }`, `{ styles }`, `{ accessories }`, `{ design }`, `{ orders }`, `{ order }`, …).
- Mọi error response: `{ error: { code: string, message: string } }` — **KHÔNG ĐỔI** so với 2026-09-29 (đã được pivot giữ nguyên).
- HTTP status: 400/401/403/404/409/422/500/502/503/504 (giữ nguyên).

### Impact for FE

- Các endpoint "Removed" trả `404 NOT_FOUND`.
- Error shape chuẩn dùng `error.code` (xem `backend/src/utils/errors.ts` hoặc `./API_CONTRACT.md`).
- Lưu ý: các rule cũ ở phiên bản khởi tạo 2026-10-16 (`designConfirmed`, hard-code `shippingProvinceId: "79"` hay bỏ `Review`/`AI`) đều đã được thay thế bởi các bản cập nhật mới hơn ở trên (`RoomDesign` mới, hệ thống Review/Chat/AI, và `WarehouseConfig` động ở 2026-11-17).
