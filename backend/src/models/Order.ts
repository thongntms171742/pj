import mongoose, { Schema, Document, Types } from "mongoose";

// ── Order item (embedded sub-document) ────────────────────────────────────────
const OrderItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    productName: { type: String, required: true },
    productImageUrl: { type: String, default: "" },
    unitPrice: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    conditionSnapshot: { type: Number, default: 0 },
    // Commission snapshot at the time the order was created.
    // Stored on the item so historical orders keep the rate that was
    // applied at checkout, even if the seller's commissionRate changes later.
    // commissionRate ∈ [0, 1] — e.g. 0.1 means 10% platform fee, seller keeps 90%.
    commissionRate: { type: Number, default: 0.1, min: 0, max: 1 },
    // Platform commission earned on this line item, in VND. Snapshotted so
    // financial reports don't drift when the seller rate changes.
    commissionAmount: { type: Number, default: 0, min: 0 },
    sellerAmount: { type: Number, default: 0 },
  },
  { _id: false }
);

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

// Valid transitions from each status
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

// ── Shipment timeline event ───────────────────────────────────────────────────
const ShippingEventSchema = new Schema(
  {
    status: { type: String, required: true },
    description: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    location: { type: String, default: "" },
  },
  { _id: false }
);

// ── Pickup address information ────────────────────────────────────────────────
const PickupInfoSchema = new Schema(
  {
    name: { type: String, default: "" },
    phone: { type: String, default: "" },
    address: { type: String, default: "" },
    province: { type: String, default: "" },
    district: { type: String, default: "" },
    ward: { type: String, default: "" },
    email: { type: String, default: "" },
    note: { type: String, default: "" },
  },
  { _id: false }
);

// ── Order document ────────────────────────────────────────────────────────────
export interface IOrderItem {
  productId: Types.ObjectId;
  sellerId: Types.ObjectId;
  productName: string;
  productImageUrl?: string;
  unitPrice: number;
  quantity: number;
  conditionSnapshot?: number;
  commissionRate: number;
  commissionAmount: number;
  sellerAmount: number;
}

export interface IPickupInfo {
  name?: string;
  phone?: string;
  address?: string;
  province?: string;
  district?: string;
  ward?: string;
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
  platformFee: number;
  discount: number;
  totalAmount: number;
  status: OrderStatus;
  statusHistory: { status: string; by: string; at: Date; reason?: string }[];
  paymentMethod: string;
  paymentId: string;
  paidAt: Date | null;
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

const OrderSchema = new Schema<IOrder>(
  {
    orderCode: { type: String, required: true, unique: true },
    buyerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    items: { type: [OrderItemSchema], required: true },
    subtotal: { type: Number, default: 0 },
    shippingFee: { type: Number, default: 30000 },
    platformFee: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    status: {
      type: String,
      enum: ORDER_STATUSES,
      default: "PENDING_PAYMENT",
    },
    statusHistory: { type: [StatusEventSchema], default: [] },
    paymentMethod: { type: String, default: "" },
    paymentId: { type: String, default: "" },
    paidAt: { type: Date, default: null },
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
OrderSchema.index({ "items.sellerId": 1 });

export const Order = mongoose.model<IOrder>("Order", OrderSchema);
