import mongoose, { Schema, Document, Types } from "mongoose";

// ── Chat v3 (unified) — Message ────────────────────────────────────────────
//
// Đã XOÁ so với v2: `role` (trùng & sai — luôn "user"), `senderType/senderId/
// senderName` phẳng (gộp vào `sender`), `participants[]` (chuyển lên
// Conversation), `isRead/readAt/readBy` (chuyển lên
// Conversation.participants[].lastReadAt), `deletedBy` (không ai dùng).

export type MessageSenderType = "USER" | "BOT" | "ADMIN" | "SYSTEM";
export const MESSAGE_SENDER_TYPES: ReadonlyArray<MessageSenderType> = [
  "USER",
  "BOT",
  "ADMIN",
  "SYSTEM",
];

/** Giới hạn độ dài nội dung tin nhắn (ký tự, sau khi trim). */
export const MESSAGE_MAX_LENGTH = 2000;

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
    /** Mã đơn chuẩn — FE admin đọc khoá này (mới). */
    orderCode?: string;
    /** Khoá cũ — giữ lại để tương thích ngược. */
    orderNumber?: string;
    status: string;
    totalAmount: number;
  };
  action?: string;
  prevStatus?: string;
  reason?: string;
  adminName?: string;
  escalationReason?: string;
  [key: string]: any;
}

export interface IMessageSender {
  type: MessageSenderType;
  /** ObjectId hex (USER/ADMIN) hoặc `guest:<sessionId>`; undefined cho BOT/SYSTEM. */
  userId?: string;
  name: string;
}

export interface IMessage extends Document {
  conversationId: Types.ObjectId;
  sender: IMessageSender;
  content: string;
  metadata?: IMessageMetadata;
  createdAt: Date;
  updatedAt: Date;
}

const SenderSchema = new Schema<IMessageSender>(
  {
    type: { type: String, enum: MESSAGE_SENDER_TYPES, required: true },
    userId: { type: String, trim: true },
    name: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const MessageSchema = new Schema<IMessage>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    sender: { type: SenderSchema, required: true },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: MESSAGE_MAX_LENGTH,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true, minimize: false }
);

// Lịch sử hội thoại + cursor pagination (createdAt, _id).
MessageSchema.index({ conversationId: 1, createdAt: -1 });
// Tra cứu tin của 1 người gửi.
MessageSchema.index({ "sender.userId": 1, createdAt: -1 });

export const Message = mongoose.model<IMessage>("Message", MessageSchema);
