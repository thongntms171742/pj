import { Request, Response } from "express";
import { Accessory } from "../../models/Accessory";
import { sendError, ErrorCode } from "../../utils/errors";
import { ah } from "../../utils/asyncRoute";
import { ok, created } from "../../utils/respond";

// ── Accessories CRUD ─────────────────────────────────────────────────────────

export const listAccessories = ah(async (_req, res) => {
  const accs = await Accessory.find({}).sort({ sortOrder: 1, name: 1 }).lean();
  ok(res, { accessories: accs });
});

export const createAccessory = ah(async (req, res) => {
  const body = req.body as Record<string, unknown>;
  if (!body.group || !body.type || !body.name || body.price == null) {
    sendError(
      res,
      ErrorCode.MISSING_FIELD,
      "Thiếu group, type, name hoặc price"
    );
    return;
  }
  const acc = await Accessory.create(body as any);
  created(res, { accessory: acc });
});

export const updateAccessory = ah(async (req, res) => {
  const { id } = req.params;
  const acc = await Accessory.findByIdAndUpdate(id, req.body, { new: true });
  if (!acc) {
    sendError(res, ErrorCode.ACCESSORY_NOT_FOUND, "Không tìm thấy phụ kiện");
    return;
  }
  ok(res, { accessory: acc });
});
