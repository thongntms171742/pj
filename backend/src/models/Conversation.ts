import mongoose, { Schema, Document, Types } from "mongoose";

/**
 * Conversation (TDD v1.0 §6.1) — hội thoại hỗ trợ khách hàng.
 *
 * Mô hình Hybrid:
 *   - `status`      : vòng đời hội thoại (open → pending → closed).
 *   - `supportMode` : AI đang phục vụ, đang chờ admin, admin phục vụ,
 *                     hay admin được AI hỗ trợ (ai_assisted).
 *
 * Optimistic concurrency:
 *   `version` tăng mỗi lần mutation có kiểm soát (assign admin, đóng/mở,
 *   chuyển mode). Service dùng `version` để chống race condition khi
 *   2 admin cùng nhận 1 conversation.
 */

export type ConversationStatus = "open" | "pending" | "closed";

export type SupportMode = "ai" | "waiting_admin" | "human" | "ai_assisted";

export interface IConversationAiConfig {
  /** Model Gemini đã dùng để sinh câu trả lời gần nhất. */
  model?: string;
  /** Version system prompt — để đo tác động khi đổi prompt. */
  promptVersion?: string;
  /** Intent đã phân loại cho lượt xử lý gần nhất. */
  intent?: string;
  /** Confidence của intent (0..1). */
  intentConfidence?: number;
  /** Sentiment đã phân loại (negative/neutral/positive). */
  sentiment?: string;
  /** AI có đang bật cho conversation này không. */
  enabled?: boolean;
  /** Số lần AI thất bại liên tiếp — dùng cho auto-escalate. */
  failedAttempts?: number;
  /** Tổng token đã tiêu (để audit quota). */
  totalTokens?: number;
}

export interface IUnreadCount {
  user: number;
  admin: number;
}

export interface IConversation extends Document {
  userId: Types.ObjectId;
  status: ConversationStatus;
  supportMode: SupportMode;
  assignedAdminId?: Types.ObjectId | null;
  aiConfig: IConversationAiConfig;
  lastMessageId?: Types.ObjectId | null;
  lastMessageAt?: Date | null;
  unreadCount: IUnreadCount;
  version: number;
  closedAt?: Date | null;
  closedBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const AiConfigSchema = new Schema<IConversationAiConfig>(
  {
    model: { type: String, default: "" },
    promptVersion: { type: String, default: "" },
    intent: { type: String, default: "" },
    intentConfidence: { type: Number, default: 0, min: 0, max: 1 },
    sentiment: { type: String, default: "" },
    enabled: { type: Boolean, default: true },
    failedAttempts: { type: Number, default: 0, min: 0 },
    totalTokens: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const UnreadCountSchema = new Schema<IUnreadCount>(
  {
    user: { type: Number, default: 0, min: 0 },
    admin: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const ConversationSchema = new Schema<IConversation>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["open", "pending", "closed"],
      default: "open",
      index: true,
    },
    supportMode: {
      type: String,
      enum: ["ai", "waiting_admin", "human", "ai_assisted"],
      default: "ai",
      index: true,
    },
    assignedAdminId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    aiConfig: { type: AiConfigSchema, default: () => ({}) },
    lastMessageId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    lastMessageAt: { type: Date, default: null },
    unreadCount: { type: UnreadCountSchema, default: () => ({ user: 0, admin: 0 }) },
    version: { type: Number, default: 1, min: 1 },
    closedAt: { type: Date, default: null },
    closedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

// Truy vấn chính: danh sách conversation của 1 user, mới nhất trước.
ConversationSchema.index({ userId: 1, status: 1, lastMessageAt: -1 });
// Hàng đợi admin: conversation đang mở, chưa ai nhận / đã có admin.
ConversationSchema.index({ status: 1, supportMode: 1, lastMessageAt: -1 });
// Truy vấn admin đã nhận.
ConversationSchema.index({ assignedAdminId: 1, status: 1, lastMessageAt: -1 });

export const Conversation = mongoose.model<IConversation>(
  "Conversation",
  ConversationSchema
);
