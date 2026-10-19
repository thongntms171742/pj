import { toStr } from "../utils/ids";
import { isObjectIdLike } from "../utils/ids";
import type { IOrder } from "../models/Order";

/**
 * Map an Order document (or lean object) to the FE-facing shape.
 * Single source of truth cho Order JSON shape. Controllers, payments, admin
 * all call this. Defined once here so we don't drift across files.
 *
 * Shape contract: see docs/FE_API_REFERENCE.md
 *   GET /api/orders  →  { orders: OrderDto[] }
 *   POST /api/orders →  { order: OrderDto }
 *   GET /api/admin/orders/:id/details  →  { order: OrderDto }
 */
export interface OrderItemVariantDto {
  _id: string;
  productId: string;
  codeId: string;
  size: string;
  name: string;
  unitPrice: number;
  price: number;
  sku: string;
  bareImage: string;
}

export interface OrderItemDto {
  variant: OrderItemVariantDto;
  deliveryOption: string;
  unitTotal: number;
  quantity: number;
  lineTotal: number;
  productionDays: number;
}

export interface StatusEventDto {
  status: string;
  by: string;
  at: string;
  reason?: string;
}

export interface PickupInfoDto {
  name: string;
  phone: string;
  address: string;
  provinceId: string;
  provinceName: string;
  communeId: string;
  communeName: string;
  district: string;
  email: string;
  note: string;
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
  pickupInfo: PickupInfoDto | null;
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
 */
export function orderToDto(o: any): OrderDto {
  return {
    _id: toStr(o._id),
    orderCode: o.orderCode,
    buyerId: o.buyerId ? toStr(o.buyerId) : "",
    items: (o.items || []).map((it: any) => ({
      variant: it.variant ?? it.tree,
      deliveryOption: it.deliveryOption,
      unitTotal: it.unitTotal,
      quantity: it.quantity,
      lineTotal: it.lineTotal,
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
    pickupInfo: o.pickupInfo
      ? {
          name: o.pickupInfo.name || "",
          phone: o.pickupInfo.phone || "",
          address: o.pickupInfo.address || "",
          provinceId: o.pickupInfo.provinceId || "",
          provinceName: o.pickupInfo.provinceName || "",
          communeId: o.pickupInfo.communeId || "",
          communeName: o.pickupInfo.communeName || "",
          district: o.pickupInfo.district || "",
          email: o.pickupInfo.email || "",
          note: o.pickupInfo.note || "",
        }
      : null,
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
