import mongoose, { Schema, Document, Types } from "mongoose";

export interface IProduct extends Document {
  title: string;
  description: string;
  price: number;
  condition: number;
  size: string;
  quantity: number;
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
