/**
 * messageService.ts — ghi / đọc Message cho chat v3.
 *
 *  - sendMessage()   → tạo Message + cập nhật Conversation.lastMessage*
 *                      (+ đánh dấu đã đọc cho chính người gửi).
 *  - listMessages()  → cursor pagination theo (createdAt, _id).
 *  - countUnread()   → so với participants[].lastReadAt (không còn isRead).
 *
 * Module này KHÔNG import conversationService (tránh vòng import) — chỉ dùng
 * trực tiếp model Conversation cho các update nhỏ.
 */

import { Types } from "mongoose";
import {
  Message,
  MESSAGE_MAX_LENGTH,
  type IMessageSender,
  type MessageSenderType,
} from "../../../models/Message";
import { Conversation, type IChatParticipant } from "../../../models/Conversation";
import { chatErrors } from "./chatErrors";

export { MESSAGE_MAX_LENGTH };

// ── Types ──────────────────────────────────────────────────────────────────

/** Bản ghi Message dạng lean (plain object). */
export interface MessageRecord {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  sender: IMessageSender;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt?: Date;
}

export interface SendMessageInput {
  conversationId: string | Types.ObjectId;
  sender: IMessageSender;
  content: unknown;
  metadata?: unknown;
  /** Bỏ qua bước sanitize metadata (chỉ dùng cho BOT/SYSTEM nội bộ). */
  trustedMetadata?: boolean;
}

/** Người xem — dùng để tính unread. */
export interface UnreadViewer {
  /** Mọi participant key của người xem (userId và/hoặc guest:<sid>). */
  keys: string[];
  isAdmin: boolean;
}

/** Conversation tối thiểu cần để tính unread. */
export interface UnreadConvLike {
  _id: Types.ObjectId | string;
  participants?: IChatParticipant[] | null;
}

// ── Validation ─────────────────────────────────────────────────────────────

/** Trim + validate nội dung. Ném ChatError khi rỗng hoặc quá dài. */
export function validateContent(raw: unknown): string {
  const content = typeof raw === "string" ? raw.trim() : "";
  if (!content) throw chatErrors.emptyContent();
  if (content.length > MESSAGE_MAX_LENGTH) throw chatErrors.tooLong(MESSAGE_MAX_LENGTH);
  return content;
}

/**
 * Các khoá metadata do SERVER sinh ra — client (USER) không được tự gửi để
 * tránh giả mạo thẻ đơn hàng / gợi ý sản phẩm / tin hệ thống.
 */
export const RESERVED_METADATA_KEYS: ReadonlyArray<string> = [
  "quickReplies",
  "suggestedProducts",
  "orderInfo",
  "action",
  "prevStatus",
  "reason",
  "adminName",
  "escalationReason",
];

const USER_METADATA_MAX_JSON = 2_000;
const ADMIN_METADATA_MAX_JSON = 8_000;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Lọc metadata do client gửi lên.
 *  - USER  : bỏ khoá reserved, tối đa 2 KB JSON.
 *  - ADMIN : giữ nguyên, tối đa 8 KB JSON.
 */
export function sanitizeMetadata(
  raw: unknown,
  senderType: MessageSenderType
): Record<string, unknown> {
  if (raw === undefined || raw === null) return {};
  if (!isPlainObject(raw)) throw chatErrors.invalidInput("metadata phải là object");

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (senderType === "USER" && RESERVED_METADATA_KEYS.includes(k)) continue;
    out[k] = v;
  }
  const limit = senderType === "ADMIN" ? ADMIN_METADATA_MAX_JSON : USER_METADATA_MAX_JSON;
  if (JSON.stringify(out).length > limit) {
    throw chatErrors.invalidInput(`metadata vượt quá ${limit} ký tự`);
  }
  return out;
}

function toObjectId(id: string | Types.ObjectId): Types.ObjectId {
  if (id instanceof Types.ObjectId) return id;
  if (!Types.ObjectId.isValid(id)) throw chatErrors.invalidId();
  return new Types.ObjectId(id);
}

// ── Write ──────────────────────────────────────────────────────────────────

/**
 * Tạo Message + cập nhật Conversation (lastMessage, lastMessageAt,
 * lastMessageSenderType). Nếu người gửi là participant, mốc đã đọc của họ
 * được đẩy lên `createdAt` của tin vừa gửi (gửi = đã đọc tới đây).
 */
export async function sendMessage(input: SendMessageInput): Promise<MessageRecord> {
  const conversationId = toObjectId(input.conversationId);
  const content = validateContent(input.content);
  const metadata = input.trustedMetadata
    ? ((input.metadata as Record<string, unknown>) ?? {})
    : sanitizeMetadata(input.metadata, input.sender.type);

  const doc = await Message.create({
    conversationId,
    sender: {
      type: input.sender.type,
      userId: input.sender.userId || undefined,
      name: (input.sender.name || "").trim() || defaultSenderName(input.sender.type),
    },
    content,
    metadata,
  });

  const createdAt = doc.createdAt;
  await Conversation.updateOne(
    { _id: conversationId },
    {
      $set: {
        lastMessage: content.length > 500 ? `${content.slice(0, 500)}…` : content,
        lastMessageAt: createdAt,
        lastMessageSenderType: input.sender.type,
      },
    }
  );

  if (input.sender.userId) {
    await Conversation.updateOne(
      { _id: conversationId, "participants.userId": input.sender.userId },
      { $max: { "participants.$.lastReadAt": createdAt } }
    );
  }

  return doc.toObject() as unknown as MessageRecord;
}

export function defaultSenderName(type: MessageSenderType): string {
  switch (type) {
    case "BOT":
      return "Trợ lý AI";
    case "SYSTEM":
      return "Hệ thống";
    case "ADMIN":
      return "Tư vấn viên";
    default:
      return "Khách hàng";
  }
}

// ── Read: cursor pagination ────────────────────────────────────────────────

export interface MessageCursor {
  createdAt: Date;
  _id: Types.ObjectId;
}

/**
 * Filter lấy các tin "cũ hơn" cursor theo thứ tự (createdAt DESC, _id DESC):
 *   createdAt < c.createdAt  OR  (createdAt == c.createdAt AND _id < c._id)
 * ⇒ không trùng / không mất tin kể cả khi nhiều tin cùng millisecond.
 */
export function buildCursorFilter(
  conversationId: Types.ObjectId,
  cursor?: MessageCursor | null
): Record<string, unknown> {
  const filter: Record<string, unknown> = { conversationId };
  if (cursor) {
    filter.$or = [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $lt: cursor._id } },
    ];
  }
  return filter;
}

/** Sort tương ứng với buildCursorFilter. */
export const MESSAGE_SORT_DESC = { createdAt: -1, _id: -1 } as const;

export interface ListMessagesInput {
  conversationId: string | Types.ObjectId;
  limit?: number;
  /** messageId của tin CŨ NHẤT FE đang có. */
  before?: string | null;
}

export interface ListMessagesResult {
  /** Theo thứ tự cũ → mới. */
  messages: MessageRecord[];
  hasMore: boolean;
  total: number;
}

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export function clampLimit(raw: unknown, fallback = DEFAULT_PAGE_SIZE): number {
  const n = parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(MAX_PAGE_SIZE, n);
}

export async function listMessages(input: ListMessagesInput): Promise<ListMessagesResult> {
  const conversationId = toObjectId(input.conversationId);
  const limit = clampLimit(input.limit);

  let cursor: MessageCursor | null = null;
  if (input.before) {
    if (!Types.ObjectId.isValid(input.before)) throw chatErrors.invalidId("before");
    const ref = await Message.findOne({
      _id: new Types.ObjectId(input.before),
      conversationId,
    })
      .select("_id createdAt")
      .lean();
    if (!ref) {
      // Cursor không thuộc conversation này ⇒ không trả gì (tránh FE nhân bản tin).
      const total = await Message.countDocuments({ conversationId });
      return { messages: [], hasMore: false, total };
    }
    cursor = { createdAt: ref.createdAt as Date, _id: ref._id as Types.ObjectId };
  }

  const [docs, total] = await Promise.all([
    Message.find(buildCursorFilter(conversationId, cursor))
      .sort(MESSAGE_SORT_DESC)
      .limit(limit + 1)
      .lean(),
    Message.countDocuments({ conversationId }),
  ]);

  const hasMore = docs.length > limit;
  const page = (hasMore ? docs.slice(0, limit) : docs) as unknown as MessageRecord[];
  return { messages: page.reverse(), hasMore, total };
}

/** N tin mới nhất (cũ → mới) — dùng cho context của chatbot. */
export async function getRecentMessages(
  conversationId: string | Types.ObjectId,
  limit: number
): Promise<MessageRecord[]> {
  const docs = await Message.find({ conversationId: toObjectId(conversationId) })
    .sort(MESSAGE_SORT_DESC)
    .limit(limit)
    .lean();
  return (docs as unknown as MessageRecord[]).reverse();
}

// ── Read-state ─────────────────────────────────────────────────────────────

/**
 * Filter "tin chưa đọc" của người xem trong 1 conversation:
 *  - không phải tin do chính họ gửi (`sender.userId ∉ keys`; BOT/SYSTEM không có userId ⇒ vẫn tính)
 *  - `createdAt > lastReadAt` nếu họ là participant đã từng đọc
 *  - admin chỉ đếm tin của khách (`sender.type = USER`) — bot/hệ thống không làm phiền admin
 */
export function buildUnreadFilter(
  conv: UnreadConvLike,
  viewer: UnreadViewer
): Record<string, unknown> {
  const convId =
    conv._id instanceof Types.ObjectId ? conv._id : new Types.ObjectId(String(conv._id));
  const filter: Record<string, unknown> = { conversationId: convId };
  if (viewer.keys.length) filter["sender.userId"] = { $nin: viewer.keys };

  const participant = (conv.participants ?? []).find((p) => viewer.keys.includes(p.userId));
  if (participant?.lastReadAt) {
    filter.createdAt = { $gt: new Date(participant.lastReadAt) };
  }
  if (viewer.isAdmin) filter["sender.type"] = "USER";
  return filter;
}

/** Số tin chưa đọc của 1 participant trong 1 conversation. */
export async function countUnread(
  conversationId: string | Types.ObjectId,
  userId: string | string[],
  opts: { isAdmin?: boolean } = {}
): Promise<number> {
  const conv = await Conversation.findById(toObjectId(conversationId))
    .select("_id participants")
    .lean();
  if (!conv) return 0;
  const keys = Array.isArray(userId) ? userId : [userId];
  return Message.countDocuments(
    buildUnreadFilter(conv as UnreadConvLike, { keys, isAdmin: Boolean(opts.isAdmin) })
  );
}

/** Unread cho nhiều conversation trong 1 aggregate. */
export async function countUnreadBatch(
  convs: UnreadConvLike[],
  viewer: UnreadViewer
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!convs.length) return result;
  for (const c of convs) result.set(String(c._id), 0);

  const rows = await Message.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: { $or: convs.map((c) => buildUnreadFilter(c, viewer)) } },
    { $group: { _id: "$conversationId", n: { $sum: 1 } } },
  ]);
  for (const r of rows) result.set(String(r._id), r.n);
  return result;
}
