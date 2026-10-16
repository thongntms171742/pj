import mongoose, { Schema, Document, Types } from "mongoose";

<<<<<<< HEAD
export type MessageSenderType = "USER" | "BOT" | "ADMIN" | "SYSTEM";

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
  conversationId: Types.ObjectId;
  senderType: MessageSenderType;
  senderId?: Types.ObjectId;
  senderName?: string;
  content: string;
  metadata?: IMessageMetadata;
  createdAt: Date;
  updatedAt: Date;
=======
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
>>>>>>> e9b299b6947f2d1b4aefc82d4ac7a3b7abaf5fc8
}

const MessageSchema = new Schema<IMessage>(
  {
    conversationId: {
<<<<<<< HEAD
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    senderType: {
      type: String,
      enum: ["USER", "BOT", "ADMIN", "SYSTEM"],
      required: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    senderName: {
      type: String,
      trim: true,
=======
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
>>>>>>> e9b299b6947f2d1b4aefc82d4ac7a3b7abaf5fc8
    },
    content: {
      type: String,
      required: true,
<<<<<<< HEAD
      trim: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

// Index to query messages for a conversation ordered chronologically
MessageSchema.index({ conversationId: 1, createdAt: 1 });
=======
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
>>>>>>> e9b299b6947f2d1b4aefc82d4ac7a3b7abaf5fc8

export const Message = mongoose.model<IMessage>("Message", MessageSchema);
