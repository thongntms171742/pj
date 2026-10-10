import { toStr } from "../utils/ids";
import { isObjectIdLike } from "../utils/ids";
import type { IOrder } from "../models/Order";

/**
 * Map an Order document (or lean object) to the FE-facing shape.
 * This is the single source of truth for what an order JSON looks like
 * — controllers, payments, admin all call this. Defined once here so
 * we don't drift across files.
 *
 * Shape contract: see docs/FE_API_REFERENCE.md
 *   GET /api/orders  →  { orders: OrderDto[] }
 *   POST /api/orders →  { order: OrderDto }
 *   GET /api/admin/orders/:id/details  →  { order: OrderDto }
 */
export interface OrderItemDto {
  designId: string | null;
  designName: string;
  previewImage: string;
  variant: any;
  style: any;
  lines: OrderLineDto[];
  deliveryOption: string;
  unitTotal: number;
  quantity: number;
  lineTotal: number;
  hasPersonalization: boolean;
  productionDays: number;
}

export interface OrderLineDto {
  kind: "ACCESSORY" | "SERVICE";
  refId: string | null;
  type: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  personalizationText: string;
}

export interface StatusEventDto {
  status: string;
  by: string;
  at: string;
  reason?: string;
}

export interface OrderDto {
  _id: string;
  orderCode: string;
  buyerId: string;
  items: OrderItemDto[];
  subtotal: number;
  shippingFee: number;
  decorationFee: number;
  discount: number;
  discountCode: string;
  discountAmount: number;
  totalAmount: number;
  internalNotes: string;
  paymentTransactionId: string;
  status: string;
  statusHistory: StatusEventDto[];
  paymentMethod: string;
  paymentId: string;
  paidAt: string | null;
  designConfirmedAt: string | null;
  designLockedAt: string | null;
  shippingName: string;
  shippingPhone: string;
  shippingAddress: string;
  shippingProvinceId: string;
  shippingProvinceName: string;
  shippingCommuneId: string;
  shippingCommuneName: string;
  addressEffectiveDate: string;
  trackingNumber: string;
  shippingProvider: string;
  trackingUrl: string;
  pickupInfo: any | null;
  shippedAt: string | null;
  estimatedDeliveryAt: string | null;
  deliveredAt: string | null;
  cancelReason: string;
  cancelRequestedAt: string | null;
  idempotencyKey: string;
  createdAt: string;
}

const toIso = (v: unknown): string => {
  if (!v) return new Date().toISOString();
  if (v instanceof Date) return v.toISOString();
  try {
    return new Date(v as string | number).toISOString();
  } catch {
    return new Date().toISOString();
  }
};

const toIsoOrNull = (v: unknown): string | null => {
  if (!v) return null;
  return toIso(v);
};

/**
 * Map one IOrder (or plain object from .lean()) to OrderDto.
 * Accepts anything with the right fields so this works for both Mongoose
 * documents and lean query results.
 */
export function orderToDto(o: any): OrderDto {
  return {
    _id: toStr(o._id),
    orderCode: o.orderCode,
    buyerId: o.buyerId ? toStr(o.buyerId) : "",
    items: (o.items || []).map((it: any) => ({
      designId: it.designId ? toStr(it.designId) : null,
      designName: it.designName,
      previewImage: it.previewImage || "",
      variant: it.variant ?? it.tree, // tolerate legacy docs that used `tree`
      style: it.style,
      lines: (it.lines || []).map((l: any) => ({
        kind: l.kind,
        refId: l.refId ? toStr(l.refId) : null,
        type: l.type,
        name: l.name,
        unitPrice: l.unitPrice,
        quantity: l.quantity,
        lineTotal: l.lineTotal,
        personalizationText: l.personalizationText || "",
      })),
      deliveryOption: it.deliveryOption,
      unitTotal: it.unitTotal,
      quantity: it.quantity,
      lineTotal: it.lineTotal,
      hasPersonalization: it.hasPersonalization,
      productionDays: it.productionDays,
    })),
    subtotal: o.subtotal,
    shippingFee: o.shippingFee,
    decorationFee: o.decorationFee || 0,
    discount: o.discount || 0,
    discountCode: o.discountCode || "",
    discountAmount: o.discountAmount || o.discount || 0,
    totalAmount: o.totalAmount,
    internalNotes: o.internalNotes || "",
    paymentTransactionId: o.paymentTransactionId || "",
    status: o.status,
    statusHistory: (o.statusHistory || []).map((h: any) => ({
      status: h.status,
      by: h.by,
      at: toIso(h.at),
      reason: h.reason,
    })),
    paymentMethod: o.paymentMethod || "",
    paymentId: o.paymentId || "",
    paidAt: toIsoOrNull(o.paidAt),
    designConfirmedAt: toIsoOrNull(o.designConfirmedAt),
    designLockedAt: toIsoOrNull(o.designLockedAt),
    shippingName: o.shippingName || "",
    shippingPhone: o.shippingPhone || "",
    shippingAddress: o.shippingAddress || "",
    shippingProvinceId: o.shippingProvinceId || "",
    shippingProvinceName: o.shippingProvinceName || "",
    shippingCommuneId: o.shippingCommuneId || "",
    shippingCommuneName: o.shippingCommuneName || "",
    addressEffectiveDate: o.addressEffectiveDate || "",
    trackingNumber: o.trackingNumber || "",
    shippingProvider: o.shippingProvider || "",
    trackingUrl: o.trackingUrl || "",
    pickupInfo: o.pickupInfo || null,
    shippedAt: toIsoOrNull(o.shippedAt),
    estimatedDeliveryAt: toIsoOrNull(o.estimatedDeliveryAt),
    deliveredAt: toIsoOrNull(o.deliveredAt),
    cancelReason: o.cancelReason || "",
    cancelRequestedAt: toIsoOrNull(o.cancelRequestedAt),
    idempotencyKey: o.idempotencyKey,
    createdAt: toIso(o.createdAt),
  };
}

export { isObjectIdLike };
