import mongoose, { Schema, Document } from "mongoose";

// ── Accessory (phụ kiện trang trí) — Phase 1 Tree Customizer ─────────────────
// Phụ kiện là mặt hàng tồn kho độc lập, gắn lên slot của cây.
//
// - sku: mã nội bộ duy nhất toàn hệ thống (VD: "ORN-BALL-RED-01")
// - slotTypes: loại slot tương thích (VD: ["ball", "star-top", "light-string"])
// - stockQuantity: tồn kho riêng, trừ kho lúc đặt hàng (không trừ lúc tùy chỉnh)
// - isActive: false = ngừng bán (giữ lại để OrderItem snapshot tham chiếu)

export const ACCESSORY_SLOT_TYPES = [
  "ball",
  "star-top",
  "light-string",
  "ribbon",
  "snow",
  "bell",
  "gift-box",
  "generic",
] as const;

export type AccessorySlotType = (typeof ACCESSORY_SLOT_TYPES)[number];

export interface IAccessory extends Document {
  sku: string;
  name: string;
  description: string;
  image: string;
  unitPrice: number;
  stockQuantity: number;
  slotTypes: string[];
  isActive: boolean;
  sortOrder: number;
}

const AccessorySchema = new Schema<IAccessory>(
  {
    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    name: { type: String, required: true, trim: true, index: true },
    description: { type: String, default: "" },
    image: { type: String, default: "" },
    unitPrice: { type: Number, required: true, min: 0 },
    stockQuantity: { type: Number, required: true, min: 0, default: 0 },
    slotTypes: { type: [String], default: ["generic"] },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

AccessorySchema.index({ isActive: 1, sortOrder: 1, name: 1 });
AccessorySchema.index({ slotTypes: 1, isActive: 1 });

export const Accessory = mongoose.model<IAccessory>(
  "Accessory",
  AccessorySchema
);
