# BE Handoff — Context-aware Photorealistic Compositing (4 lớp)

> **Trạng thái (2026-11-13): ✅ BE ĐÃ TRIỂN KHAI ĐẦY ĐỦ.**
> Toàn bộ field mới dưới đây là **OPTIONAL** — dữ liệu cũ chạy nguyên vẹn, FE fallback về hành vi cũ khi field thiếu.
>
> **Phạm vi:** BE nằm ở repo này (`pj/backend`). Tài liệu này là **hợp đồng đã được hiện thực** — mô tả schema Mongoose, payload mẫu và bảng fallback.
> Chi tiết triển khai: xem `backend/src/models/`, `backend/src/services/customizerService.ts`.

---

## 1. Tóm tắt: FE đã làm gì

Tree Customizer đã chuyển từ "dán sticker phẳng" sang hệ thống ghép 4 lớp:

| Lớp | Nội dung | Nguồn dữ liệu |
| :-- | :-- | :-- |
| Lớp 1 | Cây trơn | `variant.bareImage` *(đã có)* |
| Lớp 2 | Phụ kiện **sau cành** | `slot.depth === 'behind'` **(mới)** |
| Lớp 3 | Phụ kiện **trước cành** | `slot.depth === 'front'` *(mặc định)* |
| Lớp 4 | Cành trước cảnh (che phụ kiện) | `variant.foregroundMask` **(mới)** |

Ngoài ra FE đã thêm:

- **Điểm neo** (`anchor`) — móc treo / nút thắt nơ trùng vị trí slot ⇒ phụ kiện "treo" trên cành.
- **Kiểu bóng** (`shadow`) — `none` / `soft` / `contact` theo hướng sáng chung.
- **Kích thước authored** (`defaultScale` × `scaleHint`) — phụ kiện đúng tỉ lệ thật trên cây.
- **Snapshot `depth`** trong `placement` — đơn hàng giữ nguyên hình khách đã chọn.
- **Ruy băng uốn SVG** theo slot `garland` — sinh path trong không gian 0–1, co giãn theo cây.
- **Xuất ảnh PNG phẳng** (Canvas 2D) theo đúng thứ tự lớp, ở độ phân giải gốc của `bareImage`.

---

## 2. Nguyên tắc thiết kế (bắt buộc khi BE implement)

1. **Mọi field mới đều `optional`.** Không có `required` mới. Dữ liệu cũ phải chạy được nguyên vẹn.
2. **Không đổi semantics của field cũ.** `slot.z` trước đây là field chết — nay nó **là thứ tự vẽ thật** (sắp tăng dần trong mỗi nhóm lớp). Giá trị cũ vẫn hợp lệ.
3. **FE không gọi endpoint mới bắt buộc.** Tất cả field mới đi kèm endpoint đã có sẵn.
4. **Không áp `e_background_removal` cho `foregroundMask`.** Lớp 4 là PNG alpha đã cắt sẵn — xử lý nền lần nữa sẽ phá hỏng alpha.
5. **Fallback an toàn:**
   - `foregroundMask` thiếu ⇒ không có lớp 4 ⇒ mọi phụ kiện nằm trước cây (hành vi cũ).
   - `slot.depth` thiếu ⇒ `'front'`.
   - `placement.depth` thiếu ⇒ lấy `slot.depth` hiện tại.
   - `accessory.anchor` thiếu ⇒ neo giữa ảnh `(0.5, 0.5)`.
   - `accessory.shadow` thiếu ⇒ `'soft'`.
   - `accessory.defaultScale` thiếu ⇒ `1`.

---

## 3. Schema đề xuất

### 3.1 `TreeVariant` — thêm `foregroundMask`

```ts
// models/TreeVariant.ts
interface TreeVariant {
  // ... field cũ
  bareImage?: string;

  /**
   * Ảnh CÀNH TIỀN CẢNH (PNG alpha) — lớp overlay phủ lên phụ kiện
   * `depth: 'behind'` để tạo cảm giác phụ kiện nằm TRONG tán cây.
   *
   * YÊU CẦU: cùng pixel size với `bareImage` (cùng khung, cùng góc máy).
   * `undefined` ⇒ không có lớp che ⇒ hành vi cũ.
   */
  foregroundMask?: string;
}
```

**Mirror** trong các DTO / response sau (BE nên trả kèm nếu đang populate):
- `GET /api/catalog/customizer/base-trees` → `CustomizerBaseTree.foregroundMask`
- `GET /api/catalog/tree-products` → `TreeCodeWithVariants[].variants[].foregroundMask`
- `GET /api/catalog/tree-products/:productId/codes/:codeId/variants`
- `GET /api/designs/:id` → `design.configuration` không đổi, nhưng `variant.foregroundMask` (nếu có) nên được trả để render lại design đã lưu.

**Index / storage:** lưu URL Cloudinary (string), không lưu binary. Nên dùng `e_background_removal` cho `bareImage` nhưng **KHÔNG** dùng cho `foregroundMask`.

### 3.2 `Accessory` / `DesignAccessory` — thêm `anchor`, `shadow`, `defaultScale`

```ts
// models/DesignAccessory.ts  (và Accessory legacy)
interface DesignAccessory {
  // ... field cũ
  image: string;

  /**
   * ĐIỂM NEO — toạ độ chuẩn hoá 0–1 trong bbox của ảnh `image`
   * (KHÔNG phải ảnh `previewImage`).
   *
   * - Quả châu  → móc treo ở trên (thường `{ x: 0.5, y: 0.06 }`)
   * - Nơ satin → nút thắt ở giữa (`{ x: 0.5, y: 0.45 }`)
   * - Quả thông/bông → tâm (`{ x: 0.5, y: 0.5 }`)
   */
  anchor?: { x: number; y: number };

  /** Kiểu bóng: 'none' | 'soft' | 'contact' */
  shadow?: 'none' | 'soft' | 'contact';

  /** Tỉ lệ mặc định khi gắn (mặc định 1, khoảng 0.3–3) */
  defaultScale?: number;
}
```

**Validation đề xuất (Mongoose):**

```js
anchor: {
  type: new Schema({
    x: { type: Number, min: 0, max: 1, default: 0.5 },
    y: { type: Number, min: 0, max: 1, default: 0.5 },
  }),
  _id: false,
},
shadow: { type: String, enum: ['none', 'soft', 'contact'], default: 'soft' },
defaultScale: { type: Number, min: 0.3, max: 3, default: 1 },
```

> **Lưu ý:** nếu BE muốn trả `anchor` luôn (kể cả khi admin chưa khai), trả `anchor: { x: 0.5, y: 0.5 }` cũng được — FE tương thích.

### 3.3 `SlotMap.slots[]` — thêm `depth`, `scaleHint`

```ts
interface SlotDefinition {
  slotId: string;
  slotType: string;
  x: number;   // 0–1
  y: number;   // 0–1
  radius: number;
  z: number;
  allowedAccessoryTypes: string[];

  /**
   * Lớp chiều sâu (mặc định 'front').
   * 'behind' ⇒ phụ kiện bị cành trước che (chỉ có tác dụng khi variant
   * có `foregroundMask`).
   */
  depth?: 'behind' | 'front';

  /** Gợi ý kích thước authored của phụ kiện tại slot này (mặc định 1) */
  scaleHint?: number;
}
```

**Cần cập nhật 3 nơi ở BE:**
1. Schema Mongoose của SlotMap (mảng `slots`).
2. Controller `publishSlotMap` — nhận & lưu `depth`, `scaleHint` (hiện FE gửi kèm 2 field này).
3. DTO trả về cho client (`GET /api/catalog/variants/:variantId/slotmap` và `GET /api/admin/tree-variants/:variantId/slotmaps`) — phải trả lại nguyên vẹn.

**Payload publish (hiện FE đã gửi):**

```jsonc
POST /api/admin/tree-variants/:variantId/slotmaps/publish
{
  "slots": [
    {
      "slotId": "ball-left-01",
      "slotType": "ball",
      "x": 0.32,
      "y": 0.44,
      "radius": 0.05,
      "z": 10,
      "allowedAccessoryTypes": ["BAUBLE"],
      "depth": "behind",     // ← MỚI
      "scaleHint": 1.15      // ← MỚI
    }
  ]
}
```

**Lưu ý versioning:** khi admin đổi `depth`/`scaleHint` của slot, `slotMap.version` **phải tăng** để các design đang lưu biết là cần re-validate. FE hiện so sánh `slotMapVersion` để cảnh báo "bản đồ chạm đã thay đổi".

### 3.4 `Design.configuration.placements[]` — thêm `depth`

```ts
interface DesignPlacement {
  slotId: string;
  accessoryId: string;
  x?: number;
  y?: number;
  rotation?: number;
  scale?: number;

  /**
   * Snapshot lớp chiều sâu tại lúc khách gắn phụ kiện.
   * undefined ⇒ fallback về `depth` của slot hiện tại.
   */
  depth?: 'behind' | 'front';
}
```

**Vì sao cần snapshot:** admin có thể đổi `depth` của slot **sau khi** khách đã đặt hàng. Nếu BE không lưu snapshot, bản đơn sẽ render khác hình khách đã chọn ⇒ sai ảnh giao hàng.

**FE đã gửi field này** trong body của:
- `POST /api/designs` (kèm `configuration`)
- `PATCH /api/designs/:id` (kèm `configuration`)
- `POST /api/designs/quote` (kèm `configuration`)

BE chỉ cần **lưu nguyên mảng `placements`** (kể cả field lạ) là đủ — không cần validate.

### 3.5 `ConfigVersion` / `frozenConfig`

`CartItem.config.frozenConfig.placements[]` cũng mang `depth` theo cùng cách (BE copy nguyên mảng placements khi đóng băng).

---

## 4. Endpoint admin liên quan

### 4.1 `PATCH /api/admin/accessories/:id`

Bổ sung 3 field vào payload (đã có sẵn cơ chế update từng phần):

```jsonc
{
  "anchor": { "x": 0.5, "y": 0.06 },
  "shadow": "contact",
  "defaultScale": 1.2
}
```

FE gửi **từng field riêng** (mỗi lần sửa 1 input ⇒ 1 PATCH). BE nên hỗ trợ **partial update** (chỉ set field có mặt trong body) — nếu BE đang `Object.assign` toàn bộ model thì cần chỉnh lại để không xoá field khác.

**Response (200):**

```jsonc
{
  "accessory": {
    "_id": "...",
    "sku": "BAUBLE-RED-01",
    "name": "Quả châu đỏ",
    "image": "https://res.cloudinary.com/...",
    "unitPrice": 25000,
    "slotTypes": ["ball"],
    "isActive": true,
    "sortOrder": 10,
    "anchor": { "x": 0.5, "y": 0.06 },
    "shadow": "contact",
    "defaultScale": 1.2
  }
}
```

### 4.2 `PATCH /api/admin/tree-variants/:id`

Bổ sung `foregroundMask`:

```jsonc
{
  "foregroundMask": "https://res.cloudinary.com/byc/image/upload/v1730000000/tree-mask.png"
}
```

**Quy tắc URL `foregroundMask`:**
- Phải là **PNG có kênh alpha**.
- Phải **cùng pixel size** với `bareImage` (admin UI đã cảnh báo khi lệch — nhưng BE nên validate lại ở server nếu có thể).
- **Không** áp transformation `e_background_removal` khi phục vụ ảnh này.

### 4.3 `POST /api/admin/tree-variants/:variantId/slotmaps/publish`

Xem payload ở §3.3. BE cần:
1. Validate `depth ∈ {'behind','front'}` nếu có (bỏ qua field nếu sai ⇒ không reject).
2. Validate `scaleHint` là số > 0 nếu có.
3. Tăng `version` của SlotMap sau mỗi lần publish.

### 4.4 `POST /api/uploads`

Đã có sẵn. Dùng để upload PNG mask & PNG phụ kiện. FE admin đã gọi endpoint này cho `foregroundMask` và cho ảnh phụ kiện.

---

## 5. Endpoint public liên quan

### 5.1 `GET /api/design-accessories` *(đang thiếu trong API_CONTRACT.md)*

**Auth**: Public.

**Query params** (optional):
- `slotType` — lọc theo loại slot, ví dụ `ball`, `bow`, `star`, `garland`.

**Success (200)**:

```jsonc
{
  "accessories": [
    {
      "_id": "string",
      "code": "BAUBLE-RED-01",      // hoặc `sku` nếu BE dùng collection cũ
      "name": "Quả châu đỏ",
      "description": "string",
      "image": "https://.../bauble-red.png",
      "previewImage": "https://.../bauble-red-hi.png",
      "decorationPrice": 25000,      // hoặc `unitPrice` nếu collection cũ
      "slotTypes": ["ball"],
      "isActive": true,
      "sortOrder": 10,

      // ── Field MỚI (optional) ──────────────────────────────
      "anchor": { "x": 0.5, "y": 0.06 },
      "shadow": "contact",
      "defaultScale": 1.2
    }
  ]
}
```

> **Fallback của FE:** nếu endpoint trả `404 / 403 / 405` ⇒ FE tự gọi `GET /api/catalog/accessories` (collection cũ). Vì vậy **không bắt buộc** phải có endpoint này, nhưng nếu có thì nên trả đủ 3 field mới để phụ kiện đẹp nhất.

### 5.2 `GET /api/catalog/variants/:variantId/slotmap`

Response phải giữ nguyên `depth` / `scaleHint` trong từng slot:

```jsonc
{
  "variantId": "...",
  "version": 7,
  "slots": [
    {
      "slotId": "ball-left-01",
      "slotType": "ball",
      "x": 0.32,
      "y": 0.44,
      "radius": 0.05,
      "z": 10,
      "allowedAccessoryTypes": ["BAUBLE"],
      "depth": "behind",
      "scaleHint": 1.15
    }
  ]
}
```

### 5.3 `GET /api/catalog/customizer/base-trees`

Mỗi item trả kèm `foregroundMask` (nếu variant có):

```jsonc
{
  "_id": "...",
  "sku": "TREE-GREEN-M",
  "size": "M",
  "bareImage": "https://.../tree-green-m.png",
  "foregroundMask": "https://.../tree-green-m-mask.png",
  "hasSlotMap": true,
  "slotCount": 24,
  "slotMapVersion": 7
}
```

---

## 6. Endpoint `POST /api/designs/quote`

Không cần thay đổi logic, nhưng **giữ nguyên** mảng `placements` khi tính giá & tạo design. Field `depth` không ảnh hưởng giá.

---

## 7. Kịch bản fallback (BE chưa làm gì)

| Tình huống | FE xử lý | Kết quả người dùng thấy |
| :-- | :-- | :-- |
| BE chưa có `foregroundMask` | Không render lớp 4 | Mọi phụ kiện nằm trước cây (đúng hành vi cũ) |
| BE chưa có `slot.depth` | Mặc định `'front'` | Không có phụ kiện nào bị che |
| BE chưa có `placement.depth` | Lấy `slot.depth` | Đồng nhất với trạng thái slot hiện tại |
| BE chưa có `accessory.anchor` | Neo giữa ảnh `(0.5, 0.5)` | Hành vi cũ (phụ kiện lơ lửng ở tâm) |
| BE chưa có `accessory.shadow` | Mặc định `'soft'` | Bóng nhẹ đồng nhất |
| BE chưa có `accessory.defaultScale` | `1` | Kích thước cũ |
| BE chưa có `slot.scaleHint` | `1` | Kích thước cũ |
| BE chưa có `/design-accessories` | FE gọi `/catalog/accessories` | Danh sách phụ kiện vẫn hiện |

> ⇒ **Deploy FE trước, deploy BE sau** là an toàn.

---

## 8. Checklist cho BE

> ✅ = đã triển khai & kiểm chứng · ⬜ = phần đội ảnh/ops phụ trách

- [x] Thêm `foregroundMask?: string` vào schema `TreeVariant` + trả kèm ở mọi endpoint trả variant (`/catalog/tree-products`, `/catalog/tree-products/:pid/codes/:cid/variants`, `/catalog/trees`, `/catalog/customizer/base-trees`).
- [x] Thêm `anchor`, `shadow`, `defaultScale` vào schema `Accessory` + trả kèm ở `GET /api/design-accessories` và `GET /api/admin/accessories`.
- [x] Thêm `depth`, `scaleHint` vào schema `SlotMap.slots[]` + persist khi publish + trả kèm ở endpoint đọc slotmap (cả public lẫn admin).
- [x] Bảo đảm `placements[]` được lưu **nguyên vẹn** (kể cả `depth`) ở `POST /api/designs` (kèm `configuration`), `PUT /api/designs/:id/configuration` và `frozenConfig`.
- [x] Bảo đảm `PATCH /api/admin/accessories/:id` hỗ trợ **partial update** (không xoá field không có trong body).
- [x] Bảo đảm ảnh `foregroundMask` được phục vụ **nguyên bản** (không `e_background_removal`).
- [x] Validate kích thước `foregroundMask` khớp `bareImage` ở server *(admin UI đã cảnh báo — server hiện ghi log cảnh báo, chưa reject)*.
- [x] `POST /api/uploads` hỗ trợ `resource_type: "raw"` cho `.glb` / `.gltf` (model 3D).
- [x] Test hồi quy: `npm run test:compositing` (24 test) + `npm run test:all` (620 test) — tất cả pass.
- [ ] (Khuyến nghị) Ghi log khi nhận `depth`/`scaleHint`/`anchor` lần đầu để theo dõi adoption.
- [ ] **(Đội ảnh)** Chuẩn bị bộ ảnh: cây trơn, mask cành trước, PNG phụ kiện tách nền sạch — xem [`ASSET_PREPARATION_GUIDE.md`](./ASSET_PREPARATION_GUIDE.md).

---

## 9. Liên kết

- Hợp đồng API đầy đủ: [`API_CONTRACT.md`](./API_CONTRACT.md)
- Nhật ký thay đổi: [`API_CHANGELOG.md`](./API_CHANGELOG.md)
- Hướng dẫn chuẩn bị ảnh: [`ASSET_PREPARATION_GUIDE.md`](./ASSET_PREPARATION_GUIDE.md)
- Mã nguồn BE (hiện thực hợp đồng này):
  - `backend/src/models/Tree.ts` — `foregroundMask`
  - `backend/src/models/Accessory.ts` — `anchor`, `shadow`, `defaultScale`, metadata 3D
  - `backend/src/models/SlotMap.ts` — `slots[].depth`, `slots[].scaleHint`
  - `backend/src/models/Design.ts` — `configuration.placements[].depth`
  - `backend/src/models/CartItem.ts` — `frozenConfig.placements[].depth`
  - `backend/src/services/customizerService.ts` — chuẩn hoá & validate metadata, `listDesignAccessories()`
  - `backend/src/controllers/catalogController.ts` — `GET /api/design-accessories`, trả `foregroundMask`
  - `backend/src/controllers/admin/accessories.ts` — PATCH partial update + metadata ghép ảnh
  - `backend/src/controllers/admin/treeVariants.ts` — PATCH `foregroundMask`
  - `backend/src/controllers/admin/slotMaps.ts` — publish slotmap (depth/scaleHint)
  - `backend/src/controllers/uploadController.ts` — upload `.glb`/`.gltf` (`resource_type: "raw"`)
- Mã nguồn FE:
  - `frontend/src/components/customizer/compositing.ts` — băng z-index & quy tắc lớp
  - `frontend/src/components/customizer/lighting.ts` — mô hình ánh sáng & bóng
  - `frontend/src/components/customizer/ribbonPaths.ts` — sinh path ruy băng
  - `frontend/src/lib/canvasExport.ts` — renderer Canvas 2D xuất PNG
  - `frontend/src/components/admin/AdminCompositingMetaEditor.tsx` — UI admin khai metadata
  - `frontend/src/components/admin/AdminForegroundMaskUploader.tsx` — upload + kiểm tra kích thước mask
- Test hợp đồng: `backend/src/tests/compositingContract.test.ts` (`npm run test:compositing`)
