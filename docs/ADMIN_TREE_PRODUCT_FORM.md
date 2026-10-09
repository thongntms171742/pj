# Admin Form Mockup — Shopee-style Tree Product

> Visual reference cho admin form mới (`POST /api/admin/tree-products`).
> Pattern tham khảo từ Shopee Seller Centre "Thêm sản phẩm mới" bước 2-3.

## 1. List page — `/admin/tree-products`

```
┌──────────────────────────────────────────────────────────────────────────┐
│  🌲 Quản lý cây thông         [ + Thêm sản phẩm mới ]                    │
├──────────────────────────────────────────────────────────────────────────┤
│  Bộ lọc: [Tất cả ▼]  [Tìm tên...      🔍]                                │
├──────────────────────────────────────────────────────────────────────────┤
│  ┌────┐  Cây thông Noel — Mây Xanh         [Sửa] [Xóa]                   │
│  │IMG │  PVC cao cấp · Mật độ tiêu chuẩn                                  │
│  └────┘  ● S: 1.69tr (còn 100)                                             │
│          ● M: 2.29tr (còn 60)                                              │
│          ● L: 3.19tr (còn 30)                                              │
│  ──────────────────────────────────────────────────────────────────────── │
│  ┌────┐  Cây thông Noel — Tuyết Bạc       [Sửa] [Xóa]                   │
│  │IMG │  PVC phủ bạc · Mật độ dày                                          │
│  └────┘  ● S: 1.99tr (còn 80)                                              │
│          ● M: 2.79tr (còn 50)                                              │
│          ● L: 3.99tr (còn 20)                                              │
└──────────────────────────────────────────────────────────────────────────┘
```

## 2. Create / Edit form — `POST /api/admin/tree-products`

Layout chia 2 khối: (A) Thông tin chung (parent), (B) Ma trận size (variants).

```
┌──────────────────────────────────────────────────────────────────────────┐
│  🌲 Sản phẩm cây thông                       [ Hủy ]   [ 💾 Lưu ]      │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ╔══ A. THÔNG TIN SẢN PHẨM (parent) ════════════════════════════════╗  │
│  ║                                                                    ║  │
│  ║  Tên sản phẩm *                                                    ║  │
│  ║  ┌────────────────────────────────────────────────────────────┐    ║  │
│  ║  │ Cây thông Noel — Mây Xanh                                  │    ║  │
│  ║  └────────────────────────────────────────────────────────────┘    ║  │
│  ║  (slug tự sinh: cay-thong-noel-may-xanh)                          ║  │
│  ║                                                                    ║  │
│  ║  ┌────────────┐  ┌────────────┐                                    ║  │
│  ║  │ Chất liệu* │  │ Mật độ*    │                                    ║  │
│  ║  │ [PVC ▼]    │  │ [Dense ▼]  │                                    ║  │
│  ║  └────────────┘  └────────────┘                                    ║  │
│  ║                                                                    ║  │
│  ║  Mô tả                                                             ║  │
│  ║  ┌────────────────────────────────────────────────────────────┐    ║  │
│  ║  │ Cây thông xanh tự nhiên, cành dày, dễ trang trí...        │    ║  │
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
│  ╔══ B. MA TRẬN SIZE (variants) ════════════════════════════════════╗  │
│  ║                                                                  ║  │
│  ║  Có 3 size: S (≤1.3m) · M (1.4-1.6m) · L (1.7-1.9m)              ║  │
│  ║  Bạn có thể bỏ size nào không bán bằng cách bỏ tick bên dưới.    ║  │
│  ║                                                                  ║  │
│  ║  ☐ S   ☐ M   ☐ L                                                ║  │
│  ║                                                                  ║  │
│  ║  ▼ Size S (≤ 1m3)                                                ║  │
│  ║  ┌─────────────────────────────────────────────────────────┐     ║  │
│  ║  │ Chiều cao:  [110] – [130] cm   Đường kính: [70] cm    │     ║  │
│  ║  │                                                         │     ║  │
│  ║  │ Giá bán:       [ 169000 ] đ                              │     ║  │
│  ║  │ Tồn kho:       [   100  ] cái                            │     ║  │
│  ║  │ Ảnh riêng:     [ 📷 Upload ]  (tùy chọn)                 │     ║  │
│  ║  └─────────────────────────────────────────────────────────┘     ║  │
│  ║                                                                  ║  │
│  ║  ▼ Size M (1m4-1m6)                                              ║  │
│  ║  ┌─────────────────────────────────────────────────────────┐     ║  │
│  ║  │ Chiều cao:  [140] – [160] cm   Đường kính: [100] cm   │     ║  │
│  ║  │ Giá bán:       [ 229000 ] đ                              │     ║  │
│  ║  │ Tồn kho:       [    60  ] cái                            │     ║  │
│  ║  └─────────────────────────────────────────────────────────┘     ║  │
│  ║                                                                  ║  │
│  ║  ▼ Size L (1m7-1m9)                                              ║  │
│  ║  ┌─────────────────────────────────────────────────────────┐     ║  │
│  ║  │ Chiều cao:  [170] – [190] cm   Đường kính: [130] cm   │     ║  │
│  ║  │ Giá bán:       [ 319000 ] đ                              │     ║  │
│  ║  │ Tồn kho:       [    30  ] cái                            │     ║  │
│  ║  └─────────────────────────────────────────────────────────┘     ║  │
│  ║                                                                  ║  │
│  ║  ⚡ Áp dụng nhanh (Shopee "Bulk apply")                          ║  │
│  ║  ┌─────────────────────────────────────────────────────────┐     ║  │
│  ║  │ Field: [ Tồn kho ▼ ]   Giá trị: [ 100 ]                 │     ║  │
│  ║  │ Áp dụng cho: ( ) Chỉ M (●) Tất cả size ( ) Chỉ S+L     │     ║  │
│  ║  │                                       [ Áp dụng ]        │     ║  │
│  ║  └─────────────────────────────────────────────────────────┘     ║  │
│  ╚══════════════════════════════════════════════════════════════════╝  │
│                                                                          │
│                            [ Hủy ]      [ 💾 Lưu sản phẩm ]              │
└──────────────────────────────────────────────────────────────────────────┘
```

## 3. Luồng tương tác chính

### 3.1 Bỏ size (full-replace)
Bỏ tick `☐ L` → click [Lưu] → BE `POST /api/admin/tree-products` với
`variants: [S, M]` → BE `Tree.deleteMany({productId, size: L})`.

### 3.2 Bulk apply (Shopee "Áp dụng cho tất cả phân loại")
Gõ `Tồn kho = 100` + tick "Tất cả size" + bấm [Áp dụng] →
FE gọi `PATCH /api/admin/trees/bulk` với
`{ field: "stock", value: 100, productId: "<current>" }` →
BE updateMany toàn bộ variants của product đó.

### 3.3 Soft delete product
Click [Xóa] trên list → confirm dialog → `DELETE /api/admin/tree-products/:id` →
BE set `product.isActive = false` + cascade variants.
Existing orders/designs vẫn render đúng vì variant `_id` được giữ.

## 4. So sánh UX — Trước vs Sau

| Tác vụ | Trước (1 doc/size) | Sau (parent + variants) |
|---|---|---|
| Thêm 1 size mới cho sản phẩm có sẵn | Tạo doc mới, copy lại name/material/density | Mở form, tick thêm size, điền giá/kho |
| Đổi material cho cả 3 size | Sửa 3 chỗ | Sửa 1 chỗ (parent.material) → lưu |
| Tăng giá tất cả size 10% | 3 PATCH riêng | 1 bulk apply |
| Tắt 1 size tạm thời | PATCH isActive=false (1 doc) | Bỏ tick size đó (full-replace) |
| Admin nhập sai tên (vd: "Cây thông Noel") | Phải sửa 3 doc cùng tên | Sửa 1 chỗ |

## 5. Wireframe đơn giản (dạng 1-col mobile)

```
┌──────────────────────────────┐
│ 🌲 Cây thông Noel — Mây Xanh│
│ ──────────────────────────── │
│ Tên:                        │
│ Cây thông Noel — Mây Xanh   │
│                              │
│ Chất liệu: [PVC ▼]          │
│ Mật độ:    [Dense ▼]        │
│                              │
│ Ảnh bìa:  [📷]              │
│                              │
│ ── Sizes ─────────────────── │
│ ☑ S  1.69tr  còn 100        │
│    ↳ 110-130cm · Ø70cm      │
│ ☑ M  2.29tr  còn 60         │
│    ↳ 140-160cm · Ø100cm     │
│ ☑ L  3.19tr  còn 30         │
│    ↳ 170-190cm · Ø130cm     │
│                              │
│ [    Lưu sản phẩm    ]      │
└──────────────────────────────┘
```

## 6. State machine — Admin form

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
        │  - validate name, material       │
        │  - validate ≥1 size             │
        │  - validate price >= 0          │
        │  - validate heightMin <= Max     │
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

## 7. Validation rules (mirror BE)

- `name`: required, trim, max 100 chars
- `material`, `density`: required, dropdown
- `coverImage`: required (URL or after upload)
- Variants: ≥1, mỗi cái có `size ∈ {S, M, L}` (không trùng size), `price ≥ 0`, `stock ≥ 0`, `0 ≤ heightCmMin ≤ heightCmMax`
- Bỏ 1 size khỏi variants = xóa variant đó (full-replace)

## 8. Lưu ý cho FE dev

1. **CORS không cần quan tâm** — endpoint cùng origin với admin.
2. **Form nên support "Save & Add Another"** — tiện cho admin nhập nhiều sản phẩm liên tục.
3. **Confirm dialog khi unsaved changes** — React `usePrompt` hook hoặc window event.
4. **Loading skeleton** cho list page, không block toàn bộ table.
5. **Optimistic update** cho bulk apply — revert nếu BE lỗi.
6. **Ảnh upload**: tạm thời paste URL hoặc convert base64 (đã note trong AI_CONTEXT backlog) — sau này BE có `/api/uploads` multipart.
