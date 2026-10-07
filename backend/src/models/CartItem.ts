import mongoose, { Schema, Document, Types } from "mongoose";
import type { DesignConfig } from "./TreeDesign";

// ── Cart item (Build Your Christmas) ─────────────────────────────────────────
// A cart item wraps a TreeDesign snapshot: `designId` points to the design
// the user can return to (and keep editing), `config` is the immutable
// snapshot used at checkout, and `priceSnapshot` caches the unit total at
// the time the item was added so FE can show a fast "price changed?" hint.

export interface ICartItem extends Document {
  cartId: Types.ObjectId;
  designId: Types.ObjectId | null;
  config: DesignConfig;
  quantity: number;
  priceSnapshot: number;
  checked: boolean;
}

const CartItemSchema = new Schema<ICartItem>(
  {
    cartId: { type: Schema.Types.ObjectId, ref: "Cart", required: true, index: true },
    designId: {
      type: Schema.Types.ObjectId,
      ref: "TreeDesign",
      default: null,
    },
    config: {
      treeId: { type: Schema.Types.ObjectId, ref: "Tree", required: true },
      styleId: { type: Schema.Types.ObjectId, ref: "Style", required: true },
      accessories: [
        {
          _id: false,
          accessoryId: {
            type: Schema.Types.ObjectId,
            ref: "Accessory",
            required: true,
          },
          quantity: { type: Number, required: true, min: 1 },
          personalizationText: { type: String, default: "" },
        },
      ],
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

// No unique index — FE may legitimately add the same design multiple times
// with different configurations / personalizations.
CartItemSchema.index({ cartId: 1 });

export const CartItem = mongoose.model<ICartItem>("CartItem", CartItemSchema);