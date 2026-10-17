import mongoose, { Schema, Document, Types } from "mongoose";

// ── Cart item (Build Your Christmas) ─────────────────────────────────────────
// Sau refactor: config chỉ còn variantId (Tree) + deliveryOption. Không còn
// accessories array, không còn styleId. Phụ kiện/style giờ nằm gọn trong
// TreeProduct.description.
export interface ICartItem extends Document {
  cartId: Types.ObjectId;
  designId: Types.ObjectId | null;
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
    cartId: { type: Schema.Types.ObjectId, ref: "Cart", required: true, index: true },
    designId: {
      type: Schema.Types.ObjectId,
      ref: "Design",
      default: null,
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
