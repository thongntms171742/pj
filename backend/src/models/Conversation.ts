import mongoose, { Schema, Document, Types } from "mongoose";

export type ChatStatus = "BOT_ACTIVE" | "WAITING_ADMIN" | "ADMIN_ACTIVE" | "RESOLVED";

export interface ICustomerInfo {
  name?: string;
  phone?: string;
  email?: string;
}

export interface IConversation extends Document {
  sessionId: string;
  userId?: Types.ObjectId;
  customerInfo?: ICustomerInfo;
  status: ChatStatus;
  assignedAdminId?: Types.ObjectId;
  summary?: string;
  lastMessage?: string;
  lastMessageAt: Date;
  unreadAdminCount: number;
  unreadUserCount: number;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<IConversation>(
  {
    sessionId: { type: String, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    customerInfo: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
    },
    status: {
      type: String,
      enum: ["BOT_ACTIVE", "WAITING_ADMIN", "ADMIN_ACTIVE", "RESOLVED"],
      default: "BOT_ACTIVE",
      index: true,
    },
    assignedAdminId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    summary: { type: String, trim: true },
    lastMessage: { type: String, trim: true },
    lastMessageAt: { type: Date, default: Date.now, index: true },
    unreadAdminCount: { type: Number, default: 0 },
    unreadUserCount: { type: Number, default: 0 },
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
);

// Compound index for querying active conversations sorted by last activity
ConversationSchema.index({ status: 1, lastMessageAt: -1 });

export const Conversation = mongoose.model<IConversation>("Conversation", ConversationSchema);
