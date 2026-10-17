import mongoose, { Schema, Document, Types } from "mongoose";
import type { DeliveryOption } from "./Design";

// ── Order line item ──────────────────────────────────────────────────────────
// Sau refactor phụ kiện: chỉ giữ variant (Tree SKU) + deliveryOption. Không còn
// style, không còn lines (accessory lines). Mọi thông tin phụ kiện đã nằm
// trong TreeProduct.description tại thời điểm khách tạo design.

export interface IOrderItem {
  designId: Types.ObjectId | null;
  designName: string;
  previewImage: string;
  variant: {
    _id: string;
    productId: string;
    codeId: string;
    size: string;
    name: string;
    unitPrice: number;
    price: number;
    sku: string;
    bareImage: string;
  };
  deliveryOption: DeliveryOption;
  unitTotal: number;
  quantity: number;
  lineTotal: number;
  productionDays: number;
}

// ── Status history event ──────────────────────────────────────────────────────
const StatusEventSchema = new Schema(
  {
    status: { type: String, required: true },
    by: { type: String, default: "system" },
    at: { type: Date, default: Date.now },
    reason: { type: String },
  },
  { _id: false }
);

// ── Order statuses ────────────────────────────────────────────────────────────
export const ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "PAID",
  "CONFIRMED",
  "PACKING",
  "SHIPPING",
  "DELIVERING",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
  "CANCEL_REQUESTED",
  "DISPUTED",
  "REFUNDED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ["PAID", "CONFIRMED", "CANCELLED"],
  PAID: ["CONFIRMED", "PACKING", "CANCELLED", "REFUNDED"],
  CONFIRMED: ["PACKING", "SHIPPING", "CANCELLED", "CANCEL_REQUESTED"],
  PACKING: ["SHIPPING", "CANCELLED", "CANCEL_REQUESTED"],
  SHIPPING: ["DELIVERING", "DELIVERED", "CANCELLED"],
  DELIVERING: ["DELIVERED", "COMPLETED"],
  DELIVERED: ["COMPLETED", "DISPUTED"],
  COMPLETED: [],
  CANCELLED: [],
  CANCEL_REQUESTED: ["CANCELLED", "CONFIRMED"],
  DISPUTED: ["REFUNDED", "COMPLETED"],
  REFUNDED: [],
};

// ── Shipment timeline event ──────────────────────────────────────────────────
const ShippingEventSchema = new Schema(
  {
    status: { type: String, required: true },
    description: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    location: { type: String, default: "" },
  },
  { _id: false }
);

// ── Pickup address information ───────────────────────────────────────────────
// `address` = số nhà + tên đường (text tự do).
// `provinceId` + `communeId` = mã hành chính từ AddressKit, bắt buộc khi tạo
// vận đơn. Tỉnh luôn cứng "79" (TP.HCM) — chỉ cần dropdown phường/xã.
const PickupInfoSchema = new Schema(
  {
    name: { type: String, default: "" },
    phone: { type: String, default: "" },
    address: { type: String, default: "" },
    provinceId: { type: String, default: "" },
    provinceName: { type: String, default: "" },
    communeId: { type: String, default: "" },
    communeName: { type: String, default: "" },
    district: { type: String, default: "" },
    email: { type: String, default: "" },
    note: { type: String, default: "" },
  },
  { _id: false }
);

export interface IPickupInfo {
  name?: string;
  phone?: string;
  address?: string;
  provinceId?: string;
  provinceName?: string;
  communeId?: string;
  communeName?: string;
  district?: string;
  email?: string;
  note?: string;
}

export interface IShippingEvent {
  status: string;
  description: string;
  timestamp: Date;
  location?: string;
}

export interface IOrder extends Document {
  orderCode: string;
  buyerId: Types.ObjectId;
  items: IOrderItem[];
  subtotal: number;
  shippingFee: number;
  decorationFee: number;
  discountAmount: number;
  discountCode?: string;
  totalAmount: number;
  internalNotes?: string;
  status: OrderStatus;
  statusHistory: { status: string; by: string; at: Date; reason?: string; note?: string }[];
  paymentMethod: string;
  paymentId: string;
  paymentTransactionId?: string;
  paidAt: Date | null;
  // Set when buyer confirms "Tôi đồng ý với thiết kế này" at checkout.
  designConfirmedAt: Date | null;
  // Set when the order is created (= when the snapshot was locked).
  designLockedAt: Date | null;
  shippingName: string;
  shippingPhone: string;
  shippingAddress: string;
  shippingProvinceId?: string;
  shippingProvinceName?: string;
  shippingCommuneId?: string;
  shippingCommuneName?: string;
  addressEffectiveDate?: string;
  trackingNumber: string;
  shippingProvider: string;
  trackingUrl: string;
  pickupInfo?: IPickupInfo | null;
  shippedAt?: Date | null;
  estimatedDeliveryAt?: Date | null;
  deliveredAt?: Date | null;
  shippingEvents: IShippingEvent[];
  idempotencyKey: string;
  cancelReason?: string;
  cancelRequestedAt?: Date | null;
}

const OrderItemSchema = new Schema<IOrderItem>(
  {
    designId: { type: Schema.Types.ObjectId, ref: "TreeDesign", default: null },
    designName: { type: String, required: true, default: "My Christmas" },
    previewImage: { type: String, default: "" },
    variant: {
      _id: { type: String, required: true },
      productId: { type: String, required: true },
      codeId: { type: String, required: true },
      size: { type: String, required: true },
      name: { type: String, required: true },
      unitPrice: { type: Number, required: true, min: 0 },
      price: { type: Number, required: true, min: 0 },
      sku: { type: String, default: "" },
      bareImage: { type: String, default: "" },
    },
    deliveryOption: {
      type: String,
      enum: ["READY_TO_DISPLAY", "DIY_KIT", "SEPARATE"],
      required: true,
    },
    unitTotal: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    lineTotal: { type: Number, required: true, min: 0 },
    productionDays: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const OrderSchema = new Schema<IOrder>(
  {
    orderCode: { type: String, required: true, unique: true },
    buyerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    items: { type: [OrderItemSchema], required: true },
    subtotal: { type: Number, default: 0 },
    shippingFee: { type: Number, default: 30000 },
    decorationFee: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    discountCode: { type: String, default: "" },
    totalAmount: { type: Number, required: true },
    internalNotes: { type: String, default: "" },
    status: {
      type: String,
      enum: ORDER_STATUSES,
      default: "PENDING_PAYMENT",
    },
    statusHistory: { type: [StatusEventSchema], default: [] },
    paymentMethod: { type: String, default: "" },
    paymentId: { type: String, default: "" },
    paymentTransactionId: { type: String, default: "" },
    paidAt: { type: Date, default: null },
    designConfirmedAt: { type: Date, default: null },
    designLockedAt: { type: Date, default: null },
    shippingName: { type: String, default: "" },
    shippingPhone: { type: String, default: "" },
    shippingAddress: { type: String, default: "" },
    shippingProvinceId: { type: String, default: "" },
    shippingProvinceName: { type: String, default: "" },
    shippingCommuneId: { type: String, default: "" },
    shippingCommuneName: { type: String, default: "" },
    addressEffectiveDate: { type: String, default: "latest" },
    trackingNumber: { type: String, default: "" },
    shippingProvider: { type: String, default: "" },
    trackingUrl: { type: String, default: "" },
    pickupInfo: { type: PickupInfoSchema, default: null },
    shippedAt: { type: Date, default: null },
    estimatedDeliveryAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    shippingEvents: { type: [ShippingEventSchema], default: [] },
    idempotencyKey: { type: String, default: undefined },
    cancelReason: { type: String, default: "" },
    cancelRequestedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

OrderSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
OrderSchema.index({ buyerId: 1, createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });

// Make sure virtuals show up when controllers do `.toJSON()` / `.toObject()`.
OrderSchema.set("toJSON", { virtuals: true });
OrderSchema.set("toObject", { virtuals: true });

export const Order = mongoose.model<IOrder>("Order", OrderSchema);