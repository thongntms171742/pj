import { Request, Response } from "express";
import { Category, TreeProduct, Tree } from "../../models";
import { sendError, ErrorCode } from "../../utils/errors";
import { ah } from "../../utils/asyncRoute";
import { ok, created } from "../../utils/respond";
import { V, requireField } from "../../utils/validation";

// ── Categories (Danh mục — Tầng 2) ──────────────────────────────────────────
// Tier 2 của cấu trúc 3 tầng: TreeProduct → Category → Tree (variant).
//
// ℹ️ Route path vẫn giữ `/tree-products/:pid/codes` và `/tree-codes/:cid`
// để không phá admin FE đang gọi. Chỉ đổi tên model/biến nội bộ sang
// Category. Field `code` trong DB giữ nguyên (mã danh mục) để không mất dữ liệu.
// Xem models/Category.ts.

export const createCategory = ah(async (req, res) => {
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
    const category = await Category.create({
      productId: product._id,
      code,
      name,
      description: req.body.description ?? "",
      image: req.body.image ?? "",
      material: req.body.material ?? "",
      isActive: req.body.isActive ?? true,
      sortOrder: req.body.sortOrder ?? 0,
    });
    created(res, { category });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      sendError(
        res,
        ErrorCode.ACCESSORY_DUPLICATED,
        "Mã danh mục đã tồn tại trong sản phẩm này"
      );
      return;
    }
    throw err;
  }
});

export const updateCategory = ah(async (req, res) => {
  const { codeId } = req.params;
  const category = await Category.findById(codeId);
  if (!category) {
    sendError(res, ErrorCode.TREE_NOT_FOUND, "Không tìm thấy danh mục");
    return;
  }
  const body = req.body as Record<string, unknown>;
  try {
    if (typeof body.code === "string") category.code = String(body.code).trim();
    if (typeof body.name === "string") category.name = String(body.name).trim();
    if (typeof body.description === "string")
      category.description = body.description;
    if (typeof body.image === "string") category.image = body.image;
    if (typeof body.material === "string") category.material = body.material;
    if (typeof body.isActive === "boolean") category.isActive = body.isActive;
    if (typeof body.sortOrder === "number") category.sortOrder = body.sortOrder;
    await category.save();
    ok(res, { category });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      sendError(
        res,
        ErrorCode.ACCESSORY_DUPLICATED,
        "Mã danh mục đã tồn tại trong sản phẩm này"
      );
      return;
    }
    throw err;
  }
});

export const deleteCategory = ah(async (req, res) => {
  const { codeId } = req.params;
  const category = await Category.findById(codeId);
  if (!category) {
    sendError(res, ErrorCode.TREE_NOT_FOUND, "Không tìm thấy danh mục");
    return;
  }
  category.isActive = false;
  category.code = `${category.code}-deleted-${Date.now()}`;
  await category.save();
  // Cascade-deactivate child variants (soft delete — keep refs for orders).
  await Tree.updateMany({ codeId }, { isActive: false });
  ok(res, { success: true, codeId: String(category._id) });
});