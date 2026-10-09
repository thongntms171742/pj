# FE API Reference — 3-tier Tree Catalog (chốt response shape)

> Tài liệu này dành riêng cho **Frontend team** — copy-paste các kiểu TypeScript vào project FE, dùng làm ground-truth khi parse response từ BE.
>
> **Source of truth**: code thực tế trong `backend/src/`. Nếu khác → báo lại để update tài liệu.

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
    "styleId": "STYLE_ID",
    "accessories": [
      { "accessoryId": "ACC_ID", "quantity": 12 }
    ],
    "deliveryOption": "READY_TO_DISPLAY"
  },
  "quantity": 1
}
```

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
      "styleId": "...",
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
                    styleId: "STYLE_DEFAULT",          // hoặc lấy từ editor
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

# Cart add (dùng variant._id ở trên)
curl -X POST -H "Authorization: Bearer $USER_TOKEN" -H "Content-Type: application/json" \
     -d "{\"config\":{\"variantId\":\"<VID>\",\"styleId\":\"<SID>\",\"accessories\":[],\"deliveryOption\":\"READY_TO_DISPLAY\"},\"quantity\":1}" \
     http://localhost:4000/api/cart/items | jq
```

