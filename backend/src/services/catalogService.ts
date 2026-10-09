import { Types } from "mongoose";
import { Tree } from "../models/Tree";
import { TreeProduct } from "../models/TreeProduct";
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

  const tree = await Tree.findById(config.treeId).lean();
  if (!tree) {
    throw makeServiceError(ErrorCode.TREE_NOT_FOUND, "Không tìm thấy cây", 404);
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
      size: tree.size,
      name: tree.name,
      price: tree.price,
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

// ── Shopee-style grouped catalog (admin + catalog browse) ──────────────────
// Returns tree families: each product with its size variants. Used by the
// admin "tree product" form to render the size matrix, and by FE catalog
// browse page that wants a single product card with size chips.
export interface TreeProductGrouped {
  product: {
    _id: string;
    name: string;
    slug: string;
    density: string;
    description: string;
    coverImage: string;
    images: string[];
    colors: string[];
    isActive: boolean;
    sortOrder: number;
  };
  variants: Array<{
    _id: string;
    color: string | null;
    size: "S" | "M" | "L";
    heightCmMin: number;
    heightCmMax: number;
    diameterCm: number;
    bareImage: string;
    price: number;
    stock: number;
    isActive: boolean;
    sortOrder: number;
  }>;
}

export async function loadGroupedTreeCatalog(opts?: {
  isActive?: boolean;
  includeEmptyProducts?: boolean;
}): Promise<TreeProductGrouped[]> {
  const includeEmpty = opts?.includeEmptyProducts ?? true;
  const productQuery: Record<string, unknown> = {};
  if (opts?.isActive !== undefined) productQuery.isActive = opts.isActive;

  const products = await TreeProduct.find(productQuery)
    .sort({ sortOrder: 1, name: 1 })
    .lean();

  const productIds = products.map((p) => p._id);
  // Legacy: variants with productId=null
  const variants = await Tree.find({
    $or: [
      { productId: { $in: productIds } },
      { productId: null },
    ],
  })
    .sort({ productId: 1, sortOrder: 1, size: 1 })
    .lean();

  const byProduct = new Map<string, typeof variants>();
  const legacy: typeof variants = [];
  for (const v of variants) {
    if (v.productId) {
      const key = String(v.productId);
      const arr = byProduct.get(key) ?? [];
      arr.push(v);
      byProduct.set(key, arr);
    } else {
      legacy.push(v);
    }
  }

  // Group legacy variants into synthetic "Legacy" products (one per unique
  // material+name pattern) so admins can still see and migrate them.
  const legacyByMaterial = new Map<string, typeof variants>();
  for (const v of legacy) {
    const key = `${v.material}::${v.name.split(/\s-\s|\s\d/).slice(0, 1).join("")}`;
    const arr = legacyByMaterial.get(key) ?? [];
    arr.push(v);
    legacyByMaterial.set(key, arr);
  }

    const result: TreeProductGrouped[] = products.map((p) => ({
    product: {
      _id: String(p._id),
      name: p.name,
      slug: p.slug,
      density: p.density,
      description: p.description,
      coverImage: p.coverImage,
      images: p.images,
      colors: p.colors,
      isActive: p.isActive,
      sortOrder: p.sortOrder,
    },
    variants: (byProduct.get(String(p._id)) ?? []).map((v) => ({
      _id: String(v._id),
      color: v.color,
      size: v.size,
      heightCmMin: v.heightCmMin,
      heightCmMax: v.heightCmMax,
      diameterCm: v.diameterCm,
      bareImage: v.bareImage,
      price: v.price,
      stock: v.stock,
      isActive: v.isActive,
      sortOrder: v.sortOrder,
    })),
  }));

  if (includeEmpty) {
    for (const [key, vs] of legacyByMaterial) {
      if (!vs.length) continue;
      result.push({
        product: {
          _id: `legacy-${key}`,
          name: vs[0].name.split(/\s-\s/)[0].trim() || "Legacy tree",
          slug: `legacy-${key.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          density: vs[0].density,
          description: vs[0].description,
          coverImage: "",
          images: vs[0].images,
          colors: [],
          isActive: vs[0].isActive,
          sortOrder: -1,
        },
        variants: vs.map((v) => ({
          _id: String(v._id),
          color: v.color,
          size: v.size,
          heightCmMin: v.heightCmMin,
          heightCmMax: v.heightCmMax,
          diameterCm: v.diameterCm,
          bareImage: v.bareImage,
          price: v.price,
          stock: v.stock,
          isActive: v.isActive,
          sortOrder: v.sortOrder,
        })),
      });
    }
  }

  return result;
}