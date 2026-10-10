import { Request, Response } from "express";
import { TreeCode, TreeProduct } from "../../models";
import { sendError, ErrorCode } from "../../utils/errors";
import { ah } from "../../utils/asyncRoute";
import { ok, created } from "../../utils/respond";
import { V, requireField } from "../../utils/validation";

// ── Tree Codes (Mã cây — Phân loại 1) ───────────────────────────────────────

export const createTreeCode = ah(async (req, res) => {
  const { productId } = req.params;
  const product = await TreeProduct.findById(productId);
  if (!product) {
    sendError(res, ErrorCode.TREE_NOT_FOUND, "Không tìm thấy tree product");
    return;
  }
  const code = requireField(res, req.body?.code, V.string(40), "code");
  if (!code) return;
  const name = requireField(res, req.body?.name, V.string(200), "name");
  if (!name) return;
  try {
    const treeCode = await TreeCode.create({
      productId: product._id,
      code,
      name,
      description: req.body.description ?? "",
      image: req.body.image ?? "",
      material: req.body.material ?? "",
      isActive: req.body.isActive ?? true,
      sortOrder: req.body.sortOrder ?? 0,
    });
    created(res, { treeCode });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      sendError(
        res,
        ErrorCode.ACCESSORY_DUPLICATED,
        "Mã cây đã tồn tại trong sản phẩm này"
      );
      return;
    }
    throw err;
  }
});

export const updateTreeCode = ah(async (req, res) => {
  const { codeId } = req.params;
  const treeCode = await TreeCode.findById(codeId);
  if (!treeCode) {
    sendError(res, ErrorCode.TREE_NOT_FOUND, "Không tìm thấy mã cây");
    return;
  }
  const body = req.body as Record<string, unknown>;
  try {
    if (typeof body.code === "string") treeCode.code = String(body.code).trim();
    if (typeof body.name === "string") treeCode.name = String(body.name).trim();
    if (typeof body.description === "string") treeCode.description = body.description;
    if (typeof body.image === "string") treeCode.image = body.image;
    if (typeof body.material === "string") treeCode.material = body.material;
    if (typeof body.isActive === "boolean") treeCode.isActive = body.isActive;
    if (typeof body.sortOrder === "number") treeCode.sortOrder = body.sortOrder;
    await treeCode.save();
    ok(res, { treeCode });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      sendError(
        res,
        ErrorCode.ACCESSORY_DUPLICATED,
        "Mã cây đã tồn tại trong sản phẩm này"
      );
      return;
    }
    throw err;
  }
});

export const deleteTreeCode = ah(async (req, res) => {
  const { codeId } = req.params;
  const treeCode = await TreeCode.findById(codeId);
  if (!treeCode) {
    sendError(res, ErrorCode.TREE_NOT_FOUND, "Không tìm thấy mã cây");
    return;
  }
  treeCode.isActive = false;
  treeCode.code = `${treeCode.code}-deleted-${Date.now()}`;
  await treeCode.save();
  // Cascade-deactivate child variants.
  const { Tree } = await import("../../models");
  await Tree.updateMany({ codeId }, { isActive: false });
  ok(res, { success: true, codeId: String(treeCode._id) });
});
