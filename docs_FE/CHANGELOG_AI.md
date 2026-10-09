# AI Changelog

## [2026-10-09] (Shopee Seller Centre: Single-tier Non-variation Mode + Full Media Management Section)

> **Pass thứ 9** của FE: Hoàn thiện 100% hai giao diện bán hàng chuyên nghiệp theo ảnh chụp Shopee Seller Centre:
> 1. **Chế độ Không phân loại (Image 1)**: Khi xóa hết phân loại hàng, form Thông tin bán hàng tự động chuyển về giao diện sản phẩm đơn lẻ (Nút `+ Thêm nhóm phân loại`, ô `* Giá`, ô `* Kho hàng`, `Mua nhiều giảm giá` với `+ Thêm khoảng giá`).
> 2. **Khu vực Quản lý Media & Thông tin cơ bản (Image 2)**: Tỷ lệ ảnh 1:1 / 3:4, Thêm hình ảnh (tối đa 9 ảnh), Ảnh bìa 1:1 với hướng dẫn, Video sản phẩm MP4 tối đa 30MB, Tên sản phẩm có bộ đếm ký tự (X/120).

### Thay đổi chi tiết (FE)

1. **Xóa hết phân loại $\rightarrow$ Chuyển về chế độ Sản phẩm đơn lẻ (`TreeProductForm.tsx` + `TreeForm.css`)**:
   - Khi bấm `X` ở Phân loại 1 hoặc nút "Xóa hết phân loại": biến `hasTiers` chuyển về `false`.
   - Giao diện lập tức chuyển sang chế độ không phân loại (chuẩn 100% Image 1):
     - Nút nét đứt viền đỏ cam: `+ Thêm nhóm phân loại` (bấm vào sẽ kích hoạt lại phân loại hàng).
     - Trường `* Giá`: Ô nhập tiền tệ có tiền tố `₫`.
     - Trường `* Kho hàng`: Ô nhập số lượng tồn kho kèm icon tooltip `🛈`.
     - Khu vực `Mua nhiều giảm giá`: Nút nét đứt `+ Thêm khoảng giá` kèm dòng ghi chú điều kiện chương trình khuyến mãi.
   - Khi lưu ở chế độ này: Tự động lưu 1 biến thể duy nhất với giá và số lượng kho đã nhập.

2. **Khu vực Media & Thông tin cơ bản chuẩn Shopee (`TreeProductForm.tsx` + `TreeForm.css`)**:
   - **`* Hình ảnh sản phẩm`**:
     - Radio chọn tỉ lệ: `Hình ảnh tỷ lệ 1:1` | `Hình ảnh tỷ lệ 3:4` kèm link `Xem ví dụ`.
     - Grid hiển thị các ảnh thumbnail đã tải (tối đa 9 ảnh), hỗ trợ xóa ảnh.
     - Ô vuông nét đứt `Thêm hình ảnh (X/9)` (icon hình ảnh màu đỏ cam Shopee).
     - Thanh cảnh báo màu vàng nhạt: "Việc cắt và chỉnh sửa hình ảnh nhiều lần có thể làm giảm chất lượng của hình. Hãy đăng tải hình ảnh mới nếu cần".
   - **`* Ảnh bìa`**:
     - Ô vuông hiển thị ảnh bìa 1:1, bấm để tải lên hoặc thay thế.
     - Hướng dẫn dạng bullet list bên phải về tỷ lệ 1:1 và hiển thị tại trang tìm kiếm/gợi ý.
   - **`Video sản phẩm`**:
     - Ô vuông nét đứt `Thêm video` với icon máy quay video đỏ cam.
     - Hướng dẫn dạng bullet list: Tối đa 30MB, độ dài 10s-60s, định dạng MP4.
   - **`* Tên sản phẩm`**:
     - Ô nhập tên kèm bộ đếm ký tự góc phải (ví dụ: `18/120`), giới hạn `maxLength={120}`.

### Files Changed (FE)
- `frontend/src/pages/TreeProductForm.tsx` (Thêm chế độ không phân loại `hasTiers=false` và toàn bộ khu vực Media Image 2)
- `frontend/src/pages/TreeForm.css` (Bổ sung styles: `.shopee-btn-dashed`, `.shopee-single-field`, `.shopee-media-card`, `.shopee-aspect-ratio-bar`, `.shopee-media-grid`, `.shopee-warning-banner`, `.shopee-bullet-list`, `.shopee-name-input-wrapper`, `.shopee-char-counter`)
- `docs_FE/CHANGELOG_AI.md` (Ghi nhận Pass 9)
- `docs_FE/API_CHANGELOG.md` (Ghi nhận Pass 9)

### Verification
- ✅ `npm run build` chạy thành công (exit 0). Bundle: `index.html` 1.06 kB, CSS 127.40 kB, JS 439.10 kB. Không có lỗi TypeScript.
- ✅ Vite dev server đang chạy hoạt động bình thường.

---

## [2026-10-09] (Product Detail Modal + Shopee Seller Centre Sales Info Matrix Form)

> **Pass thứ 8** của FE:
> - **Xem chi tiết cây**: Bổ sung `TreeDetailModal` (Quick-view / Detail modal) cho khách hàng tại Catalog (ảnh zoom, gallery thumbnails, chọn phân loại 1 & 2, tồn kho real-time, số lượng, Thêm giỏ & Mua ngay).
> - **Cải thiện form thêm sản phẩm Admin**: Thiết kế lại toàn bộ section **"Thông tin bán hàng"** chuẩn 100% theo giao diện Shopee Seller Centre (Phân loại 1, Phân loại 2, Bulk apply bar màu cam `#ee4d2d`, Bảng ma trận có ô upload ảnh vuông nét đứt cho từng tùy chọn phân loại 1, Mua nhiều giảm giá).
> - **Đa năng cho cả Cây thông & Phụ kiện**: Hỗ trợ thêm cả Cây thông Noel (`TreeProduct`) và Phụ kiện trang trí (`Accessory`) với cấu trúc phân loại linh hoạt.

### Thay đổi chi tiết (FE)

1. **Bổ sung tính năng Xem chi tiết cây (`CatalogPage.tsx` + `CatalogPage.css`)**:
   - Component `TreeDetailModal`: Mở ra khi khách click vào ảnh sản phẩm, tên cây hoặc nút xem chi tiết `Eye` trên card sản phẩm.
   - Hiển thị đầy đủ thông tin:
     - Gallery ảnh phóng to kèm thumbnails chuyển ảnh nhanh.
     - Tên cây, danh mục, mật độ lá / chất liệu, mô tả đầy đủ.
     - Bộ chọn Phân loại 1 (Mã cây / Màu sắc).
     - Bộ chọn Phân loại 2 (Kích thước S/M/L) kèm trạng thái còn hàng / hết hàng.
     - Giá tiền cập nhật theo biến thể, số lượng tồn kho thực tế.
     - Bộ chọn số lượng `quantity` (tăng giảm với giới hạn tồn kho).
     - Nút **"Thêm vào giỏ"** và **"Mua ngay"** (chuyển hướng thẳng đến Giỏ hàng).
     - Cam kết uy tín: Giao tận nơi TP.HCM, Đổi trả trong 3 ngày, Bảo hành cây.

2. **Form Thêm sản phẩm chuẩn Shopee Seller Centre (`TreeProductForm.tsx` + `TreeForm.css`)**:
   - **Lựa chọn loại sản phẩm**: Chọn giữa `🌲 Cây thông Noel` (3-tier) hoặc `✨ Phụ kiện trang trí`.
   - **Thông tin cơ bản**: Tên sản phẩm, Danh mục / Nhóm phụ kiện, Mật độ lá, Mô tả, Ảnh bìa, Gallery.
   - **Section Thông tin bán hàng**:
     - **🔴 Phân loại hàng**:
       - **Phân loại 1**: Tên phân loại tùy chỉnh (`Loại cây`, `Màu sắc`...), danh sách tùy chọn (MÃ 1, MÃ 2... có thêm mô tả, icon reorder/trash, ô nhập thêm mới).
       - **Phân loại 2**: Tên phân loại (`Kích thước`, `Combo`...), danh sách tùy chọn (S, M, L... có thêm mô tả, icon trash, ô nhập thêm mới). Có nút `X` đóng/xóa hẳn phân loại 2 hoặc nút `+ Thêm phân loại 2`.
     - **Danh sách phân loại hàng (Ma trận phân loại)**:
       - Thanh công cụ: `₫ | Giá`, `Kho hàng`, `SKU phân loại` + nút màu cam `#ee4d2d` `Áp dụng cho tất cả phân loại`.
       - Bảng ma trận:
         - Cột Phân loại 1: Tên tùy chọn (rowSpan theo số phân loại 2) + Ô vuông nét đứt tải ảnh riêng cho từng tùy chọn Phân loại 1 (`📷 +`).
         - Cột Phân loại 2: Tên tùy chọn (S, M, L...).
         - Cột * Giá (`₫ [Input]`), Cột * Kho hàng (`[Input]`), Cột SKU phân loại (`[Input]`), Cột GTIN (`[Input]`).
     - **Mua nhiều giảm giá**: Text hướng dẫn thiết lập giá sỉ khi đồng giá.
   - **Lưu dữ liệu**:
     - Cây thông: Tự động lưu `TreeProduct` $\rightarrow$ `TreeCode` (Phân loại 1) $\rightarrow$ `TreeVariant` (Phân loại 2).
     - Phụ kiện: Lưu các biến thể thành các sản phẩm phụ kiện (`Accessory`) theo nhóm.

### Files Changed (FE)
- `frontend/src/pages/CatalogPage.tsx` (+`TreeDetailModal`, kết nối click xem chi tiết card)
- `frontend/src/pages/CatalogPage.css` (+styles cho Product Detail Modal, quick-view hover overlay)
- `frontend/src/pages/TreeProductForm.tsx` (Viết lại toàn diện theo giao diện Shopee Seller Centre "Thông tin bán hàng")
- `frontend/src/pages/TreeForm.css` (+styles cho Shopee card, tier box, options list, dashed image upload, bulk apply bar, matrix table)
- `docs_FE/CHANGELOG_AI.md` (Ghi nhận Pass 8)
- `docs_FE/API_CHANGELOG.md` (Ghi nhận Pass 8)

### Verification
- ✅ `npm run build` chạy thành công (exit 0). Bundle: `index.html` 1.06 kB, CSS 123.68 kB, JS 429.18 kB. Không có lỗi TypeScript.
- ✅ Vite dev server đang chạy hoạt động bình thường.

---

## [2026-10-09] (Catalog Refactor: Bỏ 3 kích thước tĩnh & Bỏ mẫu có sẵn, chuyển sang Pure TreeProduct & Accessory Catalog)

> **Pass thứ 7** của FE: Tái cấu trúc Catalog & UX luồng mua sắm theo yêu cầu mới của dự án.
> - Bỏ hiển thị 3 kích thước tĩnh (Size S, M, L cards độc lập).
> - Bỏ toàn bộ tính năng và điều hướng "Mẫu có sẵn" (Presets) trên toàn hệ thống.
> - Hiển thị 100% sản phẩm cây thông thực tế (`TreeProduct`) được thêm từ backend/admin, cho phép chọn Phân loại (TreeCode) và Kích thước (TreeVariant S/M/L) trực tiếp để thêm vào giỏ.

### Thay đổi chi tiết (FE)

1. **Bỏ hiển thị 3 kích thước tĩnh (`CatalogPage.tsx`)**:
   - Đã loại bỏ hoàn toàn section "3 Kích thước" tĩnh (trước đây hiển thị S 60cm, M 90cm, L 120cm như các thẻ rời rạc).
   - Kích thước nay được gắn liền trực tiếp với từng sản phẩm cây thông cụ thể dưới dạng `TreeVariant` (Size S / M / L) tương ứng với từng mã cây (`TreeCode`).

2. **Loại bỏ Mẫu có sẵn (Presets) trên toàn bộ Customer UI**:
   - **`App.tsx`**: Route `/presets` và `/tree/:slug` được cấu hình redirect về `/catalog`. Xóa các import không còn dùng (`PresetsPage`, `DesignSharePage`).
   - **`Layout.tsx`**:
     - Desktop Navbar & Mobile Drawer: Đổi menu "Mẫu Có Sẵn" thành "Cây Thông & Phụ Kiện" (`/catalog`).
     - Footer: Bỏ link `<Link to="/presets">Mẫu có sẵn</Link>`, thay bằng `<Link to="/catalog">Phụ kiện trang trí</Link>`.
   - **`HomePage.tsx`**:
     - `CATEGORIES`: Thay mục "Mẫu Có Sẵn" bằng "Bán Chạy Nhất" trỏ về `/catalog`.
     - Hero / CTA Banner: Thay nút "Xem mẫu decor có sẵn" (`/presets`) thành "Xem phụ kiện decor" (`/catalog`).
     - 4-Step Process: Điều chỉnh quy trình 4 bước mua hàng chuẩn e-commerce (01 Chọn cây thông $\rightarrow$ 02 Chọn kích thước & màu sắc $\rightarrow$ 03 Thêm phụ kiện $\rightarrow$ 04 Giao tận nơi).
   - **`HeroBanner.tsx`**: Cập nhật các slide banner có chứa link `/presets` và nhãn "Mẫu có sẵn" thành `/catalog`.

3. **Chỉ hiển thị sản phẩm cây thông thực tế từ Backend (`TreeProduct` 3-tier catalog)**:
   - Tạo component `TreeProductCardItem` trong `CatalogPage.tsx`:
     - Load dữ liệu từ `GET /api/catalog/tree-products`.
     - Cho phép khách chọn Màu / Phân loại (`TreeCode`) nếu cây có nhiều màu.
     - Cho phép khách chọn Size (S / M / L tương ứng với `TreeVariant` của code đó).
     - Hiển thị giá tiền động theo variant và số lượng tồn kho theo thời gian thực (nếu hết hàng sẽ hiển thị badge "Hết hàng" và disable nút mua).
     - Nút "Thêm vào giỏ" gọi trực tiếp `cartApi.addItem({ config: { variantId, deliveryOption: 'DIY_KIT', accessories: [] }, quantity: 1 })`.
   - Tab điều hướng danh mục: Đơn giản hóa thành 3 tab rõ ràng: `Tất cả sản phẩm` | `Cây thông Noel` | `Phụ kiện trang trí`.
   - Giữ nguyên khu vực Phụ kiện trang trí (`Accessory` gallery) với bộ lọc nhóm (ALL, LIGHT_STRING, BAUBLE, TOPPER, BASE, RIBBON, CARD, MISC) và nút thêm vào giỏ tức thì.

### Files Changed (FE)
- `frontend/src/pages/CatalogPage.tsx` (Refactor toàn diện, bỏ 3 kích thước tĩnh & 6 style presets, tích hợp TreeProductCardItem + Variant picker)
- `frontend/src/App.tsx` (Redirect `/presets`, `/tree/:slug` về `/catalog`, dọn dẹp unused imports)
- `frontend/src/components/Layout.tsx` (Bỏ Mẫu có sẵn ở navbar, drawer, footer)
- `frontend/src/pages/HomePage.tsx` (Cập nhật CATEGORIES, CTA banner, 4 bước mua sắm)
- `frontend/src/components/HeroBanner.tsx` (Chuyển link slide về `/catalog`)
- `docs_FE/CHANGELOG_AI.md` (Ghi nhận tài liệu thay đổi)
- `docs_FE/API_CHANGELOG.md` (Ghi nhận tài liệu thay đổi)

### Verification
- ✅ `npm run build` chạy thành công (exit 0). Bundle: `index.html` 1.06 kB, CSS 112 kB, JS 428 kB. Không có lỗi TypeScript (`tsc`).
- ✅ Dev server `npm run dev` đang chạy mượt mà.

---

## [2026-10-09] (Sync FE docs + error code với BE docs audit pass 2026-10-08)

> **Pass thứ 6** của FE: Đồng bộ FE docs với BE `docs/` đã được cập nhật 2026-10-08. Không có breaking change từ BE — chỉ là documentation/contract cleanup.

### Fixed (FE)
- **`ITEMS_REQUIRED` (400) — error code mới từ BE chưa có trong FE `errors.ts`**: BE `docs/ERROR_CODES.md` list 47 codes Christmas-specific. Khi user gửi checkout body thiếu `items[]` array, BE trả `ITEMS_REQUIRED` mà FE không có mapping → rơi vào default "Đã có lỗi xảy ra" gây khó hiểu.
  - **Fix**: thêm `ITEMS_REQUIRED` vào `ERROR_MAP` với message thân thiện "Vui lòng chọn ít nhất 1 sản phẩm trước khi thanh toán." + severity `warning`.
- **FE docs vẫn tham chiếu URL cũ** (`api.buildyourchristmas.vn` TBD / `VITE_API_URL` sai tên): Sau khi BE đã deploy Render thật, FE docs cần update.
  - `INTEGRATION_GUIDE.md`: đổi Production URL → `https://christmas-8ca4.onrender.com`. Env var chuẩn là `VITE_API_BASE_URL` (không phải `VITE_API_URL`).
  - `ONBOARDING.md` Bước 2 + Bước 3: thêm Option A "Dùng BE Render" (recommended cho FE dev) + Option B "Local BE" (cho BE dev). Đổi password mặc định cho buyer demo = `Buyer@BYC2026` (BE seed công khai).

### Verified
- ✅ BE `AI_CONTEXT.md` confirms BE đang chạy production tại `https://christmas-8ca4.onrender.com` (DB `christmas` Atlas cluster `cluster0.jkkqqk7.mongodb.net`).
- ✅ BE `ERROR_CODES.md` list 47 codes (mới thêm `ITEMS_REQUIRED` mà FE chưa có).
- ✅ BE `ENUMS.md` confirm: `AccessoryType` 10 values (LIGHT_STRING, CANDLE, BAUBLE, BELL, CANDY, FIGURINE, BOW, STAR, STOCKING, NAME_TAG, NAME_ORNAMENT) — FE `types/index.ts` đã khớp.
- ✅ BE `API_MATRIX.md` đánh dấu FE Status `⏳` cho mọi endpoint — nhưng thực tế FE đã integrate rất nhiều (xem `API_MATRIX.md` của FE để biết chi tiết).

### Files Changed (FE)
- `frontend/src/lib/errors.ts` (+`ITEMS_REQUIRED`)
- `docs/INTEGRATION_GUIDE.md` (URL + env var name)
- `docs/ONBOARDING.md` (Bước 2/3 restructure + Render Option A)

### Files NOT changed (đã khớp từ trước)
- `frontend/src/types/index.ts` — `AccessoryType`, `TreeSize`, `StyleCode`, `OrderStatus` đều khớp BE `ENUMS.md`.
- `frontend/src/lib/api.ts` — base URL, timeout, headers đúng.
- `frontend/src/lib/errors.ts` — 46 codes còn lại đều đã có (trừ `ITEMS_REQUIRED` mới thêm).
- `frontend/src/pages/*` — không cần thay đổi logic.

---

## [2026-10-08] (Auth UX — Auto-redirect khi nhận UNAUTHORIZED + page-level guards)

> **Pass thứ 5** của FE: sửa UX khi user truy cập trang protected mà chưa login.

### Fixed (FE)
- **Auto-logout chỉ bắt HTTP 401, miss BE trả `UNAUTHORIZED` code**: Trước đó interceptor chỉ check `err.response?.status === 401` hoặc `code === 'TOKEN_INVALID'`. Nếu BE trả 200 OK + envelope `{error:{code:'UNAUTHORIZED',message:'Chưa đăng nhập'}}` (pattern contract), FE sẽ bỏ sót → user thấy toast lỗi mà không được redirect.
  - **Fix**: thêm `code === 'UNAUTHORIZED'` vào điều kiện auto-logout. Khi nhận diện được, dispatch `byc:auth:logout` + redirect về `/auth?mode=login&redirect=...` nếu user đang ở trang protected.
- **Trang protected vẫn gọi API trước khi ProtectedRoute redirect xong** → gây log 401 spam trong console trong ~1 frame. Thêm guard `isAuthenticated` vào `useEffect` của:
  - `OrdersPage.tsx`
  - `OrderDetailPage.tsx`
  - `AdminPage.tsx` (thêm `isAdmin` check)

### Added (FE)
- **Smart redirect khi token invalid**:
  - Public routes (`/`, `/catalog`, `/presets`, `/editor`, `/tree/*`) — chỉ dispatch logout event, KHÔNG redirect (user vẫn xem được trang).
  - Protected routes (`/orders`, `/profile`, `/checkout`, `/admin`) — redirect về `/auth?mode=login&redirect=<current-path>` để sau khi login xong quay lại đúng trang.

### Files Changed (FE)
- `frontend/src/lib/api.ts` (interceptor bắt thêm `UNAUTHORIZED` code + smart redirect)
- `frontend/src/pages/OrdersPage.tsx` (guard `isAuthenticated` trong useEffect)
- `frontend/src/pages/OrderDetailPage.tsx` (guard `isAuthenticated` trong useEffect)
- `frontend/src/pages/AdminPage.tsx` (guard `isAdmin` trong useEffect)

### Verification
- ✅ `npx tsc --noEmit` pass (exit 0)
- ✅ `npm run build` pass (exit 0). Bundle: 386 KB JS, 105 KB CSS.
- ✅ Browser test:
  - Navigate `/orders` (chưa login) → `ProtectedRoute` redirect về `/auth?mode=login`.
  - API call nào từ page lở mount trước redirect không còn 401 vì đã guard trong useEffect.

### Behavior summary

| Tình huống | Trước | Sau |
| :--- | :--- | :--- |
| User chưa login vào `/orders` | Console 401 + toast lỗi "Chưa đăng nhập" | Redirect `/auth?mode=login?redirect=/orders` mượt |
| Token hết hạn khi đang ở `/profile` | Toast "Phiên hết hạn" nhưng KHÔNG redirect | Logout + redirect về login, redirect về `/profile` sau khi login |
| BE trả 200 OK + `{error:{code:"UNAUTHORIZED"}}` | Bỏ sót, chỉ toast | Detect được, auto-logout + redirect |

---

## [2026-10-08] (API Base URL → Render Deployment)

> **Pass thứ 4** của FE: Toàn bộ API call từ FE phải đi qua BE đã deploy trên Render
> (`https://christmas-8ca4.onrender.com/api`), KHÔNG dùng localhost BE nữa.

### Fixed (FE)
- **API base URL fallback sai** (`/api` → localhost:4000): Trước đó `frontend/src/lib/api.ts` fallback về `/api` khi thiếu env var. Trong dev mode, Vite proxy `/api` sang `VITE_API_TARGET` (mặc định `http://localhost:4000`) → khi BE local không chạy → 500 liên tục.
  - **Fix**: Đổi fallback trong `api.ts` thành `https://christmas-8ca4.onrender.com/api` (hard-code URL Render) — đảm bảo kể cả khi quên set env, vẫn gọi BE đã deploy.
  - Tạo `frontend/.env.development` với `VITE_API_BASE_URL=https://christmas-8ca4.onrender.com/api` + `VITE_API_TARGET=https://christmas-8ca4.onrender.com` (proxy target trùng BE Render, không fallback về localhost).
  - Tạo `frontend/.env.production` cho production build.
- **Mock data fallback trong EditorPage**: Sau khi BE Render đã ổn định, **xoá toàn bộ mock data fallback** trong `EditorPage.tsx` (3 trees, 3 styles, 6 accessories, mock pricing). Editor giờ chỉ hiển thị data từ BE thật. Nếu BE down, console error + empty state — không có fake data gây hiểu nhầm.

### Added (FE)
- **`frontend/.env.development`** (NEW): `VITE_API_BASE_URL=https://christmas-8ca4.onrender.com/api`, `VITE_API_TARGET=https://christmas-8ca4.onrender.com`. Comment rõ ràng "Tất cả API call phải đi qua BE đã deploy trên Render. KHÔNG dùng localhost BE trong development nữa."
- **`frontend/.env.production`** (NEW): `VITE_API_BASE_URL=https://christmas-8ca4.onrender.com/api`.
- **Cảnh báo BE error trong console** thay vì silent fallback: EditorPage `console.error('[EditorPage] Failed to load catalog:', err)` → dev dễ debug hơn.

### Files Changed (FE)
- `frontend/src/lib/api.ts` (fallback URL → Render, timeout 20s → 30s)
- `frontend/src/pages/EditorPage.tsx` (xoá mock fallback, thêm console.error)
- `frontend/.env.development` (NEW)
- `frontend/.env.production` (NEW)

### Verification
- ✅ `npx tsc --noEmit` pass (exit 0)
- ✅ `npm run build` pass (exit 0). Bundle: 386 KB JS, 105 KB CSS.
- ✅ Browser test (Network tab) confirm:
  - Tất cả XHR đều đi `https://christmas-8ca4.onrender.com/api/*` (không còn `localhost:5173/api/...` qua proxy).
  - 3 trees từ BE thật: S "Mây Xanh" 169k, M "Tuyết Bạc" 249k, L "Đại Lễ Hội" 399k.
  - Ảnh từ `https://christmas-8ca4.onrender.com/images/trees/*.jpg` render đúng.
  - Live quote trả 1.519.000đ từ `/api/catalog/quote`.

---

## [2026-10-08] (EditorPage UI/UX Polish + Demo Fallback)

> **Pass thứ 3** của FE: sửa triệt để UI/UX trang Editor theo screenshot user cung cấp.
> Vấn đề user báo: header `Trình thiết kế cây thông` + `Tổng cộng` bị đè lên nhau, step indicator chèn giữa panel, sidebar `Tổng cộng` đè lên SVG preview cây thông.

### Fixed (FE)
- **Header layout chồng chéo**:
  - `EditorPage.css`: bỏ `position: sticky; top: 68px` của `.editor-header` (nguồn gốc khiến nó đè lên panel bên dưới khi header dài hơn 68px).
  - Tách `<div>` title thành `<div class="editor-header-text">` để flex-wrap đúng khi viewport hẹp.
  - `editor-header-inner` dùng `align-items: flex-start` + `flex-wrap: wrap` để price summary tự rớt hàng khi không đủ chỗ (không overlap).
- **Step indicator chiếm chỗ panel**:
  - Thêm `min-width: 96px` (giảm từ 120px) cho `.step-dot` + `padding: 12px 14px 16px` để 4 bước fit vừa container ~485px mà không bị cắt.
  - Bỏ `position: sticky` của step indicator (đã ở trong header non-sticky nên không cần).
  - Thêm `aria-selected` + `role="tab"` cho a11y.
- **Sidebar `Tổng cộng` đè SVG preview**:
  - Đổi `top: calc(68px + 100px)` → `top: 24px` (header giờ không sticky, sidebar sticky sớm là vô nghĩa).
  - Thêm `align-self: start` cho `.editor-sidebar`.
  - Đổi `<div className="editor-sidebar">` → `<aside>` (semantic đúng).
  - SVG tree preview: thu từ `200×300` → `180×270` + `preserveAspectRatio="xMidYMid meet"` để không tràn ngang.
  - Thêm `min-height: 240px` cho `.tree-preview-visual` để layout không nhảy khi chưa có phụ kiện.
- **Tree picker đè nhãn selected**:
  - Thêm `z-index: 2` + `box-shadow` cho `.tree-option-check` (icon ✓ ở góc phải).
  - Thêm `box-shadow: 0 0 0 3px rgba(196,151,59,0.15)` cho `.tree-option.selected` / `.style-option.selected` (gold glow outline).
  - Thêm `font-family: var(--font-body)` cho buttons (đảm bảo không kế thừa font mặc định của button trên Safari).
  - Thêm `transform: translateY(-2px)` cho hover state.

### Added (FE)
- **Demo mock data fallback** trong `EditorPage.tsx`:
  - Khi `catalogApi.getTrees/Styles/Accessories` fail (500, network error, BE chưa ready), tự fill 3 trees (S/M/L) + 3 styles (CLASSIC/MINIMAL/LUXURY) + 6 accessories demo.
  - Lý do: cho phép Editor chạy demo UX khi BE down, tránh trang loading mãi.
  - **TODO cho BE**: đảm bảo `/api/catalog/*` ổn định; có thể giữ fallback cho dev environment.
- **Mock pricing fallback** trong `fetchPricing`:
  - Khi `POST /api/catalog/quote` fail, tự tính price dựa trên mock data (tree base + accessories × qty + decorationFee theo style + serviceFee theo deliveryOption).
  - Demo UX vẫn hoạt động end-to-end.
- **Tree & Style image rendering**:
  - Tree card ưu tiên hiển thị `tree.images[0]` nếu BE trả; fallback về SVG gradient nếu ảnh lỗi.
  - Style card ưu tiên `style.coverImage` làm background image; fallback về gradient palette.
  - Sử dụng `resolveAssetUrl()` helper để xử lý cả absolute URL + relative path.
- **Step title gold accent**:
  - Thêm `::before` pseudo-element (3px gold bar) cho `.step-title` → phân biệt rõ ràng giữa các step.
- **Style palette dot tooltip**:
  - Thêm `title={c}` cho mỗi palette dot → hover hiện hex color.

### Responsive polish
- `@media (max-width: 900px)`: `.editor-header-inner` flex-direction column, `.editor-price-summary` full-width với text left-aligned.
- `@media (max-width: 600px)`: `.delivery-options` flex-column, `.editor-nav` flex-column-reverse (CTA chính lên trên), buttons full-width.

### Files Changed (FE)
- `frontend/src/pages/EditorPage.tsx` (mock fallback + image rendering + semantic aside)
- `frontend/src/pages/EditorPage.css` (refactor toàn bộ: bỏ sticky, fix overlap, polish)

### Verification
- ✅ `npx tsc --noEmit` pass (exit 0)
- ✅ `npm run build` pass (exit 0). Bundle: 386 KB JS, 104 KB CSS.
- ✅ Browser test (Playwright subagent) trên dev server:
  - Step 1 (Chọn cây): 3 cards S/M/L render đúng, selected highlight gold, sidebar preview cập nhật theo size.
  - Step 2 (Phong cách): 6 styles render từ BE (Classic/Minimal/Gingerbread/Winter/Cute/Luxury), palette dots, gradient backgrounds.
  - Step 3 (Phụ kiện): 3 delivery options (Trang trí sẵn/DIY Kit/Giao riêng) + 4 accessory tabs (Đèn/Trang trí/Decor/Cá nhân hóa) + accessory list scrollable.
  - Header không còn chồng chéo với step indicator.
  - Sidebar không còn đè SVG preview.

### Known Limitations (FE)
1. **Mock fallback chỉ active khi BE fail** — nếu BE trả 200 OK với data rỗng, editor vẫn empty (đúng kỳ vọng).
2. **Image fallback silent fail** — nếu `tree.images[0]` URL trả 404, ảnh bị ẩn (`display: none`) nhưng không có placeholder. Có thể cải thiện bằng icon lỗi.

### Open Questions (FE → BE)
1. **Catalog API 500**: cần check log BE để fix root cause. Tạm thời FE có mock fallback cho demo.

---

## [2026-10-08] (FE Integration Pass — Christmas-clean audit)

> **Pass thứ 2** của FE: review lại code theo docs đã cập nhật, sửa các bug + thêm các flow còn thiếu.
> Mục tiêu: FE khớp 100% contract với BE, không "tự ý suy nghĩ" theo docs/AGENTS.md.

### Fixed (FE)
- **Token key sai** (`byc_token` → `token` theo `docs/AUTH_SPEC.md`): Cập nhật `frontend/src/store/AuthContext.tsx` + `frontend/src/lib/api.ts`. Có fallback `byc_token` cho phiên cũ để user không bị logout đột ngột.
- **401 không auto-logout**: Axios response interceptor cũ chỉ `Promise.reject` — bổ sung logic: khi nhận `TOKEN_INVALID` hoặc HTTP 401, tự clear localStorage + dispatch custom event `byc:auth:logout` (trừ khi đang ở `/auth`).
- **OrderItem delivery option sai** (`FLAT_PACK` → `DIY_KIT` / `SEPARATE`): Sửa `frontend/src/types/index.ts` + `frontend/src/pages/OrderDetailPage.tsx` theo docs audit 2026-10-08 (BE chỉ support 3 options).
- **ProfilePage gọi endpoint không tồn tại**: Bỏ gọi `authApi.updateProfile` (BE không có `PATCH /auth/me` — chỉ có `PUT /auth/me/avatar`). Update name giờ chỉ sync local + warn user. **TODO cho BE**: bổ sung endpoint update name.
- **AuthPage hard-code password sai** (`admin@byc.vn / admin123`): Bỏ block "Dùng thử nhanh" — vi phạm rule "Không hard-code secrets" trong AGENTS.md § 10. Test accounts phải lấy từ env (BE side).
- **Lỗi toast chung chung**: Bổ sung `frontend/src/lib/errors.ts` — map 35/47 error codes từ `docs/ERROR_CODES.md` → title + defaultMessage + severity. Áp dụng cho Auth/Editor/Checkout/OrderDetail/Cart.

### Added (FE)
- **OrderDetailPage action buttons** theo role-based state machine (`docs/ENUMS.md` § OrderStatus + § Role-based restrictions):
  - `PENDING_PAYMENT` → "Thanh toán ngay" (`paymentsApi.checkout`)
  - `PENDING_PAYMENT | PAID` → "Hủy đơn" → `CANCELLED`
  - `CONFIRMED+` (trừ `PACKING`+personalization) → "Yêu cầu hủy" → `CANCEL_REQUESTED`
  - `DELIVERED` → "Xác nhận hoàn tất" → `COMPLETED`
  - `DELIVERED | COMPLETED` → "Mở khiếu nại" → `DISPUTED`
- **Cancel dialog** với textarea lý do (≥5 ký tự) + warning nếu đơn có món cá nhân hóa.
- **Layout banners**:
  - `auth-suspended-banner` (sticky top, dismiss + logout) — khi `user.accountStatus === "suspended"`.
  - `auth-expired-banner` (auto-hide 5s) — khi token hết hạn.
- **AuthPage**: handle `FORBIDDEN` (suspended) + admin redirect logic (ưu tiên `?redirect=`, nếu rỗng + role `admin` → `/admin`).
- **Modal overlay styles** trong `OrderDetailPage.css` (cancel dialog).

### Files Changed (FE)
- `frontend/src/lib/api.ts`
- `frontend/src/lib/errors.ts` (NEW)
- `frontend/src/store/AuthContext.tsx`
- `frontend/src/components/Layout.tsx` + `Layout.css`
- `frontend/src/pages/AuthPage.tsx` + `AuthPage.css`
- `frontend/src/pages/CartPage.tsx`
- `frontend/src/pages/CheckoutPage.tsx`
- `frontend/src/pages/EditorPage.tsx`
- `frontend/src/pages/OrderDetailPage.tsx` + `OrderDetailPage.css`
- `frontend/src/pages/ProfilePage.tsx`
- `frontend/src/types/index.ts`

### Verification
- ✅ `npx tsc --noEmit` pass (exit 0)
- ✅ `npm run build` pass (exit 0). Bundle: 384 KB JS, 103 KB CSS.

### Known Limitations (FE)
1. **BE chưa có `GET /api/auth/me`**: `refreshUser` chỉ đọc localStorage. Khi user update từ tab khác, không auto sync.
2. **BE chưa có `PATCH /api/auth/me` (update name)**: ProfilePage tạm local + warn.
3. **No file upload endpoint BE**: ImageUploader convert file → base64 rồi gửi qua API. Nên bổ sung `/api/uploads` (multipart).
4. **No real-time notification**: polling khi mount Layout.

### Open Questions (FE → BE)
1. **Order URL**: hiện `/orders/:orderCode` (e.g. `BYC-1234567`). Có nên giữ `orderCode` hay đổi sang `_id`?
2. **Avatar upload**: FE gửi URL string. Cần multipart upload?
3. **No featured-designs endpoint** cho homepage?

### Updated Docs
- `AI_CONTEXT.md`: section "2026-10-08 — FE integration pass" (file mới này bổ sung vào entry 2026-10-07 docs audit).

---

## [2026-10-07] (Build Your Christmas — Marketplace → Single-brand Christmas Tree Editor)

> **PIVOT** toàn bộ backend từ thrift it! marketplace sang **Build Your Christmas** (single-brand Christmas e-commerce). FE đã có sẵn, plan tập trung BE + docs. Chi tiết plan: `c:\Users\HP\.cursor\plans\build_your_christmas_backend_adaptation_fc23001c.plan.md`.

### Removed (marketplace code xoá hoàn toàn)
- `models/Product.ts`, `Category.ts`, `Review.ts` — XOÁ FILE.
- `models/User.ts`: bỏ `SellerProfileSchema` + `sellerProfile`; `roles` chỉ còn `("buyer" | "admin")`.
- `controllers/productController.ts`, `sellerController.ts`, `aiController.ts` — XOÁ FILE.
- `controllers/authController.ts`: bỏ `applySeller`, `mapCartItem`, `/auth/cart/merge`, các trường `sellerStatus`/`sellerProfile` trong response.
- `controllers/paymentController.ts`: bỏ phần trừ kho (đã chuyển sang `orderController`) + thông báo seller. Giữ `PENDING_PAYMENT → PAID → CONFIRMED` + idempotent.
- `routes/products.ts`, `sellers.ts`, `ai.ts` — XOÁ FILE.
- `routes/auth.ts`: bỏ `/auth/cart/merge` alias.
- `routes/admin.ts`: bỏ pending-listings, pending-sellers, commission-rate. Admin mới chỉ làm catalog + orders + stats + users.
- `seed.ts`, `seed-sellers.ts`, `add-products.ts` — XOÁ FILE.
- `tests/productAuth.test.ts`, `orderAuth.test.ts` — XOÁ FILE (legacy marketplace).
- `src/server.ts` reference các route cũ, cập nhật sang routes mới.

### Added (Christmas-specific)
- **Models mới**:
  - `Tree.ts`: SKU cây thông với size S/M/L unique, height/diameter/material, price/stock, isActive.
  - `Style.ts`: 6 concept (CLASSIC, MINIMAL, GINGERBREAD, WINTER, CUTE, LUXURY) với palette + coverImage.
  - `Accessory.ts`: 10 loại phụ kiện (LIGHT_STRING, BAUBLE, BELL, CANDY, FIGURINE, BOW, STOCKING, STAR, NAME_TAG, NAME_ORNAMENT) × 4 group (LIGHTS/ORNAMENT/DECOR/PERSONAL) với `styleCodes` + `maxQtyBySize` + `isPersonalizable` + `personalizationMaxLength` + `productionDays`.
  - `TreeDesign.ts`: thiết kế của user với `ownerId` (null cho preset), `slug` unique, `config: DesignConfig`, `isPublic`, `isPreset`, `duplicatedFrom`, `previewImage`.
- **CartItem + Order viết lại**:
  - `CartItem`: `designId`, `config: DesignConfig`, `priceSnapshot`, `quantity`, `checked`.
  - `OrderItem`: `designId`, `designName`, `previewImage`, `tree` (snapshot), `style` (snapshot), `lines[]` (ACCESSORY/SERVICE), `unitTotal`, `quantity`, `lineTotal`, `deliveryOption`, `hasPersonalization`, `productionDays`.
  - `Order`: thêm `designConfirmedAt` + `designLockedAt`. Bỏ `platformFee`.
- **Services mới**:
  - `services/pricingService.ts`: pure function `priceDesign(config, catalog)` với full validation (active, style match, qty bound, personalization, dup accessory, deliveryOption). Trả `PriceBreakdown` (lines, decorationFee, unitTotal, productionDays, hasPersonalization, hasService). Throws `DesignValidationError` với ErrorCode.
  - `services/catalogService.ts`: `loadCatalogForConfig` (1 query tree + 1 style + 1 accessories) → `CatalogSnapshot`. `buildPricedDesign` = load + price. `safelyBuildPricedDesign` wrap catch → `sendError`.
  - `services/inventoryService.ts`: `reserveStock` (atomic `$inc` với `stock: { $gte: qty }`, rollback khi lỗi), `restoreStock`, `restoreTreeStock`.
  - `services/designService.ts`: `loadCatalogForDesign` (recompute pricing), `buildDesignResponse` (FE-facing shape), `generateDesignSlug` + `findUniqueSlug`.
- **Controllers/Routes mới**:
  - `catalogController.ts` + `routes/catalog.ts` (public): `/trees`, `/styles`, `/accessories` (filter), `/presets`, `/delivery-options`, `POST /quote`.
  - `designController.ts` + `routes/designs.ts`: `POST /quote` (public), `POST /` (auth), `GET /mine`, `GET /share/:slug`, `GET /:id`, `PATCH /:id`, `DELETE /:id`, `POST /:id/duplicate`.
  - `orderController.ts` (rewrite): `POST /` yêu cầu `designConfirmed: true` + `shippingProvinceId === "79"`, recompute pricing, atomic reserve stock, snapshot đầy đủ. `PATCH /:id/status` với Q5 (block cancel cá nhân hóa khi `PACKING`). `POST /:id/shipment` (admin only).
  - `cartController.ts` (rewrite): bỏ `/merge`. Items kèm `currentUnitTotal` + `priceChanged`.
  - `adminController.ts` (rewrite): CRUD trees/styles/accessories (PATCH only, không DELETE — soft delete qua `isActive=false`), CRUD presets (có DELETE), `GET /orders?status=`, `GET /stats` với KPIs Christmas, user management.
- **Config** (`config/business.ts`): `SHIPPING_FEE = 30_000`, `DECORATION_FEE_BY_SIZE = { S: 50_000, M: 80_000, L: 120_000 }`, `SERVICE_PROVINCE_ID = "79"` (TP.HCM), `DELIVERY_OPTIONS`, `PERSONALIZATION_REGEX`.
- **Seed** (`seed-christmas.ts`): idempotent upsert theo `size`/`code`/`name`/`slug`. Cờ `--confirm-seed`. **Từ chối chạy nếu DB là `thriftit`**. 3 trees + 6 styles + ~25 accessories + 8 presets + admin + buyer demo. Passwords từ env `SEED_ADMIN_PASSWORD`/`SEED_BUYER_PASSWORD`.
- **Tests**:
  - `tests/pricing.test.ts` (MỚI): 25 test cases — concept example (~475k), qty bound, style match, personalization (required/invalid/too long/forbidden chars/non-personalizable), dup accessory, invalid deliveryOption, STAR qty 1, inactive catalog, missing accessory, DIY_KIT/SEPARATE = 0 decoration, S/M/L decoration 50k/80k/120k.
  - `tests/errorContract.test.ts` (REWRITTEN): 61 tests — 47 codes có status mapping, contract shape, redaction, critical Christmas codes tồn tại, **legacy marketplace codes bị xoá** (assertNotPresent).
  - `tests/address.test.ts`: **giữ nguyên** (CAS Address Kit vẫn dùng cho HCM delivery).

### Changed
- `utils/errors.ts` (REWRITTEN): 47 codes mới. Xoá: `SELLER_*`, `PRODUCT_*`, `SELF_PURCHASE_NOT_ALLOWED`, `PRODUCT_ALREADY_NOT_FOR_SALE`, `ORDER_SELLER_CANNOT_DELIVER`, `REVIEW_*`, `COMMISSION_RATE_INVALID`, `AI_*`. Thêm 19 codes Christmas (xem docs/ERROR_CODES.md).
- `package.json`:
  - `name`: `thriftit-backend` → `buildyourchristmas-backend`.
  - Scripts: `seed` → `seed-christmas.ts`. Xoá `seed:sellers`, `add:products`, `test:auth`, `test:order`. Thêm `test:pricing`. Cập nhật `test:all`.
  - **Không thêm dependency nào**.

### Verification
- ✅ `npx tsc --noEmit` pass (exit 0).
- ✅ `npm run build` pass (exit 0).
- ✅ `npm test` (errorContract) pass — **61/61 PASS**.
- ✅ `npm run test:pricing` pass — **25/25 PASS**.

### Snapshot decisions
- Database: dùng DB `buildyourchristmas` (user tự đổi URI). Collection `users`, `orders`, `carts`, `cartitems`, `notifications` giữ trong cùng cluster nhưng tách DB name.
- Admin user mới: `admin@buildyourchristmas.vn`, lấy từ env `SEED_ADMIN_PASSWORD`.
- Frontend: user tự quản lý; BE đảm bảo contract match.

### Backlog (Christmas)
- [ ] FE review lại response shape (sau khi plan chốt).
- [ ] "Your 2026 Christmas" duplicate flow year filter (FE tự handle).
- [ ] Email/SMS confirmation (chưa có).
- [ ] Stock rollback thủ công (chưa dùng MongoDB transaction) — đủ cho MVP.
- [ ] Lint/format: project không có sẵn, không thêm dependency theo plan.
- [ ] Docs (`docs/API_CONTRACT.md`, `docs/openapi.yaml`, `docs/ENUMS.md`, `docs/ERROR_CODES.md`, `docs/API_MATRIX.md`, `docs/INTEGRATION_GUIDE.md`): viết lại theo Christmas.

---

## [2026-10-06] (commission)
### Added (Backend - Per-seller Commission Rate)
- **Models** (`backend/src/models/Order.ts`): added `commissionRate` (0..1, default 0.1) + `commissionAmount` (VND, default 0) to `IOrderItem` & `OrderItemSchema`. Snapshotted at order creation so historical orders keep the rate that was applied at checkout.
- **Controller** (`backend/src/controllers/orderController.ts`):
  - `createOrder` now reads `seller.sellerProfile.commissionRate` (defaults to 0.1 if missing/invalid) and snapshots it onto each `OrderItem`. `platformFee` on the order = aggregate of item `commissionAmount`.
  - `mapOrder` exposes `commissionRate` and `commissionAmount` on every item.
- **Admin Controller** (`backend/src/controllers/adminController.ts`):
  - **NEW** `updateSellerCommission` — validates `0 ≤ rate ≤ 1`, updates `User.sellerProfile.commissionRate`, returns `previousRate` + `newRate` for audit.
- **Route** (`backend/src/routes/admin.ts`): `PATCH /api/admin/sellers/:id/commission-rate` (admin-only).
- **Errors** (`backend/src/utils/errors.ts`): new codes `COMMISSION_RATE_INVALID` (400) + `SELLER_NOT_FOUND` (404). Catalog now 59 codes.
- **Docs**: updated `docs/API_CONTRACT.md`, `docs/openapi.yaml` (PATCH + OrderItem), `docs/API_MATRIX.md`, `docs/ERROR_CODES.md`, `docs/API_CHANGELOG.md`, `AI_CONTEXT.md`.
### Snapshot semantics
- Rate mới chỉ áp dụng cho orders tạo SAU khi admin update.
- Orders cũ giữ nguyên rate đã snapshot trên `OrderItem.commissionRate`.
- Admin KHÔNG nhận notification cho action này.
### Verification
- ✅ `npx tsc --noEmit` (exit 0)
- ✅ `npm run build` (exit 0)
- ✅ `npm test` (errorContract) — **38/38 PASS** (catalog 59 codes)
### Backlog
- Migration script cho orders cũ (re-rate) — chưa cần thiết nếu nghiệp vụ OK với snapshot cũ.
- `Ledger.ts` double-entry refactor cho commission flow.

## [2026-10-06]
### Added (Backend - Per-size stock & price-delta for Products)
- **Schema** (`backend/src/models/Product.ts`): added optional `sizeQuantities` and `sizePriceDeltas` (`Schema.Types.Mixed`, default `undefined`).
- **Controller** (`backend/src/controllers/productController.ts`):
  - `deriveSizeQuantities` synthesizes `{ [p.size]: p.quantity }` for legacy products so FE always receives a usable map.
  - `mapProduct` now always returns `sizeQuantities` + `sizePriceDeltas` (empty object `{}` when not set).
  - `createProduct` accepts + validates `sizeQuantities` / `sizePriceDeltas`.
  - **NEW** `updateProduct` — partial update (owner-seller or admin) supporting all editable fields including per-size stock/price.
- **Route** (`backend/src/routes/products.ts`): `PATCH /api/products/:id` registered before `/:id` wildcard.
- **Errors** (`backend/src/utils/errors.ts`): new code `PRODUCT_SIZE_DATA_INVALID` (400) — added to catalog (now 57 codes).
- **Docs**: updated `docs/API_CONTRACT.md` (POST + GET + new PATCH), `docs/openapi.yaml` (Product schema), `docs/API_MATRIX.md`, `docs/ERROR_CODES.md`, `docs/API_CHANGELOG.md` (new 2026-10-06 entry), `AI_CONTEXT.md`.
### Verification
- ✅ `npx tsc --noEmit` (exit 0)
- ✅ `npm run build` (exit 0)
- ✅ `npm test` (errorContract) — **38/38 PASS**
### Inventory semantics (intentionally unchanged)
- `quantity` (aggregate counter) remains the source of truth for order/cart decrement.
- `sizeQuantities` is currently display-only — checkout still reduces `quantity`, not a per-size bucket.
- `sizePriceDeltas` does NOT affect `OrderItem.unitPrice` yet (still `product.price`).

## [2026-10-03]
### Added (Backend - CAS Address Kit Proxy & Order Snapshot)
- Created `backend/src/services/addressService.ts`:
  - Proxies CAS Address Kit (`https://production.cas.so/address-kit`).
  - In-memory cache with 24-hour TTL for provinces and communes.
  - 5-second request timeout via `AbortController`.
  - Normalization of upstream CAS data to `{ data: [{ id, name }], effectiveDate }`.
  - Validation for `effectiveDate` (`latest` or `YYYY-MM-DD`).
- Created `backend/src/controllers/addressController.ts` and `backend/src/routes/addresses.ts`:
  - `GET /api/addresses/provinces` (query: `effectiveDate`)
  - `GET /api/addresses/provinces/:provinceId/communes` (param: `provinceId`, query: `effectiveDate`)
  - `GET /api/addresses/communes` (query: `effectiveDate`)
- Mounted `/api/addresses` in `backend/src/app.ts`.
- Updated double-layer Order snapshot in `Order.ts` and `orderController.ts` with `shippingProvinceId`, `shippingProvinceName`, `shippingCommuneId`, `shippingCommuneName`, `addressEffectiveDate`.
- Added address error codes (`INVALID_EFFECTIVE_DATE: 400`, `PROVINCE_NOT_FOUND: 404`, `ADDRESS_UPSTREAM_TIMEOUT: 504`, `ADDRESS_UPSTREAM_ERROR: 502`) in `utils/errors.ts`.
- Added test suite `backend/src/tests/address.test.ts` (16 tests passed).
- Updated `docs/API_CONTRACT.md`, `docs/openapi.yaml`, and `docs/API_MATRIX.md`.

## [2026-10-01]
### Added (Backend - Users & Admin)
- Added `accountStatus` (`"active"` | `"suspended"`) and `accountStatusReason` fields to `User` model.
- Updated `auth.ts` middleware (`requireAuth` and `optionalAuth`) to fetch the user from the database and reject requests with `403 FORBIDDEN` if `accountStatus === "suspended"`.
- Added `GET /api/admin/users` (List users with pagination, search, role filters) in `adminController.ts`.
- Added `PATCH /api/admin/users/:id/status` (Ban / Unban users) in `adminController.ts`.
- Added `GET /api/admin/users/:id/details` (View user transaction history, orders, spent) in `adminController.ts`.
- Added User Management routes to `routes/admin.ts`.
- Added `AddressSchema` embedded in `User` model to support persistent buyer and seller addresses.
- Added `GET /api/users/me/addresses`, `POST /api/users/me/addresses`, `PATCH /api/users/me/addresses/:id`, and `DELETE /api/users/me/addresses/:id` endpoints in `userController.ts`.
- Registered `/api/users` routes in `app.ts`.
- Updated `docs/API_CONTRACT.md` and `docs/API_MATRIX.md` with the new Users and Admin User Management endpoints.

### Fixed (Backend)
- **Avatar Synchronization**: Fixed an issue in `PUT /api/auth/me/avatar` where uploading a new avatar only updated the seller profile. Added `avatarUrl` field to `IUser` interface and `UserSchema` in `User.ts` (resolving TypeScript compilation error `TS2339`). It now updates `user.avatarUrl` and synchronizes to `user.sellerProfile.avatarUrl`, ensuring consistent avatars across both Buyer and Seller views. In `applySeller`, if no `avatarUrl` is passed, it automatically inherits `existingUser.avatarUrl` (buyer's avatar); if provided, it also populates `existingUser.avatarUrl` if empty. Also returned `avatarUrl` in auth response objects (`login`, `register`, `applySeller`).

### Fixed (BE DOC Inconsistencies — P0 Audit)
- **`docs/ENUMS.md`**: Added `CANCEL_REQUESTED` to Order Status table, updated state machine transitions (`CONFIRMED/PACKING → CANCEL_REQUESTED`), and corrected role-based restrictions to match actual code (buyer now allowed `CANCELLED`, `CANCEL_REQUESTED`, `DELIVERED`, `COMPLETED`, `DISPUTED`; seller now allowed `DELIVERING` and `DELIVERED`, only blocked from `COMPLETED`).
- **`docs/INTEGRATION_GUIDE.md`**: Fixed incorrect claim "KHÔNG CÓ endpoint `POST /api/auth/seller/apply`" — endpoint has been live since 2026-09-29.
- **`docs/AUTH_SPEC.md`**: Updated Role Matrix with Users/Address endpoints and `POST /api/auth/seller/apply`. Fixed seller role assignment description. Added Order status permission note. Fixed Seller Status `pending_approval` description.
- **`docs/API_CONTRACT.md`**: Fixed incorrect note on notification `markAsRead` claiming "không kiểm tra ownership" — IDOR was already fixed in 2026-09-29 refactor.
- **`docs/API_MATRIX.md`**: Marked `POST /api/ai/search` and `POST /api/ai/analyze-listing` as FE ✅ DONE.

### Added (UI/UX Audit Plan)
- Created comprehensive 10-phase UI/UX acceptance testing plan covering: BE DOC contract audit, API/UI Contract Matrix (40+ endpoints), Login/Register P0 checklists (34 test cases), responsive test matrix (8 viewports × 12 checks), validation contract audit (26 fields), error handling audit (16 critical codes), route protection matrix (13 routes × 4 roles), and 7 end-to-end user journeys.

### Frontend & Mobile Sync (Reported 2026-10-01)
- **Mobile TS**: Noted pre-existing TS error in `SearchScreen.tsx` (waiting for FE to pass `category` param to `useProducts`).
- **AI Endpoints**: Frontend has successfully integrated `POST /api/ai/search` and `POST /api/ai/analyze-listing`.
- **Order State Machine**: FE was using a workaround (`DELIVERED -> COMPLETED`) due to `ORDER_BUYER_NOT_PARTICIPANT`. The backend has now fixed this bug, allowing buyers to set `DELIVERED` directly. FE can remove the workaround.
- **Address Book**: FE noted a limitation where buyers/sellers have to re-type addresses. The backend has now implemented the `Address` API to resolve this.

### Added
- Added `CANCEL_REQUESTED` to `ORDER_STATUSES` enum and updated `VALID_TRANSITIONS` in `Order.ts` to support buyer cancellation requests.
- Added `cancelReason` and `cancelRequestedAt` fields to the `Order` model and `mapOrder` response.

### Changed
- Removed the role-based restriction preventing sellers from setting `DELIVERING` and `DELIVERED` status directly in `orderController.ts` (since there is no real shipping provider).
- Updated role-based restrictions in `orderController.ts` to allow sellers to transition orders from `CANCEL_REQUESTED` to `CANCELLED` (accept cancel) or `CONFIRMED` (reject cancel).
- Enforced a constraint where buyers can only use `CANCELLED` directly if the order is in `PENDING_PAYMENT` or `PAID`. Once the order reaches `CONFIRMED` or later, they must use `CANCEL_REQUESTED`.
- Allowed inventory restoration when an order transitions to `CANCELLED` directly from `CANCEL_REQUESTED`.
- Updated `API_CONTRACT.md` and `ERROR_CODES.md` to reflect new valid transitions for buyers and sellers.
- Fixed a buggy test in `orderAuth.test.ts` which attempted an invalid state machine transition when testing seller delivery restrictions, and updated tests for new seller permissions.

### Fixed
- Fixed `ORDER_BUYER_NOT_PARTICIPANT` error when buyers attempted to mark orders as `DELIVERED` or `DISPUTED`. Updated role-based restrictions in `orderController.ts` to allow buyers to transition orders to `DELIVERED` and `DISPUTED` (in addition to `CANCELLED` and `COMPLETED`).

## [2026-09-23]
### Added
- Express + TypeScript + Mongoose backend initialized in `backend/`.
- 7 Mongoose models: `User`, `Category`, `Product`, `Cart`, `CartItem`, `Order`, `Notification`.
- Full REST controllers and routes matching frontend API contracts.
- MongoDB Atlas connection with TLS clock skew support (`tlsAllowInvalidCertificates=true`).
- Seed script (`seed.ts`) populating categories, users, products, cart items, orders, and notifications.

### Fixed & Implemented
- Fixed MongoDB Atlas credentials (`to12345`).
- Fixed duplicate index warnings on `User.ts` (`email`) and `Order.ts` (`idempotencyKey`).
- Fixed JWT expiresIn TypeScript typing.
- Fixed `AccountScreen.tsx` Temporal Dead Zone `ReferenceError: Cannot access 'filteredOrders' before initialization`.
- Added missing `/api/sellers` and `/api/sellers/:idOrHandle` routes & controller (`sellerController.ts`).
- Added `/api/orders/:code/shipment` endpoint for tracking shipments.
- Fixed `GET /api/products` 500 error by ensuring all Mongoose models are registered on startup and adding defensive population guards.
- Fixed Render build errors by moving TypeScript & `@types/*` into `dependencies` in `backend/package.json` and adding `types: ["node"]` in `tsconfig.json`.
- Updated `render.yaml` buildCommand to `npm install --include=dev && npm run build`.
- Fixed implicit any type error for `it` in `orderController.ts`.
- Added `apiId: p._id` in `frontend/src/lib/adapters.ts` (`adaptProduct`) and `productApiId: product.apiId` in `frontend/src/app/App.tsx` (`addToCart`) to ensure cart persistence to MongoDB Atlas and guest cart merge upon login without touching backend.
- Added `/products/mine` call in `frontend/src/app/App.tsx` (`useEffect`) when user has seller role, mapping results to `myProductsByEmail` via `adaptToSellerProduct` to preserve seller listings and stats across page reloads (F5).
- Fixed 401 Unauthorized handling by syncing `setToken` with session storage and clearing expired tokens automatically.
- **Cart flow**: Added ownership isolation, stock validation, self-purchase blocking, `DELETE /api/cart/clear`, and `POST /api/cart/merge`.
- **Order & Payment flow**:
  - Implemented automatic inventory holding (`status: "reserved"`) during online card checkout, and direct confirmation for COD.
  - Implemented complete `checkout` payment flow with automatic inventory deduction, sold state updates, and buyer/seller notifications.
  - Implemented automatic stock restoration when an order is `CANCELLED`.
  - Registered `GET /api/orders/seller` before `GET /api/orders/:id` to prevent route collision.
- **Shipment & Tracking flow**:
  - Added `POST /api/orders/:code/shipment` for sellers to create shipping labels with realistic tracking numbers and timeline events.
  - Enriched `GET /api/orders/:code/shipment` with live tracking status, GHTK tracking URLs, and chronological event milestones.
  - Added transition updates for `DELIVERING` and `DELIVERED` with automatic buyer notification and timeline logging.
- **Seller flow & display fix**:
  - Enriched `sellerController.ts` with dual frontend property aliases (`name` & `shopName`, `avatar` & `avatarUrl`, `thumbs` & `coverImages`, `transactions` & `totalTransactions`).
  - Handled flexible seller lookup in `GET /api/sellers/:idOrHandle` supporting handle with/without `@`, case-insensitive matching, email, and ObjectId.
  - Added `GET /api/sellers/:idOrHandle/products` to fetch active listings of a specific shop.
  - Added `GET /api/products/mine` and `GET /api/products/seller` for authenticated sellers to retrieve all listings and dashboard stats.
- **Seller orders needing processing fix ("Đơn hàng cần xử lý")**:
  - Broadened `VALID_TRANSITIONS` in `Order.ts` allowing `SHIPPING` -> `DELIVERED` and `PAID` -> `PACKING`.
  - Added robust ObjectId/string query matching in `getSellerOrders` for `items.sellerId`.
  - Updated `AccountScreen.tsx` to include `PAID` and `DELIVERING` in the processing filter so active orders are not hidden.
  - Implemented `handleSellerUpdateStatus` in `AccountScreen.tsx` to immediately update UI state and transition orders through Packing, Shipping, and Delivered.

## [2026-09-26] (Feature Freeze / Outcome 1 Preparation)
### Added & Audited
- Audited the entire `backend` branch and confirmed the existence of **11 full backend models**, including `Ledger.ts`, `PlatformFeeConfig.ts`, and `Review.ts`.
- Re-ran the Financial Engine Smoke Test via `verifyLedger.ts` verifying idempotency of both COD and Online Checkout collection. (5/5 PASS)
- Introduced safe deployment and reset tooling to strictly separate application architecture from volatile presentation data.

### Database Tooling (Safe Archiving & Reset Strategy)
- Created `backend/scripts/backup-db.ts` to export MongoDB JSON snapshots via Mongoose cursors instead of raw `mongodump` binaries.
- Created `backend/scripts/reset-demo-db.ts` to act as a **Safe State Reset**. Instead of utilizing `.deleteMany()`, it leverages an `updateMany({ status: 'archived' })` architecture. This prevents the creation of orphan object references for `orders` and `reviews`.
- Created `backend/scripts/seed-demo-products.ts` with execution guards (`--execute --confirm-seed`) to populate the `products` collection with 25 highly curated presentation datasets without mutating `users`, `categories`, or the `Financial Subsystem`.
- Added `.gitignore` configurations isolating local `.json` backups from the Git index.
- Finalized local **E2E Buyer/Seller flow tests** verifying real-world viability of Seller Add Product, Buyer Cart, COD Orders, Shipping transitions, and Ledger consistency without mock fallback code.

## [2026-09-30] (OpenAPI Specification Alignment & Missing Product/Seller Endpoints)
### Added & Aligned (Backend)
- **`GET /api/products/:id`**: Single product detail endpoint populated with seller and category information via `mapProduct`.
- **`PATCH /api/products/:id/archive`**: Allows seller owner or admin to archive/hide a product.
- **`GET /api/sellers/me/reviews` & `GET /api/sellers/:idOrHandle/reviews`**: Returns customer reviews for products belonging to the seller.
- **`PUT /api/auth/me/avatar`**: Updates authenticated user and seller profile avatar.

### Documentation & Contract Synchronization
- **`docs/openapi.yaml`**: Hoàn thiện toàn bộ OpenAPI 3.0.3 specification gồm 12 tags, đầy đủ Cart, Notifications, Sellers, Admin moderation, AI, Reviews, schema chi tiết và đồng bộ sang `pj_UI/docs/openapi.yaml`.
- **`docs/API_MATRIX.md`**: Cập nhật ma trận tiến độ thực tế giữa BE và FE (đánh dấu hoàn tất các tính năng FE đã kết nối).
- **`docs/API_CONTRACT.md`**: Bổ sung chi tiết contract cho các endpoint `/products/:id`, `/products/:id/archive`, `/sellers/me/reviews`, `/auth/me/avatar`.

### Verification
- ✅ `npx tsc --noEmit` pass (0 errors).
- ✅ `npm run build` pass (tsc compile OK).
- ✅ `npm run test` (errorContract) pass — 38/38 PASS.

## [2026-09-29] (Admin Stats + Reviews + Admin Path Alignment)
### Added (Backend)

- **`GET /api/admin/stats`** — Aggregated platform stats cho Admin Dashboard.
  - Trả `{ stats: { pendingListings, soldProducts, totalOrders, totalUsers, totalSellers, platformProfit } }`.
  - `platformProfit` aggregate `$sum` của `Order.platformFee` (tạm thời, chưa dùng `Ledger`).
- **`POST /api/products/:id/reviews`** — Buyer review sau khi đơn giao.
  - Tạo model mới `backend/src/models/Review.ts` (compound unique index `(orderId, productId, buyerId)`).
  - Validate: rating integer 1–5, order thuộc user, status ∈ { DELIVERED, COMPLETED }, product trong order.
  - 3 ErrorCodes mới: `REVIEW_RATING_INVALID` (400), `REVIEW_NOT_ALLOWED` (403), `REVIEW_ALREADY_EXISTS` (409).
  - Wire route: `POST /api/products/:id/reviews` (sau `POST /api/products` để tránh route shadow).

### Changed (Backend)

- **Admin seller moderation paths align với FE `AdminScreen`**:
  - Canonical: `PATCH /api/admin/sellers/:id/{approve,reject}`.
  - Legacy deprecated: `PATCH /api/admin/users/:id/{approve-seller,reject-seller}` — vẫn hoạt động, log warning mỗi lần gọi.
- **`GET /api/admin/pending-sellers`** response shape đổi:
  - Trước: `{ sellers, total }`.
  - Sau: `{ users, total }` (match FE `AdminScreen` đọc `res.users`).
  - **Breaking change** — không có alias backward-compat.

### Files Changed
- `backend/src/controllers/adminController.ts` — thêm `getAdminStats`, đổi response shape `getPendingSellers`.
- `backend/src/routes/admin.ts` — thêm canonical paths + deprecated aliases.
- `backend/src/controllers/productController.ts` — thêm `createReview`, import `Order` & `Review`.
- `backend/src/routes/products.ts` — wire `POST /:id/reviews`.
- `backend/src/models/Review.ts` (NEW) — model + unique index.
- `backend/src/models/index.ts` — export `Review`.
- `backend/src/utils/errors.ts` — thêm 3 error codes (REVIEW_*) + HTTP status mappings.
- `docs/API_CONTRACT.md` — thêm docs cho `/admin/stats`, `/products/:id/reviews`, cập nhật admin endpoints.
- `docs/API_CHANGELOG.md` — entry mới ghi breaking change + new endpoints.
- `AI_CONTEXT.md` — section "Backend Iteration 2026-09-29" với verification + known limitations.

### Verification
- ✅ `npx tsc --noEmit` pass (exit 0).
- ✅ `npm run test` (errorContract) pass — **38/38 PASS** (bao gồm các critical codes).
- ✅ `npm run build` pass.

### Known Limitations
- `platformProfit` từ `Order.platformFee` thay vì `Ledger` (chưa tích hợp).
- `Ledger.ts` và `PlatformFeeConfig.ts` được nhắc trong entry 2026-09-26 cũ nhưng **không có trong git tree branch `backend` hiện tại** — cần tạo mới nếu muốn dùng.

### Backlog (cần làm trước khi vào production payment)

- [ ] **Implement `Ledger.ts`** — double-entry accounting (PLATFORM_CASH / PLATFORM_REVENUE / SELLER_PAYABLE / BUYER_PAYMENT / REFUND). Refactor `getAdminStats` dùng `Ledger` thay vì aggregate `Order.platformFee` để tránh drift.
- [ ] **Implement `PlatformFeeConfig.ts`** — schema + admin endpoint để update commission rate theo thời điểm áp dụng. Hook vào `orderController` thay hardcode `0.1`.
- [ ] **Cleanup deprecated admin paths** — sau khi FE team confirm migrate sang canonical `/admin/sellers/:id/{approve,reject}`, xóa aliases `/admin/users/:id/{approve,reject}-seller` trong `routes/admin.ts`.

## [2026-09-29] (Seller Application Flow)
### Added

- **`POST /api/auth/seller/apply`** — User tự đăng ký thành seller (trước đây admin phải set thủ công trong DB).
  - Validation: shopName 3-100 chars unique, handle 3-30 chars alphanumeric + `_` + `.`, description max 500, coverImages max 5.
  - Auto-generate `handle` từ email local-part nếu user không cung cấp.
  - Idempotent: nếu user đã apply, trả current state với status code 200 (vs 201 first-time).
  - Side effects: thêm role `"seller"` vào `user.roles`, set `sellerProfile.status = "pending_approval"`.
- **Admin seller moderation endpoints**:
  - `GET /api/admin/pending-sellers` — list applications đang chờ duyệt.
  - `PATCH /api/admin/users/:id/approve-seller` — duyệt, set `status = "active"`, gửi notification.
  - `PATCH /api/admin/users/:id/reject-seller` — từ chối, set `status = "suspended"` + remove role, gửi notification kèm `reason`.
- **3 ErrorCodes mới**: `SELLER_HANDLE_TAKEN` (409), `SELLER_SHOP_NAME_TAKEN` (409), `SELLER_ALREADY_APPROVED` (409).

### Documentation
- Updated `docs/API_CONTRACT.md` — added 4 endpoints (apply + 3 admin).
- Updated `docs/AUTH_SPEC.md` — added section "Seller Application Flow".
- Updated `docs/ERROR_CODES.md` — added 3 new codes.
- Updated `docs/API_CHANGELOG.md` — added entry 2026-09-29.
- Updated `backend/src/tests/errorContract.test.ts` — added 3 new critical codes (38/38 PASS).

### Verification
- ✅ `npx tsc --noEmit` pass.
- ✅ `npm run test` pass — **38/38 PASS** (was 35, +3 for new codes).

## [2026-09-29] (API Contract Unification)
### Added & Implemented

- **Unified Error Envelope** — Created `backend/src/utils/errors.ts` as single source of truth cho error response format.
  - `ErrorCode` enum với ~40 business codes (PRODUCT_NOT_FOUND, SELLER_NOT_APPROVED, ORDER_INVALID_TRANSITION, AI_NOT_CONFIGURED, ...).
  - `ErrorStatus` map chuẩn hóa HTTP status cho mỗi code.
  - `sendError(res, code, message, status?)` helper.
  - `handleInternalError(res, err, context)` helper cho catch block (không leak stack trace ra response).
  - `ApiErrorBody` interface export cho FE consumer.
- **Refactored toàn bộ BE** (9 controllers + middleware + app.ts) để dùng helper. Mọi error response giờ có format `{ error: { code: string, message: string } }`.

### Fixed
- **Admin endpoints shape inconsistency**: `PATCH /api/admin/listings/:id/approve|reject` giờ chạy qua `mapProduct` → response giống `GET /api/products` thay vì raw Mongoose document.
- **Notification IDOR**: `PATCH /api/notifications/:id/read` giờ enforce ownership (chỉ mark notification của chính user gọi).
- **Auth response missing fields**: `POST /api/auth/register` và `.../login` giờ trả `user._id` + `user.sellerStatus`.

### Changed (Backward Compatible)
- **Cart merge deprecation**: `/api/auth/cart/merge` trở thành thin wrapper delegate to `/api/cart/merge`. Endpoint chính thức là `/api/cart/merge`. Legacy endpoint vẫn hoạt động nhưng log warning.

### Documentation
- Updated `docs/API_CONTRACT.md` (đã đầy đủ 35 endpoints + ghi chú breaking change mới).
- Rewrote `docs/AUTH_SPEC.md` đồng bộ với code (response shape đầy đủ + Role Matrix cập nhật).
- Rewrote `docs/ENUMS.md` (Order Status 11 giá trị PAID/REFUNDED bổ sung, Payment Methods vocabulary thống nhất, Shipment Status mapping table, Error Code reference).
- Rewrote `docs/ERROR_CODES.md` (~40 codes + HTTP status + FE action + TypeScript switch example).
- Rewrote `docs/INTEGRATION_GUIDE.md` (test accounts thật từ seed + seller status + cart merge guidance).
- Added entry trong `docs/API_CHANGELOG.md` ghi nhận 4 breaking changes.

### Verification
- ✅ `npx tsc --noEmit` pass (exit 0).
- ✅ `npm run test` (errorContract.test.ts) pass — **35/35 tests PASS**, verify:
  - ErrorCode catalog đầy đủ 46 codes với HTTP status mapping.
  - `sendError` produce đúng format `{ error: { code, message } }`.
  - `handleInternalError` không leak stack trace ra response (regression test).
  - Critical codes (UNAUTHORIZED, SELLER_NOT_APPROVED, ORDER_INVALID_TRANSITION, ...) đều tồn tại.
- ⚠️ Integration tests (`productAuth.test.ts`, `orderAuth.test.ts`) chưa chạy được do thiếu `MONGODB_URI_TEST`. Setup ghi trong `docs/INTEGRATION_GUIDE.md` § Testing.

### Tests added (testing infrastructure)

- `backend/src/tests/errorContract.test.ts` (NEW): Unit test cho `utils/errors.ts`. Không cần DB, chạy nhanh (~2 giây).
- `backend/src/tests/productAuth.test.ts` (UPDATED): Thêm 5 test cases cho error envelope format. Tự `dropDatabase()` trước khi chạy để clean state.
- `backend/src/tests/orderAuth.test.ts` (UPDATED): Thêm 3 test cases + assert error code (FORBIDDEN, ORDER_NOT_FOUND, ORDER_STATUS_REQUIRED, ORDER_INVALID_TRANSITION).
- `backend/.env.test.example` (NEW): Template cho `MONGODB_URI_TEST`. BE lead cần copy thành `.env.test` và điền URI thật.
- `backend/package.json`: Thêm scripts `test`, `test:auth`, `test:order`, `test:all`.

## [2026-09-28]
### Added
- Implemented standardized API Contract Documentation architecture within the `docs/` directory to formally govern Backend and Frontend integration.
- Added `docs/API_CONTRACT.md` as the primary human-readable contract outlining all supported endpoints, request structures, and response schemas.
- Added `docs/AUTH_SPEC.md` for defining authentication methods, JWT handling, and Role-Based Access Control matrix.
- Added `docs/ENUMS.md` ensuring vocabulary consistency across the stack (Order Status, Product Conditions, Roles).
- Added `docs/ERROR_CODES.md` to map standardized business error codes to anticipated frontend UI actions.
- Added `docs/API_CHANGELOG.md` to audit structural API updates over time.
- Added `docs/INTEGRATION_GUIDE.md` detailing frontend environment variables and test account availability.
- Added `docs/API_MATRIX.md` to track endpoint implementations and integration progress between teams.
- **Security Fix**: Fixed seller authorization on `POST /api/products`. Previously it only validated `requireAuth`, allowing buyers to access product creation. It now strictly requires `user.roles.includes("seller")` and `user.sellerProfile.status === "active"`, rejecting with `403 SELLER_NOT_APPROVED` if unmet.
- **Contract Accuracy Fix**: Adjusted `docs/ENUMS.md` and `docs/API_CONTRACT.md` to reflect that `Product.condition` is a Number (0-100) and `SellerStatus` is actually `active` | `pending_approval` | `suspended` (not `APPROVED`).
- **Authorization Audit Fixes**: 
  - Fixed IDOR on `GET /api/orders/:code/shipment` (added `requireAuth` and ownership checks to prevent PII leak).
  - Fixed IDOR on `PATCH /api/orders/:code/status` (now checks if user is the buyer, a seller of an item in the order, or an admin).
  - Fixed State-machine Bypass on `PATCH /api/orders/:code/status` (Buyers can now only transition to CANCELLED or COMPLETED, Sellers cannot directly bypass to DELIVERED).
