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
  customization?: IOrderItem["customization"];
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
// CartItem tùy chỉnh mang frozenConfig: chuyển placements đóng băng thành
// accessories [{ accessoryId, quantity }] để pricing lại đúng snapshot lúc
// thêm giỏ (không bị ảnh hưởng khi Design sửa sau đó).
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
  const designIds = cartItems.map(ci => ci.config.designId).filter(Boolean);
  const { Design } = await import("../models/Design");
  const designs = await Design.find({ _id: { $in: designIds } }).select("name").lean();
  const names = new Map(designs.map(d => [String(d._id), d.name]));
  return cartItems.map((ci) => {
    const cfg = ci.config as any;
    if (!cfg) return { pricingInput: undefined, quantity: ci.quantity };
    const frozen = cfg.frozenConfig;
    let accessories: PricingInput["accessories"];
    if (frozen && Array.isArray(frozen.placements) && frozen.placements.length > 0) {
      const countByAcc = new Map<string, number>();
      for (const p of frozen.placements) {
        const id = String((p as any).accessoryId);
        countByAcc.set(id, (countByAcc.get(id) ?? 0) + 1);
      }
      accessories = [...countByAcc.entries()].map(([accessoryId, quantity]) => ({
        accessoryId,
        quantity,
      }));
    }
    return {
      pricingInput: {
        variantId: String(cfg.variantId),
        deliveryOption: cfg.deliveryOption,
        ...(accessories ? { accessories } : {}),
      },
      quantity: ci.quantity,
      ...(frozen ? { customization: {
        designId: String(cfg.designId || ""),
        designName: names.get(String(cfg.designId)) || "Cây đã cá nhân hóa",
        configuration: JSON.parse(JSON.stringify(frozen)),
      } } : {}),
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

    // ── Snapshot decorations: đóng băng tên/ảnh/SKU/đơn giá lúc đặt hàng ──
    // Dùng `pricing.decorations` (đã tính sẵn theo per-slot pricing ở
    // pricingService) để KHÔNG tự tính lại ở đây — tránh lệch giá.
    //
    // LƯU Ý INVENTORY (guardrail #4):
    //   Phụ kiện trang trí là "vật liệu thiết kế", KHÔNG quản lý tồn kho.
    //   Chỉ TREE mới được reserve. Không push kind:"ACCESSORY" vào
    //   stockToReserve — nếu không, mỗi lần đặt cây trang trí sẽ trừ kho
    //   phụ kiện dù phụ kiện không phải hàng hoá bán được.
    const decorations: NonNullable<IOrderItem["decorations"]> = [];
    for (const d of pricing.decorations ?? []) {
      // quantity = số slot dùng trên 1 cây; nhân thêm số lượng cây trong đơn.
      const totalQty = d.quantity * quantity;
      decorations.push({
        modelKind: d.modelKind,
        modelColor: d.modelColor,
        accessoryId: d.accessoryId,
        name: d.name,
        sku: d.sku,
        image: d.image,
        unitPrice: d.unitPrice,
        quantity: totalQty,
        lineTotal: d.lineTotal * quantity,
      });
    }
    decorations.sort((a, b) => a.accessoryId.localeCompare(b.accessoryId));

    const variantSnapshot = {
      _id: String(catalog.tree._id),
      productId: catalog.tree.productId,
      codeId: catalog.tree.codeId,
      size: catalog.tree.size,
      name: catalog.tree.name,
      price: catalog.tree.price,
      unitPrice: catalog.tree.price,
      sku: (catalog.tree as any).sku ?? "",
      bareImage: (catalog.tree as any).bareImage ?? "",
    };

    const itemUnitTotal = pricing.unitTotal;
    const itemLineTotal = itemUnitTotal * quantity;
    const decorTotal = decorations.reduce((s, d) => s + d.lineTotal, 0);

    const decorSig = JSON.stringify(
      decorations.map((d) => [d.accessoryId, d.quantity])
    );
    const existingBuilt = built.find((b) => {
      const sameVariant =
        String(b.variant._id) === String(variantSnapshot._id);
      const sameDelivery = b.deliveryOption === pricingInput.deliveryOption;
      const sameDecor =
        JSON.stringify((b.decorations ?? []).map((d: any) => [d.accessoryId, d.quantity])) ===
        decorSig;
      return sameVariant && sameDelivery && sameDecor && !entry.customization && !b.customization;
    });

    if (existingBuilt) {
      existingBuilt.quantity += quantity;
      existingBuilt.lineTotal += itemLineTotal;
      // Gộp decorations theo accessoryId khi trùng cấu hình.
      if (!existingBuilt.decorations) existingBuilt.decorations = [];
      for (const d of decorations) {
        const prev = (existingBuilt.decorations as Array<{
          accessoryId: string;
          quantity: number;
          lineTotal: number;
        }>).find((x) => x.accessoryId === d.accessoryId);
        if (prev) {
          prev.quantity += d.quantity;
          prev.lineTotal += d.lineTotal;
        } else {
          existingBuilt.decorations.push({ ...d });
        }
      }
    } else {
      built.push({
        ...(entry.customization ? { customization: entry.customization } : {}),
        variant: variantSnapshot as any,
        deliveryOption: pricingInput.deliveryOption as DeliveryOption,
        decorations,
        unitTotal: itemUnitTotal,
        quantity,
        lineTotal: itemLineTotal,
        productionDays: 0,
      });
    }

    subtotal += itemLineTotal;
    decorationFee += decorTotal;
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
