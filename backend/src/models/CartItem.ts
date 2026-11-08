import mongoose, { Schema, Document, Types } from "mongoose";

// ── Cart item (Build Your Christmas) ─────────────────────────────────────────
// Sau refactor RoomDesign: cart chỉ lưu variantId (Tree) + deliveryOption.
// Không còn designId — checkout dùng variant trực tiếp, không cần reference
// tới Design.

export interface ICartDesignFrozenConfig {
  configVersion: number;
  slotMapVersion: number;
  placements: Array<{
    slotId: string;
    accessoryId: Types.ObjectId;
    x: number;
    y: number;
    rotation?: number;
    scale?: number;
  }>;
}

export interface ICartItem extends Document {
  cartId: Types.ObjectId;
  config: {
    variantId: Types.ObjectId;
    deliveryOption: "READY_TO_DISPLAY" | "DIY_KIT" | "SEPARATE";
    /** Tham chiếu Design tùy chỉnh (optional — cây trơn thì không có). */
    designId?: Types.ObjectId;
    /** Bản đóng băng placements + version lúc thêm vào giỏ. */
    frozenConfig?: ICartDesignFrozenConfig;
  };
  quantity: number;
  priceSnapshot: number;
  checked: boolean;
}

const FrozenPlacementSchema = new Schema(
  {
    slotId: { type: String, required: true },
    accessoryId: { type: Schema.Types.ObjectId, ref: "Accessory", required: true },
    x: { type: Number, required: true, min: 0, max: 1 },
    y: { type: Number, required: true, min: 0, max: 1 },
    rotation: { type: Number, default: 0 },
    scale: { type: Number, default: 1 },
  },
  { _id: false }
);

const FrozenConfigSchema = new Schema<ICartDesignFrozenConfig>(
  {
    configVersion: { type: Number, required: true, min: 1 },
    slotMapVersion: { type: Number, required: true, min: 0 },
    placements: { type: [FrozenPlacementSchema], default: [] },
  },
  { _id: false }
);

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
      designId: { type: Schema.Types.ObjectId, ref: "Design", required: false },
      frozenConfig: { type: FrozenConfigSchema, required: false },
    },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    priceSnapshot: { type: Number, required: true, min: 0 },
    checked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const CartItem = mongoose.model<ICartItem>("CartItem", CartItemSchema);
