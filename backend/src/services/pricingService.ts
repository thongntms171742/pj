import type { TreeSize } from "../models/Tree";
import { DELIVERY_OPTIONS, type DeliveryOption } from "../config/business";
import { sendError, ErrorCode, type ErrorCodeValue } from "../utils/errors";

// ── Lean shapes (only the fields pricing needs) ──────────────────────────────
// Sau refactor phụ kiện: chỉ còn Tree variant (size × code combo) + delivery
// option. Style / accessories không còn tách bảng; mọi thông tin đã nằm trong
// TreeProduct.description.
export interface TreeLean {
  _id: string;
  productId: string;
  codeId: string;
  size: TreeSize;
  name: string;
  price: number;
  stockQuantity: number;
  isActive: boolean;
}

export interface CatalogSnapshot {
  tree: TreeLean;
}

// ── Output của priceDesign — gọn, không còn style/lines phức tạp ─────────────
export interface PriceBreakdown {
  tree: { id: string; name: string; size: TreeSize; unitPrice: number };
  decorationFee: number;
  shippingFee: number;
  unitTotal: number;
  productionDays: number;
  hasPersonalization: boolean;
  hasService: boolean;
  warnings: string[];
}

// Input mới của pricing: chỉ variantId (Tree) + deliveryOption.
export interface PricingInput {
  variantId: string;
  deliveryOption: DeliveryOption;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function isDeliveryOption(v: unknown): v is DeliveryOption {
  return (
    typeof v === "string" &&
    (DELIVERY_OPTIONS as ReadonlyArray<string>).includes(v)
  );
}

// ── Main pricing function (pure, no DB) ───────────────────────────────────────
export class DesignValidationError extends Error {
  public code: ErrorCodeValue;
  public httpCode: number;
  constructor(code: ErrorCodeValue, message: string) {
    super(message);
    this.code = code;
    this.httpCode = 400;
  }
}

export function priceDesign(
  input: PricingInput,
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

  // 2) deliveryOption
  if (!isDeliveryOption(input.deliveryOption)) {
    throw new DesignValidationError(
      ErrorCode.DELIVERY_OPTION_INVALID,
      `deliveryOption không hợp lệ: ${String(input.deliveryOption)}`
    );
  }

  // 3) Tính giá đơn giản: chỉ treePrice + shippingFee. Decoration fee = 0 vì
  // phụ kiện không còn là bảng riêng — concept đã có sẵn trong TreeProduct.
  const shippingFee = 20_000;
  const unitTotal = tree.price + shippingFee;

  return {
    tree: { id: tree._id, name: tree.name, size: tree.size, unitPrice: tree.price },
    decorationFee: 0,
    shippingFee,
    unitTotal,
    productionDays: 0,
    hasPersonalization: false,
    hasService: false,
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
