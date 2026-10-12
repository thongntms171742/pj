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
  const normalizedSize = String(body.size || "STANDARD")
    .trim()
    .toUpperCase();

  const normalizedSku = String(
    body.sku || `${treeCode.code}-${normalizedSize}`
  )
    .trim()
    .toUpperCase();

  if (typeof body.price !== "number" || body.price < 0) {
    sendError(res, ErrorCode.INVALID_INPUT, "Giá phải là số >= 0");
    return;
  }
  if (typeof body.stockQuantity !== "number" || body.stockQuantity < 0) {
    sendError(res, ErrorCode.INVALID_INPUT, "Tồn kho phải là số >= 0");
    return;
  }

  // 1. Kiểm tra cặp mã cây + size trùng trước
  const existingVariant = await Tree.findOne({
    codeId: treeCode._id,
    size: normalizedSize,
  });

  if (existingVariant) {
    if (!existingVariant.isActive) {
      // Phương án A: Tự động kích hoạt lại variant cũ, cập nhật giá và tồn kho mới
      existingVariant.isActive = true;
      existingVariant.price = body.price as number;
      existingVariant.stockQuantity = body.stockQuantity as number;
      if (typeof body.costPrice === "number" && body.costPrice >= 0) existingVariant.costPrice = body.costPrice;
      if (typeof body.sku === "string" && body.sku.trim()) {
        existingVariant.sku = normalizedSku;
      }
      if (typeof body.heightCmMin === "number") existingVariant.heightCmMin = body.heightCmMin;
      if (typeof body.heightCmMax === "number") existingVariant.heightCmMax = body.heightCmMax;
      if (typeof body.diameterCm === "number") existingVariant.diameterCm = body.diameterCm;
      if (typeof body.description === "string") existingVariant.description = body.description;
      if (typeof body.bareImage === "string") existingVariant.bareImage = body.bareImage;
      if (Array.isArray(body.images)) existingVariant.images = body.images as string[];
      await existingVariant.save();
      created(res, { variant: existingVariant, reactivated: true });
      return;
    }
    sendError(
      res,
      ErrorCode.CONFLICT,
      `Mã cây này đã có size ${normalizedSize}`
    );
    return;
  }

  // 2. Kiểm tra SKU trùng toàn hệ thống
  const duplicateSku = await Tree.exists({
    sku: normalizedSku,
  });

  if (duplicateSku) {
    sendError(
      res,
      ErrorCode.CONFLICT,
      `SKU "${normalizedSku}" đã tồn tại`
    );
    return;
  }
  try {
    const variant = await Tree.create({
      productId: product._id,
      codeId: treeCode._id,
      size: normalizedSize,
      sku: normalizedSku,
      name: `${product.name} — ${treeCode.name} — ${normalizedSize}`,
      heightCmMin: (body.heightCmMin as number) ?? 0,
      heightCmMax: (body.heightCmMax as number) ?? 0,
      diameterCm: (body.diameterCm as number) ?? 0,
      description: (body.description as string) ?? product.description,
      bareImage: (body.bareImage as string) ?? "",
      images: Array.isArray(body.images) ? (body.images as string[]) : [],
      price: body.price,
      costPrice: typeof body.costPrice === "number" && body.costPrice >= 0 ? body.costPrice : undefined,
      stockQuantity: body.stockQuantity,
      isActive: (body.isActive as boolean) ?? true,
      sortOrder: (body.sortOrder as number) ?? 0,
    });
    created(res, { variant });
  } catch (err: any) {
    if (err?.code === 11000) {
      const keyPattern = err.keyPattern || {};
      console.error("MongoDB duplicate key in createTreeVariant:", {
        keyPattern,
        keyValue: err.keyValue,
      });

      if (keyPattern.sku) {
        sendError(res, ErrorCode.CONFLICT, "SKU đã tồn tại");
        return;
      }

      if (keyPattern.codeId && keyPattern.size) {
        sendError(res, ErrorCode.CONFLICT, "Mã cây này đã có kích thước tương ứng");
        return;
      }

      const duplicateFields = Object.keys(keyPattern).join(", ");
      sendError(
        res,
        ErrorCode.CONFLICT,
        `Dữ liệu bị trùng tại trường: ${duplicateFields || "không xác định"}`
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

  if (body.sku) {
    const normalizedSku = String(body.sku).trim().toUpperCase();
    if (normalizedSku !== variant.sku) {
      const duplicateSku = await Tree.exists({
        _id: { $ne: variant._id },
        sku: normalizedSku,
      });
      if (duplicateSku) {
        sendError(
          res,
          ErrorCode.CONFLICT,
          `SKU "${normalizedSku}" đã tồn tại`
        );
        return;
      }
      variant.sku = normalizedSku;
    }
  }

  if (body.size) {
    const normalizedSize = String(body.size).trim().toUpperCase();
    if (normalizedSize !== variant.size) {
      const duplicateVariant = await Tree.exists({
        _id: { $ne: variant._id },
        codeId: variant.codeId,
        size: normalizedSize,
      });
      if (duplicateVariant) {
        sendError(
          res,
          ErrorCode.CONFLICT,
          `Mã cây này đã có size ${normalizedSize}`
        );
        return;
      }
      variant.size = normalizedSize;
    }
  }

  try {
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
    if (body.costPrice === null) variant.costPrice = undefined;
    else if (typeof body.costPrice === "number" && body.costPrice >= 0) variant.costPrice = body.costPrice;
    else if (body.costPrice !== undefined) { sendError(res, ErrorCode.INVALID_INPUT, "Giá vốn phải là số >= 0 hoặc null"); return; }
    if (typeof body.stockQuantity === "number")
      variant.stockQuantity = body.stockQuantity;
    if (typeof body.isActive === "boolean") variant.isActive = body.isActive;
    if (typeof body.sortOrder === "number")
      variant.sortOrder = body.sortOrder;
    await variant.save();
    ok(res, { variant });
  } catch (err: any) {
    if (err?.code === 11000) {
      const keyPattern = err.keyPattern || {};
      console.error("MongoDB duplicate key in updateTreeVariant:", {
        keyPattern,
        keyValue: err.keyValue,
      });

      if (keyPattern.sku) {
        sendError(res, ErrorCode.CONFLICT, "SKU đã tồn tại");
        return;
      }

      if (keyPattern.codeId && keyPattern.size) {
        sendError(res, ErrorCode.CONFLICT, "Mã cây này đã có kích thước tương ứng");
        return;
      }

      const duplicateFields = Object.keys(keyPattern).join(", ");
      sendError(
        res,
        ErrorCode.CONFLICT,
        `Dữ liệu bị trùng tại trường: ${duplicateFields || "không xác định"}`
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
