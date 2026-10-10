import { Types } from "mongoose";
import { Order, IOrder, IOrderItem } from "../models/Order";
import { Cart } from "../models/Cart";
import { CartItem } from "../models/CartItem";
import { TreeDesign } from "../models/TreeDesign";
import { Coupon } from "../models/Coupon";
import { buildPricedDesign } from "./catalogService";
import {
  reserveStock,
  type StockReservation,
} from "./inventoryService";
import { SHIPPING_FEE, SERVICE_PROVINCE_ID } from "../config/business";
import type { DesignConfig, DeliveryOption, ResolvedVariantRef, ResolvedStyleRef } from "../models/TreeDesign";
import { computeCouponDiscount } from "../controllers/couponController";

// ── orderService ─────────────────────────────────────────────────────────────
// Pure business logic for the order flow, separated from HTTP concerns
// (response shape, status codes). Controllers call into these; tests can
// call them too without needing req/res.
//
// Functions exported:
//   - resolveOrderItems       pull items from cart or pass-through direct body
//   - buildOrderItems         build snapshots, totals, stock reservations
//   - assertDeliveryArea      throw if READY_TO_DISPLAY outside HCM
//   - applyCoupon             look up coupon, check eligibility, return discount
//   - markOrderAsPaid         shared PAID → CONFIRMED transition

export interface OrderItemInput {
  config?: DesignConfig;
  designId?: string;
  quantity?: number;
}

export interface BuildOrderResult {
  items: IOrderItem[];
  stockToReserve: StockReservation[];
  subtotal: number;
  decorationFee: number;
  productionDaysMax: number;
  hasPersonalization: boolean;
}

// ── resolveOrderItems ────────────────────────────────────────────────────────
// Pull items from cart (mode B) or accept direct items (mode A). Returns
// `[]` if the cart is missing or no items were checked.
export async function resolveOrderItems(
  userId: string,
  cartItemIds?: string[]
): Promise<OrderItemInput[]> {
  const cart = await Cart.findOne({ userId });
  if (!cart) return [];
  const query: Record<string, unknown> = { cartId: cart._id };
  if (Array.isArray(cartItemIds) && cartItemIds.length > 0) {
    query._id = { $in: cartItemIds };
  } else {
    query.checked = true;
  }
  const cartItems = await CartItem.find(query);
  return cartItems.map((ci) => ({
    config: ci.config as DesignConfig,
    designId: ci.designId ? String(ci.designId) : undefined,
    quantity: ci.quantity,
  }));
}

// ── buildOrderItems ──────────────────────────────────────────────────────────
// For each input item, resolve the designId (if any) to a config, validate
// via pricingService, and build:
//   - the immutable OrderItem snapshot (variant, style, accessory lines)
//   - stock reservation list (tree + each non-loop accessory)
//   - subtotal, decoration fee, max production days, personalization flag
//
// Throws errors tagged with .code and .httpCode on validation failure.
export async function buildOrderItems(
  items: OrderItemInput[]
): Promise<BuildOrderResult> {
  const built: IOrderItem[] = [];
  const stockToReserve: StockReservation[] = [];
  let subtotal = 0;
  let decorationFee = 0;
  let productionDaysMax = 0;
  let hasPersonalization = false;

  for (const entry of items) {
    let cfg = entry.config;
    if (!cfg && entry.designId) {
      const doc = await TreeDesign.findById(entry.designId).lean();
      if (!doc) continue;
      cfg = doc.config;
    }
    if (!cfg) continue;

    const { pricing, catalog } = await buildPricedDesign(cfg);
    const quantity = Math.max(1, parseInt(String(entry.quantity ?? 1), 10) || 1);

    stockToReserve.push({
      refId: new Types.ObjectId(String(catalog.tree._id)),
      kind: "TREE",
      quantity,
    });
    for (const line of pricing.lines) {
      stockToReserve.push({
        refId: new Types.ObjectId(line.accessoryId),
        kind: "ACCESSORY",
        quantity: line.quantity * quantity,
      });
    }

    const variantSnapshot: ResolvedVariantRef = {
      _id: String(catalog.tree._id),
      productId: catalog.tree.productId,
      codeId: catalog.tree.codeId,
      size: catalog.tree.size,
      name: catalog.tree.name,
      price: catalog.tree.price,
      unitPrice: catalog.tree.price,
      sku: "",
      bareImage: "",
    };
    const styleSnapshot: ResolvedStyleRef = {
      _id: String(catalog.style._id),
      code: catalog.style.code,
      name: catalog.style.name,
      coverImage: "",
      palette: [],
    };
    const lines: any[] = pricing.lines.map((l) => ({
      kind: "ACCESSORY",
      refId: new Types.ObjectId(l.accessoryId),
      type: l.type,
      name: l.name,
      unitPrice: l.unitPrice,
      quantity: l.quantity,
      lineTotal: l.lineTotal,
      personalizationText: l.personalizationText || "",
    }));
    if (pricing.decorationFee > 0) {
      lines.push({
        kind: "SERVICE",
        refId: null,
        type: "DECORATION_SERVICE",
        name: `Phí trang trí (${catalog.tree.size})`,
        unitPrice: pricing.decorationFee,
        quantity: 1,
        lineTotal: pricing.decorationFee,
        personalizationText: "",
      });
    }

    const itemUnitTotal = pricing.unitTotal;
    const itemLineTotal = itemUnitTotal * quantity;
    const designName = entry.designId
      ? await getDesignName(entry.designId)
      : "My Christmas";

    built.push({
      designId: entry.designId ? new Types.ObjectId(entry.designId) : null,
      designName,
      previewImage: "",
      variant: variantSnapshot as any,
      style: styleSnapshot,
      lines,
      deliveryOption: cfg.deliveryOption as DeliveryOption,
      unitTotal: itemUnitTotal,
      quantity,
      lineTotal: itemLineTotal,
      hasPersonalization: pricing.hasPersonalization,
      productionDays: pricing.productionDays,
    });

    subtotal += itemLineTotal;
    decorationFee += pricing.decorationFee * quantity;
    if (pricing.productionDays > productionDaysMax) {
      productionDaysMax = pricing.productionDays;
    }
    if (pricing.hasPersonalization) hasPersonalization = true;
  }

  return {
    items: built,
    stockToReserve,
    subtotal,
    decorationFee,
    productionDaysMax,
    hasPersonalization,
  };
}

async function getDesignName(id: string): Promise<string> {
  const doc = await TreeDesign.findById(id).select("name").lean();
  return doc?.name || "My Christmas";
}

// ── assertDeliveryArea ──────────────────────────────────────────────────────
// READY_TO_DISPLAY is restricted to HCM (province 79). DIY_KIT and SEPARATE
// can be delivered nationwide. Throws if the rule is violated.
export function assertDeliveryArea(
  items: IOrderItem[],
  shippingProvinceId: string | undefined
): void {
  const hasReadyToDisplay = items.some(
    (it) => it.deliveryOption === "READY_TO_DISPLAY"
  );
  if (
    hasReadyToDisplay &&
    shippingProvinceId &&
    shippingProvinceId !== SERVICE_PROVINCE_ID
  ) {
    const err = new Error(
      "Hình thức giao cây trang trí sẵn (Ready-to-display) chỉ áp dụng tại khu vực TP.HCM. Quý khách ở tỉnh khác vui lòng chọn Bộ tự trang trí (DIY Kit)."
    ) as Error & { code: string; httpCode: number };
    err.code = "READY_TO_DISPLAY_HCM_ONLY";
    err.httpCode = 400;
    throw err;
  }
}

// ── applyCoupon ──────────────────────────────────────────────────────────────
// Look up a coupon by code, check eligibility, return discount info.
// On any error (db issue, expired, etc.) returns `{ discount: 0, code: "" }`
// so order placement is never blocked by a coupon glitch.
export interface CouponResult {
  discount: number;
  code: string;
}

export async function applyCoupon(
  couponInput: string | undefined,
  subtotal: number
): Promise<CouponResult> {
  if (!couponInput) return { discount: 0, code: "" };
  const code = couponInput.trim().toUpperCase();
  if (!code) return { discount: 0, code: "" };
  try {
    const coupon = await Coupon.findOne({ code, isActive: true });
    if (!coupon) return { discount: 0, code: "" };
    const now = new Date();
    if (now < coupon.startDate || now > coupon.endDate) return { discount: 0, code: "" };
    if (coupon.usedCount >= coupon.usageLimit) return { discount: 0, code: "" };
    if (subtotal < coupon.minOrderValue) return { discount: 0, code: "" };
    const { discountAmount } = computeCouponDiscount(coupon, subtotal);
    await Coupon.updateOne({ _id: coupon._id }, { $inc: { usedCount: 1 } });
    return { discount: discountAmount, code: coupon.code };
  } catch (err) {
    console.warn("[orderService] applyCoupon error:", err);
    return { discount: 0, code: "" };
  }
}

// ── markOrderAsPaid ──────────────────────────────────────────────────────────
// Shared PAID → CONFIRMED transition used by both /payments/checkout and
// /payments/webhook so there's exactly one place that knows the rule.
export interface MarkPaidOptions {
  by: string;
  reason: string;
  paymentId?: string;
  transactionId?: string;
}

export async function markOrderAsPaid(
  order: IOrder,
  opts: MarkPaidOptions
): Promise<void> {
  const now = new Date();
  order.paidAt = now;
  if (opts.paymentId) order.paymentId = opts.paymentId;
  if (opts.transactionId) order.paymentTransactionId = opts.transactionId;
  order.statusHistory.push({
    status: "PAID",
    by: opts.by,
    at: now,
    reason: opts.reason,
  });
  order.status = "CONFIRMED";
  order.statusHistory.push({
    status: "CONFIRMED",
    by: "system",
    at: new Date(),
    reason: "Hệ thống tự động xác nhận sau khi thanh toán",
  });
  await order.save();
}

// ── cleanupCartAfterOrder ────────────────────────────────────────────────────
// Drop the cart items that were used to build this order. Two modes:
//   - explicit cartItemIds → delete by id
//   - otherwise → drop all checked items
export async function cleanupCartAfterOrder(
  userId: string,
  args: {
    cartItemIds?: string[];
    usedItemsCount: number;
  }
): Promise<void> {
  if (Array.isArray(args.cartItemIds) && args.cartItemIds.length > 0) {
    await CartItem.deleteMany({ _id: { $in: args.cartItemIds } });
    return;
  }
  if (args.usedItemsCount > 0) {
    const cart = await Cart.findOne({ userId });
    if (cart) {
      await CartItem.deleteMany({ cartId: cart._id, checked: true });
    }
  }
}

export { SHIPPING_FEE };
