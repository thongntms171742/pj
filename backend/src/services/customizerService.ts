import { Types } from "mongoose";
import { Accessory } from "../models/Accessory";
import { SlotMap, type ISlotMap } from "../models/SlotMap";
import { Tree } from "../models/Tree";

// ── Customizer service (Phase 1: Catalog phụ kiện + SlotMap) ────────────────
// Mọi hàm ở đây là pure DB access, không dính Express. Controller chỉ parse
// input / map lỗi. FE Customizer đọc slotMap + accessories để render canvas.

export interface AccessoryFilter {
  slotType?: string;
  onlyActive?: boolean;
}

export interface AccessoryLean {
  _id: string;
  sku: string;
  name: string;
  description: string;
  image: string;
  unitPrice: number;
  stockQuantity: number;
  slotTypes: string[];
  isActive: boolean;
  sortOrder: number;
}

export async function listAccessories(
  filter: AccessoryFilter = {}
): Promise<AccessoryLean[]> {
  const query: Record<string, unknown> = {};
  if (filter.onlyActive !== false) query.isActive = true;
  if (filter.slotType) query.slotTypes = filter.slotType;
  const docs = await Accessory.find(query)
    .sort({ sortOrder: 1, name: 1 })
    .lean();
  return docs.map((d) => ({
    _id: String(d._id),
    sku: d.sku,
    name: d.name,
    description: d.description ?? "",
    image: d.image ?? "",
    unitPrice: d.unitPrice,
    stockQuantity: d.stockQuantity,
    slotTypes: d.slotTypes ?? [],
    isActive: d.isActive,
    sortOrder: d.sortOrder,
  }));
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
    })),
  };
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
    value.push({
      slotId,
      slotType,
      x,
      y,
      radius,
      z,
      allowedAccessoryTypes: allowed,
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
}

export interface ValidatedPlacement extends PlacementInput {
  accessorySku: string;
  accessoryName: string;
  unitPrice: number;
}

export async function validatePlacements(
  variantId: string,
  placements: unknown
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
  const slotMap = await SlotMap.findOne({
    variantId: new Types.ObjectId(variantId),
    isPublished: true,
  }).lean();
  if (!slotMap) {
    return {
      ok: false,
      errorCode: "SLOTMAP_NOT_FOUND",
      error: "Biến thể này chưa có bảng slot tùy chỉnh",
    };
  }
  const slotById = new Map((slotMap.slots ?? []).map((s: any) => [String(s.slotId), s]));
  const seen = new Set<string>();
  const value: ValidatedPlacement[] = [];
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i] as Record<string, unknown>;
    const slotId = typeof p.slotId === "string" ? p.slotId.trim() : "";
    const accessoryId = typeof p.accessoryId === "string" ? p.accessoryId.trim() : "";
    if (!slotId) {
      return { ok: false, errorCode: "SLOT_NOT_FOUND", error: `placements[${i}].slotId không hợp lệ` };
    }
    if (seen.has(slotId)) {
      return { ok: false, errorCode: "SLOT_OCCUPIED", error: `Slot ${slotId} đã được dùng (1 slot = 1 phụ kiện)` };
    }
    const slot = slotById.get(slotId) as any;
    if (!slot) {
      return { ok: false, errorCode: "SLOT_NOT_FOUND", error: `Slot ${slotId} không thuộc bảng slot hiện hành` };
    }
    seen.add(slotId);
    if (!Types.ObjectId.isValid(accessoryId)) {
      return { ok: false, errorCode: "ACCESSORY_NOT_FOUND", error: `placements[${i}].accessoryId không hợp lệ` };
    }
    const accessory = await Accessory.findById(accessoryId).lean();
    if (!accessory || !accessory.isActive) {
      return { ok: false, errorCode: "ACCESSORY_UNAVAILABLE", error: `Phụ kiện tại slot ${slotId} đã ngừng bán` };
    }
    // Tương thích loại slot: accessory.slotTypes phải chứa slot.slotType,
    // trừ khi slot.allowedAccessoryTypes liệt kê rõ sku/_id của phụ kiện.
    const slotType = String(slot.slotType);
    const allowed: string[] = Array.isArray(slot.allowedAccessoryTypes)
      ? slot.allowedAccessoryTypes.map(String)
      : [];
    const accSlotTypes: string[] = Array.isArray((accessory as any).slotTypes)
      ? (accessory as any).slotTypes.map(String)
      : [];
    const explicitlyAllowed =
      allowed.length === 0 ||
      allowed.includes(accessory.sku) ||
      allowed.includes(String(accessory._id)) ||
      allowed.some((a) => accSlotTypes.includes(a));
    const typeCompatible = accSlotTypes.includes(slotType) || accSlotTypes.includes("generic");
    if (!explicitlyAllowed && !typeCompatible) {
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
    value.push({
      slotId,
      accessoryId: String(accessory._id),
      x,
      y,
      rotation,
      scale,
      accessorySku: accessory.sku,
      accessoryName: accessory.name,
      unitPrice: accessory.unitPrice,
    });
  }
  return { ok: true, value, slotMapVersion: slotMap.version };
}
