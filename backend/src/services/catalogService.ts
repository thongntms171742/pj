import { Types } from "mongoose";
import { Tree } from "../models/Tree";
import { TreeProduct } from "../models/TreeProduct";
import { TreeCode } from "../models/TreeCode";
import { Style } from "../models/Style";
import { Accessory } from "../models/Accessory";
import { TreeDesign } from "../models/TreeDesign";
import {
  priceDesign,
  type CatalogSnapshot,
  type TreeLean,
  type StyleLean,
  type AccessoryLean,
  DesignValidationError,
} from "./pricingService";
import type { DesignConfig } from "../models/TreeDesign";
import { sendError, ErrorCode } from "../utils/errors";
import type { Response } from "express";

// ── Resolve a DesignConfig to a fully-hydrated catalog snapshot + price ──────
// Throws an Error that callers can route through sendError / handleInternalError.
// Used by quote endpoint, cart-add endpoint, design-save endpoint, and
// order-creation. Keep DB queries batched to 3 (tree, style, accessories).
export async function buildPricedDesign(config: DesignConfig): Promise<{
  catalog: CatalogSnapshot;
  pricing: ReturnType<typeof priceDesign>;
}> {
  const catalog = await loadCatalogForConfig(config);
  const pricing = priceDesign(config, catalog);
  return { catalog, pricing };
}

export async function loadCatalogForConfig(
  config: DesignConfig
): Promise<CatalogSnapshot> {
  const accessoryIds = Array.from(
    new Set(
      (config.accessories || [])
        .map((a) => String(a.accessoryId))
        .filter(Boolean)
    )
  );

  // After 3-tier refactor: DesignConfig.variantId points to a Tree variant
  // (code × size SKU). catalog.tree carries the variant-shaped lean record.
  const tree = await Tree.findById(config.variantId).lean();
  if (!tree) {
    throw makeServiceError(
      ErrorCode.TREE_NOT_FOUND,
      "Không tìm thấy biến thể cây",
      404
    );
  }
  const style = await Style.findById(config.styleId).lean();
  if (!style) {
    throw makeServiceError(ErrorCode.STYLE_NOT_FOUND, "Không tìm thấy style", 404);
  }
  const accDocs = accessoryIds.length
    ? await Accessory.find({ _id: { $in: accessoryIds } }).lean()
    : [];

  const accessoryMap = new Map<string, AccessoryLean>();
  for (const a of accDocs) {
    accessoryMap.set(String(a._id), {
      _id: String(a._id),
      name: a.name,
      type: a.type,
      group: a.group,
      price: a.price,
      isActive: a.isActive,
      styleCodes: a.styleCodes,
      maxQtyBySize: a.maxQtyBySize,
      isPersonalizable: a.isPersonalizable,
      personalizationMaxLength: a.personalizationMaxLength,
      productionDays: a.productionDays,
    });
  }

  return {
    tree: {
      _id: String(tree._id),
      productId: String(tree.productId ?? ""),
      codeId: String(tree.codeId ?? ""),
      size: tree.size,
      name: tree.name,
      price: tree.price,
      stockQuantity: tree.stockQuantity,
      isActive: tree.isActive,
    },
    style: {
      _id: String(style._id),
      code: style.code,
      name: style.name,
      isActive: style.isActive,
    },
    accessories: accessoryMap,
  };
}

// ── Helper: convert designId → its embedded DesignConfig ────────────────────
export async function loadConfigByDesignId(
  designId: string | Types.ObjectId | null | undefined
): Promise<DesignConfig | null> {
  if (!designId) return null;
  const design = await TreeDesign.findById(designId).lean();
  if (!design) return null;
  return design.config;
}

// ── Service error wrapper ────────────────────────────────────────────────────
export interface CatalogServiceError extends Error {
  code: ErrorCodeValue;
  httpCode: number;
}
type ErrorCodeValue =
  (typeof ErrorCode)[keyof typeof ErrorCode];

function makeServiceError(
  code: ErrorCodeValue,
  message: string,
  httpCode: number
): CatalogServiceError {
  const err = new Error(message) as CatalogServiceError;
  err.code = code;
  err.httpCode = httpCode;
  return err;
}

// ── Try/catch shim: routes can `await safelyBuildPricedDesign` and either
// get a result or a surfaced sendError()-style response object.
export async function safelyBuildPricedDesign(
  res: Response,
  config: DesignConfig
): Promise<{ catalog: CatalogSnapshot; pricing: ReturnType<typeof priceDesign> } | null> {
  try {
    return await buildPricedDesign(config);
  } catch (err) {
    if (err instanceof DesignValidationError) {
      sendError(res, err.code, err.message, err.httpCode);
      return null;
    }
    if (err && typeof err === "object" && "code" in err && "httpCode" in err) {
      const code = (err as CatalogServiceError).code;
      const httpCode = (err as CatalogServiceError).httpCode;
      const message = (err as unknown as Error).message || "Lỗi không xác định";
      sendError(res, code, message, httpCode);
      return null;
    }
    throw err;
  }
}

// ── Shopee-style 3-tier grouped catalog (Product → Code → Variant) ──────────
// Returns products each with N codes, each code with M size variants.
// Used by admin product form (render 3-level table) and FE customer browse
// (show 1 product card → expand to codes → pick size).
export interface TreeVariantSummary {
  _id: string;
  size: string;
  sku: string;
  heightCmMin: number;
  heightCmMax: number;
  diameterCm: number;
  bareImage: string;
  price: number;
  stockQuantity: number;
  isActive: boolean;
  sortOrder: number;
}

export interface TreeCodeSummary {
  _id: string;
  productId: string;
  code: string;
  name: string;
  description: string;
  image: string;
  material: string;
  isActive: boolean;
  sortOrder: number;
  variants: TreeVariantSummary[];
}

export interface TreeProductGrouped {
  product: {
    _id: string;
    name: string;
    slug: string;
    category: string;
    density: string;
    description: string;
    coverImage: string;
    images: string[];
    isActive: boolean;
    sortOrder: number;
  };
  codes: TreeCodeSummary[];
}

export async function loadGroupedTreeCatalog(opts?: {
  isActive?: boolean;
  includeEmptyProducts?: boolean;
}): Promise<TreeProductGrouped[]> {
  const productQuery: Record<string, unknown> = {};
  if (opts?.isActive !== undefined) productQuery.isActive = opts.isActive;

  const products = await TreeProduct.find(productQuery)
    .sort({ sortOrder: 1, name: 1 })
    .lean();

  if (products.length === 0) return [];

  const productIds = products.map((p) => p._id);
  const codes = await TreeCode.find({ productId: { $in: productIds } })
    .sort({ sortOrder: 1, name: 1 })
    .lean();
  const codeIds = codes.map((c) => c._id);
  const variants = codeIds.length
    ? await Tree.find({ codeId: { $in: codeIds } })
        .sort({ sortOrder: 1, size: 1 })
        .lean()
    : [];

  // Group variants by codeId
  const variantsByCode = new Map<string, Array<typeof variants[number]>>();
  for (const v of variants) {
    const key = String(v.codeId);
    const arr = variantsByCode.get(key) ?? [];
    arr.push(v);
    variantsByCode.set(key, arr);
  }

  // Group codes by productId
  const codesByProduct = new Map<string, Array<typeof codes[number]>>();
  for (const c of codes) {
    const key = String(c.productId);
    const arr = codesByProduct.get(key) ?? [];
    arr.push(c);
    codesByProduct.set(key, arr);
  }

  return products.map((p) => ({
    product: {
      _id: String(p._id),
      name: p.name,
      slug: p.slug,
      category: p.category,
      density: p.density,
      description: p.description,
      coverImage: p.coverImage,
      images: p.images,
      isActive: p.isActive,
      sortOrder: p.sortOrder,
    },
    codes: (codesByProduct.get(String(p._id)) ?? []).map((c) => ({
      _id: String(c._id),
      productId: String(c.productId),
      code: c.code,
      name: c.name,
      description: c.description,
      image: c.image,
      material: c.material,
      isActive: c.isActive,
      sortOrder: c.sortOrder,
      variants: (variantsByCode.get(String(c._id)) ?? []).map((v) => ({
        _id: String(v._id),
        size: v.size,
        sku: v.sku,
        heightCmMin: v.heightCmMin,
        heightCmMax: v.heightCmMax,
        diameterCm: v.diameterCm,
        bareImage: v.bareImage,
        price: v.price,
        stockQuantity: v.stockQuantity,
        isActive: v.isActive,
        sortOrder: v.sortOrder,
      })),
    })),
  }));
}