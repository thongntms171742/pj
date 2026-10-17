import mongoose, { Schema, Document, Types } from "mongoose";

// ── Design (gộp TreeDesign + AIDesign cũ) — Build Your Christmas ────────────
// Design là 1 "bản thiết kế" do khách tạo: chọn 1 TreeProduct (concept cây
// hoàn chỉnh đã có sẵn trong catalog — gồm cây + phụ kiện + style mô tả
// trong coverImage/description), viết prompt mô tả mong muốn, AI sẽ render
// ảnh thành phẩm dựa trên TreeProduct làm reference.
//
// Schema tối giản: không còn styleId, accessories array, isPreset.
//   - baseTreeProductId: ref TreeProduct (concept hoàn chỉnh)
//   - prompt: text khách viết
//   - imageUrl: ảnh AI render
//   - status: DRAFT → AI_PENDING → AI_COMPLETED → CONFIRMED (khi add-to-cart)
//   - deliveryOption: READY_TO_DISPLAY / DIY_KIT / SEPARATE
//   - pricingSnapshot: cache giá tại thời điểm confirm
//   - isPublic: bật/tắt chia sẻ qua slug
//   - duplicatedFrom: clone từ design khác

export type DeliveryOption = "READY_TO_DISPLAY" | "DIY_KIT" | "SEPARATE";

export const DELIVERY_OPTIONS: ReadonlyArray<DeliveryOption> = [
  "READY_TO_DISPLAY",
  "DIY_KIT",
  "SEPARATE",
];

export type DesignStatus =
  | "DRAFT"
  | "AI_PENDING"
  | "AI_COMPLETED"
  | "CONFIRMED"
  | "FAILED";

export interface DesignPricingSnapshot {
  treePrice: number;
  decorationFee: number;
  shippingFee: number;
  totalSalePrice: number;
}

export interface IDesign extends Document {
  ownerId: Types.ObjectId | null;
  name: string;
  slug: string;
  year: number;
  baseTreeProductId: Types.ObjectId;
  prompt: string;
  imageUrl: string;
  imagePublicId: string;
  status: DesignStatus;
  lastError: string | null;
  pricingSnapshot: DesignPricingSnapshot;
  deliveryOption: DeliveryOption;
  isPublic: boolean;
  duplicatedFrom: Types.ObjectId | null;
  previewImage: string;
  createdAt: Date;
  updatedAt: Date;
}

const DesignSchema = new Schema<IDesign>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    name: { type: String, required: true, trim: true, default: "My Christmas" },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    year: { type: Number, required: true, default: () => new Date().getFullYear() },
    baseTreeProductId: {
      type: Schema.Types.ObjectId,
      ref: "TreeProduct",
      required: true,
      index: true,
    },
    prompt: { type: String, default: "", trim: true },
    imageUrl: { type: String, default: "", trim: true },
    imagePublicId: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: ["DRAFT", "AI_PENDING", "AI_COMPLETED", "CONFIRMED", "FAILED"],
      default: "DRAFT",
      index: true,
    },
    lastError: { type: String, default: null },
    pricingSnapshot: {
      treePrice: { type: Number, default: 0 },
      decorationFee: { type: Number, default: 0 },
      shippingFee: { type: Number, default: 0 },
      totalSalePrice: { type: Number, default: 0 },
    },
    deliveryOption: {
      type: String,
      enum: ["READY_TO_DISPLAY", "DIY_KIT", "SEPARATE"],
      required: true,
      default: "READY_TO_DISPLAY",
    },
    isPublic: { type: Boolean, default: true },
    duplicatedFrom: {
      type: Schema.Types.ObjectId,
      ref: "Design",
      default: null,
    },
    previewImage: { type: String, default: "" },
  },
  { timestamps: true }
);

DesignSchema.index({ ownerId: 1, updatedAt: -1 });
DesignSchema.index({ isPublic: 1, updatedAt: -1 });

export const Design = mongoose.model<IDesign>("Design", DesignSchema);

// Backward-compat alias — code cũ vẫn dùng tên TreeDesign.
export const TreeDesign = Design;
export type ITreeDesign = IDesign;
