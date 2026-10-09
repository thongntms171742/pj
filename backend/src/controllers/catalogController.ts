import { Request, Response } from "express";
import { TreeProduct } from "../models/TreeProduct";
import { TreeCode } from "../models/TreeCode";
import { Tree } from "../models/Tree";
import { Style } from "../models/Style";
import { Accessory } from "../models/Accessory";
import { TreeDesign } from "../models/TreeDesign";
import { safelyBuildPricedDesign } from "../services/catalogService";
import { loadGroupedTreeCatalog } from "../services/catalogService";
import {
  DELIVERY_OPTIONS,
  DECORATION_FEE_BY_SIZE,
  SHIPPING_FEE,
} from "../config/business";
import {
  loadCatalogForDesign,
  buildDesignResponse,
} from "../services/designService";
import { sendError, ErrorCode, handleInternalError } from "../utils/errors";
import type { TreeSize } from "../models/Tree";

// Re-export the marker so TS doesn't drop it
export type _ReservedTreeSize = TreeSize;

// ── GET /api/catalog/tree-products ──────────────────────────────────────────
// Customer browse: returns active tree products with their codes + variants.
// FE renders: 1 product card → click → show codes → pick code → show sizes
// per code → add to cart with variantId.
export const getTreeProducts = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const groups = await loadGroupedTreeCatalog({
      isActive: true,
      includeEmptyProducts: false,
    });
    // Only return products that have at least 1 active code with at least
    // 1 active variant — otherwise the customer can't buy anything.
    const filtered = groups.filter((g) =>
      g.codes.some(
        (c) => c.isActive && c.variants.some((v) => v.isActive)
      )
    );
    res.json({ treeProducts: filtered });
  } catch (err) {
    handleInternalError(res, err, "[catalog] getTreeProducts error");
  }
};

// ── GET /api/catalog/tree-products/:productId/codes/:codeId/variants ────────
// Convenience: when a customer clicks a code, FE fetches its active variants
// (sizes) with price + stockQuantity to render the size grid.
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
    res.json({
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
        bareImage: v.bareImage,
        price: v.price,
        stockQuantity: v.stockQuantity,
      })),
    });
  } catch (err) {
    handleInternalError(res, err, "[catalog] getVariantsForCode error");
  }
};

// Legacy tree catalog kept for backward compat — returns flat list of
// active variants. Read-only. Used by older FE pages.
export const getTrees = async (_req: Request, res: Response): Promise<void> => {
  try {
    const trees = await Tree.find({ isActive: true })
      .sort({ sortOrder: 1, size: 1 })
      .lean();
    res.json({
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

// ── GET /api/catalog/styles ──────────────────────────────────────────────────
export const getStyles = async (_req: Request, res: Response): Promise<void> => {
  try {
    const styles = await Style.find({ isActive: true })
      .sort({ sortOrder: 1, code: 1 })
      .lean();
    res.json({
      styles: styles.map((s) => ({
        _id: String(s._id),
        code: s.code,
        name: s.name,
        description: s.description,
        palette: s.palette,
        coverImage: s.coverImage,
      })),
    });
  } catch (err) {
    handleInternalError(res, err, "[catalog] getStyles error");
  }
};

// ── GET /api/catalog/accessories ─────────────────────────────────────────────
export const getAccessories = async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, group, style, size } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = { isActive: true };
    if (type) filter.type = type;
    if (group) filter.group = group;

    const docs = await Accessory.find(filter)
      .sort({ sortOrder: 1, type: 1, name: 1 })
      .lean();

    // Filter styleCodes in app code (style might be empty = compatible)
    const filtered = docs.filter((a) => {
      if (!style) return true;
      const codes: string[] = a.styleCodes || [];
      return codes.length === 0 || codes.includes(style);
    });

    res.json({
      accessories: filtered.map((a) => ({
        _id: String(a._id),
        group: a.group,
        type: a.type,
        name: a.name,
        description: a.description,
        image: a.image,
        price: a.price,
        stock: a.stock,
        styleCodes: a.styleCodes,
        // If a `size` is provided, expose the per-size max qty so FE can
        // bound its inputs immediately without an extra roundtrip.
        maxQty: size && (["S", "M", "L"] as string[]).includes(size)
          ? (a.maxQtyBySize as Record<string, number>)[size]
          : a.maxQtyBySize,
        isPersonalizable: a.isPersonalizable,
        personalizationMaxLength: a.personalizationMaxLength,
        productionDays: a.productionDays,
      })),
    });
  } catch (err) {
    handleInternalError(res, err, "[catalog] getAccessories error");
  }
};

// ── GET /api/catalog/presets ─────────────────────────────────────────────────
export const getPresets = async (_req: Request, res: Response): Promise<void> => {
  try {
    const presets = await TreeDesign.find({ isPreset: true })
      .sort({ sortOrder: -1, updatedAt: -1 })
      .lean();

    // Hydrate each preset so FE sees the same shape as a saved design.
    // Use Promise.allSettled so 1 orphaned preset (treeId/styleId/accessoryId
    // pointing to soft-deleted or hard-deleted items) does not 500 the entire
    // gallery — we just skip + log the bad ones.
    const results = await Promise.allSettled(
      presets.map((p) => loadCatalogForDesign(p))
    );

    const out: ReturnType<typeof buildDesignResponse>[] = [];
    results.forEach((r, idx) => {
      if (r.status === "fulfilled") {
        out.push(buildDesignResponse(r.value.design, r.value.pricing));
      } else {
        console.warn(
          `[catalog] Skipping preset "${presets[idx].name}" (id=${presets[idx]._id}) — config invalid:`,
          r.reason instanceof Error ? r.reason.message : r.reason
        );
      }
    });

    res.json({ presets: out });
  } catch (err) {
    handleInternalError(res, err, "[catalog] getPresets error");
  }
};

// ── GET /api/catalog/delivery-options ────────────────────────────────────────
export const getDeliveryOptions = async (
  _req: Request,
  res: Response
): Promise<void> => {
  res.json({
    options: DELIVERY_OPTIONS.map((code) => ({
      code,
      shippingFee: SHIPPING_FEE,
      decorationFeeBySize:
        code === "READY_TO_DISPLAY" ? DECORATION_FEE_BY_SIZE : { S: 0, M: 0, L: 0 },
    })),
  });
};

// ── POST /api/catalog/quote ──────────────────────────────────────────────────
// Public endpoint — same shape as pricingService.priceDesign but wrapped so
// designers without an account can also see totals.
export const quoteDesign = async (req: Request, res: Response): Promise<void> => {
  const { config } = req.body as { config?: any };
  if (!config) {
    sendError(res, ErrorCode.MISSING_FIELD, "Thiếu `config` trong body");
    return;
  }
  try {
    const result = await safelyBuildPricedDesign(res, config);
    if (!result) return; // safelyBuildPricedDesign already sent the response
    res.json({ pricing: result.pricing });
  } catch (err) {
    handleInternalError(res, err, "[catalog] quoteDesign error");
  }
};