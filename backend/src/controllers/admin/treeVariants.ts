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
  const size =
    typeof body.size === "string" && body.size.trim()
      ? body.size.trim().toUpperCase()
      : "STANDARD";
  const sku =
    typeof body.sku === "string" && body.sku.trim()
      ? body.sku.trim().toUpperCase()
      : `${treeCode.code}-${size}`.toUpperCase();

  // 1. Kiểm tra SKU trùng
  const existingSku = await Tree.findOne({ sku }).lean();
  if (existingSku) {
    sendError(
      res,
      ErrorCode.INVALID_INPUT,
      `SKU "${sku}" đã tồn tại. Vui lòng sử dụng SKU khác.`
    );
    return;
  }

  // 2. Kiểm tra mã cây + size trùng
  const existingVariant = await Tree.findOne({
    codeId: treeCode._id,
    size,
  }).lean();
  if (existingVariant) {
    if (!existingVariant.isActive) {
      sendError(
        res,
        ErrorCode.INVALID_INPUT,
        `Mã cây "${treeCode.code}" đã có biến thể size "${size}" (đang ngừng bán). Vui lòng kích hoạt lại thay vì tạo mới.`
      );
      return;
    }
    sendError(
      res,
      ErrorCode.INVALID_INPUT,
      `Mã cây "${treeCode.code}" đã có biến thể size "${size}".`
    );
    return;
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
      const mongoError = err as {
        keyPattern?: Record<string, number>;
        keyValue?: Record<string, unknown>;
      };
      console.error("MongoDB duplicate key in createTreeVariant:", {
        keyPattern: mongoError.keyPattern,
        keyValue: mongoError.keyValue,
      });
      const duplicateFields = Object.keys(mongoError.keyPattern ?? {}).join(", ");
      sendError(
        res,
        ErrorCode.INVALID_INPUT,
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

  if (typeof body.sku === "string") {
    const newSku = body.sku.trim().toUpperCase();
    if (newSku !== variant.sku) {
      const existingSku = await Tree.findOne({
        _id: { $ne: variant._id },
        sku: newSku,
      }).lean();
      if (existingSku) {
        sendError(
          res,
          ErrorCode.INVALID_INPUT,
          `SKU "${newSku}" đã tồn tại. Vui lòng sử dụng SKU khác.`
        );
        return;
      }
      variant.sku = newSku;
    }
  }

  if (typeof body.size === "string") {
    const newSize = body.size.trim().toUpperCase();
    if (newSize !== variant.size) {
      const existingVariant = await Tree.findOne({
        _id: { $ne: variant._id },
        codeId: variant.codeId,
        size: newSize,
      }).lean();
      if (existingVariant) {
        sendError(
          res,
          ErrorCode.INVALID_INPUT,
          `Mã cây này đã có biến thể size "${newSize}".`
        );
        return;
      }
      variant.size = newSize;
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
    if (typeof body.stockQuantity === "number")
      variant.stockQuantity = body.stockQuantity;
    if (typeof body.isActive === "boolean") variant.isActive = body.isActive;
    if (typeof body.sortOrder === "number")
      variant.sortOrder = body.sortOrder;
    await variant.save();
    ok(res, { variant });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      const mongoError = err as {
        keyPattern?: Record<string, number>;
        keyValue?: Record<string, unknown>;
      };
      console.error("MongoDB duplicate key in updateTreeVariant:", {
        keyPattern: mongoError.keyPattern,
        keyValue: mongoError.keyValue,
      });
      const duplicateFields = Object.keys(mongoError.keyPattern ?? {}).join(", ");
      sendError(
        res,
        ErrorCode.INVALID_INPUT,
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
