import mongoose, { Schema, Document, Types } from "mongoose";

// ── Message types ──────────────────────────────────────────────────────────────
export type MessageRole = "buyer" | "admin" | "system";
export type MessageSenderType = "USER" | "BOT" | "ADMIN" | "SYSTEM" | "user" | "admin" | "system";

export interface IMessageMetadata {
  quickReplies?: string[];
  suggestedProducts?: Array<{
    id: string;
    type: "tree" | "accessory";
    name: string;
    price: number;
    imageUrl?: string;
  }>;
  orderInfo?: {
    orderId: string;
    orderNumber?: string;
    status: string;
    totalAmount: number;
  };
  escalationReason?: string;
  [key: string]: any;
}

export interface IMessage extends Document {
  conversationId: any;
  participants?: string[];
  role?: MessageSenderType;
  senderType?: MessageSenderType;
  senderId?: any;
  senderName?: string;
  content: string;
  metadata?: IMessageMetadata;
  isRead?: boolean;
  readAt?: Date;
  readBy?: string;
  deletedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    conversationId: {
      type: Schema.Types.Mixed,
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
      default: "user",
    },
    senderType: {
      type: String,
      default: "USER",
    },
    senderId: {
      type: Schema.Types.Mixed,
    },
    senderName: {
      type: String,
      trim: true,
      default: "User",
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
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
  { timestamps: true }
);

// Indexes
MessageSchema.index({ conversationId: 1, createdAt: 1 });
MessageSchema.index({ conversationId: 1, createdAt: -1 });
MessageSchema.index({ senderId: 1, createdAt: -1 });
MessageSchema.index({ isRead: 1, readBy: 1 });
MessageSchema.index({ participants: 1, createdAt: -1 });

export const Message = mongoose.model<IMessage>("Message", MessageSchema);
