import { Types } from "mongoose";
import { Accessory, ACCESSORY_SLOT_TYPES } from "../../models";
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
    const doc = await Accessory.create({
      sku,
      name,
      description: typeof body.description === "string" ? body.description : "",
      image: typeof body.image === "string" ? body.image : "",
      unitPrice,
      stockQuantity,
      slotTypes: effective,
      isActive: typeof body.isActive === "boolean" ? body.isActive : true,
      sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : 0,
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
    if (body.unitPrice !== undefined) {
      const v = Number(body.unitPrice);
      if (body.unitPrice === null || !Number.isSafeInteger(v) || v < 0) {
        sendError(res, ErrorCode.INVALID_INPUT, "`unitPrice` phải là số >= 0");
        return;
      }
      doc.unitPrice = v;
    }
    if (body.priceStatus !== undefined) {
      if (!["confirmed", "requires_confirmation"].includes(String(body.priceStatus))) {
        sendError(res, ErrorCode.INVALID_INPUT, "Trạng thái xác nhận giá không hợp lệ");
        return;
      }
      if (body.priceStatus === "confirmed" && doc.unitPrice === null) {
        sendError(res, ErrorCode.INVALID_INPUT, "Nhập đơn giá chính xác trước khi xác nhận");
        return;
      }
      doc.priceStatus = body.priceStatus as "confirmed" | "requires_confirmation";
      if (doc.priceStatus === "requires_confirmation") doc.unitPrice = null;
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
