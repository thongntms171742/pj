import { Types } from "mongoose";
import { Order, IOrder, IOrderItem } from "../models/Order";
import { Cart } from "../models/Cart";
import { CartItem } from "../models/CartItem";
import { Coupon } from "../models/Coupon";
import { buildPricedDesign } from "./catalogService";
import {
  reserveStock,
  type StockReservation,
} from "./inventoryService";
import { SHIPPING_FEE, SERVICE_PROVINCE_ID, type DeliveryOption } from "../config/business";
import type { PricingInput } from "./pricingService";
import { computeCouponDiscount } from "../controllers/couponController";

// ── orderService ─────────────────────────────────────────────────────────────
// Sau refactor RoomDesign: cart chỉ chứa variantId + deliveryOption. Không
// còn resolveDesign lookup. OrderItem giờ chỉ chứa variant snapshot.
//
// Functions exported:
//   - resolveOrderItems       pull items from cart
//   - buildOrderItems         build snapshots, totals, stock reservations
//   - assertDeliveryArea      throw if READY_TO_DISPLAY outside HCM
//   - applyCoupon             look up coupon, check eligibility
//   - markOrderAsPaid         shared PAID → CONFIRMED transition
//   - cleanupCartAfterOrder   drop cart items used

export interface OrderItemInput {
  pricingInput?: PricingInput;
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
  return cartItems.map((ci) => {
    const cfg = ci.config as any;
    return {
      pricingInput: cfg
        ? {
            variantId: String(cfg.variantId),
            deliveryOption: cfg.deliveryOption,
          }
        : undefined,
      quantity: ci.quantity,
    };
  });
}

// ── buildOrderItems ──────────────────────────────────────────────────────────
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
    const pricingInput = entry.pricingInput;
    if (!pricingInput) continue;

    const { pricing, catalog } = await buildPricedDesign(pricingInput);
    const quantity = Math.max(
      1,
      parseInt(String(entry.quantity ?? 1), 10) || 1
    );

    stockToReserve.push({
      refId: new Types.ObjectId(String(catalog.tree._id)),
      kind: "TREE",
      quantity,
    });

    const variantSnapshot = {
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

    const itemUnitTotal = pricing.unitTotal;
    const itemLineTotal = itemUnitTotal * quantity;

    const existingBuilt = built.find((b) => {
      const sameVariant =
        String(b.variant._id) === String(variantSnapshot._id);
      const sameDelivery = b.deliveryOption === pricingInput.deliveryOption;
      return sameVariant && sameDelivery;
    });

    if (existingBuilt) {
      existingBuilt.quantity += quantity;
      existingBuilt.lineTotal += itemLineTotal;
    } else {
      built.push({
        variant: variantSnapshot as any,
        deliveryOption: pricingInput.deliveryOption as DeliveryOption,
        unitTotal: itemUnitTotal,
        quantity,
        lineTotal: itemLineTotal,
        productionDays: 0,
      });
    }

    subtotal += itemLineTotal;
    decorationFee += 0; // đã purge
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

// ── assertDeliveryArea ──────────────────────────────────────────────────────
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
    if (now < coupon.startDate || now > coupon.endDate)
      return { discount: 0, code: "" };
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
