import mongoose, { Schema, Document, Types } from "mongoose";

/**
 * Message (TDD v1.0 §6.2) — 1 tin nhắn trong hội thoại.
 *
 * `visibility` quyết định ai được thấy:
 *   - `public`  : user + admin + ai đều thấy.
 *   - `internal`: chỉ admin (ghi chú nội bộ, gợi ý của AI Copilot).
 *
 * `clientMessageId` là idempotency key từ client — server upsert theo key này
 * để user bấm gửi 2 lần / mất mạng retry KHÔNG tạo tin nhắn trùng.
 */

export type MessageSenderType = "user" | "admin" | "ai" | "system";

export type MessageType = "text" | "image" | "file" | "system";

export type MessageVisibility = "public" | "internal";

export interface IMessageAttachment {
  url: string;
  publicId?: string;
  name?: string;
  mimeType?: string;
  size?: number;
}

export interface IMessageAiMetadata {
  /** Model đã sinh ra tin nhắn này. */
  model?: string;
  /** Version system prompt. */
  promptVersion?: string;
  /** Intent được phân loại. */
  intent?: string;
  /** Confidence của intent (0..1). */
  intentConfidence?: number;
  /** Sentiment của tin nhắn user. */
  sentiment?: string;
  /** Token đã dùng (prompt + output). */
  tokensUsed?: number;
  /** Thời gian xử lý AI (ms). */
  latencyMs?: number;
  /** Tool calls đã chạy trong lượt này. */
  toolsUsed?: string[];
  /** Câu trả lời có cần admin duyệt không. */
  needsHumanReview?: boolean;
}

export interface IMessage extends Document {
  conversationId: Types.ObjectId;
  senderId?: Types.ObjectId | null;
  senderType: MessageSenderType;
  content: string;
  messageType: MessageType;
  visibility: MessageVisibility;
  attachments: IMessageAttachment[];
  aiMetadata?: IMessageAiMetadata | null;
  /** Idempotency key từ client. */
  clientMessageId?: string | null;
  userReadAt?: Date | null;
  adminReadAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const AttachmentSchema = new Schema<IMessageAttachment>(
  {
    url: { type: String, required: true },
    publicId: { type: String, default: "" },
    name: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    size: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const AiMetadataSchema = new Schema<IMessageAiMetadata>(
  {
    model: { type: String, default: "" },
    promptVersion: { type: String, default: "" },
    intent: { type: String, default: "" },
    intentConfidence: { type: Number, default: 0, min: 0, max: 1 },
    sentiment: { type: String, default: "" },
    tokensUsed: { type: Number, default: 0, min: 0 },
    latencyMs: { type: Number, default: 0, min: 0 },
    toolsUsed: { type: [String], default: [] },
    needsHumanReview: { type: Boolean, default: false },
  },
  { _id: false }
);

const MessageSchema = new Schema<IMessage>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    senderType: {
      type: String,
      enum: ["user", "admin", "ai", "system"],
      required: true,
      index: true,
    },
    content: { type: String, required: true, trim: true },
    messageType: {
      type: String,
      enum: ["text", "image", "file", "system"],
      default: "text",
    },
    visibility: {
      type: String,
      enum: ["public", "internal"],
      default: "public",
      index: true,
    },
    attachments: { type: [AttachmentSchema], default: [] },
    aiMetadata: { type: AiMetadataSchema, default: null },
    clientMessageId: { type: String, default: null },
    userReadAt: { type: Date, default: null },
    adminReadAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Load tin nhắn theo thứ tự thời gian tăng dần.
MessageSchema.index({ conversationId: 1, createdAt: 1 });
// Idempotency: 1 clientMessageId duy nhất trong 1 conversation.
MessageSchema.index(
  { conversationId: 1, clientMessageId: 1 },
  { unique: true, partialFilterExpression: { clientMessageId: { $type: "string" } } }
);
// Truy vấn tin nhắn nội bộ cho admin.
MessageSchema.index({ conversationId: 1, visibility: 1, createdAt: -1 });
// Truy vấn theo sender cho audit.
MessageSchema.index({ conversationId: 1, senderType: 1, createdAt: 1 });

export const Message = mongoose.model<IMessage>("Message", MessageSchema);
