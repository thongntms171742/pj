import mongoose, { Schema, Document, Types } from "mongoose";

export interface IReview extends Document {
  productId: Types.ObjectId;
  buyerId: Types.ObjectId;
  orderId: Types.ObjectId;
  rating: number;
  comment: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReviewSchema = new Schema<IReview>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
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
      maxlength: 1000,
    },
  },
  { timestamps: true }
);

// Prevent a buyer from reviewing the same product twice in the same order.
ReviewSchema.index({ orderId: 1, productId: 1, buyerId: 1 }, { unique: true });

export const Review = mongoose.model<IReview>("Review", ReviewSchema);
