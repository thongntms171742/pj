import type { TreeSize } from "../models/Tree";
import type { Style, StyleCode } from "../models/Style";
import type { Accessory } from "../models/Accessory";
import type {
  DesignConfig,
  DeliveryOption,
  ResolvedAccessoryRef,
} from "../models/TreeDesign";
import {
  DECORATION_FEE_BY_SIZE,
  DELIVERY_OPTIONS,
  PERSONALIZATION_DEFAULT_MAX_LENGTH,
  PERSONALIZATION_REGEX,
} from "../config/business";
import { sendError, ErrorCode, type ErrorCodeValue } from "../utils/errors";

// ── Lean shapes (only the fields pricing needs) ──────────────────────────────
export interface TreeLean {
  _id: string;
  size: TreeSize;
  name: string;
  price: number;
  isActive: boolean;
}

export interface StyleLean {
  _id: string;
  code: StyleCode;
  name: string;
  isActive: boolean;
}

export interface AccessoryLean {
  _id: string;
  name: string;
  type: string;
  group: string;
  price: number;
  isActive: boolean;
  styleCodes: StyleCode[];
  maxQtyBySize: { S: number; M: number; L: number };
  isPersonalizable: boolean;
  personalizationMaxLength: number;
  productionDays: number;
}

export interface CatalogSnapshot {
  tree: TreeLean;
  style: StyleLean;
  accessories: Map<string, AccessoryLean>;
}

// ── Output of priceDesign — what FE shows + what OrderItem stores ────────────
export interface PriceLine extends ResolvedAccessoryRef {
  accessoryId: string;
}

export interface PriceBreakdown {
  tree: { id: string; name: string; size: TreeSize; unitPrice: number };
  style: { id: string; code: StyleCode; name: string };
  lines: PriceLine[];
  decorationFee: number;
  shippingFee: number;
  unitTotal: number;
  productionDays: number;
  hasPersonalization: boolean;
  hasService: boolean;
  warnings: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function isDeliveryOption(v: unknown): v is DeliveryOption {
  return (
    typeof v === "string" &&
    (DELIVERY_OPTIONS as ReadonlyArray<string>).includes(v)
  );
}

function trimOrEmpty(s: unknown): string {
  return typeof s === "string" ? s.trim() : "";
}

// ── Main pricing function (pure, no DB) ───────────────────────────────────────
// Throws an Error tagged with `.httpCode` + `.code` so controllers can use
// sendError() to surface consistent FE-facing error envelopes.
export class DesignValidationError extends Error {
  public code: ErrorCodeValue;
  public httpCode: number;
  constructor(code: ErrorCodeValue, message: string) {
    super(message);
    this.code = code;
    this.httpCode = code === "ACCESSORY_NOT_FOUND" ? 404 : 400;
  }
}

export function priceDesign(
  config: DesignConfig,
  catalog: CatalogSnapshot
): PriceBreakdown {
  const warnings: string[] = [];

  // 1) Tree
  const tree = catalog.tree;
  if (!tree) {
    throw new DesignValidationError(
      ErrorCode.TREE_NOT_FOUND,
      "Không tìm thấy cây trong catalog"
    );
  }
  if (!tree.isActive) {
    throw new DesignValidationError(
      ErrorCode.CATALOG_ITEM_UNAVAILABLE,
      `Cây "${tree.name}" hiện không được bán`
    );
  }

  // 2) Style
  const style = catalog.style;
  if (!style) {
    throw new DesignValidationError(
      ErrorCode.STYLE_NOT_FOUND,
      "Không tìm thấy style trong catalog"
    );
  }
  if (!style.isActive) {
    throw new DesignValidationError(
      ErrorCode.CATALOG_ITEM_UNAVAILABLE,
      `Style "${style.name}" hiện không được bán`
    );
  }

  // 3) deliveryOption
  if (!isDeliveryOption(config.deliveryOption)) {
    throw new DesignValidationError(
      ErrorCode.DELIVERY_OPTION_INVALID,
      `deliveryOption không hợp lệ: ${String(config.deliveryOption)}`
    );
  }

  // 4) accessories
  if (!Array.isArray(config.accessories)) {
    throw new DesignValidationError(
      ErrorCode.DESIGN_CONFIG_INVALID,
      "accessories phải là mảng"
    );
  }

  const seenIds = new Set<string>();
  const lines: PriceLine[] = [];
  let productionDays = 0;
  let hasPersonalization = false;

  for (const entry of config.accessories) {
    if (!entry || !entry.accessoryId) {
      throw new DesignValidationError(
        ErrorCode.DESIGN_CONFIG_INVALID,
        "Mỗi accessory phải có accessoryId"
      );
    }
    const id = String(entry.accessoryId);
    if (seenIds.has(id)) {
      throw new DesignValidationError(
        ErrorCode.ACCESSORY_DUPLICATED,
        "Không được thêm cùng một phụ kiện nhiều lần — hãy tăng quantity"
      );
    }
    seenIds.add(id);

    const acc = catalog.accessories.get(id);
    if (!acc) {
      throw new DesignValidationError(
        ErrorCode.ACCESSORY_NOT_FOUND,
        `Không tìm thấy phụ kiện ${id}`
      );
    }
    if (!acc.isActive) {
      throw new DesignValidationError(
        ErrorCode.CATALOG_ITEM_UNAVAILABLE,
        `Phụ kiện "${acc.name}" hiện không được bán`
      );
    }

    // style compatibility (empty list = useable in any style)
    if (acc.styleCodes.length > 0 && !acc.styleCodes.includes(style.code)) {
      throw new DesignValidationError(
        ErrorCode.ACCESSORY_STYLE_MISMATCH,
        `Phụ kiện "${acc.name}" không phù hợp với style "${style.name}"`
      );
    }

    // quantity bounds per tree size
    const maxForSize = acc.maxQtyBySize?.[tree.size];
    const qty = Number(entry.quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > (maxForSize ?? 1)) {
      throw new DesignValidationError(
        ErrorCode.ACCESSORY_QUANTITY_INVALID,
        `Số lượng "${acc.name}" cho cây ${tree.size} phải trong khoảng 1 đến ${maxForSize}`
      );
    }

    // personalization
    const rawText = trimOrEmpty(entry.personalizationText);
    if (acc.isPersonalizable) {
      if (!rawText) {
        throw new DesignValidationError(
          ErrorCode.PERSONALIZATION_REQUIRED,
          `Phụ kiện "${acc.name}" yêu cầu nhập chữ cá nhân hóa`
        );
      }
      const max = acc.personalizationMaxLength || PERSONALIZATION_DEFAULT_MAX_LENGTH;
      if (rawText.length > max) {
        throw new DesignValidationError(
          ErrorCode.PERSONALIZATION_INVALID,
          `Chữ cá nhân hóa cho "${acc.name}" tối đa ${max} ký tự`
        );
      }
      if (!PERSONALIZATION_REGEX.test(rawText)) {
        throw new DesignValidationError(
          ErrorCode.PERSONALIZATION_INVALID,
          `Chữ cá nhân hóa chỉ chứa chữ cái, số, khoảng trắng, '.', \"'\", '-' và '&'`
        );
      }
      hasPersonalization = true;
    } else if (rawText) {
      throw new DesignValidationError(
        ErrorCode.PERSONALIZATION_INVALID,
        `Phụ kiện "${acc.name}" không hỗ trợ chữ cá nhân hóa`
      );
    }

    const lineTotal = acc.price * qty;
    lines.push({
      accessoryId: id,
      name: acc.name,
      type: acc.type as PriceLine["type"],
      group: acc.group as PriceLine["group"],
      image: "", // not needed for price breakdown; FE hydrates from catalog
      unitPrice: acc.price,
      quantity: qty,
      lineTotal,
      personalizationText: rawText || undefined,
      isPersonalizable: acc.isPersonalizable,
      personalizationMaxLength: acc.personalizationMaxLength,
      productionDays: acc.productionDays,
    });

    if (acc.productionDays > productionDays) {
      productionDays = acc.productionDays;
    }
  }

  // 5) Decoration fee
  const decorationFee =
    config.deliveryOption === "READY_TO_DISPLAY"
      ? DECORATION_FEE_BY_SIZE[tree.size]
      : 0;

  // 6) unit total = tree + accessories + decoration; shipping is added at
  //    order level (depends on province) so we just expose the constant.
  const accessorySubtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const unitTotal = tree.price + accessorySubtotal + decorationFee;

  return {
    tree: { id: tree._id, name: tree.name, size: tree.size, unitPrice: tree.price },
    style: { id: style._id, code: style.code, name: style.name },
    lines,
    decorationFee,
    shippingFee: 30_000,
    unitTotal,
    productionDays,
    hasPersonalization,
    hasService: decorationFee > 0,
    warnings,
  };
}

// ── Tiny helper for controllers that prefer throw → sendError ───────────────
export function rethrowAsHttp(
  res: import("express").Response,
  err: unknown
): boolean {
  if (err instanceof DesignValidationError) {
    sendError(res, err.code, err.message, err.httpCode);
    return true;
  }
  return false;
}