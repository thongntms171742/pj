/**
 * chat.emitter.ts — cầu nối giữa service layer và Socket.IO.
 *
 * Vấn đề kiến trúc:
 *   Nếu chỉ socket handler phát event, thì mọi thay đổi state thực hiện
 *   qua REST (đóng conversation, admin nhận handoff, AI escalate...) sẽ
 *   KHÔNG báo tới client ⇒ FE bị lệch trạng thái.
 *
 * Giải pháp:
 *   Service gọi `emitXxx()` ở đây. Module socket đăng ký namespace vào
 *   emitter lúc init. Nhờ vậy mọi nguồn thay đổi đều phát event đúng 1 chỗ.
 *
 * Quy tắc:
 *   - Emitter KHÔNG throw. Lỗi phát event không được làm fail nghiệp vụ.
 *   - Emitter KHÔNG import service (tránh circular dependency).
 */

import type { Namespace } from "socket.io";
import { ChatRooms, ChatServerEvents } from "./chat.events";

let namespace: Namespace | null = null;

/** Socket module gọi hàm này lúc init. */
export function registerChatNamespace(ns: Namespace): void {
  namespace = ns;
}

/** Xoá namespace (dùng khi shutdown / test). */
export function unregisterChatNamespace(): void {
  namespace = null;
}

/** Namespace hiện tại (null nếu socket chưa init). */
export function getChatNamespace(): Namespace | null {
  return namespace;
}

/**
 * Phát tin nhắn mới tới room conversation.
 *
 * Tin nhắn `internal` chỉ tới room admin — user KHÔNG BAO GIỜ thấy.
 */
export function emitMessageNew(params: {
  conversationId: string;
  message: unknown;
  echo?: boolean;
}): void {
  if (!namespace) return;
  try {
    const visibility =
      (params.message as { visibility?: string } | undefined)?.visibility;

    if (visibility === "internal") {
      namespace.to(ChatRooms.admins).emit(ChatServerEvents.MESSAGE_NEW, {
        conversationId: params.conversationId,
        message: params.message,
        echo: false,
      });
      return;
    }

    namespace.to(ChatRooms.conversation(params.conversationId)).emit(
      ChatServerEvents.MESSAGE_NEW,
      {
        conversationId: params.conversationId,
        message: params.message,
        echo: params.echo ?? false,
      }
    );
  } catch (err) {
    console.error("[chat.emitter] emitMessageNew failed:", err);
  }
}

/** Phát cập nhật trạng thái conversation. */
export function emitConversationUpdated(params: {
  conversationId: string;
  conversation: unknown;
}): void {
  if (!namespace) return;
  try {
    namespace.to(ChatRooms.conversation(params.conversationId)).emit(
      ChatServerEvents.CONVERSATION_UPDATED,
      params
    );
  } catch (err) {
    console.error("[chat.emitter] emitConversationUpdated failed:", err);
  }
}

/** Phát thay đổi unread count tới 1 user (tất cả tab/thiết bị). */
export function emitUnreadChanged(params: {
  userId: string;
  conversationId: string;
  unreadCount: { user: number; admin: number };
}): void {
  if (!namespace) return;
  try {
    namespace.to(ChatRooms.user(params.userId)).emit(
      ChatServerEvents.UNREAD_CHANGED,
      {
        conversationId: params.conversationId,
        unreadCount: params.unreadCount,
      }
    );
  } catch (err) {
    console.error("[chat.emitter] emitUnreadChanged failed:", err);
  }
}

/** Phát cập nhật handoff tới room admin + conversation. */
export function emitHandoffUpdated(params: {
  conversationId: string;
  handoff: unknown;
  status: "created" | "accepted" | "resolved" | "cancelled";
}): void {
  if (!namespace) return;
  try {
    const payload = {
      conversationId: params.conversationId,
      handoff: params.handoff,
      status: params.status,
    };
    namespace.to(ChatRooms.conversation(params.conversationId)).emit(
      ChatServerEvents.HANDOFF_UPDATED,
      payload
    );
    namespace.to(ChatRooms.admins).emit(ChatServerEvents.HANDOFF_UPDATED, payload);
  } catch (err) {
    console.error("[chat.emitter] emitHandoffUpdated failed:", err);
  }
}

/** Phát trạng thái AI đang xử lý (thinking / answered / escalated). */
export function emitAiStatus(params: {
  conversationId: string;
  status: "thinking" | "answered" | "escalated" | "unavailable";
  message?: unknown;
}): void {
  if (!namespace) return;
  try {
    namespace.to(ChatRooms.conversation(params.conversationId)).emit(
      ChatServerEvents.AI_STATUS,
      params
    );
  } catch (err) {
    console.error("[chat.emitter] emitAiStatus failed:", err);
  }
}
