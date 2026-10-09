# Admin Form Mockup — Shopee-style Tree Product (2D Matrix: Màu × Size)

> Visual reference cho admin form mới (`POST /api/admin/tree-products`).
> Pattern tham khảo từ Shopee Seller Centre "Thêm sản phẩm mới" bước 2-3.

## 0. So sánh 1D (cũ) vs 2D (Shopee)

| Aspect | 1D (cũ) | 2D (Shopee) |
|---|---|---|
| Phân loại 1 | — | **Màu sắc** (Mây Xanh, Tuyết Bạc, Đại Lễ Hội) |
| Phân loại 2 | **Size** (S/M/L) | **Size** (S/M/L) |
| SKU count | 3 (1 per size) | 9 (3 colors × 3 sizes) tối đa |
| Variant doc | 1 doc/size | 1 doc/(color, size) |
| Ma trận UX | Form cuộn dọc theo size | Bảng 2D cells: hàng=màu, cột=size |
| `material` | Field riêng trên variant | Implicit từ `color` (map) |
| Bulk apply | "Áp dụng cho tất cả size" | "Áp dụng cho tất cả phân loại" (cả màu lẫn size) |

## 1. List page — `/admin/tree-products`

```
┌──────────────────────────────────────────────────────────────────────────┐
│  🌲 Quản lý cây thông         [ + Thêm sản phẩm mới ]                    │
├──────────────────────────────────────────────────────────────────────────┤
│  Bộ lọc: [Tất cả ▼]  [Tìm tên...      🔍]                                │
├──────────────────────────────────────────────────────────────────────────┤
│  ┌────┐  Cây thông Noel                       [Sửa] [Xóa]                 │
│  │IMG │  Mật độ tiêu chuẩn · 3 màu · 3 size                              │
│  └────┘  ┌──────┬────────┬────────┬────────┐                              │
│          │      │   S    │   M    │   L    │                              │
│          │Mây X.│ 1.69tr │ 2.49tr │ 3.99tr │                              │
│          │Tuyết B│ —     │ 2.49tr │ —      │  (chưa tạo)                  │
│          │Đại L.H│ 1.69tr │ —     │ 3.99tr │                              │
│          └──────┴────────┴────────┴────────┘                              │
│  ──────────────────────────────────────────────────────────────────────── │
│  ┌────┐  Cây thông mini (nếu có)         [Sửa] [Xóa]                     │
│  │IMG │  ...                                                               │
│  └────┘                                                                   │
└──────────────────────────────────────────────────────────────────────────┘
```

Mỗi cell của ma trận = 1 SKU `(màu, size)`. Empty cells = SKU chưa tạo
(click để thêm nhanh). Click cell → modal edit 1 SKU.

## 2. Create / Edit form — `POST /api/admin/tree-products`

Layout chia 2 khối: (A) Thông tin chung (parent), (B) Bảng ma trận Màu × Size.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  🌲 Sản phẩm cây thông                       [ Hủy ]   [ 💾 Lưu ]      │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ╔══ A. THÔNG TIN SẢN PHẨM (parent) ════════════════════════════════╗  │
│  ║                                                                    ║  │
│  ║  Tên sản phẩm *                                                    ║  │
│  ║  ┌────────────────────────────────────────────────────────────┐    ║  │
│  ║  │ Cây thông Noel                                              │    ║  │
│  ║  └────────────────────────────────────────────────────────────┘    ║  │
│  ║  (slug tự sinh: cay-thong-noel)                                  ║  │
│  ║                                                                    ║  │
│  ║  ┌────────────┐                                                    ║  │
│  ║  │ Mật độ *   │                                                    ║  │
│  ║  │ [Dense ▼]  │                                                    ║  │
│  ║  └────────────┘                                                    ║  │
│  ║                                                                    ║  │
│  ║  Mô tả                                                             ║  │
│  ║  ┌────────────────────────────────────────────────────────────┐    ║  │
│  ║  │ Cây thông Noel tự nhiên, cành dày, dễ trang trí...         │    ║  │
│  ║  │                                                            │    ║  │
│  ║  └────────────────────────────────────────────────────────────┘    ║  │
│  ║                                                                    ║  │
│  ║  Ảnh bìa *               Ảnh phụ (kéo thả để sắp xếp)             ║  │
│  ║  ┌────────┐              ┌────┐ ┌────┐ ┌────┐  [+]                  ║  │
│  ║  │  IMG   │              │IMG │ │IMG │ │IMG │                       ║  │
│  ║  │   📷   │              └────┘ └────┘ └────┘                       ║  │
│  ║  └────────┘                                                       ║  │
│  ║                                                                    ║  │
│  ║  ☑ Hiển thị trên catalog                                            ║  │
│  ║  Thứ tự hiển thị:  [  1  ]                                          ║  │
│  ╚════════════════════════════════════════════════════════════════════╝  │
│                                                                          │
│  ╔══ B. BẢNG MA TRẬN MÀU × SIZE (variants) ═══════════════════════════╗  │
│  ║                                                                  ║  │
│  ║  Phân loại 1 — Màu:    ☑ Mây Xanh  ☑ Tuyết Bạc  ☑ Đại Lễ Hội  ║  │
│  ║  Phân loại 2 — Size:   ☑ S (≤1m3)  ☑ M (1m4-1m6) ☑ L (1m7-1m9)  ║  │
│  ║                                                                  ║  │
│  ║  ┌────────────────┬──────────┬──────────┬──────────┐              ║  │
│  ║  │   Màu \ Size   │ S (≤1m3) │ M (1m4)  │ L (1m7)  │              ║  │
│  ║  ├────────────────┼──────────┼──────────┼──────────┤              ║  │
│  ║  │ 🟢 Mây Xanh    │ ┌──────┐ │ ┌──────┐ │ ┌──────┐ │              ║  │
│  ║  │                │ │169k  │ │ │249k  │ │ │399k  │ │              ║  │
│  ║  │                │ │100 cái│ │ │ 80 cái│ │ │ 50 cái│ │             ║  │
│  ║  │                │ │[Sửa] │ │ │[Sửa] │ │ │[Sửa] │ │              ║  │
│  ║  │                │ └──────┘ │ └──────┘ │ └──────┘ │              ║  │
│  ║  ├────────────────┼──────────┼──────────┼──────────┤              ║  │
│  ║  │ ⚪ Tuyết Bạc    │  (chưa  │ ┌──────┐ │  (chưa  │              ║  │
│  ║  │                │   tạo)  │ │299k  │ │   tạo)  │              ║  │
│  ║  │                │ [+ Tạo]  │ │ 50 cái│ │ [+ Tạo]  │             ║  │
│  ║  │                │          │ │[Sửa] │ │          │              ║  │
│  ║  │                │          │ └──────┘ │          │              ║  │
│  ║  ├────────────────┼──────────┼──────────┼──────────┤              ║  │
│  ║  │ 🟡 Đại Lễ Hội  │ ┌──────┐ │  (chưa  │ ┌──────┐ │              ║  │
│  ║  │                │ │199k  │ │   tạo)  │ │449k  │ │              ║  │
│  ║  │                │ │ 60 cái│ │ [+ Tạo]  │ │ 30 cái│ │             ║  │
│  ║  │                │ │[Sửa] │ │          │ │[Sửa] │ │              ║  │
│  ║  │                │ └──────┘ │          │ └──────┘ │              ║  │
│  ║  └────────────────┴──────────┴──────────┴──────────┘              ║  │
│  ║                                                                  ║  │
│  ║  Click [+ Tạo] hoặc [Sửa] → modal edit 1 SKU (xem §3)            ║  │
│  ║                                                                  ║  │
│  ║  ⚡ Áp dụng nhanh (Shopee "Bulk apply")                          ║  │
│  ║  ┌─────────────────────────────────────────────────────────┐     ║  │
│  ║  │ Field: [ Tồn kho ▼ ]   Giá trị: [ 100 ]                 │     ║  │
│  ║  │ Áp dụng cho:                                              │     ║  │
│  ║  │   ( ) Chỉ 1 SKU đang edit                                │     ║  │
│  ║  │   (●) 1 màu × tất cả size                                │     ║  │
│  ║  │   ( ) 1 size × tất cả màu                                │     ║  │
│  ║  │   ( ) Toàn bộ ma trận                                    │     ║  │
│  ║  │                                       [ Áp dụng ]        │     ║  │
│  ║  └─────────────────────────────────────────────────────────┘     ║  │
│  ╚══════════════════════════════════════════════════════════════════╝  │
│                                                                          │
│                            [ Hủy ]      [ 💾 Lưu sản phẩm ]              │
└──────────────────────────────────────────────────────────────────────────┘
```

## 3. Modal edit 1 SKU (click [Sửa] hoặc [+ Tạo])

```
┌─────────────────────────────────────────────────┐
│  📦 SKU: Mây Xanh — Size S               [ ✕ ] │
├─────────────────────────────────────────────────┤
│                                                 │
│  Chiều cao:  [110] – [130] cm                   │
│  Đường kính: [70] cm                            │
│                                                 │
│  Giá bán:    [ 169000 ] đ                        │
│  Tồn kho:    [   100  ] cái                      │
│                                                 │
│  Ảnh riêng:  [ 📷 Upload ]   (tùy chọn)         │
│                                                 │
│  ☑ Hiển thị SKU này                              │
│                                                 │
│              [ Hủy ]    [ 💾 Lưu SKU ]          │
└─────────────────────────────────────────────────┘
```

## 4. Payload mẫu FE → BE

### 4.1 Tạo mới
```json
POST /api/admin/tree-products
{
  "name": "Cây thông Noel",
  "density": "Dense",
  "description": "Cây thông Noel tự nhiên, cành dày, dễ trang trí.",
  "coverImage": "https://cdn.byc.vn/trees/noel-cover.jpg",
  "images": [
    "https://cdn.byc.vn/trees/noel-1.jpg",
    "https://cdn.byc.vn/trees/noel-2.jpg"
  ],
  "colors": ["Mây Xanh", "Tuyết Bạc", "Đại Lễ Hội"],
  "isActive": true,
  "sortOrder": 1,
  "variants": [
    { "color": "Mây Xanh", "size": "S", "price": 169000, "stock": 100, "heightCmMin": 110, "heightCmMax": 130, "diameterCm": 70 },
    { "color": "Mây Xanh", "size": "M", "price": 249000, "stock": 80,  "heightCmMin": 140, "heightCmMax": 160, "diameterCm": 100 },
    { "color": "Mây Xanh", "size": "L", "price": 399000, "stock": 50,  "heightCmMin": 170, "heightCmMax": 190, "diameterCm": 130 },
    { "color": "Tuyết Bạc", "size": "M", "price": 299000, "stock": 50,  "heightCmMin": 140, "heightCmMax": 160, "diameterCm": 100 },
    { "color": "Đại Lễ Hội", "size": "S", "price": 199000, "stock": 60,  "heightCmMin": 110, "heightCmMax": 130, "diameterCm": 70 },
    { "color": "Đại Lễ Hội", "size": "L", "price": 449000, "stock": 30,  "heightCmMin": 170, "heightCmMax": 190, "diameterCm": 130 }
  ]
}
```
→ 201 Created về `{ treeProduct: { ..., variants: [...6] } }`

### 4.2 Update (đổi giá + thêm 1 SKU)
```json
POST /api/admin/tree-products
{
  "productId": "6ac88d34624e21c239a90249",
  "name": "Cây thông Noel",
  ...
  "variants": [
    { "color": "Mây Xanh", "size": "S", "price": 179000, "stock": 100, ... },
    { "color": "Mây Xanh", "size": "M", "price": 259000, "stock": 80,  ... },
    { "color": "Mây Xanh", "size": "L", "price": 399000, "stock": 50,  ... },
    { "color": "Tuyết Bạc", "size": "S", "price": 219000, "stock": 50,  ... }   ← MỚI
    { "color": "Tuyết Bạc", "size": "M", "price": 299000, "stock": 50,  ... },
    { "color": "Tuyết Bạc", "size": "L", "price": 429000, "stock": 30,  ... }   ← MỚI
    { "color": "Đại Lễ Hội", "size": "S", "price": 199000, "stock": 60,  ... },
    { "color": "Đại Lễ Hội", "size": "M", "price": 309000, "stock": 40,  ... }   ← MỚI
    { "color": "Đại Lễ Hội", "size": "L", "price": 449000, "stock": 30,  ... }
  ]
}
```
→ 200 OK + Tuyết Bạc × L + Đại Lễ Hội × M mới được insert, các variant cũ còn lại update giá.

### 4.3 Bulk apply (Shopee "Áp dụng cho tất cả phân loại")
```json
PATCH /api/admin/trees/bulk
{ "field": "stock", "value": 200, "productId": "6ac88d34624e21c239a90249" }
```
→ 200 OK `{ "matched": 6, "modified": 6 }`

## 5. Luồng tương tác chính

### 5.1 Bỏ 1 SKU (click cell → bỏ tick → Save)
Bỏ tick Mây Xanh × S trên hàng chọn color → click [Lưu] → FE gửi
`variants` KHÔNG có SKU đó → BE `Tree.deleteOne({productId, color: "Mây Xanh", size: "S"})`.

### 5.2 Bỏ 1 màu (cả cột)
Bỏ tick ☐ Tuyết Bạc → click [Lưu] → FE gửi
`colors: ["Mây Xanh", "Đại Lễ Hội"]` + `variants` không có SKU Tuyết Bạc →
BE deleteMany + create 6 SKUs mới (2 colors × 3 sizes).

### 5.3 Bulk apply
- 1 SKU đang edit: modal có mini-bulk
- 1 màu × tất cả size: `PATCH /api/admin/trees/bulk?filter=color` (BE updateMany match color)
- 1 size × tất cả màu: tương tự filter=size
- Toàn bộ: `productId: "..."` không filter

(Hiện tại BE chỉ hỗ trợ filter theo `productId`. FE cần build filter
options rồi translate sang query param hoặc tạo endpoint mới.)

### 5.4 Soft delete product
Click [Xóa] → confirm → `DELETE /api/admin/tree-products/:id` →
BE set `product.isActive = false` + cascade variants.
Existing orders/designs vẫn render đúng vì variant `_id` được giữ.

## 6. So sánh UX — Trước vs Sau

| Tác vụ | Trước (1 doc/size) | Sau (parent + 2D matrix) |
|---|---|---|
| Thêm 1 size mới cho sản phẩm có sẵn | Tạo doc mới, copy name/material/density | Mở form, click [+ Tạo] ở cell, điền 1 SKU |
| Thêm 1 màu mới | Tạo doc mới | Tick color mới → click [Tạo hàng loạt] → tự sinh 3 cells |
| Đổi mô tả cho cả product | Sửa 3 chỗ | Sửa 1 chỗ (parent.description) → lưu |
| Tăng giá 10% toàn bộ ma trận | 3 PATCH riêng | 1 bulk apply `Toàn bộ ma trận` |
| Tắt 1 SKU tạm thời | PATCH isActive=false (1 doc) | Click [Sửa] cell → bỏ tick "Hiển thị" |
| Tắt 1 màu (cả 3 size) | PATCH 3 lần | Bỏ tick color → Save (1 lần) |

## 7. Wireframe đơn giản (dạng 1-col mobile)

```
┌──────────────────────────────┐
│ 🌲 Cây thông Noel            │
│ ──────────────────────────── │
│ Tên:                        │
│ Cây thông Noel              │
│                              │
│ Mật độ: [Dense ▼]           │
│ Ảnh bìa: [📷]               │
│                              │
│ ── Phân loại ────────────── │
│ Màu: ☑Mây Xanh ☑Tuyết ☑Đại│
│ Size: ☑S  ☑M  ☑L          │
│                              │
│ ── Ma trận giá ─────────── │
│     │  S  │  M  │  L       │
│ Mây │169k │249k │399k      │
│ Tuyết│  -  │299k │  -      │
│ Đại  │199k │  -  │449k     │
│                              │
│ ⚡ Bulk: [Tồn kho ▼][100]  │
│         [    Áp dụng    ]   │
│                              │
│ [    Lưu sản phẩm    ]      │
└──────────────────────────────┘
```

## 8. State machine — Admin form

```
                  ┌──────────────┐
                  │  Loading     │
                  │  (skeleton)  │
                  └──────┬───────┘
                         │ GET /admin/tree-products/:id (or new)
                         ▼
        ┌──────────────────────────────────┐
        │  Editing                         │
        │  (form dirty, validation live)   │
        │                                  │
        │  - validate name, density        │
        │  - validate ≥1 color, ≥1 size   │
        │  - validate ≥1 SKU in matrix    │
        │  - validate each SKU: price≥0,  │
        │    stock≥0, heightMin ≤ Max     │
        └──────┬──────────────────┬────────┘
               │ [Save]           │ [Cancel]
               ▼                  ▼
        ┌──────────────┐    ┌──────────┐
        │  Saving      │    │  Cancel  │
        │  (spinner)   │    │  (discard│
        │              │    │  confirm)│
        └──────┬───────┘    └──────────┘
               │ 200/201
               ▼
        ┌──────────────┐
        │  Saved ✓     │
        │  (toast)     │
        └──────┬───────┘
               │ (auto redirect after 1.5s)
               ▼
        ┌──────────────┐
        │  List page   │
        └──────────────┘
```

## 9. Validation rules (mirror BE)

- `name`: required, trim, max 100 chars
- `density`: required, dropdown
- `coverImage`: required (URL hoặc sau upload)
- `colors`: ≥1, mỗi cái ∈ {Mây Xanh, Tuyết Bạc, Đại Lễ Hội}
- `variants`: ≥1 SKU
- Mỗi SKU:
  - `color ∈ {Mây Xanh, Tuyết Bạc, Đại Lễ Hội}`
  - `size ∈ {S, M, L}`
  - `(color, size)` không trùng với SKU khác
  - `price ≥ 0`, `stock ≥ 0`
  - `0 ≤ heightCmMin ≤ heightCmMax`
  - `color` phải nằm trong `colors[]` ở parent

## 10. Lưu ý cho FE dev

1. **CORS không cần quan tâm** — endpoint cùng origin với admin.
2. **Form nên support "Save & Add Another"** — tiện cho admin nhập nhiều sản phẩm liên tục.
3. **Confirm dialog khi unsaved changes** — React `usePrompt` hook hoặc window event.
4. **Loading skeleton** cho list page, không block toàn bộ table.
5. **Optimistic update** cho bulk apply — revert nếu BE lỗi.
6. **Ảnh upload**: tạm thời paste URL hoặc convert base64 (đã note trong AI_CONTEXT backlog) — sau này BE có `/api/uploads` multipart.
7. **Bulk filter nâng cao**: hiện BE chỉ filter theo productId. Nếu FE cần "1 màu × tất cả size" thì cần extend endpoint hoặc build UI trên FE (chọn subset rồi gọi 1 variant update / SKU một lần).
8. **Empty cells = [+ Tạo]**: UX tốt hơn là disable hoặc ẩn. Khi user click + Tạo, mở modal với color+size đã pre-filled.
9. **Color chip preview**: nên render color thật (vd: "Mây Xanh" = màu xanh pastel) để admin dễ phân biệt — không chỉ text.
