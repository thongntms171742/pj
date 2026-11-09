import type { TreeSize } from "../models/Tree";
import {
  DELIVERY_OPTIONS,
  SHIPPING_FEE,
  type DeliveryOption,
} from "../config/business";
import { sendError, ErrorCode, type ErrorCodeValue } from "../utils/errors";

// ── Lean shapes (only the fields pricing needs) ──────────────────────────────
// Phase Customizer: accessories là mặt hàng tồn kho độc lập, tính phí trang
// trí động = tổng unitPrice × số slot dùng.
export interface TreeLean {
  _id: string;
  productId: string;
  codeId: string;
  size: TreeSize;
  name: string;
  price: number;
  stockQuantity: number;
  isActive: boolean;
  sku?: string;
  bareImage?: string;
}

export interface AccessoryPricingLean {
  _id: string;
  sku: string;
  name: string;
  image: string;
  unitPrice: number;
  isActive: boolean;
}

export interface CatalogSnapshot {
  tree: TreeLean;
  accessories?: AccessoryPricingLean[];
}

// ── Output của priceDesign ────────────────────────────────────────────────────
// `unitTotal` = giá của 1 cây ĐÃ BAO GỒM phí trang trí, KHÔNG gồm phí ship.
// (Phí ship được Order layer cộng 1 lần duy nhất khi checkout — trước đây
// `unitTotal` đã chứa sẵn shippingFee khiến phí ship bị tính 2 lần.)
export interface PriceBreakdown {
  tree: { id: string; name: string; size: TreeSize; unitPrice: number };
  decorationFee: number;
  shippingFee: number;
  /** Giá 1 cây + phí trang trí (KHÔNG gồm shipping). */
  unitTotal: number;
  /** Tiện ích: unitTotal + shippingFee — dùng cho màn hình báo giá. */
  grandTotal: number;
  /** Chi tiết từng dòng trang trí (đã tính theo số slot dùng). */
  decorations: Array<{
    accessoryId: string;
    sku: string;
    name: string;
    image: string;
    unitPrice: number;
    /** Số slot đã dùng phụ kiện này. */
    quantity: number;
    lineTotal: number;
  }>;
  productionDays: number;
  hasPersonalization: boolean;
  hasService: boolean;
  warnings: string[];
}

// Input mới của pricing: variantId (Tree) + deliveryOption + phụ kiện tùy chọn.
// accessories: [{ accessoryId, quantity }] — quantity = số slot dùng phụ kiện
// đó (1 slot = 1 instance). Bỏ trống = cây trơn (tương thích flow cũ).
export interface PricingInput {
  variantId: string;
  deliveryOption: DeliveryOption;
  accessories?: Array<{ accessoryId: string; quantity: number }>;
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

  // 3) Phí trang trí động = tổng unitPrice × số slot dùng.
  // Không có accessories ⇒ decorationFee = 0 (flow cây trơn cũ).
  //
  // LƯU Ý NGHIỆP VỤ (per-slot pricing):
  //   Mỗi placement = 1 slot đã dùng = 1 lần phí trang trí.
  //   `accessories` ở đây là dạng rút gọn { accessoryId, quantity } — quantity
  //   chính là SỐ SLOT đã dùng phụ kiện đó. Cùng 1 phụ kiện dùng 15 slot ⇒
  //   quantity = 15 ⇒ phí = 15 × unitPrice. KHÔNG được tính theo số id duy nhất.
  let decorationFee = 0;
  const decorations: PriceBreakdown["decorations"] = [];
  const requested = Array.isArray(input.accessories) ? input.accessories : [];
  if (requested.length > 0) {
    const accById = new Map(
      (catalog.accessories ?? []).map((a) => [String(a._id), a])
    );
    for (const line of requested) {
      const qty = Math.floor(Number(line.quantity));
      if (!Number.isFinite(qty) || qty < 1) {
        throw new DesignValidationError(
          ErrorCode.INVALID_INPUT,
          `Số lượng phụ kiện không hợp lệ`
        );
      }
      const acc = accById.get(String(line.accessoryId));
      if (!acc) {
        throw new DesignValidationError(
          ErrorCode.ACCESSORY_NOT_FOUND,
          "Không tìm thấy phụ kiện trong catalog"
        );
      }
      if (!acc.isActive) {
        throw new DesignValidationError(
          ErrorCode.ACCESSORY_UNAVAILABLE,
          `Phụ kiện "${acc.name}" hiện ngừng bán`
        );
      }
      const lineTotal = acc.unitPrice * qty;
      decorationFee += lineTotal;
      decorations.push({
        accessoryId: String(acc._id),
        sku: acc.sku,
        name: acc.name,
        image: acc.image ?? "",
        unitPrice: acc.unitPrice,
        quantity: qty,
        lineTotal,
      });
    }
  }

  // Phí ship là fallback (đơn thật sẽ tính theo địa chỉ ở Order layer).
  const shippingFee = SHIPPING_FEE;
  // unitTotal KHÔNG chứa shipping — tránh tính phí ship 2 lần khi checkout.
  const unitTotal = tree.price + decorationFee;

  return {
    tree: { id: tree._id, name: tree.name, size: tree.size, unitPrice: tree.price },
    decorationFee,
    shippingFee,
    unitTotal,
    grandTotal: unitTotal + shippingFee,
    decorations,
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
