import mongoose, { Schema, Document, Types } from "mongoose";

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
}

const MessageSchema = new Schema<IMessage>(
  {
    conversationId: {
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
  },
  { timestamps: true }
);

// Index to query messages for a conversation ordered chronologically
MessageSchema.index({ conversationId: 1, createdAt: 1 });

export const Message = mongoose.model<IMessage>("Message", MessageSchema);
