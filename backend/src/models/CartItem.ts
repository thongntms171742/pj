import mongoose, { Schema, Document, Types } from "mongoose";

// ── Cart item (Build Your Christmas) ─────────────────────────────────────────
// Sau refactor RoomDesign: cart chỉ lưu variantId (Tree) + deliveryOption.
// Không còn designId — checkout dùng variant trực tiếp, không cần reference
// tới Design.

export interface ICartItem extends Document {
  cartId: Types.ObjectId;
  config: {
    variantId: Types.ObjectId;
    deliveryOption: "READY_TO_DISPLAY" | "DIY_KIT" | "SEPARATE";
  };
  quantity: number;
  priceSnapshot: number;
  checked: boolean;
}

const CartItemSchema = new Schema<ICartItem>(
  {
    cartId: {
      type: Schema.Types.ObjectId,
      ref: "Cart",
      required: true,
      index: true,
    },
    config: {
      variantId: { type: Schema.Types.ObjectId, ref: "Tree", required: true },
      deliveryOption: {
        type: String,
        enum: ["READY_TO_DISPLAY", "DIY_KIT", "SEPARATE"],
        required: true,
        default: "READY_TO_DISPLAY",
      },
    },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    priceSnapshot: { type: Number, required: true, min: 0 },
    checked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const CartItem = mongoose.model<ICartItem>("CartItem", CartItemSchema);
