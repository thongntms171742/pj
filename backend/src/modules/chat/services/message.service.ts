/**
 * message.service.ts — nghiệp vụ tin nhắn (TDD §6.2).
 *
 * Trách nhiệm:
 *   - Ghi tin nhắn (user / admin / ai / system) với idempotency key.
 *   - Đọc tin nhắn theo phân trang (cursor-based cho chat).
 *   - Read receipt 2 chiều (user đã đọc / admin đã đọc).
 *   - Lọc tin nhắn `internal` (user không bao giờ thấy).
 */

import { Types, type FilterQuery } from "mongoose";
import {
  Message,
  type IMessage,
  type MessageSenderType,
  type MessageType,
} from "../../../models/Message";
import { Conversation } from "../../../models/Conversation";
import { ErrorCode } from "../../../utils/errors";
import {
  CHAT_MESSAGE_MAX_LENGTH,
  CHAT_ATTACHMENT_MAX,
  CHAT_ATTACHMENT_MAX_BYTES,
  CHAT_MAX_MESSAGES_PER_PAGE,
} from "../../../config/chat.config";
import {
  ChatError,
  canViewInternalMessages,
  isAdmin,
  loadConversationForActor,
  type ChatActor,
} from "./chatPermission.service";
import { incrementUnread, touchLastMessage } from "./conversation.service";
import { emitMessageNew } from "../socket/chat.emitter";
import { messageToDto } from "../dto/chat.mapper";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AttachmentInput {
  url: string;
  publicId?: string;
  name?: string;
  mimeType?: string;
  size?: number;
}

export interface SendMessageInput {
  conversationId: string;
  content: string;
  messageType?: MessageType;
  attachments?: AttachmentInput[];
  clientMessageId?: string;
  /** Tin nhắn nội bộ — chỉ admin tạo được. */
  visibility?: "public" | "internal";
  aiMetadata?: IMessage["aiMetadata"];
}

export interface ListMessagesOptions {
  limit?: number;
  /** Cursor: message id của tin nhắn cuối đã xem (exclusive). */
  before?: string;
  after?: string;
}

export interface ListMessagesResult {
  items: IMessage[];
  hasMore: boolean;
  /** Cursor để gọi trang tiếp theo. */
  nextCursor: string | null;
}

// ── Validation ────────────────────────────────────────────────────────────────

/** Validate nội dung + đính kèm. Throw ChatError nếu sai. */
export function validateMessageInput(input: {
  content: string;
  attachments?: AttachmentInput[];
}): { content: string; attachments: AttachmentInput[] } {
  const rawContent = (input.content ?? "").trim();

  if (!rawContent && (!input.attachments || input.attachments.length === 0)) {
    throw new ChatError(
      ErrorCode.CHAT_EMPTY_CONTENT,
      "Nội dung tin nhắn không được để trống"
    );
  }

  if (rawContent.length > CHAT_MESSAGE_MAX_LENGTH) {
    throw new ChatError(
      ErrorCode.CHAT_MESSAGE_TOO_LONG,
      `Nội dung tin nhắn tối đa ${CHAT_MESSAGE_MAX_LENGTH} ký tự`
    );
  }

  const attachments = input.attachments ?? [];
  if (attachments.length > CHAT_ATTACHMENT_MAX) {
    throw new ChatError(
      ErrorCode.INVALID_INPUT,
      `Tối đa ${CHAT_ATTACHMENT_MAX} file đính kèm mỗi tin nhắn`
    );
  }

  for (const att of attachments) {
    if (!att?.url || typeof att.url !== "string") {
      throw new ChatError(ErrorCode.INVALID_INPUT, "File đính kèm thiếu URL");
    }
    if ((att.size ?? 0) > CHAT_ATTACHMENT_MAX_BYTES) {
      throw new ChatError(
        ErrorCode.FILE_TOO_LARGE,
        `File đính kèm vượt quá ${Math.floor(CHAT_ATTACHMENT_MAX_BYTES / 1024 / 1024)}MB`
      );
    }
  }

  return { content: rawContent, attachments };
}

// ── Send ──────────────────────────────────────────────────────────────────────

/**
 * Gửi tin nhắn.
 *
 * Idempotency:
 *   - Nếu `clientMessageId` đã tồn tại trong conversation ⇒ trả lại tin nhắn
 *     cũ, KHÔNG tạo bản ghi mới. `duplicate = true`.
 *   - Client gửi lại (retry mạng, bấm 2 lần) không sinh tin nhắn trùng.
 *
 * Unread count:
 *   - Tin nhắn từ user ⇒ tăng unread cho admin.
 *   - Tin nhắn từ admin/ai ⇒ tăng unread cho user.
 */
export async function sendMessage(
  actor: ChatActor,
  input: SendMessageInput
): Promise<{ message: IMessage; duplicate: boolean }> {
  const conversation = await loadConversationForActor(input.conversationId, actor);

  if (conversation.status === "closed") {
    throw new ChatError(
      ErrorCode.CHAT_CONVERSATION_CLOSED,
      "Hội thoại đã đóng, không thể gửi tin nhắn mới",
      409
    );
  }

  // Chỉ admin tạo được tin nhắn nội bộ.
  const visibility = input.visibility ?? "public";
  if (visibility === "internal" && !isAdmin(actor)) {
    throw new ChatError(
      ErrorCode.CHAT_FORBIDDEN,
      "Chỉ admin mới được tạo tin nhắn nội bộ",
      403
    );
  }

  // User không được giả danh senderType "admin"/"ai".
  const senderType: MessageSenderType = isAdmin(actor) ? "admin" : "user";

  const { content, attachments } = validateMessageInput(input);

  // ── Idempotency check ─────────────────────────────────────────────────────
  if (input.clientMessageId) {
    const existing = await Message.findOne({
      conversationId: conversation._id,
      clientMessageId: input.clientMessageId,
    });
    if (existing) {
      return { message: existing, duplicate: true };
    }
  }

  const message = await Message.create({
    conversationId: conversation._id,
    senderId: isAdmin(actor) ? actor.userId : conversation.userId,
    senderType,
    content,
    messageType: input.messageType ?? "text",
    visibility,
    attachments,
    aiMetadata: input.aiMetadata ?? null,
    clientMessageId: input.clientMessageId ?? null,
  });

  await touchLastMessage(conversation._id, message._id);

  // Tăng unread cho phía nhận (trừ khi chính người gửi cũng là người nhận).
  if (visibility === "public") {
    if (senderType === "user") {
      await incrementUnread(conversation._id, "admin", 1);
    } else {
      await incrementUnread(conversation._id, "user", 1);
    }
  }

  // Báo realtime cho các client đang subscribe conversation này.
  emitMessageNew({
    conversationId: String(conversation._id),
    message: messageToDto(message),
  });

  // ── AI trigger ────────────────────────────────────────────────────────────
  // Khi user gửi tin nhắn và conversation đang ở mode AI ⇒ orchestrator xử lý.
  // Fire-and-forget: KHÔNG chặn response — lỗi AI không được làm fail API chat.
  //
  // Dynamic import ⇒ không circular dependency (ai-orchestrator import lại
  // message.service cho `sendSystemMessage`).
  if (senderType === "user" && conversation.supportMode === "ai") {
    void triggerAiReply(conversation._id, message);
  }

  return { message, duplicate: false };
}

/**
 * Kích hoạt AI trả lời — fire-and-forget, không bao giờ throw ra ngoài.
 */
async function triggerAiReply(
  conversationId: Types.ObjectId,
  userMessage: IMessage
): Promise<void> {
  try {
    const { processUserMessage } = await import(
      "../../ai/services/ai-orchestrator.service"
    );
    await processUserMessage(String(conversationId), userMessage);
  } catch (err) {
    console.error(
      "[message.service] AI reply failed:",
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Gửi tin nhắn hệ thống (ví dụ: thông báo AI escalate, gợi ý quick reply).
 * Không qua kiểm tra quyền actor — dùng nội bộ từ service khác.
 */
export async function sendSystemMessage(
  conversationId: Types.ObjectId,
  content: string,
  options: { messageType?: MessageType; visibility?: "public" | "internal" } = {}
): Promise<IMessage> {
  const message = await Message.create({
    conversationId,
    senderId: null,
    senderType: "system",
    content,
    messageType: options.messageType ?? "system",
    visibility: options.visibility ?? "public",
    attachments: [],
    aiMetadata: null,
    clientMessageId: null,
  });

  await touchLastMessage(conversationId, message._id);
  await incrementUnread(conversationId, "user", 1);

  return message;
}

// ── List ──────────────────────────────────────────────────────────────────────

/**
 * Lấy tin nhắn trong conversation (cursor pagination).
 *
 * - User: chỉ thấy `visibility: "public"`.
 * - Admin: thấy cả `internal`.
 * - `before` : lấy tin nhắn CŨ HƠN cursor (load lịch sử ngược).
 * - `after`  : lấy tin nhắn MỚI HƠN cursor (poll tin mới).
 */
export async function listMessages(
  conversationId: string,
  actor: ChatActor,
  options: ListMessagesOptions = {}
): Promise<ListMessagesResult> {
  const conversation = await loadConversationForActor(conversationId, actor);

  const limit = Math.min(
    CHAT_MAX_MESSAGES_PER_PAGE,
    Math.max(1, options.limit ?? 20)
  );

  const filter: FilterQuery<IMessage> = { conversationId: conversation._id };

  if (!canViewInternalMessages(actor)) {
    filter.visibility = "public";
  }

  if (options.before && Types.ObjectId.isValid(options.before)) {
    const cursor = await Message.findById(options.before).select("createdAt").lean();
    if (cursor) {
      filter.createdAt = { $lt: cursor.createdAt };
    }
  } else if (options.after && Types.ObjectId.isValid(options.after)) {
    const cursor = await Message.findById(options.after).select("createdAt").lean();
    if (cursor) {
      filter.createdAt = { $gt: cursor.createdAt };
    }
  }

  // Lấy limit + 1 để biết có trang tiếp theo không.
  const docs = await Message.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit + 1);

  const hasMore = docs.length > limit;
  const page = hasMore ? docs.slice(0, limit) : docs;

  // Đảo lại để trả về theo thứ tự thời gian tăng dần (dễ đọc cho FE).
  const items = page.reverse();

  return {
    items,
    hasMore,
    nextCursor: hasMore && items.length > 0 ? String(items[0]._id) : null,
  };
}

// ── Read receipt ──────────────────────────────────────────────────────────────

/**
 * Đánh dấu đã đọc (phía user hoặc phía admin).
 *
 * - Set `userReadAt` / `adminReadAt` trên các tin nhắn chưa đọc.
 * - Reset `unreadCount` tương ứng về 0.
 */
export async function markAsRead(
  conversationId: string,
  actor: ChatActor
): Promise<{ markedCount: number }> {
  const conversation = await loadConversationForActor(conversationId, actor);

  const field = isAdmin(actor) ? "adminReadAt" : "userReadAt";
  const unreadPath = isAdmin(actor) ? "unreadCount.admin" : "unreadCount.user";

  const result = await Message.updateMany(
    {
      conversationId: conversation._id,
      visibility: "public",
      [field]: null,
      // Không đánh dấu tin nhắn của chính mình là đã đọc.
      $or: isAdmin(actor)
        ? [{ senderType: { $ne: "admin" } }]
        : [{ senderType: { $ne: "user" } }],
    },
    { $set: { [field]: new Date() } }
  );

  await Conversation.updateOne(
    { _id: conversation._id },
    { $set: { [unreadPath]: 0 } }
  );

  return { markedCount: result.modifiedCount ?? 0 };
}

// ── Edit / delete (chưa hỗ trợ trong TDD v1.0) ─────────────────────────────────
//
// TDD v1.0 không yêu cầu sửa/xoá tin nhắn — chat là append-only log.
// Nếu cần sau này: thêm `editedAt` + `deletedAt` và giữ lịch sử audit.

export { Message };
