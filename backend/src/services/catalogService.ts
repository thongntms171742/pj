import { Types } from "mongoose";
import { Tree } from "../models/Tree";
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