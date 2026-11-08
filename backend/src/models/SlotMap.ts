import mongoose, { Schema, Document, Types } from "mongoose";

// ── SlotMap (bảng slot của 1 variant) — Phase 1 Tree Customizer ──────────────
// 1 variant có nhiều bản slotMap, mỗi lần phát hành tăng `version`.
// slotMapVersion đi vào Design.configuration + CartItem frozen copy +
// OrderItem snapshot để phát hiện lệch version.
//
// - slots[].slotId: định danh ổn định trong 1 variant (VD: "ball-01").
//   Migrate 1 chạm chỉ map theo slotId trùng — không tự đoán slot mới.
// - x, y: tọa độ chuẩn hóa 0–1 theo bounding-box cây (KHÔNG lưu pixel).
// - radius: bán kính snap chuẩn hóa (0–1, tương đối theo chiều rộng cây).
// - z: thứ tự xếp lớp render.
// - allowedAccessoryTypes: loại phụ kiện được gắn vào slot này.

export interface ISlotDefinition {
  slotId: string;
  slotType: string;
  x: number;
  y: number;
  radius: number;
  z: number;
  allowedAccessoryTypes: string[];
}

export interface ISlotMap extends Document {
  variantId: Types.ObjectId;
  version: number;
  isPublished: boolean;
  slots: ISlotDefinition[];
}

const SlotDefinitionSchema = new Schema<ISlotDefinition>(
  {
    slotId: { type: String, required: true, trim: true },
    slotType: { type: String, required: true, trim: true },
    x: { type: Number, required: true, min: 0, max: 1 },
    y: { type: Number, required: true, min: 0, max: 1 },
    radius: { type: Number, required: true, min: 0, max: 1 },
    z: { type: Number, default: 0 },
    allowedAccessoryTypes: { type: [String], default: [] },
  },
  { _id: false }
);

const SlotMapSchema = new Schema<ISlotMap>(
  {
    variantId: {
      type: Schema.Types.ObjectId,
      ref: "Tree",
      required: true,
      index: true,
    },
    version: { type: Number, required: true, min: 1 },
    isPublished: { type: Boolean, default: false, index: true },
    slots: { type: [SlotDefinitionSchema], default: [] },
  },
  { timestamps: true }
);

// Mỗi variant chỉ có 1 slotMap cho mỗi version.
SlotMapSchema.index({ variantId: 1, version: 1 }, { unique: true });
// Query bản đang phát hành nhanh: 1 variant → 1 bản published.
SlotMapSchema.index(
  { variantId: 1, isPublished: 1 },
  {
    unique: true,
    partialFilterExpression: { isPublished: true },
  }
);

export const SlotMap = mongoose.model<ISlotMap>("SlotMap", SlotMapSchema);
