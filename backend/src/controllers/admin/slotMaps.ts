import { Types } from "mongoose";
import { Tree, SlotMap } from "../../models";
import { sendError, ErrorCode } from "../../utils/errors";
import { ah } from "../../utils/asyncRoute";
import { ok, created } from "../../utils/respond";
import { validateSlots, publishSlotMap } from "../../services/customizerService";

// ── Admin: SlotMap (Phase 1 Customizer) ──────────────────────────────────────
// Mỗi variant có nhiều bản slotMap, mỗi lần publish tăng version.
// Không xóa bản cũ để Design/Cart/Order đối chiếu version.

export const listSlotMapsAdmin = ah(async (req, res) => {
  const { variantId } = req.params;
  if (!Types.ObjectId.isValid(String(variantId))) {
    sendError(res, ErrorCode.TREE_NOT_FOUND, "Không tìm thấy biến thể");
    return;
  }
  const variant = await Tree.findById(variantId).lean();
  if (!variant) {
    sendError(res, ErrorCode.TREE_NOT_FOUND, "Không tìm thấy biến thể");
    return;
  }
  const docs = await SlotMap.find({ variantId }).sort({ version: -1 }).lean();
  ok(res, {
    variantId: String(variantId),
    slotMaps: docs.map((d: any) => ({
      _id: String(d._id),
      variantId: String(d.variantId),
      version: d.version,
      isPublished: d.isPublished,
      slots: d.slots,
      createdAt: d.createdAt,
    })),
  });
});

export const publishSlotMapAdmin = ah(async (req, res) => {
  const { variantId } = req.params;
  if (!Types.ObjectId.isValid(String(variantId))) {
    sendError(res, ErrorCode.TREE_NOT_FOUND, "Không tìm thấy biến thể");
    return;
  }
  const variant = await Tree.findById(variantId).lean();
  if (!variant) {
    sendError(res, ErrorCode.TREE_NOT_FOUND, "Không tìm thấy biến thể");
    return;
  }
  const { slots } = req.body as { slots?: unknown };
  const checked = validateSlots(slots);
  if (!checked.ok) {
    sendError(res, ErrorCode.INVALID_INPUT, checked.error || "slots không hợp lệ");
    return;
  }
  const result = await publishSlotMap(String(variantId), checked.value!);
  created(res, { slotMap: result });
});
