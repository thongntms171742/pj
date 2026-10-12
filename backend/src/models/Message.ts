import mongoose, { Schema, Document, Types } from "mongoose";

// ── Message types ──────────────────────────────────────────────────────────────
export type MessageRole = "buyer" | "admin" | "system";
export type MessageSenderType = "user" | "admin" | "system";

// ── IMessage ──────────────────────────────────────────────────────────────────
export interface IMessage extends Document {
  conversationId: string; // 1-1 room id, e.g. "c_<userA>__<userB>" (sorted)
  participants: string[]; // [userA, userB] sorted — fast "my conversations" queries
  role: MessageSenderType;
  senderId: string;       // user._id or "admin" string
  senderName: string;     // display name
  content: string;
  isRead: boolean;
  readAt?: Date;
  readBy?: string;        // userId who read it
  deletedBy?: string;     // soft-delete per user
}

const MessageSchema = new Schema<IMessage>(
  {
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    participants: {
      type: [String],
      default: [],
      index: true,
    },
    role: {
      type: String,
      enum: ["user", "admin", "system"] as const,
      required: true,
    },
    senderId: {
      type: String,
      required: true,
      index: true,
    },
    senderName: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: 2000,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
    },
    readBy: {
      type: String,
    },
    deletedBy: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true, // createdAt = sentAt, updatedAt = last edit
  }
);

// Indexes
MessageSchema.index({ conversationId: 1, createdAt: -1 });
MessageSchema.index({ senderId: 1, createdAt: -1 });
MessageSchema.index({ isRead: 1, readBy: 1 });
// "List my conversations sorted by latest message" — admin inbox query
MessageSchema.index({ participants: 1, createdAt: -1 });

export const Message = mongoose.model<IMessage>("Message", MessageSchema);
