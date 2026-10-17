import { Request, Response } from "express";
import { TreeProduct } from "../models/TreeProduct";
import { TreeCode } from "../models/TreeCode";
import { Tree } from "../models/Tree";
import { safelyBuildPricedDesign } from "../services/catalogService";
import { loadGroupedTreeCatalog } from "../services/catalogService";
import { DELIVERY_OPTIONS, DECORATION_FEE_BY_SIZE, SHIPPING_FEE } from "../config/business";
import { sendError, ErrorCode, handleInternalError } from "../utils/errors";
import { ok } from "../utils/respond";
import type { TreeSize } from "../models/Tree";

// ── GET /api/catalog/tree-products ──────────────────────────────────────────
// Customer browse: returns active tree products with their codes + variants.
export const getTreeProducts = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const groups = await loadGroupedTreeCatalog({
      isActive: true,
      includeEmptyProducts: false,
    });
    const filtered = groups.filter((g) =>
      g.codes.some(
        (c) => c.isActive && c.variants.some((v) => v.isActive)
      )
    );
    ok(res, { treeProducts: filtered });
  } catch (err) {
    handleInternalError(res, err, "[catalog] getTreeProducts error");
  }
};

// ── GET /api/catalog/tree-products/:productId/codes/:codeId/variants ────────
export const getVariantsForCode = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { productId, codeId } = req.params;
    const code = await TreeCode.findOne({
      _id: codeId,
      productId,
      isActive: true,
    }).lean();
    if (!code) {
      sendError(res, ErrorCode.TREE_NOT_FOUND, "Không tìm thấy mã cây");
      return;
    }
    const variants = await Tree.find({ codeId, isActive: true })
      .sort({ sortOrder: 1, size: 1 })
      .lean();
    ok(res, {
      code: {
        _id: String(code._id),
        code: code.code,
        name: code.name,
        description: code.description,
        image: code.image,
        material: code.material,
      },
      variants: variants.map((v) => ({
        _id: String(v._id),
        size: v.size,
        sku: v.sku,
        heightCmMin: v.heightCmMin,
        heightCmMax: v.heightCmMax,
        diameterCm: v.diameterCm,
        description: v.description || "",
        bareImage: v.bareImage,
        price: v.price,
        stockQuantity: v.stockQuantity,
      })),
    });
  } catch (err) {
    handleInternalError(res, err, "[catalog] getVariantsForCode error");
  }
};

// ── GET /api/catalog/trees (LEGACY — flat list, read-only) ──────────────────
export const getTrees = async (_req: Request, res: Response): Promise<void> => {
  try {
    const trees = await Tree.find({ isActive: true })
      .sort({ sortOrder: 1, size: 1 })
      .lean();
    ok(res, {
      trees: trees.map((t) => ({
        _id: String(t._id),
        size: t.size as TreeSize,
        name: t.name,
        heightCmMin: t.heightCmMin,
        heightCmMax: t.heightCmMax,
        diameterCm: t.diameterCm,
        material: "",
        density: "",
        description: t.description,
        images: t.images,
        bareImage: t.bareImage,
        price: t.price,
        stock: t.stockQuantity,
        productId: String(t.productId ?? ""),
        codeId: String(t.codeId ?? ""),
        sku: t.sku,
      })),
    });
  } catch (err) {
    handleInternalError(res, err, "[catalog] getTrees error");
  }
};

// ── GET /api/catalog/delivery-options ────────────────────────────────────────
export const getDeliveryOptions = async (
  _req: Request,
  res: Response
): Promise<void> => {
  ok(res, {
    options: DELIVERY_OPTIONS.map((code) => ({
      code,
      shippingFee: SHIPPING_FEE,
      decorationFeeBySize:
        code === "READY_TO_DISPLAY" ? DECORATION_FEE_BY_SIZE : { S: 0, M: 0, L: 0 },
    })),
  });
};

// ── POST /api/catalog/quote ──────────────────────────────────────────────────
// Body: { variantId, deliveryOption } — không còn styleId / accessories.
export const quoteDesign = async (req: Request, res: Response): Promise<void> => {
  const { variantId, deliveryOption } = req.body as {
    variantId?: string;
    deliveryOption?: string;
  };
  if (!variantId || !deliveryOption) {
    sendError(res, ErrorCode.MISSING_FIELD, "Thiếu `variantId` hoặc `deliveryOption`");
    return;
  }
  try {
    const result = await safelyBuildPricedDesign(res, {
      variantId: String(variantId),
      deliveryOption: deliveryOption as any,
    });
    if (!result) return;
    ok(res, { pricing: result.pricing });
  } catch (err) {
    handleInternalError(res, err, "[catalog] quoteDesign error");
  }
};
