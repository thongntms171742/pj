import mongoose, { Schema, Document } from "mongoose";

// ── Accessory (phụ kiện trang trí) — Phase 1 Tree Customizer ─────────────────
// Phụ kiện là mặt hàng tồn kho độc lập, gắn lên slot của cây.
//
// - sku: mã nội bộ duy nhất toàn hệ thống (VD: "ORN-BALL-RED-01")
// - slotTypes: loại slot tương thích (VD: ["ball", "star-top", "light-string"])
// - stockQuantity: tồn kho riêng, trừ kho lúc đặt hàng (không trừ lúc tùy chỉnh)
// - isActive: false = ngừng bán (giữ lại để OrderItem snapshot tham chiếu)
//
// ── Metadata ghép ảnh (context-aware compositing) ────────────────────────────
// Mọi field dưới đây là OPTIONAL. Thiếu ⇒ FE fallback về hành vi cũ:
//   - anchor      thiếu ⇒ neo giữa ảnh (0.5, 0.5)
//   - shadow      thiếu ⇒ 'soft'
//   - defaultScale thiếu ⇒ 1
//
// ⚠️ `anchor` được đo trên ảnh `image`, KHÔNG phải `previewImage`.
// Nếu 2 ảnh khác tỉ lệ ⇒ neo sẽ lệch.

/** Điểm neo chuẩn hoá 0–1 trong bbox của ảnh `image`. */
export interface IAccessoryAnchor {
  x: number;
  y: number;
}

/** Kiểu bóng của phụ kiện. */
export type AccessoryShadow = "none" | "soft" | "contact";

export const ACCESSORY_SHADOW_TYPES = ["none", "soft", "contact"] as const;

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
  /**
   * Ảnh preview chất lượng cao (render từ model 3D hoặc chụp tay).
   * KHÔNG thay thế được `image` — `image` là ảnh PNG alpha được KÉO lên cây.
   */
  previewImage?: string;
  /** URL file model 3D (.glb / .gltf) — optional, chỉ Admin dùng ở phase này. */
  model3dUrl?: string;
  /** Tỉ lệ hiển thị mặc định của model 3D. */
  model3dScale?: number;
  /** Góc xoay hiển thị mặc định của model 3D (độ). */
  model3dRotation?: number;
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
  /** Điểm neo chuẩn hoá 0–1 trong bbox của `image`. */
  anchor?: IAccessoryAnchor;
  /** Kiểu bóng: 'none' | 'soft' | 'contact'. */
  shadow?: AccessoryShadow;
  /** Tỉ lệ mặc định khi gắn (0.3–3). */
  defaultScale?: number;
}

const AccessoryAnchorSchema = new Schema<IAccessoryAnchor>(
  {
    x: { type: Number, min: 0, max: 1, default: 0.5 },
    y: { type: Number, min: 0, max: 1, default: 0.5 },
  },
  { _id: false }
);

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
    previewImage: { type: String, default: "" },
    model3dUrl: { type: String, default: "" },
    model3dScale: { type: Number, default: 1 },
    model3dRotation: { type: Number, default: 0 },
    unitPrice: { type: Number, default: null, min: 0 },
    category: { type: String, default: "" },
    catalogKey: { type: String, default: "", index: true },
    priceStatus: { type: String, enum: ["confirmed", "requires_confirmation"], default: "confirmed" },
    mounting: { type: String, enum: ["tree", "floor"], default: "tree" },
    modelKind: { type: String, default: "" },
    modelColor: { type: String, default: "" },
    unitLabel: { type: String, default: "chiếc" },
    source: { document: String, figure: Number, priceText: String, note: String, imageSha256: String },
    stockQuantity: { type: Number, required: true, min: 0, default: 0 },
    slotTypes: { type: [String], default: ["generic"] },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
    anchor: { type: AccessoryAnchorSchema, required: false },
    shadow: {
      type: String,
      enum: ACCESSORY_SHADOW_TYPES,
      default: "soft",
    },
    defaultScale: { type: Number, min: 0.3, max: 3, default: 1 },
  },
  { timestamps: true }
);

AccessorySchema.index({ isActive: 1, sortOrder: 1, name: 1 });
AccessorySchema.index({ slotTypes: 1, isActive: 1 });

export const Accessory = mongoose.model<IAccessory>(
  "Accessory",
  AccessorySchema
);
