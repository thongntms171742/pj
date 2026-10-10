import { Request, Response } from "express";
import { Style } from "../../models/Style";
import { sendError, ErrorCode } from "../../utils/errors";
import { ah } from "../../utils/asyncRoute";
import { ok, created } from "../../utils/respond";
import { V, requireField } from "../../utils/validation";

// ── Styles CRUD ──────────────────────────────────────────────────────────────

export const listStyles = ah(async (_req, res) => {
  const styles = await Style.find({}).sort({ sortOrder: 1 }).lean();
  ok(res, { styles });
});

export const createStyle = ah(async (req, res) => {
  const code = requireField(res, req.body?.code, V.string(40), "code");
  if (!code) return;
  const name = requireField(res, req.body?.name, V.string(200), "name");
  if (!name) return;
  const style = await Style.create({ ...req.body, code, name });
  created(res, { style });
});

export const updateStyle = ah(async (req, res) => {
  const { id } = req.params;
  const style = await Style.findByIdAndUpdate(id, req.body, { new: true });
  if (!style) {
    sendError(res, ErrorCode.STYLE_NOT_FOUND, "Không tìm thấy style");
    return;
  }
  ok(res, { style });
});
