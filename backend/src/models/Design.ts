import mongoose, { Schema, Document, Types } from "mongoose";
import type { DeliveryOption } from "../config/business";
import { slugify } from "../utils/slug";

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
  slug: string;
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
    slug: {
      type: String,
      default: "",
      trim: true,
      // Unique index — đảm bảo không bao giờ có 2 document cùng null.
      // Slug được generate tự động trước khi save.
      index: { unique: true },
    },
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

// ── Pre-save: auto-generate unique slug ──────────────────────────────────────
// Slug dùng làm shareable link (VD: /designs/my-room-abc123).
// Chỉ generate khi chưa có slug (không overwrite khi re-save).
RoomDesignSchema.pre("save", async function (next) {
  if (this.slug && this.slug.length > 0) return next();

  const base = slugify(this.name || "design") || "design";
  // Cast sang Model<any> để gọi static `.exists()` không bị TS lỗi kiểu.
  const Model = this.constructor as unknown as {
    exists(filter: Record<string, unknown>): Promise<{ _id: unknown } | null>;
  };

  const MAX_ATTEMPTS = 10;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const suffix =
      Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const candidate = `${base}-${suffix}`;
    const existing = await Model.exists({ slug: candidate });
    if (!existing) {
      this.slug = candidate;
      return next();
    }
  }

  // Fallback: dùng UUID ngắn nếu tất cả candidates đều trùng (rất hiếm).
  const fallback =
    Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  this.slug = `design-${fallback}`;
  next();
});

// ── Model export ─────────────────────────────────────────────────────────────
export const Design = mongoose.model<IRoomDesign>("Design", RoomDesignSchema);
export type IDesign = IRoomDesign;
export type ITreeDesign = IRoomDesign;
