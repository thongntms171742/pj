import { Types } from "mongoose";
import { Accessory, ACCESSORY_SHADOW_TYPES } from "../models/Accessory";
import type { AccessoryShadow } from "../models/Accessory";
import { SlotMap, SLOT_DEPTH_TYPES, type ISlotMap } from "../models/SlotMap";
import type { SlotDepth } from "../models/SlotMap";
import { Tree } from "../models/Tree";
import { accessoryOverlap, accessoryFitsSurface, MAX_SCALE, MIN_SCALE, type Mounting, type ScenePosition } from "./placementRules";

// ── Customizer service (Phase 1: Catalog phụ kiện + SlotMap) ────────────────
// Mọi hàm ở đây là pure DB access, không dính Express. Controller chỉ parse
// input / map lỗi. FE Customizer đọc slotMap + accessories để render canvas.

export interface AccessoryFilter {
  slotType?: string;
  onlyActive?: boolean;
  variantId?: string;
}

export interface AccessoryLean {
  _id: string;
  sku: string;
  name: string;
  description: string;
  image: string;
  previewImage: string;
  model3dUrl: string;
  model3dScale: number;
  model3dRotation: number;
  unitPrice: number;
  stockQuantity: number;
  slotTypes: string[];
  isActive: boolean;
  sortOrder: number;
  /** Điểm neo chuẩn hoá 0–1 trong bbox của `image`. */
  anchor: { x: number; y: number };
  /** Kiểu bóng. */
  shadow: AccessoryShadow;
  /** Tỉ lệ mặc định khi gắn. */
  defaultScale: number;
}

export async function listAccessories(
  filter: AccessoryFilter = {}
): Promise<AccessoryLean[]> {
  const query: Record<string, unknown> = {};
  if (filter.onlyActive !== false) query.isActive = true;
  if (filter.slotType) query.slotTypes = filter.slotType;
  const variant = filter.variantId && Types.ObjectId.isValid(filter.variantId)
    ? await Tree.findById(filter.variantId).lean() : null;
  if (variant?.customizationCatalog) {
    query.catalogKey = variant.customizationCatalog;
  } else {
    query.$or = [{ catalogKey: { $exists: false } }, { catalogKey: "" }];
  }
  const docs = await Accessory.find(query)
    .sort({ sortOrder: 1, name: 1 })
    .lean();
  return docs.map((d) => ({
    _id: String(d._id),
    sku: d.sku,
    name: d.name,
    description: d.description ?? "",
    image: d.image ?? "",
    previewImage: d.previewImage ?? "",
    model3dUrl: d.model3dUrl ?? "",
    model3dScale: typeof d.model3dScale === "number" ? d.model3dScale : 1,
    model3dRotation:
      typeof d.model3dRotation === "number" ? d.model3dRotation : 0,
    unitPrice: d.unitPrice,
    stockQuantity: d.stockQuantity,
    slotTypes: d.slotTypes ?? [],
    isActive: d.isActive,
    sortOrder: d.sortOrder,
    anchor: normalizeAnchor(d.anchor),
    shadow: normalizeShadow(d.shadow),
    defaultScale:
      typeof d.defaultScale === "number" ? d.defaultScale : 1,
  }));
}

/**
 * Chuẩn hoá điểm neo về 0–1. Thiếu ⇒ neo giữa ảnh (hành vi cũ).
 */
export function normalizeAnchor(
  raw: unknown
): { x: number; y: number } {
  const a = (raw ?? {}) as { x?: unknown; y?: unknown };
  const x = Number(a.x);
  const y = Number(a.y);
  return {
    x: Number.isFinite(x) ? clamp01(x) : 0.5,
    y: Number.isFinite(y) ? clamp01(y) : 0.5,
  };
}

/**
 * Chuẩn hoá kiểu bóng. Thiếu / sai giá trị ⇒ 'soft' (hành vi cũ).
 */
export function normalizeShadow(raw: unknown): AccessoryShadow {
  const s = String(raw ?? "");
  return (ACCESSORY_SHADOW_TYPES as readonly string[]).includes(s)
    ? (s as AccessoryShadow)
    : "soft";
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

// ── Published SlotMap ────────────────────────────────────────────────────────
// FE Customizer luôn render theo bản đang phát hành. Không có bản nào ⇒
// variant chưa hỗ trợ tùy chỉnh (FE ẩn nút "Tùy chỉnh").

export interface SlotMapResponse {
  variantId: string;
  version: number;
  slots: Array<{
    slotId: string;
    slotType: string;
    x: number;
    y: number;
    radius: number;
    z: number;
    allowedAccessoryTypes: string[];
    /** Mặc định 'front'. */
    depth: SlotDepth;
    /** Mặc định 1. */
    scaleHint: number;
  }>;
}

export async function getPublishedSlotMap(
  variantId: string
): Promise<SlotMapResponse | null> {
  if (!Types.ObjectId.isValid(variantId)) return null;
  const variant = await Tree.exists({ _id: variantId });
  if (!variant) return null;
  const doc = await SlotMap.findOne({ variantId, isPublished: true }).lean();
  if (!doc) return null;
  return toSlotMapResponse(doc);
}

function toSlotMapResponse(doc: ISlotMap | Record<string, any>): SlotMapResponse {
  const raw = doc as any;
  return {
    variantId: String(raw.variantId),
    version: raw.version,
    slots: (raw.slots ?? []).map((s: any) => ({
      slotId: String(s.slotId),
      slotType: String(s.slotType),
      x: Number(s.x),
      y: Number(s.y),
      radius: Number(s.radius),
      z: Number(s.z ?? 0),
      allowedAccessoryTypes: Array.isArray(s.allowedAccessoryTypes)
        ? s.allowedAccessoryTypes.map(String)
        : [],
      depth: normalizeDepth(s.depth),
      scaleHint: normalizeScaleHint(s.scaleHint),
    })),
  };
}

/**
 * Chuẩn hoá lớp chiều sâu của slot. Thiếu / sai giá trị ⇒ 'front'.
 */
export function normalizeDepth(raw: unknown): SlotDepth {
  const d = String(raw ?? "");
  return (SLOT_DEPTH_TYPES as readonly string[]).includes(d)
    ? (d as SlotDepth)
    : "front";
}

/**
 * Chuẩn hoá gợi ý kích thước. Thiếu / sai ⇒ 1.
 */
export function normalizeScaleHint(raw: unknown): number {
  const v = Number(raw);
  return Number.isFinite(v) && v > 0 ? v : 1;
}

// ── Admin: phát hành SlotMap mới ─────────────────────────────────────────────
// Mỗi lần publish tăng version, unpublish bản cũ. Không xóa bản cũ để
// Design/Cart/Order còn đối chiếu version (phát hiện CONFIG_VERSION_MISMATCH).

export interface SlotInput {
  slotId: string;
  slotType: string;
  x: number;
  y: number;
  radius: number;
  z?: number;
  allowedAccessoryTypes?: string[];
  /** Lớp chiều sâu — mặc định 'front'. */
  depth?: SlotDepth;
  /** Gợi ý kích thước authored — mặc định 1. */
  scaleHint?: number;
}

export function validateSlots(slots: unknown): {
  ok: boolean;
  error?: string;
  value?: SlotInput[];
} {
  if (!Array.isArray(slots) || slots.length === 0) {
    return { ok: false, error: "slots phải là mảng không rỗng" };
  }
  if (slots.length > 200) {
    return { ok: false, error: "slots tối đa 200 slot" };
  }
  const seen = new Set<string>();
  const value: SlotInput[] = [];
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i] as Record<string, unknown>;
    const slotId = typeof s.slotId === "string" ? s.slotId.trim() : "";
    const slotType = typeof s.slotType === "string" ? s.slotType.trim() : "";
    const x = typeof s.x === "number" ? s.x : Number(s.x);
    const y = typeof s.y === "number" ? s.y : Number(s.y);
    const radius = typeof s.radius === "number" ? s.radius : Number(s.radius);
    if (!slotId || slotId.length > 64) {
      return { ok: false, error: `slots[${i}].slotId không hợp lệ` };
    }
    if (seen.has(slotId)) {
      return { ok: false, error: `slots[${i}].slotId bị trùng: ${slotId}` };
    }
    seen.add(slotId);
    if (!slotType || slotType.length > 32) {
      return { ok: false, error: `slots[${i}].slotType không hợp lệ` };
    }
    // Tọa độ chuẩn hóa 0–1 theo bounding-box cây (KHÔNG lưu pixel màn hình).
    if (!Number.isFinite(x) || x < 0 || x > 1) {
      return { ok: false, error: `slots[${i}].x phải trong khoảng 0–1` };
    }
    if (!Number.isFinite(y) || y < 0 || y > 1) {
      return { ok: false, error: `slots[${i}].y phải trong khoảng 0–1` };
    }
    if (!Number.isFinite(radius) || radius <= 0 || radius > 1) {
      return { ok: false, error: `slots[${i}].radius phải trong khoảng (0, 1]` };
    }
    const z = s.z === undefined ? 0 : Number(s.z);
    if (!Number.isFinite(z) || z < 0 || z > 10000) {
      return { ok: false, error: `slots[${i}].z không hợp lệ` };
    }
    const allowed = Array.isArray(s.allowedAccessoryTypes)
      ? (s.allowedAccessoryTypes as unknown[]).map(String)
      : [];
    // `depth` / `scaleHint` là field OPTIONAL. Giá trị sai ⇒ BỎ QUA field
    // (không reject request) để admin có thể sửa từng lần mà không bị chặn.
    const depth = normalizeDepth(s.depth);
    const scaleHint = normalizeScaleHint(s.scaleHint);
    value.push({
      slotId,
      slotType,
      x,
      y,
      radius,
      z,
      allowedAccessoryTypes: allowed,
      depth,
      scaleHint,
    });
  }
  return { ok: true, value };
}

export async function publishSlotMap(
  variantId: string,
  slots: SlotInput[]
): Promise<SlotMapResponse> {
  const latest = await SlotMap.findOne({ variantId }).sort({ version: -1 });
  const nextVersion = latest ? latest.version + 1 : 1;
  await SlotMap.updateMany({ variantId }, { $set: { isPublished: false } });
  const doc = await SlotMap.create({
    variantId: new Types.ObjectId(variantId),
    version: nextVersion,
    isPublished: true,
    slots,
  });
  return toSlotMapResponse(doc.toObject());
}

// ── Design configuration ─────────────────────────────────────────────────────
// 1 slot = 1 accessory instance (không có qty trong slot). Số lượng 1 phụ kiện
// = số slot đang dùng nó. Tọa độ x/y chuẩn hóa 0–1 theo bounding-box cây.

export interface PlacementInput {
  slotId: string;
  accessoryId: string;
  x: number;
  y: number;
  rotation?: number;
  scale?: number;
  /**
   * Snapshot lớp chiều sâu. `undefined` ⇒ lấy `depth` của slot hiện tại.
   */
  depth?: SlotDepth;
}

export interface ValidatedPlacement extends PlacementInput {
  accessorySku: string;
  accessoryName: string;
  unitPrice: number | null;
}

export async function validatePlacements(
  variantId: string,
  placements: unknown,
  placementMode: "slots" | "free" = "slots",
  previousPlacements: ReadonlyArray<PlacementInput> = [],
): Promise<{
  ok: boolean;
  errorCode?: string;
  error?: string;
  value?: ValidatedPlacement[];
  slotMapVersion?: number;
}> {
  if (!Array.isArray(placements)) {
    return { ok: false, errorCode: "INVALID_INPUT", error: "placements phải là mảng" };
  }
  if (placements.length > 200) {
    return { ok: false, errorCode: "INVALID_INPUT", error: "placements tối đa 200 slot" };
  }
  const variant = await Tree.findById(variantId).lean();
  if (!variant || !variant.isActive) {
    return { ok: false, errorCode: "TREE_NOT_FOUND", error: "Cây không còn khả dụng" };
  }
  if (placementMode === "free" && (variant.customizationMode !== "free" || !variant.customizationCatalog)) {
    return { ok: false, errorCode: "INVALID_INPUT", error: "Cây này chưa hỗ trợ bố trí tự do" };
  }
  const slotMap = placementMode === "slots" ? await SlotMap.findOne({
    variantId: new Types.ObjectId(variantId),
    isPublished: true,
  }).lean() : null;
  if (placementMode === "slots" && !slotMap) {
    return {
      ok: false,
      errorCode: "SLOTMAP_NOT_FOUND",
      error: "Biến thể này chưa có bảng slot tùy chỉnh",
    };
  }
  const slotById = new Map((slotMap?.slots ?? []).map((s: any) => [String(s.slotId), s]));
  const seen = new Set<string>();
  const value: ValidatedPlacement[] = [];
  const previousById = new Map(previousPlacements.map(p => [p.slotId, p]));
  const occupied: Array<{ position3d: ScenePosition; mounting: Mounting; kind: string; scale: number; rotation: number; unchanged: boolean }> = [];
  const accessoryIds = [...new Set(placements.flatMap(p => typeof p?.accessoryId === "string" && Types.ObjectId.isValid(p.accessoryId.trim()) ? [p.accessoryId.trim().toLowerCase()] : []))];
  const accessories = await Accessory.find({ _id: { $in: accessoryIds } }).lean();
  const accessoryById = new Map(accessories.map(accessory => [String(accessory._id), accessory]));
  for (let i = 0; i < placements.length; i++) {
    if (!placements[i] || typeof placements[i] !== "object" || Array.isArray(placements[i])) {
      return { ok: false, errorCode: "INVALID_INPUT", error: `placements[${i}] không hợp lệ` };
    }
    const p = placements[i] as Record<string, unknown>;
    const slotId = typeof p.slotId === "string" ? p.slotId.trim() : "";
    const accessoryId = typeof p.accessoryId === "string" ? p.accessoryId.trim() : "";
    if (!slotId || slotId.length > 64) {
      return { ok: false, errorCode: "SLOT_NOT_FOUND", error: `placements[${i}].slotId không hợp lệ` };
    }
    if (seen.has(slotId)) {
      return { ok: false, errorCode: "SLOT_OCCUPIED", error: `Slot ${slotId} đã được dùng (1 slot = 1 phụ kiện)` };
    }
    const slot = slotById.get(slotId) as any;
    if (!slot && placementMode === "slots") {
      return { ok: false, errorCode: "SLOT_NOT_FOUND", error: `Slot ${slotId} không thuộc bảng slot hiện hành` };
    }
    seen.add(slotId);
    if (!Types.ObjectId.isValid(accessoryId)) {
      return { ok: false, errorCode: "ACCESSORY_NOT_FOUND", error: `placements[${i}].accessoryId không hợp lệ` };
    }
    const accessory = accessoryById.get(accessoryId.toLowerCase());
    if (!accessory || !accessory.isActive) {
      return { ok: false, errorCode: "ACCESSORY_UNAVAILABLE", error: `Phụ kiện tại slot ${slotId} đã ngừng bán` };
    }
    if (placementMode === "free" && accessory.catalogKey !== variant.customizationCatalog) {
      return { ok: false, errorCode: "ACCESSORY_UNAVAILABLE", error: "Phụ kiện không thuộc danh mục của cây này" };
    }
    // Tương thích loại slot:
    //   - Nếu slot có `allowedAccessoryTypes` (whitelist do admin cấu hình) thì
    //     phụ kiện PHẢI nằm trong whitelist đó.
    //   - Nếu slot KHÔNG có whitelist (mảng rỗng) thì fallback theo loại:
    //     accessory.slotTypes phải chứa slot.slotType (hoặc "generic").
    //
    // LƯU Ý: logic cũ đảo ngược — `allowed.length === 0` lại cho `explicitlyAllowed
    // = true`, tức là slot KHÔNG whitelist lại chấp nhận MỌI phụ kiện, và
    // whitelist lại bị bỏ qua khi phụ kiện cũng khớp slotType. Sai cả 2 chiều.
    const slotType = String(slot?.slotType || "generic");
    const allowed: string[] = Array.isArray(slot?.allowedAccessoryTypes)
      ? slot.allowedAccessoryTypes.map(String)
      : [];
    const accSlotTypes: string[] = Array.isArray((accessory as any).slotTypes)
      ? (accessory as any).slotTypes.map(String)
      : [];
    const typeCompatible =
      accSlotTypes.includes(slotType) || accSlotTypes.includes("generic");

    if (allowed.length > 0) {
      const explicitlyAllowed =
        allowed.includes(accessory.sku) ||
        allowed.includes(String(accessory._id)) ||
        allowed.some((a) => accSlotTypes.includes(a));
      if (!explicitlyAllowed) {
        return {
          ok: false,
          errorCode: "ACCESSORY_UNAVAILABLE",
          error: `Phụ kiện ${accessory.name} không được phép gắn vào slot ${slotId}`,
        };
      }
    } else if (placementMode === "slots" && !typeCompatible) {
      return {
        ok: false,
        errorCode: "ACCESSORY_UNAVAILABLE",
        error: `Phụ kiện ${accessory.name} không gắn được vào slot ${slotId} (loại ${slotType})`,
      };
    }
    const x = typeof p.x === "number" ? p.x : Number(p.x);
    const y = typeof p.y === "number" ? p.y : Number(p.y);
    if (!Number.isFinite(x) || x < 0 || x > 1 || !Number.isFinite(y) || y < 0 || y > 1) {
      return { ok: false, errorCode: "INVALID_INPUT", error: `placements[${i}].x/y phải trong khoảng 0–1` };
    }
    const rotation = p.rotation === undefined ? 0 : Number(p.rotation);
    const scale = p.scale === undefined ? 1 : Number(p.scale);
    if (!Number.isFinite(rotation) || !Number.isFinite(scale) || scale <= 0 || scale > 10) {
      return { ok: false, errorCode: "INVALID_INPUT", error: `placements[${i}].rotation/scale không hợp lệ` };
    }
    // Snapshot lớp chiều sâu: ưu tiên giá trị FE gửi kèm, nếu không có thì
    // lấy `depth` hiện tại của slot. Giá trị sai ⇒ bỏ qua (fallback slot).
    const depth = normalizeDepth(p.depth ?? slot.depth);
    value.push({
      slotId,
      accessoryId: String(accessory._id),
      x,
      y,
      rotation,
      scale,
      depth,
      accessorySku: accessory.sku,
      accessoryName: accessory.name,
      unitPrice: accessory.unitPrice,
      ...(position3d ? { position3d, mounting: accessory.mounting || "tree" } : {}),
    });
  }
  return { ok: true, value, slotMapVersion: slotMap?.version ?? 0 };
}

// ── Public catalog phụ kiện cho Tree Customizer ──────────────────────────────
// Endpoint `GET /api/design-accessories` trả collection phụ kiện riêng cho
// Customizer: phụ kiện THIẾT KẾ (không phải hàng hóa thương mại) ⇒ không có
// tồn kho, giá tính theo từng slot.
//
// FE tự chuẩn hoá qua `normalizeDesignAccessory()`:
//   code            ↔ sku            (mã phụ kiện)
//   decorationPrice ↔ unitPrice      (giá cho 1 slot)
//   image           ↔ image          (PNG alpha được KÉO lên cây)

export interface DesignAccessoryDto {
  _id: string;
  code: string;
  name: string;
  description: string;
  image: string;
  previewImage: string;
  decorationPrice: number;
  slotTypes: string[];
  isActive: boolean;
  sortOrder: number;
  /** Metadata 3D (optional — FE tự fallback khi thiếu). */
  model3dUrl: string;
  model3dScale: number;
  model3dRotation: number;
  /** Metadata ghép ảnh (optional — FE tự fallback khi thiếu). */
  anchor: { x: number; y: number };
  shadow: AccessoryShadow;
  defaultScale: number;
}

export async function listDesignAccessories(
  slotType?: string
): Promise<DesignAccessoryDto[]> {
  const accessories = await listAccessories(
    slotType ? { slotType } : { onlyActive: true }
  );
  return accessories.map((a) => ({
    _id: a._id,
    code: a.sku,
    name: a.name,
    description: a.description,
    image: a.image,
    previewImage: a.previewImage,
    decorationPrice: a.unitPrice,
    slotTypes: a.slotTypes,
    isActive: a.isActive,
    sortOrder: a.sortOrder,
    model3dUrl: a.model3dUrl,
    model3dScale: a.model3dScale,
    model3dRotation: a.model3dRotation,
    anchor: a.anchor,
    shadow: a.shadow,
    defaultScale: a.defaultScale,
  }));
}

// ── Tree variant: foregroundMask (lớp 4 — cành trước cảnh) ─────────────────// Ảnh CÀNH TIỀN CẢNH (PNG alpha) phủ lên phụ kiện `depth: 'behind'`.
// Phải CÙNG pixel size với `bareImage`. Thiếu ⇒ không có lớp 4 ⇒ hành vi cũ.
//
// ⚠️ KHÔNG áp transformation `e_background_removal` khi phục vụ ảnh này —
// đây là PNG alpha đã cắt sẵn, xử lý nền lần nữa sẽ phá hỏng alpha.

export async function getVariantForegroundMask(
  variantId: string
): Promise<string> {
  if (!Types.ObjectId.isValid(variantId)) return "";
  const variant = await Tree.findById(variantId).lean();
  return (variant as any)?.foregroundMask ?? "";
}

// ── Normalize `configuration` gửi kèm lúc tạo/sửa design ────────────────────
// FE gửi `configuration` trong body của `POST /api/designs`,
// `PATCH /api/designs/:id` và `POST /api/designs/quote`.
//
// BE KHÔNG cần validate sâu: chỉ cần lưu nguyên vẹn mảng `placements`
// (kể cả field lạ như `depth`) để bản đơn render đúng hình khách đã chọn.
//
// `depth` trong mỗi placement là SNAPSHOT lớp chiều sâu tại lúc khách gắn.
// Nếu FE không gửi ⇒ lấy `depth` hiện tại của slot trong SlotMap đang publish.

export interface NormalizedConfiguration {
  configVersion: number;
  slotMapVersion: number;
  variantSnapshot: {
    variantId: Types.ObjectId;
    sku: string;
    name: string;
    price: number;
  };
  placements: Array<{
    slotId: string;
    accessoryId: Types.ObjectId;
    x: number;
    y: number;
    rotation: number;
    scale: number;
    depth?: SlotDepth;
  }>;
}

/**
 * Chuẩn hoá `configuration` từ body. Trả `null` nếu body không có cấu hình.
 */
export async function normalizeConfiguration(
  variantId: string,
  raw: unknown
): Promise<NormalizedConfiguration | null> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const cfg = raw as Record<string, unknown>;

  // Placements: validate qua validatePlacements để chuẩn hoá & snapshot depth.
  const checked = await validatePlacements(variantId, cfg.placements);
  if (!checked.ok) {
    // Cấu hình sai ⇒ không persist (giữ hành vi cũ: design không có config).
    return null;
  }

  const variant = await Tree.findById(variantId).lean();
  const configVersion = Number(cfg.configVersion);
  const slotMapVersion = Number(cfg.slotMapVersion);

  return {
    configVersion:
      Number.isFinite(configVersion) && configVersion > 0
        ? configVersion
        : 1,
    slotMapVersion:
      Number.isFinite(slotMapVersion) && slotMapVersion >= 0
        ? slotMapVersion
        : checked.slotMapVersion ?? 0,
    variantSnapshot: {
      variantId: new Types.ObjectId(String(variantId)),
      sku: (variant as any)?.sku ?? "",
      name: (variant as any)?.name ?? "",
      price: (variant as any)?.price ?? 0,
    },
    placements: (checked.value ?? []).map((p) => ({
      slotId: p.slotId,
      accessoryId: new Types.ObjectId(p.accessoryId),
      x: p.x,
      y: p.y,
      rotation: p.rotation ?? 0,
      scale: p.scale ?? 1,
      depth: p.depth,
    })),
  };
}
