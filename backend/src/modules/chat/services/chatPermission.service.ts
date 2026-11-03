/**
 * chatPermission.service.ts — nguồn sự thật duy nhất về quyền truy cập chat.
 *
 * Quy tắc (TDD §4.4 — Security):
 *   - User chỉ truy cập được conversation của chính mình.
 *   - Admin truy cập được MỌI conversation, nhưng tin nhắn `internal`
 *     chỉ hiện với admin — user không bao giờ thấy.
 *   - Mọi endpoint ghi (send message, close, reopen) đều đi qua đây,
 *     không tự kiểm tra `userId === req.user.id` rải rác.
 */

import { Types } from "mongoose";
import { Conversation, type IConversation } from "../../../models/Conversation";
import { ErrorCode, ErrorStatus } from "../../../utils/errors";

export type ChatRole = "user" | "admin";

export interface ChatActor {
  userId: string;
  roles: string[];
}

/** Lỗi nghiệp vụ có mã + HTTP status (controller chuyển thành response). */
export class ChatError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status?: number, details?: unknown) {
    super(message);
    this.name = "ChatError";
    this.code = code;
    this.status = status ?? ErrorStatus[code as keyof typeof ErrorStatus] ?? 400;
    this.details = details;
  }
}

export function isAdmin(actor: ChatActor): boolean {
  return Array.isArray(actor?.roles) && actor.roles.includes("admin");
}

/** Có phải admin không? Nếu không phải admin thì phải là chính chủ conversation. */
export function canAccessConversation(
  conversation: Pick<IConversation, "userId">,
  actor: ChatActor
): boolean {
  if (isAdmin(actor)) return true;
  return String(conversation.userId) === actor.userId;
}

/** Có phải chủ conversation không? (admin cũng KHÔNG tự động là chủ). */
export function isConversationOwner(
  conversation: Pick<IConversation, "userId">,
  actor: ChatActor
): boolean {
  return String(conversation.userId) === actor.userId;
}

/**
 * Load conversation và kiểm tra quyền truy cập trong 1 lần.
 * Throw `ChatError` nếu không tồn tại hoặc không có quyền.
 *
 * Lưu ý: trả lỗi NOT_FOUND (không phải FORBIDDEN) khi user cố truy cập
 * conversation của người khác — tránh rò rỉ sự tồn tại của conversation.
 */
export async function loadConversationForActor(
  conversationId: string,
  actor: ChatActor
): Promise<IConversation> {
  if (!Types.ObjectId.isValid(conversationId)) {
    throw new ChatError(ErrorCode.CHAT_INVALID_ID, "Conversation ID không hợp lệ");
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw new ChatError(
      ErrorCode.CHAT_CONVERSATION_NOT_FOUND,
      "Không tìm thấy hội thoại"
    );
  }

  if (!canAccessConversation(conversation, actor)) {
    throw new ChatError(
      ErrorCode.CHAT_FORBIDDEN,
      "Bạn không có quyền truy cập hội thoại này",
      403
    );
  }

  return conversation;
}

/**
 * Load conversation mà user PHẢI là chủ (user-facing operations).
 * Admin không được dùng hàm này để bypass.
 */
export async function loadOwnedConversation(
  conversationId: string,
  actor: ChatActor
): Promise<IConversation> {
  const conversation = await loadConversationForActor(conversationId, actor);
  if (!isConversationOwner(conversation, actor)) {
    throw new ChatError(
      ErrorCode.CHAT_FORBIDDEN,
      "Bạn không có quyền thao tác trên hội thoại này",
      403
    );
  }
  return conversation;
}

/**
 * Quyền xem tin nhắn `internal`:
 *   - Admin: có.
 *   - User: không — kể cả khi là chủ conversation.
 */
export function canViewInternalMessages(actor: ChatActor): boolean {
  return isAdmin(actor);
}

/** Admin có được phép quản lý conversation này không? */
export function canManageConversation(actor: ChatActor): boolean {
  return isAdmin(actor);
}
