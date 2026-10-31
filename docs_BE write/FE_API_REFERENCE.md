# FE API Reference — Cẩm nang Tích hợp Frontend

> Tài liệu này dành riêng cho **Frontend team** — cung cấp thông tin môi trường, tài khoản test, quy tắc tích hợp, hợp đồng dữ liệu, code mẫu React và cURL.
>
> **Source of truth**: Code thực tế trong `backend/src/`.
> **Maintainer**: Backend team (`docs_BE write/`).

---

## 📌 THÔNG TIN MÔI TRƯỜNG & TÀI KHOẢN TEST

### Môi trường API
- **Production (Render)**: `https://christmas-8ca4.onrender.com` (API: `https://christmas-8ca4.onrender.com/api`)
- **Local**: `http://localhost:4000` (API: `http://localhost:4000/api`)
- **Frontend local**: `http://localhost:5173`
- **Env Frontend** (`.env.development` / `.env.production`):
  ```bash
  VITE_API_BASE_URL=https://christmas-8ca4.onrender.com/api
  VITE_API_TARGET=https://christmas-8ca4.onrender.com
  ```

### Tài khoản Test (sau khi seed)
- **Admin**: `admin@buildyourchristmas.vn` | Password: lấy từ `SEED_ADMIN_PASSWORD` trong `backend/.env` (Quyền: quản lý sản phẩm 3 tầng, đơn hàng, preset, thống kê).
- **Buyer demo**: `buyer@buildyourchristmas.vn` | Password: lấy từ `SEED_BUYER_PASSWORD` trong `backend/.env` (Quyền: mua hàng, lưu thiết kế, giỏ hàng, checkout).

### Quy tắc tích hợp quan trọng
1. **JWT Auth**: Lưu token vào `localStorage("token")`, gửi kèm header `Authorization: Bearer <token>`. Khi token hết hạn (mã `TOKEN_INVALID`), tự động logout và redirect về `/login`.
2. **Error Envelope**: Mọi response lỗi đều có dạng `{ error: { code: string, message: string } }`. Hãy xử lý logic dựa trên `error.code`.
3. **Cart Item**: Giỏ hàng **không bắt buộc `styleId`**. Client có thể thêm trực tiếp biến thể cây (`variantId`) và phụ kiện lẻ (`accessories`) mà không cần chọn Style.
4. **Guest Session & Merge**: Khách chưa đăng nhập gửi kèm header `X-Session-Id`. Khi khách đăng nhập, gọi `POST /api/cart/merge` với body `{ guestSessionId }` để tự động gộp giỏ hàng vào tài khoản.
5. **Giao hàng (Delivery)**:
   - `READY_TO_DISPLAY` (cây trang trí sẵn): Chỉ hỗ trợ TP.HCM (`shippingProvinceId === "79"`).
   - `DIY_KIT` (bộ tự trang trí) và `SEPARATE` (giao riêng lẻ): Hỗ trợ giao hàng toàn quốc (63 tỉnh thành qua CAS proxy `GET /api/addresses/provinces`).

---

## 0. 🚨 BREAKING CHANGE 2026-10-10 — Legacy `/api/admin/trees` đã bị chặn ghi

> Đọc mục này **trước khi** viết code gọi API. Đây là thay đổi phá vỡ hợp đồng API.

### Bảng trạng thái

| Endpoint | Trạng thái | Dùng thay bằng |
| :--- | :--- | :--- |
| `GET /api/admin/trees` | ⚠️ Deprecated — còn chạy, read-only | `GET /api/admin/tree-products` |
| `POST /api/admin/trees` | ❌ **ĐÃ CHẶN** → 400 `INVALID_INPUT` | `POST /api/admin/tree-products` |
| `PATCH /api/admin/trees/:id` | ❌ **ĐÃ CHẶN** → 400 `INVALID_INPUT` | `PATCH /api/admin/tree-products/:productId` |
| `GET /api/catalog/trees` | ⚠️ Deprecated — còn chạy, read-only | `GET /api/catalog/tree-products` |

### Tại sao chặn

Handler cũ nhận `req.body` thô rồi đưa thẳng vào `Tree.create(body)` — **không validate** `productId` / `codeId`:

```typescript
// Code CŨ — đã bị thay thế
export const createTree = ah(async (req, res) => {
  const body = req.body as any;
  if (!body.size || !body.name || body.price == null) { /* ... */ }
  const tree = await Tree.create(body);   // ← bypass hoàn toàn cấu trúc 3 tầng
});
```

Hệ quả: tạo được **variant mồ côi** — thuộc về product nào? code nào? Không ai biết.

Vấn đề nghiêm trọng vì `GET /api/catalog/tree-products` duyệt dữ liệu theo đường **product → code → variant**. Variant mồ côi không nằm trên bất kỳ đường nào → **không hiện trên catalog, không ai thấy, không ai xoá được** — nhưng vẫn là dòng live trong collection `Tree`, vẫn được tính vào các phép thống kê, vẫn có thể bị tham chiếu bởi order cũ.

```
TreeProduct
   └── TreeCode
         └── Tree          ← 3 tầng bắt buộc
                 ↑
                 └── Tree.create(body)   ← tạo thẳng, bỏ qua 2 tầng trên
```

### Response lỗi khi gọi endpoint đã chặn

HTTP `400`:

```json
{
  "error": {
    "code": "INVALID_INPUT",
    "message": "POST/PATCH /api/admin/trees đã bị vô hiệu hoá (create). Hãy dùng luồng 3 bước: POST /api/admin/tree-products → POST /api/admin/tree-products/:productId/codes → POST /api/admin/tree-codes/:codeId/variants"
  }
}
```

### Luồng thay thế (3 bước)

```
1.  POST   /api/admin/tree-products
            body: { name, category?, density, coverImage?, images?, aspectRatio?, videoUrl? }
    ← { treeProduct: { _id, name, slug, ... } }

2.  POST   /api/admin/tree-products/:productId/codes
            body: { code, name, material?, image?, sortOrder? }
    ← { treeCode: { _id, code, name, ... } }

3.  POST   /api/admin/tree-codes/:codeId/variants
            body: { size, price, stockQuantity, heightCmMin, heightCmMax,
                    diameterCm?, sku?, images?, bareImage? }
    ← { variant: { _id, sku, name, price, stockQuantity, ... } }
```

Bước 3 là nơi **duy nhất** chứa `price` và `stockQuantity`.

### Hành động cần làm cho FE

1. Grep codebase FE mọi chỗ gọi `POST /api/admin/trees` hoặc `PATCH /api/admin/trees/` → đổi sang flow 3 bước.
2. Form admin chỉ gọi `POST /api/admin/trees` thì **đã hỏng** — phải viết lại.
3. Chỗ gọi `GET` vẫn chạy, nên migrate dần sang `/tree-products` để có dữ liệu grouped 3 tầng.
4. Deadline **BE xoá hẳn** endpoint legacy: `2026-12-01`.

### Quan sát được trong prod logs

Cả 2 endpoint `GET` legacy đều ghi log mức `warn` mỗi lần được gọi:

```json
{"ts":"...","level":"warn","ctx":"[legacy] GET /api/admin/trees called — migrate to /admin/tree-products","userId":"..."}
```

→ Trước ngày xoá hẳn, kiểm tra Render logs để biết còn client nào gọi endpoint cũ.

---

## 1. Tổng quan flow

  ```
  Admin form                          Customer browse
  ─────────────                       ───────────────
  GET  /api/admin/tree-products       GET  /api/catalog/tree-products
    → list (product + codes + variants) → render grid
  POST /api/admin/tree-products
    → trả { treeProduct } (chỉ fields product)
  POST /api/admin/tree-products/:pid/codes
    → trả { treeCode }
  POST /api/admin/tree-codes/:cid/variants
    → trả { variant }
  PATCH ...                           POST /api/catalog/quote { config }
    → update từng phần                 → recompute price
                                      POST /api/cart/items { config: { variantId, ... } }
                                      POST /api/orders
  ```

  ⚠️ **Mấu chốt 1**: Sau khi `POST /api/admin/tree-products` bạn chỉ nhận về `{ treeProduct: {_id, name, slug, ...} }` — **KHÔNG có codes/variants**. Để render admin form cần ngay `GET /api/admin/tree-products` (trả grouped 3-tier) hoặc dùng kết quả POST + gọi thêm `POST /api/admin/tree-products/:pid/codes` rồi `POST /api/admin/tree-codes/:cid/variants`.

  ⚠️ **Mấu chốt 2**: Customer `GET /api/catalog/tree-products` trả về **mảng** `{ treeProducts: [...] }` (note: **s** ở cuối).

  ⚠️ **Mấu chốt 3**: Khi add cart / order, payload config dùng **`variantId`** (KHÔNG phải `treeId`).

  ---

  ## 2. TypeScript types (copy-paste)

  ```ts
  // ── Customer browse ─────────────────────────────────────────
  export interface ITreeProductBrowse {
    product: ITreeProduct;
    codes: ITreeCodeWithVariants[];
  }

  export interface ITreeProduct {
    _id: string;
    name: string;
    slug: string;
    category: string;
    density: string;
    description: string;
    coverImage: string;
    images: string[];
    isActive: boolean;
    sortOrder: number;
  }

  export interface ITreeCodeWithVariants extends ITreeCode {
    variants: ITreeVariant[];
  }

  export interface ITreeCode {
    _id: string;
    productId: string;
    code: string;        // "TREE-GREEN"
    name: string;        // "Xanh truyền thống"
    description: string;
    image: string;
    material: string;    // "PVC cao cấp"
    isActive: boolean;
    sortOrder: number;
  }

  export interface ITreeVariant {
    _id: string;          // ← đây là variantId cần truyền vào cart
    size: string;         // "S" | "M" | "L" | "XL" | tuỳ-admin
    sku: string;          // "TREE-GREEN-M"
    name: string;
    heightCmMin: number;
    heightCmMax: number;
    diameterCm: number;
    description: string;
    bareImage: string;
    images: string[];
    price: number;        // VND
    stockQuantity: number;
    isActive: boolean;
    sortOrder: number;
  }

  // ── Admin form ──────────────────────────────────────────────
  // GET /api/admin/tree-products → response giống customer browse
  //   { treeProducts: ITreeProductBrowse[] }

  // POST /api/admin/tree-products (create parent)
  // Body:
  //   { name, slug?, category, density, description, coverImage, images, isActive, sortOrder }
  // Response 201:
  //   { treeProduct: ITreeProduct }   ← CHỈ CÓ product, KHÔNG có codes/variants

  // PATCH /api/admin/tree-products/:productId
  // Body: same as POST
  // Response 200: { treeProduct: ITreeProduct }

  // DELETE /api/admin/tree-products/:productId
  // Response 200: { success: true, productId: string }

  // POST /api/admin/tree-products/:productId/codes
  // Body: { code, name, description, image, material, isActive, sortOrder }
  // Response 201: { treeCode: ITreeCode }   ← CHỈ CÓ code, KHÔNG có variants

  // PATCH /api/admin/tree-codes/:codeId
  // Body: same as POST
  // Response 200: { treeCode: ITreeCode }

  // DELETE /api/admin/tree-codes/:codeId
  // Response 200: { success: true, codeId: string }

  // POST /api/admin/tree-codes/:codeId/variants
  // Body: { size, sku, heightCmMin, heightCmMax, diameterCm, description,
  //         bareImage, images, price, stockQuantity, isActive, sortOrder }
  // Response 201: { variant: ITreeVariant }

  // PATCH /api/admin/tree-variants/:variantId
  // Body: same as POST (all optional)
  // Response 200: { variant: ITreeVariant }

  // DELETE /api/admin/tree-variants/:variantId
  // Response 200: { success: true, variantId: string }

  // PATCH /api/admin/tree-variants/bulk
  // Body: { field: 'price'|'stockQuantity'|'isActive', value, productId?, codeId? }
  // Response 200: { matched: number, modified: number }
  ```

  ---

  ## 3. Ví dụ response thực tế (copy-paste JSON)

  ### 3.1 Customer browse

  **Request**
  ```
  GET /api/catalog/tree-products
  ```

  **Response 200**
  ```json
  {
    "treeProducts": [
      {
        "product": {
          "_id": "65f1a2b3c4d5e6f7g8h9i0j1",
          "name": "Cây thông Noel trang trí",
          "slug": "cay-thong-noel-trang-tri",
          "category": "Cây thông Noel",
          "density": "Dày (380-820 cành)",
          "description": "Cây thông Noel chất lượng cao, nhiều kích thước.",
          "coverImage": "/images/trees/cover.jpg",
          "images": ["/images/trees/cover.jpg"],
          "isActive": true,
          "sortOrder": 1
        },
        "codes": [
          {
            "_id": "65f1a2b3c4d5e6f7g8h9i0j2",
            "productId": "65f1a2b3c4d5e6f7g8h9i0j1",
            "code": "TREE-GREEN",
            "name": "Xanh truyền thống",
            "description": "Cây thông màu xanh rêu cổ điển",
            "image": "/images/trees/code-green.jpg",
            "material": "PVC cao cấp",
            "isActive": true,
            "sortOrder": 1,
            "variants": [
              {
                "_id": "65f1a2b3c4d5e6f7g8h9i0j3",
                "size": "S",
                "sku": "TREE-GREEN-S",
                "name": "Cây thông Noel 1m2 — Xanh truyền thống — S",
                "heightCmMin": 110,
                "heightCmMax": 130,
                "diameterCm": 70,
                "description": "...",
                "bareImage": "/images/trees/green-s-bare.png",
                "images": [],
                "price": 169000,
                "stockQuantity": 100,
                "isActive": true,
                "sortOrder": 0
              },
              {
                "_id": "65f1a2b3c4d5e6f7g8h9i0j4",
                "size": "M",
                "sku": "TREE-GREEN-M",
                "name": "Cây thông Noel 1m5 — Xanh truyền thống — M",
                "heightCmMin": 140,
                "heightCmMax": 160,
                "diameterCm": 100,
                "bareImage": "/images/trees/green-m-bare.png",
                "images": [],
                "price": 249000,
                "stockQuantity": 80,
                "isActive": true,
                "sortOrder": 1
              }
            ]
          },
          {
            "_id": "65f1a2b3c4d5e6f7g8h9i0j5",
            "productId": "65f1a2b3c4d5e6f7g8h9i0j1",
            "code": "TREE-SNOW",
            "name": "Phủ tuyết",
            "description": "Cây phủ bông tuyết trắng",
            "image": "/images/trees/code-snow.jpg",
            "material": "PVC + bông tuyết",
            "isActive": true,
            "sortOrder": 2,
            "variants": [ /* ... */ ]
          }
        ]
      }
    ]
  }
  ```

  ### 3.2 Get variants for a code

  **Request**
  ```
  GET /api/catalog/tree-products/PRODUCT_ID/codes/CODE_ID/variants
  ```

  **Response 200**
  ```json
  {
    "code": {
      "_id": "65f1a2b3c4d5e6f7g8h9i0j2",
      "code": "TREE-GREEN",
      "name": "Xanh truyền thống",
      "description": "Cây thông màu xanh rêu cổ điển",
      "image": "/images/trees/code-green.jpg",
      "material": "PVC cao cấp"
    },
    "variants": [
      {
        "_id": "65f1a2b3c4d5e6f7g8h9i0j3",
        "size": "S",
        "sku": "TREE-GREEN-S",
        "heightCmMin": 110,
        "heightCmMax": 130,
        "diameterCm": 70,
        "bareImage": "/images/trees/green-s-bare.png",
        "price": 169000,
        "stockQuantity": 100
      }
    ]
  }
  ```

  ### 3.3 Admin — create product

  **Request**
  ```http
  POST /api/admin/tree-products
  Content-Type: application/json
  Authorization: Bearer <admin-jwt>

  {
    "name": "Cây thông Noel trang trí",
    "category": "Cây thông Noel",
    "density": "Dày",
    "description": "...",
    "coverImage": "/images/trees/cover.jpg",
    "images": ["/images/trees/cover.jpg"]
  }
  ```

  **Response 201**
  ```json
  {
    "treeProduct": {
      "_id": "65f1a2b3c4d5e6f7g8h9i0j1",
      "name": "Cây thông Noel trang trí",
      "slug": "cay-thong-noel-trang-tri",
      "category": "Cây thông Noel",
      "density": "Dày",
      "description": "...",
      "coverImage": "/images/trees/cover.jpg",
      "images": ["/images/trees/cover.jpg"],
      "isActive": true,
      "sortOrder": 0,
      "createdAt": "2026-10-09T12:00:00.000Z",
      "updatedAt": "2026-10-09T12:00:00.000Z"
    }
  }
  ```

  ⚠️ **Response này KHÔNG có `codes` và `variants`**. Để lấy danh sách grouped, gọi `GET /api/admin/tree-products` ngay sau đó.

  ### 3.4 Admin — add code to product

  **Request**
  ```http
  POST /api/admin/tree-products/65f1a2b3c4d5e6f7g8h9i0j1/codes
  Content-Type: application/json
  Authorization: Bearer <admin-jwt>

  {
    "code": "TREE-GREEN",
    "name": "Xanh truyền thống",
    "description": "Cây xanh rêu",
    "image": "/images/trees/code-green.jpg",
    "material": "PVC cao cấp",
    "sortOrder": 1
  }
  ```

  **Response 201**
  ```json
  {
    "treeCode": {
      "_id": "65f1a2b3c4d5e6f7g8h9i0j2",
      "productId": "65f1a2b3c4d5e6f7g8h9i0j1",
      "code": "TREE-GREEN",
      "name": "Xanh truyền thống",
      "description": "Cây xanh rêu",
      "image": "/images/trees/code-green.jpg",
      "material": "PVC cao cấp",
      "isActive": true,
      "sortOrder": 1,
      "createdAt": "2026-10-09T12:00:00.000Z",
      "updatedAt": "2026-10-09T12:00:00.000Z"
    }
  }
  ```

  ### 3.5 Admin — add size variant

  **Request**
  ```http
  POST /api/admin/tree-codes/65f1a2b3c4d5e6f7g8h9i0j2/variants
  Content-Type: application/json
  Authorization: Bearer <admin-jwt>

  {
    "size": "M",
    "sku": "TREE-GREEN-M",
    "heightCmMin": 140,
    "heightCmMax": 160,
    "diameterCm": 100,
    "bareImage": "/images/trees/green-m-bare.png",
    "price": 249000,
    "stockQuantity": 80
  }
  ```

  **Response 201**
  ```json
  {
    "variant": {
      "_id": "65f1a2b3c4d5e6f7g8h9i0j4",
      "productId": "65f1a2b3c4d5e6f7g8h9i0j1",
      "codeId": "65f1a2b3c4d5e6f7g8h9i0j2",
      "size": "M",
      "sku": "TREE-GREEN-M",
      "name": "Cây thông Noel trang trí — Xanh truyền thống — M",
      "heightCmMin": 140,
      "heightCmMax": 160,
      "diameterCm": 100,
      "description": "...",
      "bareImage": "/images/trees/green-m-bare.png",
      "images": [],
      "price": 249000,
      "stockQuantity": 80,
      "isActive": true,
      "sortOrder": 1,
      "createdAt": "2026-10-09T12:00:00.000Z",
      "updatedAt": "2026-10-09T12:00:00.000Z"
    }
  }
  ```

  ### 3.6 Admin — list grouped

  **Request**
  ```
  GET /api/admin/tree-products
  Authorization: Bearer <admin-jwt>
  ```

  **Response 200**
  ```json
  {
    "treeProducts": [
      {
        "product": { "_id": "...", "name": "...", ... },
        "codes": [
          {
            "_id": "...",
            "code": "TREE-GREEN",
            "name": "Xanh truyền thống",
            ...,
            "variants": [
              { "_id": "...", "size": "S", "sku": "TREE-GREEN-S", "price": 169000, "stockQuantity": 100, ... }
            ]
          }
        ]
      }
    ]
  }
  ```

  ### 3.7 Cart add (customer)

  **Request**
  ```http
  POST /api/cart/items
  Content-Type: application/json
  Authorization: Bearer <user-jwt>

  {
    "config": {
      "variantId": "65f1a2b3c4d5e6f7g8h9i0j4",   // ← từ variant._id ở trên
      "accessories": [
        { "accessoryId": "ACC_ID", "quantity": 12 }
      ],
      "deliveryOption": "READY_TO_DISPLAY"
    },
    "quantity": 1
  }
  ```

  > ℹ️ **Lưu ý**: Giỏ hàng (`CartItem`) không yêu cầu trường `styleId`. FE có thể thêm trực tiếp cây và phụ kiện vào giỏ hàng mà không cần chọn Style.

  **Response 201** (cart item với pricing snapshot)
  ```json
  {
    "item": {
      "_id": "...",
      "cartId": "...",
      "designId": null,
      "quantity": 1,
      "priceSnapshot": 554996,
      "currentUnitTotal": 554996,
      "priceChanged": false,
      "checked": false,
      "config": {
        "variantId": "65f1a2b3c4d5e6f7g8h9i0j4",
        "accessories": [ ... ],
        "deliveryOption": "READY_TO_DISPLAY"
      }
    }
  }
  ```

  ### 3.8 Errors phổ biến

  ```json
  // 400 — thiếu field
  { "error": { "code": "MISSING_FIELD", "message": "Thiếu size hoặc sku" } }

  // 404 — không tìm thấy
  { "error": { "code": "TREE_NOT_FOUND", "message": "Không tìm thấy mã cây" } }

  // 409 — trùng
  { "error": { "code": "ACCESSORY_DUPLICATED", "message": "SKU đã tồn tại hoặc (mã, size) đã tồn tại" } }

  // 409 — hết hàng
  { "error": { "code": "OUT_OF_STOCK", "message": "Một hoặc nhiều món đã hết hàng trong lúc đặt" } }
  ```

  ---

  ## 4. Mapping cũ → mới (giúp FE refactor)

  | Cũ (2-tier, sai) | Mới (3-tier, đúng) |
  | :--- | :--- |
  | `Tree.colors: ["Mây Xanh", "Tuyết Bạc"]` | Tách thành `TreeCode` records, mỗi code là 1 phân loại |
  | `Tree.color: "Mây Xanh"` | `Tree.codeId` → resolve sang `TreeCode` để lấy `name`, `image`, `material` |
  | `Tree.treeId` trong DesignConfig | `DesignConfig.variantId` (chính là `Tree._id` của variant) |
  | `Tree.stock` | `Tree.stockQuantity` (cây dùng `stockQuantity`, phụ kiện vẫn `stock`) |
  | `OrderItem.tree: {...}` | `OrderItem.variant: { _id, productId, codeId, size, sku, ... }` |
  | `POST /api/admin/tree-products` body có `colors[]` + `variants[]` | 3 bước: `POST /tree-products` → `POST /tree-products/:id/codes` → `POST /tree-codes/:id/variants` |
  | Response `{treeProduct: {colors, variants: [...]}}` | Response `{treeProduct: {name, slug, ...}}` rồi gọi `GET /tree-products` để lấy grouped |

  ---

  ## 5. Lỗi FE hay mắc (FAQ)

  ❌ **Sai**: `POST /api/admin/tree-products` với body `{name, colors: [...], variants: [...]}` 1 phát.
  ✅ **Đúng**: 3 lần POST riêng (xem section 1).

  ❌ **Sai**: Gọi `POST /api/cart/items` với `{treeId: "..."}`.
  ✅ **Đúng**: Dùng `variantId: "..."` (lấy từ `variant._id` khi customer chọn size).

  ❌ **Sai**: Expect `Tree.material` / `Tree.density` (đã bỏ).
  ✅ **Đúng**: Material ở `TreeCode.material`, density ở `TreeProduct.density`.

  ❌ **Sai**: Render admin form từ response của `POST /api/admin/tree-products` (chỉ có product, không có codes/variants).
  ✅ **Đúng**: Gọi `GET /api/admin/tree-products` để lấy grouped 3-tier.

  ❌ **Sai**: Type `Tree.stock`.
  ✅ **Đúng**: `Tree.stockQuantity` (cây). Phụ kiện vẫn `Accessory.stock`.

  ---

  ## 6. Code mẫu (React + fetch) — copy-paste

  ### 6.1 Types

  ```ts
  // src/types/tree.ts
  export interface ITreeProduct {
    _id: string;
    name: string;
    slug: string;
    category: string;
    density: string;
    description: string;
    coverImage: string;
    images: string[];
    isActive: boolean;
    sortOrder: number;
  }

  export interface ITreeCode {
    _id: string;
    productId: string;
    code: string;
    name: string;
    description: string;
    image: string;
    material: string;
    isActive: boolean;
    sortOrder: number;
  }

  export interface ITreeVariant {
    _id: string;
    productId: string;
    codeId: string;
    size: string;
    sku: string;
    name: string;
    heightCmMin: number;
    heightCmMax: number;
    diameterCm: number;
    description: string;
    bareImage: string;
    images: string[];
    price: number;
    stockQuantity: number;
    isActive: boolean;
    sortOrder: number;
  }

  export interface ITreeProductBrowse {
    product: ITreeProduct;
    codes: (ITreeCode & { variants: ITreeVariant[] })[];
  }
  ```

  ### 6.2 API client

  ```ts
  // src/api/treeApi.ts
  import type { ITreeProduct, ITreeCode, ITreeVariant, ITreeProductBrowse } from "../types/tree";

  const BASE = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

  async function authed<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = localStorage.getItem("adminToken"); // hoặc từ auth context
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${res.status}`);
    }
    return res.json();
  }

  // ── Public ───────────────────────────────────────────────────
  export const getTreeProducts = () =>
    fetch(`${BASE}/catalog/tree-products`).then(r => r.json() as Promise<{ treeProducts: ITreeProductBrowse[] }>);

  export const getVariantsForCode = (productId: string, codeId: string) =>
    fetch(`${BASE}/catalog/tree-products/${productId}/codes/${codeId}/variants`)
      .then(r => r.json() as Promise<{ code: ITreeCode; variants: ITreeVariant[] }>);

  // ── Admin ────────────────────────────────────────────────────
  export const adminListTreeProducts = () =>
    authed<{ treeProducts: ITreeProductBrowse[] }>("/admin/tree-products");

  export const adminCreateProduct = (body: Partial<ITreeProduct>) =>
    authed<{ treeProduct: ITreeProduct }>("/admin/tree-products", {
      method: "POST",
      body: JSON.stringify(body),
    });

  export const adminUpdateProduct = (productId: string, body: Partial<ITreeProduct>) =>
    authed<{ treeProduct: ITreeProduct }>(`/admin/tree-products/${productId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

  export const adminDeleteProduct = (productId: string) =>
    authed<{ success: boolean; productId: string }>(`/admin/tree-products/${productId}`, {
      method: "DELETE",
    });

  export const adminCreateCode = (productId: string, body: Partial<ITreeCode>) =>
    authed<{ treeCode: ITreeCode }>(`/admin/tree-products/${productId}/codes`, {
      method: "POST",
      body: JSON.stringify(body),
    });

  export const adminUpdateCode = (codeId: string, body: Partial<ITreeCode>) =>
    authed<{ treeCode: ITreeCode }>(`/admin/tree-codes/${codeId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

  export const adminDeleteCode = (codeId: string) =>
    authed<{ success: boolean; codeId: string }>(`/admin/tree-codes/${codeId}`, {
      method: "DELETE",
    });

  export const adminCreateVariant = (codeId: string, body: Partial<ITreeVariant>) =>
    authed<{ variant: ITreeVariant }>(`/admin/tree-codes/${codeId}/variants`, {
      method: "POST",
      body: JSON.stringify(body),
    });

  export const adminUpdateVariant = (variantId: string, body: Partial<ITreeVariant>) =>
    authed<{ variant: ITreeVariant }>(`/admin/tree-variants/${variantId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

  export const adminDeleteVariant = (variantId: string) =>
    authed<{ success: boolean; variantId: string }>(`/admin/tree-variants/${variantId}`, {
      method: "DELETE",
    });

  export const adminBulkUpdateVariants = (
    field: "price" | "stockQuantity" | "isActive",
    value: number | boolean,
    filter: { productId?: string; codeId?: string } = {}
  ) =>
    authed<{ matched: number; modified: number }>("/admin/tree-variants/bulk", {
      method: "PATCH",
      body: JSON.stringify({ field, value, ...filter }),
    });
  ```

  ### 6.3 React component — admin form

  ```tsx
  // src/pages/admin/TreeCatalogPage.tsx
  import { useEffect, useState } from "react";
  import { adminListTreeProducts, adminCreateCode, adminCreateVariant } from "../../api/treeApi";
  import type { ITreeProductBrowse } from "../../types/tree";

  export function TreeCatalogPage() {
    const [data, setData] = useState<ITreeProductBrowse[]>([]);
    const [loading, setLoading] = useState(true);

    async function load() {
      setLoading(true);
      const res = await adminListTreeProducts();
      setData(res.treeProducts);
      setLoading(false);
    }

    useEffect(() => { load(); }, []);

    if (loading) return <div>Loading…</div>;

    return (
      <div>
        {data.map(({ product, codes }) => (
          <section key={product._id} className="border p-4 mb-4">
            <h2 className="text-xl font-bold">{product.name}</h2>
            <p className="text-sm text-gray-500">{product.category}</p>

            {codes.map(code => (
              <div key={code._id} className="ml-4 mt-3">
                <h3 className="font-semibold">
                  {code.name} <span className="text-xs">({code.code})</span>
                </h3>
                <p className="text-xs">{code.material}</p>

                <table className="mt-2 w-full text-sm">
                  <thead>
                    <tr>
                      <th>Size</th><th>SKU</th><th>Giá</th><th>Kho</th><th>Ảnh</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {code.variants.map(v => (
                      <tr key={v._id}>
                        <td>{v.size}</td>
                        <td className="font-mono">{v.sku}</td>
                        <td>{v.price.toLocaleString()}đ</td>
                        <td>{v.stockQuantity}</td>
                        <td>{v.bareImage && <img src={v.bareImage} className="h-10" />}</td>
                        <td><button>Sửa</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <button
                  className="text-blue-600 text-sm mt-2"
                  onClick={async () => {
                    const size = prompt("Size mới?") || "";
                    if (!size) return;
                    const sku = `${code.code}-${size}`.toUpperCase();
                    await adminCreateVariant(code._id, {
                      size, sku, price: 0, stockQuantity: 0,
                      heightCmMin: 0, heightCmMax: 0, diameterCm: 0,
                    });
                    load();
                  }}
                >
                  + Thêm size
                </button>
              </div>
            ))}

            <button
              className="ml-4 text-blue-600 text-sm"
              onClick={async () => {
                const name = prompt("Tên mã cây?") || "";
                const code = prompt("Mã nội bộ? (vd: TREE-GREEN)") || "";
                if (!name || !code) return;
                await adminCreateCode(product._id, { name, code });
                load();
              }}
            >
              + Thêm mã cây
            </button>
          </section>
        ))}
      </div>
    );
  }
  ```

  ### 6.4 React component — customer browse + add to cart

  ```tsx
  // src/pages/TreeBrowsePage.tsx
  import { useEffect, useState } from "react";
  import { getTreeProducts } from "../api/treeApi";
  import { addCartItem } from "../api/cartApi";
  import type { ITreeProductBrowse, ITreeVariant } from "../types/tree";

  export function TreeBrowsePage() {
    const [data, setData] = useState<ITreeProductBrowse[]>([]);
    const [selectedCode, setSelectedCode] = useState<string | null>(null);
    const [selectedVariant, setSelectedVariant] = useState<ITreeVariant | null>(null);

    useEffect(() => {
      getTreeProducts().then(res => setData(res.treeProducts));
    }, []);

    return (
      <div>
        {data.map(({ product, codes }) => (
          <article key={product._id} className="border p-4 mb-4">
            <h2>{product.name}</h2>
            <img src={product.coverImage} className="h-32" />

            {/* Mã cây (Phân loại 1) */}
            <div className="flex gap-2 mt-2">
              {codes.map(code => (
                <button
                  key={code._id}
                  onClick={() => setSelectedCode(code._id)}
                  className={selectedCode === code._id ? "border-2 border-blue-500" : ""}
                >
                  {code.name}
                </button>
              ))}
            </div>

            {/* Size grid cho mã đang chọn */}
            {selectedCode && (() => {
              const code = codes.find(c => c._id === selectedCode);
              if (!code) return null;
              return (
                <table className="mt-3">
                  <tbody>
                    {code.variants.map(v => (
                      <tr
                        key={v._id}
                        onClick={() => setSelectedVariant(v)}
                        className={selectedVariant?._id === v._id ? "bg-blue-100" : ""}
                      >
                        <td>{v.size}</td>
                        <td>{v.price.toLocaleString()}đ</td>
                        <td>Còn {v.stockQuantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}

            {selectedVariant && (
              <button
                className="mt-2 px-4 py-2 bg-green-600 text-white"
                onClick={async () => {
                  await addCartItem({
                    config: {
                      variantId: selectedVariant._id,   // ← QUAN TRỌNG
                      accessories: [],
                      deliveryOption: "READY_TO_DISPLAY",
                    },
                    quantity: 1,
                  });
                  alert("Đã thêm vào giỏ!");
                }}
              >
                Thêm {selectedVariant.name} vào giỏ — {selectedVariant.price.toLocaleString()}đ
              </button>
            )}
          </article>
        ))}
      </div>
    );
  }
  ```

  ---

  ## 7. Test nhanh bằng curl (FE dev test)

  ```bash
  # Customer xem catalog
  curl http://localhost:4000/api/catalog/tree-products | jq

  # Customer xem variants cho 1 code
  curl http://localhost:4000/api/catalog/tree-products/<P>/codes/<C>/variants | jq

  # Admin: list grouped
  curl -H "Authorization: Bearer $ADMIN_TOKEN" \
      http://localhost:4000/api/admin/tree-products | jq

  # Admin: tạo product
  curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
      -d '{"name":"Cây test"}' \
      http://localhost:4000/api/admin/tree-products | jq

  # Admin: thêm code
  curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
      -d '{"code":"TREE-TEST","name":"Test"}' \
      http://localhost:4000/api/admin/tree-products/<PID>/codes | jq

  # Admin: thêm variant
  curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
      -d '{"size":"M","sku":"TREE-TEST-M","price":199000,"stockQuantity":50}' \
      http://localhost:4000/api/admin/tree-codes/<CID>/variants | jq

  # Cart add (dùng variant._id ở trên, không cần styleId)
  curl -X POST -H "Authorization: Bearer $USER_TOKEN" -H "Content-Type: application/json" \
      -d "{\"config\":{\"variantId\":\"<VID>\",\"accessories\":[],\"deliveryOption\":\"READY_TO_DISPLAY\"},\"quantity\":1}" \
      http://localhost:4000/api/cart/items | jq
  ```

  ---

  ## 8. Media / File Uploads (`POST /api/uploads`)

  Hỗ trợ tải ảnh và video lên hệ sinh thái BuildYourChristmas. Mặc định trên Production lưu vĩnh viễn trên **Cloudinary**, môi trường dev cục bộ có cơ chế fallback lưu ổ đĩa `/uploads/`.

  - **Endpoint**: `POST /api/uploads`
  - **Auth**: Tùy chọn (`Bearer <token>` hoặc Public)
  - **Giới hạn dung lượng**:
    - Ảnh (`.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`): Tối đa **5MB**
    - Video (`.mp4`): Tối đa **30MB**

  ### 8.1 Gửi dạng `application/json` (Base64 Data URL)
  **Request Header**: `Content-Type: application/json`  
  **Request Body**:
  ```json
  {
    "dataUrl": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
  }
  ```
  *(Các trường `file` hoặc `image` cũng được chấp nhận tương đương `dataUrl`)*

  ### 8.2 Gửi dạng `multipart/form-data` (Binary File Upload)
  **Request Header**: `Content-Type: multipart/form-data`  
  **Form Field**: `file` (hoặc tên bất kỳ chứa file đính kèm)

  ### 8.3 Response Thành Công (`201 Created`)
  ```json
  {
    "url": "https://res.cloudinary.com/cloud_name/image/upload/v1234567890/buildyourchristmas/uuid.png",
    "path": "https://res.cloudinary.com/cloud_name/image/upload/v1234567890/buildyourchristmas/uuid.png",
    "publicId": "buildyourchristmas/uuid",
    "format": "png",
    "size": 102400
  }
  ```
  *(Khi fallback local, `path` trả về `/uploads/img_xxx.png` và `url` trỏ về host backend)*

  ### 8.4 Mã Lỗi Trả Về (Error Contract)
  - `400 MISSING_FIELD`: Không có file hoặc chuỗi dataUrl rỗng.
  - `400 FILE_TOO_LARGE`: Dung lượng vượt quá 5MB (ảnh) hoặc 30MB (video).
  - `415 UNSUPPORTED_MEDIA_TYPE`: Đuôi file hoặc MIME type không nằm trong danh sách cho phép.
  - `500 INTERNAL_ERROR`: Lỗi máy chủ hoặc Cloudinary chưa cấu hình khi chạy ở chế độ `REQUIRE_CLOUDINARY=true`.

  ---

  ## 9. Banners (`/api/banners` & `/api/admin/banners`)

  Hỗ trợ quản lý và hiển thị banner chiến dịch, carousel hero trang chủ.

  ### 9.1 Lấy danh sách banner hiển thị (Public)
  - **Endpoint**: `GET /api/banners`
  - **Query param (tùy chọn)**: `?position=home_hero` (ví dụ: `home_hero`, `popup`...)
  - **Auth**: Public
  - **Response (200 OK)**:
  ```json
  {
    "banners": [
      {
        "_id": "6708a1b2c3d4e5f6a7b80010",
        "title": "Mừng Giáng Sinh Rộn Ràng 2026",
        "imageUrl": "https://res.cloudinary.com/.../banner1.jpg",
        "linkUrl": "/products",
        "position": "home_hero",
        "isActive": true,
        "sortOrder": 1,
        "createdAt": "2026-10-11T10:00:00.000Z",
        "updatedAt": "2026-10-11T10:00:00.000Z"
      }
    ]
  }
  ```

  ### 9.2 Quản lý banner (Admin)
  - **Auth**: `Bearer <admin_token>`

  #### 1. Lấy tất cả banner
  - `GET /api/admin/banners` → `{ "banners": [...] }`

  #### 2. Thêm banner mới
  - `POST /api/admin/banners`
  - **Body**:
  ```json
  {
    "title": "Sale Đêm Giáng Sinh",
    "imageUrl": "https://res.cloudinary.com/.../banner.jpg",
    "linkUrl": "/products",
    "position": "home_hero",
    "isActive": true,
    "sortOrder": 1
  }
  ```
  - **Response (201 Created)**: `{ "banner": { ... } }`

  #### 3. Chỉnh sửa banner
  - `PATCH /api/admin/banners/:id`
  - **Body** (các trường tùy chọn): `{ "title": "...", "imageUrl": "...", "isActive": false, "sortOrder": 2 }`
  - **Response (200 OK)**: `{ "banner": { ... } }`

  #### 4. Xóa banner
  - `DELETE /api/admin/banners/:id`
  - **Response (200 OK)**: `{ "success": true, "bannerId": ":id" }`

---
## 🌟 PHẦN 10B: MEDIA (VIDEO NỀN HERO, STORY FEED, NHẠC NỀN)

> **Ngày thêm**: 2026-10-30 · **Nhánh BE**: `christmas`
> Dùng cho tính năng "gia tăng cảm xúc": video nền hero, story dọc kiểu Reels, nhạc nền toàn app.

### 0. Model `MediaAsset`

| Field | Type | Ghi chú |
|---|---|---|
| `_id` | string | Mongo ObjectId |
| `kind` | `VIDEO` \| `AUDIO` \| `IMAGE` | Loại media |
| `placement` | `HERO_BACKGROUND` \| `STORY_FEED` \| `MUSIC_TRACK` \| `PROMO` | Vị trí sử dụng |
| `title` | string | Bắt buộc, dùng làm alt/caption |
| `caption` | string | Mô tả ngắn hiển thị dưới story |
| `url` | string | **Bắt buộc** — URL Cloudinary (https) |
| `publicId` | string | Cloudinary publicId để xóa/thay file sau này |
| `posterUrl` | string | Ảnh poster/thumbnail cho video (BE tự sinh từ Cloudinary) |
| `format` | string | `mp4`, `mp3`, `m4a`... |
| `size` | number | Byte |
| `duration` | number | Giây |
| `ctaLabel` | string | Nhãn nút CTA (vd: "Mua ngay") |
| `ctaLink` | string | URL nội bộ FE (vd: `/tree/xxx`) hoặc ngoài |
| `linkType` | `PRODUCT` \| `CATEGORY` \| `NONE` | Đích đến khi bấm CTA |
| `linkId` | string | Id đối tượng đích (productId / categoryId) |
| `musicArtist` | string | Nghệ sĩ/nguồn nhạc (hiển thị cho FE) |
| `isLoop` | boolean | Nhạc có lặp hay không (mặc định `true`) |
| `volume` | number | 0–100 (mặc định 40) |
| `isActive` | boolean | Bật/tắt hiển thị (mặc định `true`) |
| `sortOrder` | number | Thứ tự hiển thị (nhỏ trước) |

### 1. Lấy danh sách media (Public)
- **URL**: `GET /api/media`
- **Query Params**:
  - `placement` (string, tùy chọn): `HERO_BACKGROUND` \| `STORY_FEED` \| `MUSIC_TRACK` \| `PROMO`
  - `limit` (number, default: 20, max: 50)
- **Auth**: Public (không cần token)
- **Ghi chú**: Chỉ trả asset có `isActive: true`. Placement không hợp lệ → trả `{ "assets": [] }` (không lỗi 500).
- **Response (200 OK)**:
```json
{
  "assets": [
    {
      "_id": "670d1e2f3a4b5c6d7e8f9012",
      "kind": "VIDEO",
      "placement": "STORY_FEED",
      "title": "Cây thông 2m trong phòng khách",
      "caption": "Không gian ấm áp mùa Giáng Sinh",
      "url": "https://res.cloudinary.com/xxx/video/upload/v1/buildyourchristmas/story1.mp4",
      "publicId": "buildyourchristmas/story1",
      "posterUrl": "https://res.cloudinary.com/xxx/video/upload/so_0/buildyourchristmas/story1.jpg",
      "format": "mp4",
      "size": 8421376,
      "duration": 12,
      "ctaLabel": "Mua ngay",
      "ctaLink": "/tree/670a...",
      "linkType": "PRODUCT",
      "linkId": "670a...",
      "musicArtist": "",
      "isLoop": true,
      "volume": 40,
      "isActive": true,
      "sortOrder": 0
    }
  ]
}
```

### 2. Lấy media hero (Public)
- **URL**: `GET /api/media/hero`
- **Auth**: Public
- **Ghi chú**: Trả asset `HERO_BACKGROUND` active đầu tiên (sortOrder nhỏ nhất). Nếu không có → fallback sang `PROMO`. Nếu không có nữa → `{ "asset": null }`.
- **Response (200 OK)**: `{ "asset": { ...MediaAsset } | null }`

### 3. Lấy nhạc nền (Public)
- **URL**: `GET /api/media/background-music`
- **Auth**: Public
- **Ghi chú**: Trả asset `placement=MUSIC_TRACK` **và** `kind=AUDIO` active đầu tiên. Không có → `{ "asset": null }`.
- **Response (200 OK)**: `{ "asset": { ...MediaAsset } | null }`

### 4. Upload file media (dùng chung cho admin)
- **URL**: `POST /api/uploads`
- **Auth**: `optionalAuth` (không bắt buộc, nhưng nên gửi token admin)
- **Content-Type**: `multipart/form-data` (field: `file`) — **không** dùng base64 cho file lớn
- **Giới hạn**:
  - Ảnh: 5MB (png/jpg/jpeg/webp/svg)
  - Video: 30MB (mp4)
  - Audio: 15MB (mp3/mp4/m4a/aac/wav/ogg)
- **Response (201 Created)**:
```json
{
  "url": "https://res.cloudinary.com/xxx/video/upload/v1/buildyourchristmas/story1.mp4",
  "publicId": "buildyourchristmas/story1",
  "format": "mp4",
  "size": 8421376,
  "kind": "video",
  "duration": 12,
  "posterUrl": "https://res.cloudinary.com/xxx/video/upload/so_0s/c_limit,f_auto,q_auto,w_720/v1/buildyourchristmas/story1.jpg"
}
```
> 💡 **`posterUrl` được BE tự sinh** cho video (Cloudinary trích frame đầu tiên on-the-fly).
> FE/Mobile dùng làm `poster` của `<video>` / `thumbnail` của story bubble → không cần admin upload ảnh riêng.
- **Lỗi**:
  - `400 MISSING_FIELD` — thiếu file
  - `400 UNSUPPORTED_MEDIA_TYPE` — sai định dạng
  - `413 FILE_TOO_LARGE` — vượt giới hạn dung lượng

### 5. Admin CRUD MediaAsset
> Tất cả yêu cầu cần header `Authorization: Bearer <admin_token>`.

#### 5.1 Xem tất cả (kể cả đã tắt)
- `GET /api/admin/media` → `{ "assets": [...] }`

#### 5.2 Tạo media asset
- `POST /api/admin/media`
- **Body**:
```json
{
  "kind": "VIDEO",
  "placement": "STORY_FEED",
  "title": "Cây thông 2m trong phòng khách",
  "caption": "Không gian ấm áp mùa Giáng Sinh",
  "url": "https://res.cloudinary.com/xxx/.../story1.mp4",
  "publicId": "buildyourchristmas/story1",
  "posterUrl": "https://res.cloudinary.com/xxx/.../story1.jpg",
  "format": "mp4",
  "size": 8421376,
  "duration": 12,
  "ctaLabel": "Mua ngay",
  "ctaLink": "/tree/670a...",
  "linkType": "PRODUCT",
  "linkId": "670a...",
  "musicArtist": "",
  "isLoop": true,
  "volume": 40,
  "isActive": true,
  "sortOrder": 0
}
```
- `title` và `url` là **bắt buộc**. Các field còn lại có default.
- **Response (201 Created)**: `{ "asset": { ...MediaAsset } }`

#### 5.3 Chỉnh sửa
- `PATCH /api/admin/media/:id`
- **Body**: bất kỳ tập nào field ở trên (chỉ cập nhật field có mặt).
- **Response (200 OK)**: `{ "asset": { ...MediaAsset } }`
- **Lỗi**: `404 NOT_FOUND` nếu id không tồn tại.

#### 5.4 Xóa
- `DELETE /api/admin/media/:id`
- **Response (200 OK)**: `{ "success": true, "assetId": ":id" }`

---

## 🌟 PHẦN 11: ĐÁNH GIÁ SẢN PHẨM (PRODUCT REVIEWS)

### 1. Xem danh sách đánh giá của sản phẩm (Public)
- **URL**: `GET /api/products/:productId/reviews` (hoặc `GET /api/catalog/tree-products/:productId/reviews`)
- **Query Params**:
  - `page` (number, default: 1)
  - `limit` (number, default: 10, max: 50)
  - `rating` (1-5, lọc theo số sao)
  - `hasImages` (boolean, lọc đánh giá có ảnh)
- **Response (200 OK)**:
```json
{
  "reviews": [
    {
      "_id": "670c...",
      "productId": "670a...",
      "variant": {
        "_id": "670b...",
        "name": "Cây thông Noel — Xanh — M",
        "size": "M",
        "bareImage": "https://..."
      },
      "buyer": {
        "_id": "6701...",
        "name": "Nguyễn Văn A",
        "avatar": "https://..."
      },
      "orderId": "670d...",
      "rating": 5,
      "comment": "Cây rất đẹp, tán dày dặn và giao hàng nhanh!",
      "images": ["https://.../review1.jpg"],
      "adminReply": {
        "comment": "Cảm ơn bạn đã ủng hộ shop!",
        "repliedAt": "2026-10-15T03:00:00.000Z"
      },
      "createdAt": "2026-10-15T02:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 24,
    "totalPages": 3
  },
  "stats": {
    "averageRating": 4.9,
    "totalReviews": 24,
    "distribution": {
      "1": 0,
      "2": 0,
      "3": 1,
      "4": 2,
      "5": 21
    }
  }
}
```

---

### 2. Gửi đánh giá sản phẩm (Buyer đã mua hàng)
- **URL**: `POST /api/products/:productId/reviews` (hoặc `POST /api/reviews`)
- **Auth**: `Bearer <token>`
- **Điều kiện**:
  1. Đơn hàng phải thuộc về tài khoản đang đăng nhập.
  2. Đơn hàng ở trạng thái `DELIVERED` hoặc `COMPLETED`.
  3. Đơn hàng có chứa sản phẩm (`productId`).
  4. Mỗi sản phẩm trong một đơn hàng chỉ được đánh giá 1 lần.
- **Side effect**: Nếu đơn hàng đang ở trạng thái `DELIVERED`, backend sẽ tự động chuyển đơn sang `COMPLETED`.
- **Request Body**:
```json
{
  "orderId": "670d...",
  "rating": 5,
  "comment": "Cây rất đẹp và chất lượng!",
  "images": ["https://.../review1.jpg"]
}
```
- **Response (201 Created)**:
```json
{
  "review": {
    "_id": "670c...",
    "productId": "670a...",
    "buyerId": "6701...",
    "orderId": "670d...",
    "rating": 5,
    "comment": "Cây rất đẹp và chất lượng!",
    "images": ["https://.../review1.jpg"],
    "status": "APPROVED",
    "createdAt": "2026-10-15T03:00:00.000Z"
  }
}
```

---

### 3. Kiểm tra các món có thể đánh giá trong đơn hàng
- **URL**: `GET /api/orders/:orderId/reviewable-items` (hoặc `GET /api/reviews/order/:orderId`)
- **Auth**: `Bearer <token>`
- **Response (200 OK)**:
```json
{
  "orderId": "670d...",
  "orderCode": "BYC-12345678",
  "orderStatus": "DELIVERED",
  "isEligibleStatus": true,
  "items": [
    {
      "productId": "670a...",
      "designId": "670e...",
      "designName": "Cây Giáng Sinh Ấm Cúng",
      "previewImage": "https://...",
      "variantName": "Cây thông Noel — Xanh — M",
      "variantSize": "M",
      "canReview": true,
      "isReviewed": false,
      "review": null
    }
  ]
}
```

---

### 4. Xem lịch sử đánh giá của tôi
- **URL**: `GET /api/reviews/my`
- **Auth**: `Bearer <token>`
- **Response (200 OK)**:
```json
{
  "reviews": [
    {
      "_id": "670c...",
      "product": {
        "_id": "670a...",
        "name": "Cây thông Noel truyền thống",
        "coverImage": "https://...",
        "slug": "cay-thong-noel-truyen-thong"
      },
      "variant": {
        "_id": "670b...",
        "name": "Cây thông Noel — Xanh — M",
        "size": "M",
        "bareImage": "https://..."
      },
      "order": {
        "_id": "670d...",
        "orderCode": "BYC-12345678",
        "status": "COMPLETED"
      },
      "rating": 5,
      "comment": "Cây đẹp lắm ạ!",
      "images": [],
      "adminReply": null,
      "createdAt": "2026-10-15T03:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 }
}
```

---

### 5. Quản lý đánh giá (Dành cho Admin)
- **Auth**: `Bearer <admin_token>`

#### Lấy danh sách đánh giá
- `GET /api/admin/reviews?page=1&limit=20&status=APPROVED&rating=5&productId=...`

#### Phản hồi đánh giá của khách
- `POST /api/admin/reviews/:id/reply`
- **Body**: `{ "comment": "Dạ cảm ơn bạn nhiều ạ!" }`

#### Ẩn/Hiện đánh giá
- `PATCH /api/admin/reviews/:id/status`
- **Body**: `{ "status": "HIDDEN" }` hoặc `{ "status": "APPROVED" }`

#### Xóa đánh giá
- `DELETE /api/admin/reviews/:id`

---

## 💬 PHẦN 11: HỆ THỐNG CHAT V3 HỢP NHẤT (UNIFIED MODEL)

> 📘 **Tài liệu chi tiết đầy đủ**: `docs_BE write/FE_CHAT_INTEGRATION_GUIDE.md` và `backend/docs/CHAT_API.md`.

### 11.1 Kiến trúc & URL kết nối
- **Socket.IO Namespace**: `/chat` (BẮT BUỘC, ví dụ: `https://christmas-8ca4.onrender.com/chat`).
- **Cấu hình Socket Client**:
  ```typescript
  import { io } from "socket.io-client";
  const socket = io("https://christmas-8ca4.onrender.com/chat", {
    auth: {
      token: localStorage.getItem("token") || undefined,
      sessionId: localStorage.getItem("chat_session_id") || undefined,
    },
    transports: ["websocket", "polling"],
    tryAllTransports: true,
  });
  ```

### 11.2 Bảng tra cứu Socket Events

| Hướng | Tên Event | Payload | Mô tả |
| :--- | :--- | :--- | :--- |
| **C → S** | `chat:join` | `{ conversationId }` | Vào phòng chat để nhận tin realtime |
| **C → S** | `chat:send` | `{ conversationId, content, metadata? }` | Gửi tin nhắn mới |
| **C → S** | `chat:read` | `{ conversationId, lastMessageId? }` | Đánh dấu đã đọc tin nhắn |
| **C → S** | `chat:typing`| `{ conversationId }` | Báo đang gõ văn bản |
| **C → S** | `chat:leave`| `{ conversationId }` | Rời phòng chat |
| **S → C** | `chat:message`| `ChatMessageDto` | Nhận tin nhắn mới từ Bot/Admin/User |
| **S → C** | `chat:conversation` | `ChatConversationDto` | Cập nhật thông tin hội thoại |
| **S → C** | `chat:unread` | `{ total, byConversation }` | Cập nhật số tin nhắn chưa đọc |
| **S → C** | `chat:status` | `{ conversationId, status }` | Trạng thái chuyển đổi (vd: WAITING_ADMIN) |
| **S → C** | `chat:typing` | `{ conversationId, userId, userName }` | Đối phương đang gõ |
| **S → C** | `chat:error` | `{ code, message }` | Lỗi thao tác socket |

### 11.3 Tóm tắt REST Endpoints
- `POST /api/chat/conversations` (Optional Auth) — Tạo hoặc lấy hội thoại (`channel: "AI" | "SUPPORT"`).
- `GET /api/chat/conversations` (Require Auth) — Danh sách hội thoại của tôi.
- `GET /api/chat/conversations/:id/messages?before=&limit=` (Optional Auth) — Lấy lịch sử tin nhắn (Cursor pagination).
- `POST /api/chat/conversations/:id/messages` (Optional Auth) — Gửi tin qua REST (fallback khi socket mất mạng).
- `POST /api/chat/conversations/:id/read` (Optional Auth) — Đánh dấu đã đọc.
- `POST /api/chat/conversations/:id/escalate` (Optional Auth) — Yêu cầu gặp nhân viên hỗ trợ.
- `GET /api/chat/unread` (Require Auth) — Đếm tổng số tin chưa đọc.

---

## 🎨 PHẦN 12: PHỐI CẢNH PHÒNG TỰ GHÉP (CLIENT-SIDE COMPOSITING)

> 📘 **Tài liệu chi tiết & Code mẫu Canvas / React Native Skia**: `docs_BE write/FE_ROOM_DESIGN_COMPOSITE_GUIDE.md`.

### 12.1 Thay đổi luồng từ AI Render sang Ghép ảnh Client
- **Trước đây**: Gọi `POST /api/designs/:id/generate-image` và chờ server render 40s (hay bị timeout 504).
- **Hiện tại**:
  1. Client upload ảnh căn phòng: `POST /api/designs/upload-room` (nhận `roomImageUrl`).
  2. Tạo thiết kế: `POST /api/designs`.
  3. Client dùng Canvas (Web) hoặc Skia (Mobile) để cho khách hàng tự kéo thả, phóng to, xoay cây thông vào góc phòng.
  4. Client xuất ảnh đã ghép và upload trực tiếp lên Cloudinary: `POST /api/designs/:id/result`.
  5. Backend phản hồi `200 OK` đồng bộ với `status: "AI_COMPLETED"`. **Không cần polling kiểm tra trạng thái nữa**.

### 12.2 Chi tiết Endpoint `POST /api/designs/:id/result`
- **Auth**: `Bearer <token>` (Chủ sở hữu hoặc Admin).
- **Content-Type**: `multipart/form-data`
- **Fields**:
  - `compositeImage` *(bắt buộc)*: File ảnh kết quả (JPEG, PNG, WebP — tối đa 8 MB).
  - `clientPrompt` *(tùy chọn)*: Ghi chú vị trí hoặc mô tả phối cảnh của khách.
- **Response mẫu (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "designId": "6724b1029102...",
      "status": "AI_COMPLETED",
      "imageUrl": "https://res.cloudinary.com/byc/image/upload/v1/.../result_123.jpg",
      "imagePublicId": "buildyourchristmas/room-designs/results/result_123",
      "compositeSource": "CLIENT"
    }
  }
  ```

---

## 👤 PHẦN 13: XOÁ TÀI KHOẢN (ACCOUNT DELETION — GOOGLE PLAY COMPLIANCE)

> 📘 **Tài liệu bàn giao chi tiết**: `docs_BE write/BE_HANDOFF_ACCOUNT_DELETION.md`.
> **Mục tiêu**: Đáp ứng chính sách Google Play Data Safety và quyền riêng tư người dùng.

### 13.1 Đặc tả `DELETE /api/users/me`
- **Method**: `DELETE`
- **Path**: `/api/users/me`
- **Auth**: `Bearer <token>` (Token của chính user cần xoá)
- **Request Body**: Không có
- **Rate Limit**: 1 request / 60 giây / user
- **Response Thành Công**: `204 No Content` (không có body)

### 13.2 Cơ chế xử lý & Mã lỗi

| HTTP Status | `error.code` | Ý nghĩa | Hành động của Mobile / Web |
| :--- | :--- | :--- | :--- |
| **204** | *(None)* | Xoá thành công | Xoá token local, clear state, điều hướng về màn hình đăng nhập hoặc trang chủ. |
| **401** | `UNAUTHORIZED` | Token thiếu / không hợp lệ | Đăng xuất người dùng. |
| **404** | `NOT_FOUND` | User đã bị xoá (idempotent) | Coi như đã xoá thành công, clear token local. |
| **409** | `ORDER_IN_PROGRESS` | User còn đơn hàng đang xử lý | Hiển thị thông báo: "Bạn còn đơn hàng đang xử lý. Vui lòng hoàn tất hoặc huỷ đơn trước khi xoá tài khoản" (kèm danh sách đơn trong `error.details.blockingOrders`). |
| **429** | `CONFLICT` | Gửi request quá nhanh (< 60s) | Báo người dùng thử lại sau 1 phút. |

### 13.3 Cascade dữ liệu tự động
- **Xoá vĩnh viễn**: Document `User` (kèm `addresses[]`), `Cart` & `CartItem`, `Design`, `Review`, `Notification`.
- **Làm sạch PII trong Order**: Giữ lại `orderCode`, `totalAmount`, `status` để đối soát tài chính nhưng xoá sạch tên, số điện thoại, địa chỉ nhận hàng (`shippingName`, `shippingPhone`, `shippingAddress`), đánh dấu `isAnonymized: true`.
- **Token**: Ngay sau khi xoá, JWT cũ lập tức mất hiệu lực vì user không còn trong hệ thống.
