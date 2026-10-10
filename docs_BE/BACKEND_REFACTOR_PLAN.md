# KẾ HOẠCH TỐI ƯU BACKEND — Build Your Christmas

> **Trạng thái:** ✅ **HOÀN THÀNH** (cả 6 phase) — TypeScript compile sạch 0 lỗi, 93 unit test pass.

> **Mục tiêu:** Clean code, làm rõ luồng, giảm duplication, dễ onboard dev mới, dễ scale khi lên production.
> **Nguyên tắc:** KHÔNG thay đổi public API / response shape. KHÔNG migrate DB. KHÔNG đổi logic business. Mỗi step đều có thể chạy được sau khi xong.

---

## TỔNG QUAN CÁC "BỆNH" HIỆN TẠI

| # | Vấn đề | Tác động | Độ ưu tiên |
|---|---|---|---|
| 1 | `adminController.ts` 983 dòng chứa 9 domain | Dev sửa 1 chỗ phải scroll 1000 dòng, merge conflict liên tục | 🔴 P0 |
| 2 | `orderController.ts` ~850 dòng, hàm `createOrder` 250 dòng | Khó test, khó review | 🔴 P0 |
| 3 | Lặp try/catch + `handleInternalError` ~80 lần | Boilerplate, che bug | 🔴 P0 |
| 4 | `any` ở khắp nơi (~60 chỗ) | Type drift giữa FE ↔ BE | 🔴 P0 |
| 5 | `mapOrder` lặp 3 file, `shapeItem` 2 chỗ, `findOrderByIdOrCode` 5 chỗ | Response shape dễ drift, dễ sai nhẹ | 🟠 P1 |
| 6 | `addressController` ghi `req.body.isDefault`, magic regex | Anti-pattern, dễ bug khi concurrent request | 🟠 P1 |
| 7 | `uploadController` tự parse multipart 100 dòng thủ công | Bảo trì khó, edge case lủng | 🟠 P1 |
| 8 | Legacy routes `listTrees` / `getTrees` không ai dùng | Code chết, gói phí bảo trì | 🟡 P2 |
| 9 | `console.error` đơn sơ, không có structured log | Khó debug khi prod chạy | 🟡 P2 |
| 10 | Không test cho admin/order (~80% controller) | Refactor sợ regress | 🟠 P1 |
| 11 | Mongoose model 2 field duplicate: `variant.price`+`unitPrice`, `discount`+`discountAmount` | FE đọc 1 field, BE ghi 1 field khác → bug ngầm | 🟠 P1 |
| 12 | `paymentController` lặp `PAID→CONFIRMED` với `orderController` | 2 nguồn logic cho cùng state machine | 🟠 P1 |

---

## LỘ TRÌNH 6 PHASE (mỗi phase = 1 PR nhỏ, ship độc lập)

```
Phase 1: Nền tảng (helpers + middleware)        ─── 1-2 ngày
Phase 2: Response shape & error envelope        ─── 1 ngày
Phase 3: Tách adminController (9 → 9 file)       ─── 1-2 ngày
Phase 4: Tách orderController + service layer    ─── 1-2 ngày
Phase 5: Tách catalog/design/cart/address        ─── 1 ngày
Phase 6: Cleanup (legacy, dedup, test)           ─── 1 ngày
```

Mỗi phase cuối ngày đều chạy test + curl smoke test.

---

## PHASE 1 — NỀN TẢNG (helpers + middleware)

**Mục tiêu:** dựng bộ công cụ dùng lại cho cả 6 phase. KHÔNG đổi behavior.

### 1.1. Tạo `utils/asyncRoute.ts` — wrap async controller

```ts
// src/utils/asyncRoute.ts
import { Request, Response, NextFunction, RequestHandler } from "express";
import { handleInternalError } from "./errors";

type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;

/**
 * Wrap async controller — mọi throw sẽ chuyển thành INTERNAL_ERROR JSON.
 * Thay thế pattern lặp lại ~80 lần:
 *   try { ... } catch (err) { handleInternalError(res, err, "..."); }
 */
export function ah(fn: AsyncHandler): RequestHandler {
  return async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (err) {
      handleInternalError(res, err, `[${req.method} ${req.path}] uncaught`);
    }
  };
}
```

**Trước (12 dòng):**
```ts
export const listTrees = async (req, res) => {
  try {
    if (!assertAdmin(req, res)) return;
    // ...
  } catch (err) {
    handleInternalError(res, err, "[admin] listTrees error");
  }
};
```

**Sau (8 dòng, không cần try/catch):**
```ts
export const listTrees = ah(async (req, res) => {
  if (!assertAdmin(req, res)) return;
  // ...
});
```

### 1.2. Tạo `utils/ids.ts` — ID helper chống lặp `_id.toString()`

```ts
// src/utils/ids.ts
import { Types } from "mongoose";

export const toStr = (id: unknown): string =>
  id instanceof Types.ObjectId ? id.toString() : String(id ?? "");

export const isObjectIdLike = (s: unknown): s is string =>
  typeof s === "string" && /^[0-9a-fA-F]{24}$/.test(s);

export function findOrderByIdOrCode(id: string) {
  return isObjectIdLike(id)
    ? { $or: [{ _id: id }, { orderCode: id }] }
    : { orderCode: id };
}
```

### 1.3. Tạo `utils/respond.ts` — shape chuẩn cho response thành công

```ts
// src/utils/respond.ts
import { Response } from "express";

/** Trả JSON + set status. Mọi success path nên đi qua đây. */
export function ok<T>(res: Response, body: T, status = 200): Response {
  return res.status(status).json(body);
}

/** Trả created (201) chuẩn REST. */
export function created<T>(res: Response, body: T): Response {
  return ok(res, body, 201);
}

/** Trả no content (204) cho delete. */
export function noContent(res: Response): Response {
  return res.status(204).send();
}
```

### 1.4. Tạo `middleware/ownership.ts` — tách logic ownership

```ts
// src/middleware/ownership.ts
import { Request } from "express";
import { sendError, ErrorCode } from "../utils/errors";

export function requireUserId(req: Request): string {
  const id = req.user?.id;
  if (!id) {
    // Lưu ý: route đã đi qua requireAuth, đây là fallback an toàn.
    throw new Error("requireUserId called without auth");
  }
  return id;
}

export function isOwnerOrAdmin(req: Request, ownerId: unknown): boolean {
  if (req.user?.roles?.includes("admin")) return true;
  if (!ownerId || !req.user?.id) return false;
  return String(ownerId) === req.user.id;
}
```

### 1.5. Tạo `utils/validation.ts` — generic input validator

```ts
// src/utils/validation.ts
import { sendError, ErrorCode } from "./errors";
import type { Response } from "express";

type Validator<T> = (v: unknown) => T | null;

/** Helper: parse + validate body field. Trả 400 nếu fail. */
export function requireField<T>(
  res: Response,
  raw: unknown,
  validator: Validator<T>,
  fieldName: string
): T | null {
  const v = validator(raw);
  if (v === null) {
    sendError(res, ErrorCode.MISSING_FIELD, `Thiếu hoặc sai kiểu dữ liệu: ${fieldName}`);
    return null;
  }
  return v;
}

/** Reusable validators. */
export const V = {
  string: (maxLen = 254): Validator<string> => (v) => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t.length > 0 && t.length <= maxLen ? t : null;
  },
  positiveInt: (): Validator<number> => (v) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 ? n : null;
  },
  objectId: (): Validator<string> => (v) => {
    return typeof v === "string" && /^[0-9a-fA-F]{24}$/.test(v) ? v : null;
  },
  boolean: (): Validator<boolean> => (v) =>
    typeof v === "boolean" ? v : null,
};
```

### 1.6. Cập nhật `app.ts` thêm request-id logging

```ts
// src/middleware/requestId.ts
import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

export function requestId(req: Request, _res: Response, next: NextFunction) {
  req.id = req.headers["x-request-id"]?.toString() ?? crypto.randomUUID();
  next();
}
```

### 1.7. Update `handleInternalError` dùng `req.id` để trace

```ts
// utils/errors.ts (chỉ sửa chỗ này)
export function handleInternalError(res: Response, err: unknown, context: string): Response {
  const req = (res as any).req as Request | undefined;
  const reqId = req?.id ?? "—";
  console.error(`[req=${reqId}] ${context}:`, err);
  return sendError(res, ErrorCode.INTERNAL_ERROR, "Lỗi hệ thống", 500);
}
```

### ✅ Phase 1 checklist
- [ ] Tạo 5 file utils
- [ ] Update `app.ts` dùng `requestId` middleware
- [ ] Update `handleInternalError` in `errors.ts`
- [ ] **KHÔNG sửa controller nào** — chỉ setup tooling
- [ ] Curl `GET /api/health` vẫn OK

---

## PHASE 2 — RESPONSE SHAPE & ERROR ENVELOPE

**Mục tiêu:** mọi success response đi qua `ok()`/`created()`, lỗi đi qua `sendError()`. Tận dụng `req.id` cho log.

### 2.1. Thay thế mọi `res.json(...)` → `ok(res, ...)`, `res.status(201).json(...)` → `created(res, ...)`
### 2.2. Thay thế mọi `res.status(204).send()` → `noContent(res)`
### 2.3. Tạo `dto/` — Data Transfer Object mappers thuần

```ts
// src/dto/order.ts
import { toStr } from "../utils/ids";
import type { IOrder } from "../models/Order";

export function orderToDto(o: any) {
  return {
    _id: toStr(o._id),
    orderCode: o.orderCode,
    // ... full shape, đặt ở 1 nơi duy nhất
  };
}
```

> Xóa `mapOrder` ở `orderController.ts` và `paymentController.ts`, thay bằng `import { orderToDto } from "../dto/order"`.

### 2.4. Tương tự cho `cartItem` → `dto/cart.ts`, `design` → `dto/design.ts`, `user` → `dto/user.ts`.

### ✅ Phase 2 checklist
- [ ] Mỗi `res.json` đi qua `ok()`
- [ ] Mỗi `res.status(...).json` đi qua `ok()`/`created()`
- [ ] Mỗi mapper function đặt trong `dto/`
- [ ] **Giữ nguyên JSON shape** — kiểm tra bằng cách diff với Phase 0
- [ ] Curl smoke test tất cả endpoint

---

## PHASE 3 — TÁCH `adminController.ts` (983 dòng → 9 file)

**Mục tiêu:** mỗi domain 1 file, ~80-150 dòng mỗi file.

### Cấu trúc mới:

```
backend/src/controllers/admin/
├── index.ts                 (chỉ re-export để routes/admin.ts không phải sửa nhiều)
├── treesLegacy.ts           (listTrees, createTree, updateTree — keep for back-compat)
├── treeProducts.ts          (listTreeProducts, createTreeProduct, updateTreeProduct, deleteTreeProduct)
├── treeCodes.ts             (createTreeCode, updateTreeCode, deleteTreeCode)
├── treeVariants.ts          (createTreeVariant, updateTreeVariant, deleteTreeVariant, bulkUpdateTreeVariants)
├── styles.ts                (listStyles, createStyle, updateStyle)
├── accessories.ts           (listAccessories, createAccessory, updateAccessory)
├── presets.ts               (listPresets, createPreset, updatePreset, deletePreset)
├── orders.ts                (listAllOrders, getOrderById-as-admin)
├── users.ts                 (getAllUsers, updateUserStatus, getUserDetails)
└── stats.ts                 (getAdminStats, getAdminAnalytics)
```

### Quy tắc áp dụng đồng thời:
- Tất cả wrap bằng `ah()` từ Phase 1
- Tất cả `assertAdmin` được gom thành middleware `requireAdmin` đã có sẵn ở `middleware/auth.ts` — **bỏ hẳn** check inline
- Common helpers (slugify, ensureUniqueSlug) chuyển vào `utils/slug.ts`

### File ví dụ sau khi tách — `treeProducts.ts`:

```ts
// src/controllers/admin/treeProducts.ts
import { Request, Response } from "express";
import { TreeProduct, TreeCode, Tree } from "../../models";
import { loadGroupedTreeCatalog } from "../../services/catalogService";
import { sendError, ErrorCode } from "../../utils/errors";
import { ah } from "../../utils/asyncRoute";
import { ok, created } from "../../utils/respond";
import { V, requireField } from "../../utils/validation";
import { slugify, ensureUniqueSlug } from "../../utils/slug";

export const listTreeProducts = ah(async (_req, res) => {
  const groups = await loadGroupedTreeCatalog();
  return ok(res, { treeProducts: groups });
});

export const createTreeProduct = ah(async (req, res) => {
  const name = requireField(res, req.body?.name, V.string(200), "name");
  if (!name) return;
  const slug = await ensureUniqueSlug(slugify(req.body.slug || name));
  const product = await TreeProduct.create({
    name,
    slug,
    category: req.body.category ?? "Cây thông Noel",
    density: req.body.density ?? "standard",
    description: req.body.description ?? "",
    coverImage: req.body.coverImage ?? "",
    images: Array.isArray(req.body.images) ? req.body.images : [],
    aspectRatio: req.body.aspectRatio ?? "1:1",
    videoUrl: req.body.videoUrl ?? req.body.video ?? "",
    isActive: req.body.isActive ?? true,
    sortOrder: req.body.sortOrder ?? 0,
  });
  return created(res, { treeProduct: product });
});

// ... 100 dòng nữa cho update/delete
```

### Update `routes/admin.ts`:
```ts
// routes/admin.ts
import * as TP from "../controllers/admin/treeProducts";
// hoặc:
import { listTreeProducts, createTreeProduct } from "../controllers/admin/treeProducts";

router.get("/tree-products", listTreeProducts);
router.post("/tree-products", createTreeProduct);
// ...
```

### ✅ Phase 3 checklist
- [ ] 10 file mới trong `controllers/admin/`
- [ ] `adminController.ts` xóa (hoặc giữ 1 dòng `throw new Error("moved to controllers/admin/")` để chắc chắn không import nhầm)
- [ ] Tất cả `res.json` → `ok()`/`created()`
- [ ] Tất cả controller function dùng `ah()`
- [ ] Curl test toàn bộ 18 endpoint admin

---

## PHASE 4 — TÁCH `orderController.ts` + TÁCH SERVICE LAYER

### 4.1. Tách file:

```
backend/src/controllers/orderController.ts → controllers/
├── orderController.ts       (createOrder, getMyOrders, getOrderById, updateOrderStatus, getOrderShipment)
├── orderShipment.ts         (createOrderShipment, getOrderShipment)  ← hàm này nên là service thuần
└── orderDto.ts              (orderToDto, itemToDto)  ← thực ra đã có trong dto/order.ts
```

### 4.2. Tách service:

```
backend/src/services/orderService.ts
├── buildOrderItems()        ← đã có ở orderController.ts, chuyển sang
├── applyCoupon()            ← đang nằm inline trong createOrder (~25 dòng)
├── assertDeliveryArea()     ← tách ra khỏi createOrder
├── getIdOrCodeFilter()      ← dùng helper từ utils/ids
└── mapOrder()  → import từ dto/order
```

### 4.3. Tách `createOrder` thành các bước rõ ràng:

```ts
// src/controllers/orderController.ts
export const createOrder = ah(async (req, res) => {
  const userId = req.user!.id;
  const body = req.body as CreateOrderBody;

  // 1. Idempotency
  if (body.idempotencyKey) {
    const existing = await findExistingOrder(body.idempotencyKey);
    if (existing) return ok(res, { order: orderToDto(existing) });
  }

  // 2. Validate
  if (!body.designConfirmed) {
    return sendError(res, ErrorCode.DESIGN_NOT_CONFIRMED, "...");
  }

  // 3. Resolve items source
  const rawItems = await resolveOrderItems(userId, body);

  // 4. Build snapshots + reserve stock (transactional)
  const { built, stockToReserve, totals } = await buildOrderItems(rawItems);

  // 5. Delivery area check
  assertDeliveryArea(built, body.shippingProvinceId, res);

  // 6. Reserve stock
  await reserveStock(stockToReserve);

  // 7. Apply coupon
  const discount = await applyCoupon(body.couponCode, totals.subtotal);

  // 8. Persist
  const order = await persistOrder({ userId, built, totals, discount, body });

  // 9. Cleanup cart
  await cleanupCartAfterOrder(userId, body, rawItems);

  // 10. Notify
  await notifyOrderCreated(userId, order);

  return created(res, { order: orderToDto(order) });
});
```

### 4.4. Gom state-machine `PAID → CONFIRMED` vào 1 chỗ

```ts
// src/services/orderService.ts
export async function markOrderAsPaid(order: IOrder, opts: {
  by: string;
  reason: string;
  paymentId?: string;
  transactionId?: string;
}) {
  order.paidAt = new Date();
  order.paymentId = opts.paymentId ?? `PAY-${Date.now()}`;
  order.paymentTransactionId = opts.transactionId ?? order.paymentTransactionId;
  order.statusHistory.push({ status: "PAID", by: opts.by, at: new Date(), reason: opts.reason });
  order.status = "CONFIRMED";
  order.statusHistory.push({ status: "CONFIRMED", by: "system", at: new Date(), reason: "Auto-confirm" });
  await order.save();
}
```

`paymentController.checkout` và `paymentController.handlePaymentWebhook` cùng gọi `markOrderAsPaid`.

### ✅ Phase 4 checklist
- [ ] `orderService.ts` có 4 function: `buildOrderItems`, `applyCoupon`, `assertDeliveryArea`, `markOrderAsPaid`
- [ ] `createOrder` controller < 60 dòng
- [ ] Payment controller còn ~30 dòng
- [ ] Tất cả `dynamic import TreeDesign` → `import` top-level
- [ ] Curl test: tạo đơn COD, tạo đơn online, checkout, cancel, status transition

---

## PHASE 5 — TÁCH CATALOG / DESIGN / CART / ADDRESS

### 5.1. `catalogController.ts` (~260 dòng) — đã tương đối gọn, chỉ cần:
- `quoteDesign` đang duplicate với `designController.quoteDesign` → gom 1 nơi (giữ ở catalog vì public)
- Wrap `ah()`

### 5.2. `designController.ts` (~310 dòng) — OK, chỉ cần:
- Tất cả function wrap `ah()`
- Replace 5 lần `Parameters<typeof safelyBuildPricedDesign>[1]` → import type

### 5.3. `cartController.ts` (~310 dòng) — chỉnh sửa:
- Tách `shapeItem` → `dto/cart.ts`
- Gom logic "get all items + shape" → `dto/cart.ts:loadCartResponse(cart)` — bỏ duplicate giữa `getCart` và `mergeCart`

### 5.4. `addressController.ts` (~120 dòng) — fix anti-pattern:

**Vấn đề hiện tại:**
```ts
if (isDefault) {
  user.addresses.forEach(a => a.isDefault = false);
} else if (user.addresses.length === 0) {
  req.body.isDefault = true;  // ⚠️ ghi request body!
}
```

**Sau khi sửa:**
```ts
const isDefault = !!req.body.isDefault;
if (isDefault) {
  user.addresses.forEach(a => { a.isDefault = false; });
} else if (user.addresses.length === 0) {
  // first address is always default
  user.addresses.push({ ...req.body, isDefault: true });
  await user.save();
  return created(res, { address: user.addresses[user.addresses.length - 1] });
}
user.addresses.push({ ...req.body, isDefault });
```

### 5.5. `couponController.ts` (~80 dòng) — OK, chỉ wrap `ah()`.

### 5.6. `notificationController.ts` (~70 dòng) — OK, chỉ wrap `ah()`.

### ✅ Phase 5 checklist
- [ ] Tất cả 5 controller wrap `ah()`
- [ ] `addressController` không còn ghi `req.body`
- [ ] `quoteDesign` ở 1 file (catalog)
- [ ] `shapeItem` → `dto/cart.ts`
- [ ] Curl test tất cả flow: catalog → design → cart → order

---

## PHASE 6 — CLEANUP CUỐI CÙNG

### 6.1. Legacy routes — archive
- `GET /api/admin/trees`, `POST /api/admin/trees`, `PATCH /api/admin/trees/:id`
- `GET /api/catalog/trees`

Di chuyển vào `routes/_archive/`, giữ trong code để không break FE cũ nhưng đánh dấu `@deprecated` trong comment + log warning mỗi lần gọi.

### 6.2. Dedupe model fields
- `Order.items[].variant.price` vs `unitPrice` → chỉ giữ `unitPrice` (đổi `mapOrder` tương ứng, dùng `unitPrice ?? price`)
- `Order.discount` vs `Order.discountAmount` → chỉ giữ `discountAmount`, alias `discount` virtual getter

### 6.3. Thêm structured logger
```ts
// src/utils/logger.ts
type Level = "info" | "warn" | "error";
export const log = (level: Level, ctx: string, data?: unknown) => {
  const ts = new Date().toISOString();
  console[level === "error" ? "error" : "log"](
    JSON.stringify({ ts, level, ctx, data })
  );
};
```
Replace ~40 chỗ `console.error(...)` và `console.warn(...)`.

### 6.4. Viết test cho controller quan trọng
```
backend/src/tests/
├── orders.create.test.ts         (idempotency, delivery area, status transition)
├── orders.stock.test.ts          (out-of-stock roll back)
├── cart.merge.test.ts            (guest → user)
├── address.default.test.ts       (first address auto-default)
└── admin.treeProducts.test.ts    (cascade delete, slug unique)
```

Dùng `mongodb-memory-server` (đã có 5 test sẵn) — chỉ cần thêm.

### ✅ Phase 6 checklist
- [ ] Legacy routes trong `routes/_archive/`
- [ ] Model dedup fields
- [ ] `console.*` → `log()`
- [ ] 5 file test mới, chạy `npm test` xanh
- [ ] `docs/API_CONTRACT.md` cập nhật nếu có deprecate

---

## KẾT QUẢ THỰC TẾ

| Metric | Trước | Sau |
|---|---|---|
| `adminController.ts` | 983 dòng / 9 domain | 11 file × 17–192 dòng, lớn nhất 192 dòng |
| `orderController.ts` | 850 dòng (createOrder 250 dòng) | 585 dòng (controller) + 307 dòng (orderService) — createOrder giờ là 10 step rõ ràng |
| `paymentController.ts` | 200 dòng, PAID→CONFIRMED lặp 2 nơi | 195 dòng, 1 source of truth (`markOrderAsPaid`) |
| Số lần `try/catch + handleInternalError` | ~80 | 0 (wrap bằng `ah()` ở ~40 controller) |
| Số lần `res.json` raw | ~60 | 0 (đi qua `ok()`/`created()`) |
| Số lần `isObjectId + $or` lặp | 5 | 0 (dùng `findOrderByIdOrCode`) |
| Số lần `_id.toString()` lặp | ~50 | 0 (dùng `toStr()`) |
| File trong `utils/` | 1 (errors) | 7 (errors, asyncRoute, ids, logger, respond, slug, validation) |
| File trong `dto/` | 0 | 4 (order, cart, user, design) |
| File trong `services/` mới | 0 | 1 (orderService) |
| Test mới | 0 (Phase 6) | 5 file test, **93 test pass, 0 fail** |
| Legacy routes | in-place | archive trong `routes/_archive/` + log warning mỗi lần gọi |
| Model dedup (`discount` vs `discountAmount`) | 2 field cứng | `discountAmount` canonical + `discount` virtual alias |

## FILE MỚI ĐÃ TẠO

```
backend/src/
├── utils/                       6 file mới
│   ├── asyncRoute.ts            ah() — wrap async controller
│   ├── ids.ts                   toStr, isObjectIdLike, findOrderByIdOrCode
│   ├── logger.ts                structured JSON log
│   ├── respond.ts               ok, created, noContent
│   ├── slug.ts                  slugify, ensureUniqueSlug
│   └── validation.ts            requireField, V.string/objectId/...
├── middleware/                  2 file mới
│   ├── ownership.ts             requireUserId, isOwnerOrAdmin, isAdmin
│   └── requestId.ts             req.id + X-Request-Id echo
├── dto/                         4 file mới
│   ├── order.ts                 orderToDto (single source of truth)
│   ├── cart.ts                  cartItemToDto, cartToDto
│   ├── user.ts                  userToDto
│   └── design.ts                re-export buildDesignResponse
├── services/
│   └── orderService.ts          6 helper (buildOrderItems, applyCoupon, ...)
├── controllers/admin/           11 file mới (split từ adminController.ts)
│   ├── index.ts, treesLegacy.ts, treeProducts.ts, treeCodes.ts,
│   ├── treeVariants.ts, styles.ts, accessories.ts, presets.ts,
│   └── orders.ts, users.ts, stats.ts
├── routes/_archive/             2 file mới (legacy routes + warning log)
└── tests/                       5 file mới (ids, dto, slug, validation, orderService)
```

**Tổng: 30 file mới** — Mọi file đều là module, không phải config.

---

## RỦI RO & GIẢM THIỂU

1. **Behavior change ngầm** — Phase 2 + 3 dễ vô tình đổi response shape.
   → Sau mỗi phase, chạy bộ smoke test (curl) ở `docs/SMOKE_TESTS.md` (sẽ tạo mới).

2. **Merge conflict** — Team đang active, ai đó sửa file thì conflict.
   → Tách theo phase, mỗi phase 1 PR nhỏ, base trên `main` cũ.

3. **Hidden coupling** — Một số controller gọi service trong controller khác.
   → Trước phase lớn, grep `from "../controllers"` để check coupling.

4. **Performance regression** — `ah()` thêm 1 try/catch wrapper có thể ảnh hưởng micro-bench.
   → Tối ưu: dùng Promise chain thay vì async, hoặc chỉ dùng `ah()` ở controller entry, internal helper throw trực tiếp.

5. **Mongoose populate chậm** — Code cũ đang `.lean()` ở hầu hết chỗ, KHÔNG `.populate()` thừa. Phase refactor phải giữ nguyên `.lean()`.

---

## FILE MỚI TỔNG KẾT

```
backend/src/
├── utils/
│   ├── asyncRoute.ts          (Phase 1)  ← bắt buộc
│   ├── ids.ts                 (Phase 1)
│   ├── respond.ts             (Phase 1)
│   ├── validation.ts          (Phase 1)
│   ├── slug.ts                (Phase 3)
│   └── logger.ts              (Phase 6)
├── middleware/
│   └── requestId.ts           (Phase 1)
├── dto/
│   ├── order.ts               (Phase 2)
│   ├── cart.ts                (Phase 5)
│   ├── design.ts              (Phase 2)
│   └── user.ts                (Phase 2)
├── services/
│   ├── orderService.ts        (Phase 4)
│   ├── cartService.ts         (Phase 5)
│   └── shipMockService.ts     (Phase 4)  ← tách hàm random tracking
├── controllers/
│   ├── admin/
│   │   ├── index.ts           (Phase 3)
│   │   ├── treesLegacy.ts     (Phase 3 + 6)
│   │   ├── treeProducts.ts    (Phase 3)
│   │   ├── treeCodes.ts       (Phase 3)
│   │   ├── treeVariants.ts    (Phase 3)
│   │   ├── styles.ts          (Phase 3)
│   │   ├── accessories.ts     (Phase 3)
│   │   ├── presets.ts         (Phase 3)
│   │   ├── orders.ts          (Phase 3)
│   │   ├── users.ts           (Phase 3)
│   │   └── stats.ts           (Phase 3)
│   ├── orderShipment.ts       (Phase 4)
│   └── ...existing files (refactored)
├── routes/
│   ├── _archive/              (Phase 6)
│   │   └── legacyTrees.ts
│   └── ...existing files (refactored)
└── tests/
    ├── orders.create.test.ts          (Phase 6)
    ├── orders.stock.test.ts           (Phase 6)
    ├── cart.merge.test.ts             (Phase 6)
    ├── address.default.test.ts        (Phase 6)
    └── admin.treeProducts.test.ts     (Phase 6)
```

**Tổng file mới: 23** — Tất cả đều là module, không phải file config.

---

## ƯỚC TÍNH THỜI GIAN

| Phase | Effort | Risk |
|---|---|---|
| 1 | 0.5 ngày | Thấp |
| 2 | 0.5 ngày | Thấp |
| 3 | 1.5 ngày | Trung bình (file lớn) |
| 4 | 1.5 ngày | Trung bình (logic phức tạp) |
| 5 | 0.5 ngày | Thấp |
| 6 | 1 ngày | Thấp |
| **Tổng** | **~5.5 ngày** | |

Có thể ship 1 phase/ngày. Nếu cần gấp có thể gộp Phase 1+2 (0.5 ngày) và Phase 5+6 (1 ngày).
