import { Request, Response } from "express";
import { Tree, TreeCode, TreeProduct } from "../../models";
import { sendError, ErrorCode } from "../../utils/errors";
import { ah } from "../../utils/asyncRoute";
import { ok, created } from "../../utils/respond";
import { V, requireField } from "../../utils/validation";

// ── Tree Variants (size × code SKU) ──────────────────────────────────────────

export const createTreeVariant = ah(async (req, res) => {
  const { codeId } = req.params;
  const treeCode = await TreeCode.findById(codeId);
  if (!treeCode) {
    sendError(res, ErrorCode.TREE_NOT_FOUND, "Không tìm thấy mã cây");
    return;
  }
  const product = await TreeProduct.findById(treeCode.productId);
  if (!product) {
    sendError(res, ErrorCode.TREE_NOT_FOUND, "Không tìm thấy sản phẩm cha");
    return;
  }
  const body = req.body as Record<string, unknown>;
  const size = (typeof body.size === "string" && body.size.trim()) || "STANDARD";
  let sku =
    (typeof body.sku === "string" && body.sku.trim().toUpperCase()) ||
    `${treeCode.code}-${size}`.toUpperCase();
  if (await Tree.exists({ sku })) {
    sku = `${sku}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  }
  if (typeof body.price !== "number" || body.price < 0) {
    sendError(res, ErrorCode.INVALID_INPUT, "Giá phải là số >= 0");
    return;
  }
  if (typeof body.stockQuantity !== "number" || body.stockQuantity < 0) {
    sendError(res, ErrorCode.INVALID_INPUT, "Tồn kho phải là số >= 0");
    return;
  }
  try {
    const variant = await Tree.create({
      productId: product._id,
      codeId: treeCode._id,
      size,
      sku,
      name: `${product.name} — ${treeCode.name} — ${size}`,
      heightCmMin: (body.heightCmMin as number) ?? 0,
      heightCmMax: (body.heightCmMax as number) ?? 0,
      diameterCm: (body.diameterCm as number) ?? 0,
      description: (body.description as string) ?? product.description,
      bareImage: (body.bareImage as string) ?? "",
      images: Array.isArray(body.images) ? (body.images as string[]) : [],
      price: body.price,
      stockQuantity: body.stockQuantity,
      isActive: (body.isActive as boolean) ?? true,
      sortOrder: (body.sortOrder as number) ?? 0,
    });
    created(res, { variant });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      sendError(
        res,
        ErrorCode.ACCESSORY_DUPLICATED,
        "SKU đã tồn tại hoặc (mã, size) đã tồn tại"
      );
      return;
    }
    throw err;
  }
});

export const updateTreeVariant = ah(async (req, res) => {
  const { variantId } = req.params;
  const variant = await Tree.findById(variantId);
  if (!variant) {
    sendError(res, ErrorCode.TREE_NOT_FOUND, "Không tìm thấy biến thể");
    return;
  }
  const body = req.body as Record<string, unknown>;
  try {
    if (typeof body.size === "string") variant.size = body.size.trim();
    if (typeof body.sku === "string")
      variant.sku = body.sku.trim().toUpperCase();
    if (typeof body.heightCmMin === "number")
      variant.heightCmMin = body.heightCmMin;
    if (typeof body.heightCmMax === "number")
      variant.heightCmMax = body.heightCmMax;
    if (typeof body.diameterCm === "number")
      variant.diameterCm = body.diameterCm;
    if (typeof body.description === "string")
      variant.description = body.description;
    if (typeof body.bareImage === "string")
      variant.bareImage = body.bareImage;
    if (Array.isArray(body.images)) variant.images = body.images as string[];
    if (typeof body.price === "number") variant.price = body.price;
    if (typeof body.stockQuantity === "number")
      variant.stockQuantity = body.stockQuantity;
    if (typeof body.isActive === "boolean") variant.isActive = body.isActive;
    if (typeof body.sortOrder === "number")
      variant.sortOrder = body.sortOrder;
    await variant.save();
    ok(res, { variant });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      sendError(
        res,
        ErrorCode.ACCESSORY_DUPLICATED,
        "SKU đã tồn tại hoặc (mã, size) đã tồn tại"
      );
      return;
    }
    throw err;
  }
});

export const deleteTreeVariant = ah(async (req, res) => {
  const { variantId } = req.params;
  const variant = await Tree.findById(variantId);
  if (!variant) {
    sendError(res, ErrorCode.TREE_NOT_FOUND, "Không tìm thấy biến thể");
    return;
  }
  variant.isActive = false;
  variant.sku = `${variant.sku}-deleted-${Date.now()}`;
  variant.size = `${variant.size}-deleted-${Date.now()}`;
  await variant.save();
  ok(res, { success: true, variantId: String(variant._id) });
});

export const bulkUpdateTreeVariants = ah(async (req, res) => {
  const { field, value, productId, codeId } = req.body as {
    field?: string;
    value?: unknown;
    productId?: string;
    codeId?: string;
  };
  const allowed = ["price", "stockQuantity", "isActive"];
  if (!field || !allowed.includes(field)) {
    sendError(
      res,
      ErrorCode.INVALID_INPUT,
      `Field không hợp lệ: ${field}. Cho phép: ${allowed.join(", ")}`
    );
    return;
  }
  const update: Record<string, unknown> = { [field]: value };
  const query: Record<string, unknown> = {};
  if (productId) query.productId = productId;
  if (codeId) query.codeId = codeId;
  const result = await Tree.updateMany(query, update);
  ok(res, { matched: result.matchedCount, modified: result.modifiedCount });
});
