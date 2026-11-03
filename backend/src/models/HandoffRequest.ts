import mongoose, { Schema, Document, Types } from "mongoose";

/**
 * HandoffRequest (TDD v1.0 §6.3) — yêu cầu chuyển sang nhân viên thật.
 *
 * Vòng đời:
 *   waiting → assigned → accepted → resolved
 *   (hoặc cancelled nếu user đóng / admin từ chối)
 *
 * Dùng `version` để chống race: 2 admin cùng claim 1 handoff.
 */

export type HandoffStatus =
  | "waiting"
  | "assigned"
  | "accepted"
  | "resolved"
  | "cancelled";

export type HandoffPriority = "low" | "normal" | "high" | "urgent";

export interface IHandoffRequest extends Document {
  conversationId: Types.ObjectId;
  userId: Types.ObjectId;
  /** Lý do escalate (user chọn hoặc AI suy luận). */
  reason: string;
  priority: HandoffPriority;
  status: HandoffStatus;
  /** Tóm tắt do AI sinh — admin đọc để nắm nhanh vấn đề. */
  summary: string;
  requestedAt: Date;
  assignedAdminId?: Types.ObjectId | null;
  acceptedAt?: Date | null;
  resolvedAt?: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const HandoffRequestSchema = new Schema<IHandoffRequest>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reason: { type: String, required: true, trim: true },
    priority: {
      type: String,
      enum: ["low", "normal", "high", "urgent"],
      default: "normal",
    },
    status: {
      type: String,
      enum: ["waiting", "assigned", "accepted", "resolved", "cancelled"],
      default: "waiting",
    },
    summary: { type: String, default: "" },
    requestedAt: { type: Date, default: Date.now },
    assignedAdminId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    acceptedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    version: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true }
);

// Hàng đợi admin: handoff đang chờ, ưu tiên cao trước.
HandoffRequestSchema.index({ status: 1, priority: -1, requestedAt: 1 });
// Tra cứu handoff theo user.
HandoffRequestSchema.index({ userId: 1, status: 1, createdAt: -1 });
// Mỗi conversation chỉ có tối đa 1 handoff đang mở.
HandoffRequestSchema.index(
  { conversationId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["waiting", "assigned", "accepted"] },
    },
  }
);

export const HandoffRequest = mongoose.model<IHandoffRequest>(
  "HandoffRequest",
  HandoffRequestSchema
);
