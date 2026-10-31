import mongoose, { Schema, Document, Types } from "mongoose";

// ── Chat v3 (unified) — Conversation là nguồn sự thật DUY NHẤT ──────────────
//
// Mọi hội thoại (AI chatbot + hỗ trợ tư vấn viên) đều là 1 document ở đây.
// Không còn convention `c_<a>__<b>`; không còn `Message.participants`.
//
//  - channel "AI"      → chatbot Gemini (guest hoặc user đã đăng nhập).
//  - channel "SUPPORT" → mỗi buyer có đúng 1 conversation với đội admin.
//
// Định danh participant (`participants[].userId`):
//  - buyer / admin  → ObjectId hex của User
//  - guest          → "guest:<sessionId>"
//
// Read-state theo từng participant: tin chưa đọc của P là các Message có
// `createdAt > P.lastReadAt` (và không phải do P gửi). Không còn `isRead`.

export type ChatChannel = "AI" | "SUPPORT";
export type ChatStatus = "BOT_ACTIVE" | "WAITING_ADMIN" | "ADMIN_ACTIVE" | "RESOLVED";
export type ChatParticipantRole = "buyer" | "admin" | "guest";

export const CHAT_CHANNELS: ReadonlyArray<ChatChannel> = ["AI", "SUPPORT"];
export const CHAT_STATUSES: ReadonlyArray<ChatStatus> = [
  "BOT_ACTIVE",
  "WAITING_ADMIN",
  "ADMIN_ACTIVE",
  "RESOLVED",
];
export const CHAT_PARTICIPANT_ROLES: ReadonlyArray<ChatParticipantRole> = [
  "buyer",
  "admin",
  "guest",
];

/** Prefix cho participant khách vãng lai: `guest:<sessionId>`. */
export const GUEST_PREFIX = "guest:";

export interface ICustomerInfo {
  name?: string;
  phone?: string;
  email?: string;
}

export interface IChatParticipant {
  /** ObjectId hex (buyer/admin) hoặc `guest:<sessionId>`. */
  userId: string;
  role: ChatParticipantRole;
  /** Mốc đã đọc của participant này. */
  lastReadAt?: Date | null;
}

export interface IConversation extends Document {
  channel: ChatChannel;
  participants: IChatParticipant[];
  status: ChatStatus;
  assignedAdminId?: Types.ObjectId | null;
  customerInfo?: ICustomerInfo;
  summary?: string;
  lastMessage?: string;
  /** Loại người gửi của tin cuối (USER/BOT/ADMIN/SYSTEM) — để render sidebar không cần join Message. */
  lastMessageSenderType?: string;
  lastMessageAt: Date;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const ParticipantSchema = new Schema<IChatParticipant>(
  {
    userId: { type: String, required: true, trim: true },
    role: { type: String, enum: CHAT_PARTICIPANT_ROLES, required: true },
    lastReadAt: { type: Date, default: null },
  },
  { _id: false }
);

const ConversationSchema = new Schema<IConversation>(
  {
    channel: { type: String, enum: CHAT_CHANNELS, required: true, default: "AI" },
    participants: { type: [ParticipantSchema], default: [] },
    status: {
      type: String,
      enum: CHAT_STATUSES,
      default: "BOT_ACTIVE",
    },
    assignedAdminId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    customerInfo: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
    },
    summary: { type: String, trim: true },
    lastMessage: { type: String, trim: true },
    lastMessageSenderType: { type: String, trim: true },
    lastMessageAt: { type: Date, default: Date.now },
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
);

// Tìm conversation của 1 participant theo kênh (auto-join socket, get-or-create).
ConversationSchema.index({ "participants.userId": 1, channel: 1 });
// Hàng đợi admin theo trạng thái + hoạt động gần nhất.
ConversationSchema.index({ status: 1, lastMessageAt: -1 });
// Admin lọc theo kênh + trạng thái.
ConversationSchema.index({ channel: 1, status: 1, lastMessageAt: -1 });

export const Conversation = mongoose.model<IConversation>("Conversation", ConversationSchema);
