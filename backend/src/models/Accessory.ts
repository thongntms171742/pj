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
  unitPrice: number | null;
  category?: string;
  catalogKey?: string;
  priceStatus?: "confirmed" | "requires_confirmation";
  mounting?: "tree" | "floor";
  modelKind?: string;
  modelColor?: string;
  unitLabel?: string;
  source?: { document: string; figure: number; priceText: string; note: string; imageSha256: string };
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
    unitPrice: { type: Number, default: null, min: 0 },
    category: { type: String, default: "" },
    catalogKey: { type: String, default: "", index: true },
    priceStatus: { type: String, enum: ["confirmed", "requires_confirmation"], default: "confirmed" },
    mounting: { type: String, enum: ["tree", "floor"], default: "tree" },
    modelKind: { type: String, default: "" },
    modelColor: { type: String, default: "" },
    unitLabel: { type: String, default: "chiếc" },
    source: {
      document: String,
      figure: Number,
      priceText: String,
      note: String,
      imageSha256: String,
    },
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
