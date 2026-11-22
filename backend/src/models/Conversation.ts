import mongoose, { Schema, Document, Types } from "mongoose";

/**
 * Conversation — hội thoại hỗ trợ khách hàng 1-1 (user ↔ admin).
 *
 *   - `status`      : vòng đời hội thoại (open → pending → closed).
 *   - `supportMode` : waiting_admin (chờ admin nhận) hoặc human (admin phục vụ).
 *
 * Optimistic concurrency:
 *   `version` tăng mỗi lần mutation có kiểm soát (assign admin, đóng/mở,
 *   chuyển mode). Service dùng `version` để chống race condition khi
 *   2 admin cùng nhận 1 conversation.
 */

export type ConversationStatus = "open" | "pending" | "closed";

export type SupportMode = "waiting_admin" | "human";

export interface IUnreadCount {
  user: number;
  admin: number;
}

export interface IConversation extends Document {
  userId: Types.ObjectId;
  status: ConversationStatus;
  supportMode: SupportMode;
  assignedAdminId?: Types.ObjectId | null;
  lastMessageId?: Types.ObjectId | null;
  lastMessageAt?: Date | null;
  unreadCount: IUnreadCount;
  version: number;
  closedAt?: Date | null;
  closedBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

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
      enum: ["waiting_admin", "human"],
      default: "waiting_admin",
      index: true,
    },
    assignedAdminId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
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
