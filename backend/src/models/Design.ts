import mongoose, { Schema, Document, Types } from "mongoose";

// ── DeliveryOption re-export từ config/business.ts ──────────────────────────
// Giữ single source of truth ở config layer; Mongoose model chỉ type-import.
import type { DeliveryOption } from "../config/business";

// ── RoomDesign (Build Your Christmas) ───────────────────────────────────────
// RoomDesign là 1 "bản ghép AI" do khách tạo: chọn 1 Tree variant (SKU),
// upload ảnh phòng, viết prompt mô tả mong muốn. AI sẽ ghép cây vào phòng.
//
// Schema:
//   - ownerId: null nếu guest
//   - name: label tùy chọn
//   - treeVariantId: ref Tree (SKU) — KHÔNG dùng TreeProduct concept cũ
//   - prompt: text khách viết
//   - roomImageUrl / roomImagePublicId: ảnh phòng user upload lên Cloudinary
//   - resultImageUrl / resultImagePublicId: ảnh AI render → Cloudinary
//   - status: DRAFT → AI_PENDING → AI_COMPLETED / FAILED
//
// Không còn: baseTreeProductId, slug, year, isPublic, pricingSnapshot,
// duplicatedFrom, previewImage (== resultImageUrl).
// Không còn status CONFIRMED — checkout không cần design confirmed.

export type RoomDesignStatus = "DRAFT" | "AI_PENDING" | "AI_COMPLETED" | "FAILED";

export const ROOM_DESIGN_STATUSES: ReadonlyArray<RoomDesignStatus> = [
  "DRAFT",
  "AI_PENDING",
  "AI_COMPLETED",
  "FAILED",
];

export interface IRoomDesign extends Document {
  ownerId: Types.ObjectId | null;
  name: string;
  treeVariantId: Types.ObjectId;
  prompt: string;
  roomImageUrl: string;
  roomImagePublicId: string;
  resultImageUrl: string;
  resultImagePublicId: string;
  status: RoomDesignStatus;
  lastError: string | null;
  deliveryOption: DeliveryOption;
  createdAt: Date;
  updatedAt: Date;
}

const RoomDesignSchema = new Schema<IRoomDesign>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    name: { type: String, default: "My Room", trim: true, maxlength: 80 },
    treeVariantId: {
      type: Schema.Types.ObjectId,
      ref: "Tree",
      required: true,
      index: true,
    },
    prompt: { type: String, default: "", trim: true, maxlength: 1000 },
    roomImageUrl: { type: String, default: "", trim: true },
    roomImagePublicId: { type: String, default: "", trim: true },
    resultImageUrl: { type: String, default: "", trim: true },
    resultImagePublicId: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: ROOM_DESIGN_STATUSES,
      default: "DRAFT",
      index: true,
    },
    lastError: { type: String, default: null },
    deliveryOption: {
      type: String,
      enum: ["READY_TO_DISPLAY", "DIY_KIT", "SEPARATE"],
      required: true,
      default: "READY_TO_DISPLAY",
    },
  },
  { timestamps: true }
);

RoomDesignSchema.index({ ownerId: 1, updatedAt: -1 });

// ── Model export ─────────────────────────────────────────────────────────────
// Tên `Design` giữ để tương thích với file cũ (`models/Design.ts` trước đó
// từng định nghĩa TreeDesign + AIDesign). Import path khác đổi sang schema
// RoomDesign; cần migrate imports nếu có dùng `IDesign`/`ITreeDesign`.
export const Design = mongoose.model<IRoomDesign>("Design", RoomDesignSchema);
export type IDesign = IRoomDesign;
export type ITreeDesign = IRoomDesign;
