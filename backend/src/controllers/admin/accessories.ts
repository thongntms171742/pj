import { Types } from "mongoose";
import {
  Accessory,
  ACCESSORY_SLOT_TYPES,
  ACCESSORY_SHADOW_TYPES,
} from "../../models";
import type { AccessoryShadow } from "../../models/Accessory";
import { sendError, ErrorCode } from "../../utils/errors";
import { ah } from "../../utils/asyncRoute";
import { ok, created } from "../../utils/respond";

// ── Admin: Accessories (Phase 1 Customizer) ──────────────────────────────────
// CRUD mặt hàng tồn kho độc lập. FE Customizer đọc qua /api/catalog/accessories.

export const listAccessoriesAdmin = ah(async (req, res) => {
  const includeInactive = String(req.query.includeInactive ?? "") === "true";
  const query: Record<string, unknown> = {};
  if (!includeInactive) query.isActive = true;
  const docs = await Accessory.find(query).sort({ sortOrder: 1, name: 1 }).lean();
  ok(res, {
    accessories: docs.map((d) => ({ ...d, _id: String((d as any)._id) })),
  });
});

function parseSlotTypes(raw: unknown): string[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const vals = (raw as unknown[]).map((v) => String(v).trim()).filter(Boolean);
  return vals;
}

/**
 * Parse điểm neo (anchor) — toạ độ chuẩn hoá 0–1 trong bbox của ảnh `image`.
 *
 * ⚠️ `anchor` đo trên `image`, KHÔNG phải `previewImage`. Nếu 2 ảnh khác tỉ
 * lệ ⇒ neo sẽ lệch.
 *
 * @returns `undefined` = field không có trong body (giữ nguyên giá trị cũ)
 *          `null` = giá trị sai ⇒ báo lỗi
 */
function parseAnchor(
  raw: unknown
): { x: number; y: number } | undefined | null {
  if (raw === undefined) return undefined;
  if (raw === null) return { x: 0.5, y: 0.5 };
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const a = raw as { x?: unknown; y?: unknown };
  const x = Number(a.x);
  const y = Number(a.y);
  if (!Number.isFinite(x) || x < 0 || x > 1) return null;
  if (!Number.isFinite(y) || y < 0 || y > 1) return null;
  return { x, y };
}

/**
 * Parse kiểu bóng. Giá trị không hợp lệ ⇒ `null` (báo lỗi).
 */
function parseShadow(raw: unknown): AccessoryShadow | undefined | null {
  if (raw === undefined) return undefined;
  const s = String(raw);
  if (!(ACCESSORY_SHADOW_TYPES as readonly string[]).includes(s)) return null;
  return s as AccessoryShadow;
}

/**
 * Parse scale mặc định (0.3–3).
 */
function parseDefaultScale(raw: unknown): number | undefined | null {
  if (raw === undefined) return undefined;
  const v = Number(raw);
  if (!Number.isFinite(v) || v < 0.3 || v > 3) return null;
  return v;
}

/**
 * Parse metadata 3D (optional). Chỉ Admin dùng ở phase hiện tại.
 */
function parseModel3dUrl(raw: unknown): string | undefined | null {
  if (raw === undefined) return undefined;
  if (raw === null) return "";
  if (typeof raw !== "string") return null;
  return raw.trim();
}

function parseModel3dNumber(
  raw: unknown
): number | undefined | null {
  if (raw === undefined) return undefined;
  const v = Number(raw);
  if (!Number.isFinite(v)) return null;
  return v;
}

export const createAccessoryAdmin = ah(async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 200) {
    sendError(res, ErrorCode.MISSING_FIELD, "Thiếu hoặc sai `name` (1–200 ký tự)");
    return;
  }
  const sku = typeof body.sku === "string" ? body.sku.trim().toUpperCase() : "";
  if (!sku || sku.length > 64) {
    sendError(res, ErrorCode.MISSING_FIELD, "Thiếu hoặc sai `sku`");
    return;
  }
  const unitPrice = Number(body.unitPrice);
  const stockQuantity = Number(body.stockQuantity ?? 0);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    sendError(res, ErrorCode.INVALID_INPUT, "`unitPrice` phải là số >= 0");
    return;
  }
  if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
    sendError(res, ErrorCode.INVALID_INPUT, "`stockQuantity` phải là số nguyên >= 0");
    return;
  }
  const slotTypes = parseSlotTypes(body.slotTypes);
  if (slotTypes === null) {
    sendError(res, ErrorCode.INVALID_INPUT, "`slotTypes` phải là mảng chuỗi");
    return;
  }
  const effective = slotTypes.length > 0 ? slotTypes : ["generic"];
  const invalid = effective.filter(
    (t) => !(ACCESSORY_SLOT_TYPES as readonly string[]).includes(t)
  );
  if (invalid.length > 0) {
    sendError(res, ErrorCode.INVALID_INPUT, `slotTypes không hợp lệ: ${invalid.join(", ")}`);
    return;
  }
  try {
    const anchor = parseAnchor(body.anchor);
    if (anchor === null) {
      sendError(
        res,
        ErrorCode.INVALID_INPUT,
        "`anchor` phải là object { x, y } với x/y trong khoảng 0–1"
      );
      return;
    }
    const shadow = parseShadow(body.shadow);
    if (shadow === null) {
      sendError(
        res,
        ErrorCode.INVALID_INPUT,
        `\`shadow\` phải là: ${ACCESSORY_SHADOW_TYPES.join(", ")}`
      );
      return;
    }
    const defaultScale = parseDefaultScale(body.defaultScale);
    if (defaultScale === null) {
      sendError(res, ErrorCode.INVALID_INPUT, "`defaultScale` phải là số trong khoảng 0.3–3");
      return;
    }
    const model3dUrl = parseModel3dUrl(body.model3dUrl);
    if (model3dUrl === null) {
      sendError(res, ErrorCode.INVALID_INPUT, "`model3dUrl` phải là chuỗi");
      return;
    }
    const model3dScale = parseModel3dNumber(body.model3dScale);
    if (model3dScale === null) {
      sendError(res, ErrorCode.INVALID_INPUT, "`model3dScale` phải là số");
      return;
    }
    const model3dRotation = parseModel3dNumber(body.model3dRotation);
    if (model3dRotation === null) {
      sendError(res, ErrorCode.INVALID_INPUT, "`model3dRotation` phải là số");
      return;
    }
    const doc = await Accessory.create({
      sku,
      name,
      description: typeof body.description === "string" ? body.description : "",
      image: typeof body.image === "string" ? body.image : "",
      previewImage:
        typeof body.previewImage === "string" ? body.previewImage : "",
      model3dUrl: model3dUrl ?? "",
      model3dScale: model3dScale ?? 1,
      model3dRotation: model3dRotation ?? 0,
      unitPrice,
      stockQuantity,
      slotTypes: effective,
      isActive: typeof body.isActive === "boolean" ? body.isActive : true,
      sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : 0,
      ...(anchor ? { anchor } : {}),
      ...(shadow ? { shadow } : {}),
      ...(defaultScale !== undefined ? { defaultScale } : {}),
    });
    created(res, { accessory: doc.toObject() });
  } catch (err: any) {
    if (err?.code === 11000) {
      sendError(res, ErrorCode.CONFLICT, `SKU "${sku}" đã tồn tại`);
      return;
    }
    throw err;
  }
});

export const updateAccessoryAdmin = ah(async (req, res) => {
  const { accessoryId } = req.params;
  if (!Types.ObjectId.isValid(String(accessoryId))) {
    sendError(res, ErrorCode.ACCESSORY_NOT_FOUND, "Không tìm thấy phụ kiện");
    return;
  }
  const doc = await Accessory.findById(accessoryId);
  if (!doc) {
    sendError(res, ErrorCode.ACCESSORY_NOT_FOUND, "Không tìm thấy phụ kiện");
    return;
  }
  const body = req.body as Record<string, unknown>;
  try {
    if (typeof body.name === "string" && body.name.trim()) doc.name = body.name.trim();
    if (typeof body.description === "string") doc.description = body.description;
    if (typeof body.image === "string") doc.image = body.image;
    if (typeof body.previewImage === "string") doc.previewImage = body.previewImage;
    // ⚠️ PARTIAL UPDATE: chỉ set field CÓ MẶT trong body. FE gửi từng field
    // riêng (mỗi lần admin sửa 1 input ⇒ 1 PATCH) — nếu xoá field không có
    // trong body thì metadata của các field khác sẽ mất.
    const model3dUrl = parseModel3dUrl(body.model3dUrl);
    if (model3dUrl === null) {
      sendError(res, ErrorCode.INVALID_INPUT, "`model3dUrl` phải là chuỗi");
      return;
    }
    if (model3dUrl !== undefined) doc.model3dUrl = model3dUrl;
    const model3dScale = parseModel3dNumber(body.model3dScale);
    if (model3dScale === null) {
      sendError(res, ErrorCode.INVALID_INPUT, "`model3dScale` phải là số");
      return;
    }
    if (model3dScale !== undefined) doc.model3dScale = model3dScale;
    const model3dRotation = parseModel3dNumber(body.model3dRotation);
    if (model3dRotation === null) {
      sendError(res, ErrorCode.INVALID_INPUT, "`model3dRotation` phải là số");
      return;
    }
    if (model3dRotation !== undefined) doc.model3dRotation = model3dRotation;
    const anchor = parseAnchor(body.anchor);
    if (anchor === null) {
      sendError(
        res,
        ErrorCode.INVALID_INPUT,
        "`anchor` phải là object { x, y } với x/y trong khoảng 0–1"
      );
      return;
    }
    if (anchor !== undefined) doc.anchor = anchor;
    const shadow = parseShadow(body.shadow);
    if (shadow === null) {
      sendError(
        res,
        ErrorCode.INVALID_INPUT,
        `\`shadow\` phải là: ${ACCESSORY_SHADOW_TYPES.join(", ")}`
      );
      return;
    }
    if (shadow !== undefined) doc.shadow = shadow;
    const defaultScale = parseDefaultScale(body.defaultScale);
    if (defaultScale === null) {
      sendError(res, ErrorCode.INVALID_INPUT, "`defaultScale` phải là số trong khoảng 0.3–3");
      return;
    }
    if (defaultScale !== undefined) doc.defaultScale = defaultScale;
    if (body.unitPrice !== undefined) {
      const v = Number(body.unitPrice);
      if (!Number.isFinite(v) || v < 0) {
        sendError(res, ErrorCode.INVALID_INPUT, "`unitPrice` phải là số >= 0");
        return;
      }
      doc.unitPrice = v;
    }
    if (body.stockQuantity !== undefined) {
      const v = Number(body.stockQuantity);
      if (!Number.isInteger(v) || v < 0) {
        sendError(res, ErrorCode.INVALID_INPUT, "`stockQuantity` phải là số nguyên >= 0");
        return;
      }
      doc.stockQuantity = v;
    }
    if (body.slotTypes !== undefined) {
      const parsed = parseSlotTypes(body.slotTypes);
      if (parsed === null || parsed.length === 0) {
        sendError(res, ErrorCode.INVALID_INPUT, "`slotTypes` phải là mảng không rỗng");
        return;
      }
      doc.slotTypes = parsed;
    }
    if (typeof body.isActive === "boolean") doc.isActive = body.isActive;
    if (typeof body.sortOrder === "number") doc.sortOrder = body.sortOrder;
    await doc.save();
    ok(res, { accessory: doc.toObject() });
  } catch (err: any) {
    if (err?.code === 11000) {
      sendError(res, ErrorCode.CONFLICT, "SKU đã tồn tại");
      return;
    }
    throw err;
  }
});

export const deleteAccessoryAdmin = ah(async (req, res) => {
  const { accessoryId } = req.params;
  const doc = await Accessory.findById(accessoryId);
  if (!doc) {
    sendError(res, ErrorCode.ACCESSORY_NOT_FOUND, "Không tìm thấy phụ kiện");
    return;
  }
  // Xóa mềm: giữ snapshot lịch sử cho OrderItem.decorations.
  doc.isActive = false;
  await doc.save();
  ok(res, { success: true, accessoryId: String(doc._id) });
});
