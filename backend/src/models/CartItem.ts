import mongoose, { Schema, Document, Types } from "mongoose";

export interface ICartItem extends Document {
  cartId: Types.ObjectId;
  productId: Types.ObjectId;
  quantity: number;
  priceSnapshot: number;
  checked: boolean;
}

const CartItemSchema = new Schema<ICartItem>(
  {
    cartId: { type: Schema.Types.ObjectId, ref: "Cart", required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, default: 1, min: 1 },
    priceSnapshot: { type: Number, required: true },
    checked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

CartItemSchema.index({ cartId: 1, productId: 1 }, { unique: true });

export const CartItem = mongoose.model<ICartItem>("CartItem", CartItemSchema);
