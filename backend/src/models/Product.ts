import mongoose, { Schema, Document, Types } from "mongoose";

// Size stock mapping (FE-facing). Optional — products created via the legacy
// single-size+quantity shape continue to work. When present, FE can read
// per-size stock and price deltas without having to call separate endpoints.
export interface IProduct extends Document {
  title: string;
  description: string;
  price: number;
  condition: number;
  size: string;
  quantity: number;
  sizeQuantities?: Record<string, number>;
  sizePriceDeltas?: Record<string, number>;
  status: "pending" | "active" | "reserved" | "sold" | "archived";
  reservedUntil: Date | null;
  reservedByOrderId: Types.ObjectId | null;
  coverImage: string;
  views: number;
  likes: number;
  location: string;
  sellerId: Types.ObjectId;
  categoryId: Types.ObjectId | null;
}

const ProductSchema = new Schema<IProduct>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    condition: { type: Number, required: true, min: 0, max: 100 },
    size: { type: String, required: true, trim: true },
    quantity: { type: Number, default: 1, min: 0 },
    // Per-size stock map (e.g. { XS: 0, S: 0, M: 65, L: 0, XL: 0, XXL: 0 }).
    // Optional for backward compat — older products keep the legacy
    // single-size+quantity shape and mapProduct derives a synthetic map on
    // read if this field is missing/empty.
    sizeQuantities: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    // Per-size price deltas in VND applied on top of `price` (e.g. { XS: -10000, L: 20000 }).
    // Optional. When absent FE falls back to using `price` for every size.
    sizePriceDeltas: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    status: {
      type: String,
      enum: ["pending", "active", "reserved", "sold", "archived"],
      default: "pending",
    },
    reservedUntil: { type: Date, default: null },
    reservedByOrderId: { type: Schema.Types.ObjectId, ref: "Order", default: null },
    coverImage: { type: String, default: "" },
    views: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    location: { type: String, default: "" },
    sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", default: null, index: true },
  },
  { timestamps: true }
);

ProductSchema.index({ status: 1 });
ProductSchema.index({ sellerId: 1, status: 1 });

export const Product = mongoose.model<IProduct>("Product", ProductSchema);
