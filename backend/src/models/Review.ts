import mongoose, { Schema, Document, Types } from "mongoose";

export interface IAdminReply {
  comment: string;
  repliedAt: Date;
  repliedBy?: Types.ObjectId;
}

export interface IReview extends Document {
    productId: Types.ObjectId;
  variantId?: Types.ObjectId | null;
  buyerId: Types.ObjectId;
  orderId: Types.ObjectId;
  rating: number; // 1 to 5
  comment: string;
  images: string[];
  adminReply?: IAdminReply | null;
  status: "APPROVED" | "HIDDEN";
  createdAt: Date;
  updatedAt: Date;
}

const AdminReplySchema = new Schema(
  {
    comment: { type: String, required: true, trim: true },
    repliedAt: { type: Date, default: Date.now },
    repliedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { _id: false }
);

const ReviewSchema = new Schema<IReview>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: "TreeProduct",
      required: true,
      index: true,
    },
    variantId: {
      type: Schema.Types.ObjectId,
      ref: "Tree",
      default: null,
    },
    buyerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      default: "",
      trim: true,
    },
    images: {
      type: [String],
      default: [],
    },
    adminReply: {
      type: AdminReplySchema,
      default: null,
    },
    status: {
      type: String,
      enum: ["APPROVED", "HIDDEN"],
      default: "APPROVED",
      index: true,
    },
  },
  { timestamps: true }
);

// Prevent duplicate reviews for the same product in the same order by the same buyer
ReviewSchema.index({ orderId: 1, productId: 1, buyerId: 1 }, { unique: true });
ReviewSchema.index({ productId: 1, status: 1, createdAt: -1 });
ReviewSchema.index({ buyerId: 1, createdAt: -1 });

export const Review = mongoose.model<IReview>("Review", ReviewSchema);
