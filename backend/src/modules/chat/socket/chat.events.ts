/**
 * chat.events.ts — hợp đồng event của Socket.IO namespace `/chat`.
 *
 * Đây là "source of truth" cho FE realtime. Mọi event phát đi và mọi event
 * client gửi lên đều được khai báo ở đây ⇒ FE chỉ cần import là khớp.
 *
 * Nguyên tắc:
 *   - Event server → client có tiền tố theo hướng: `message:new`, `conversation:updated`.
 *   - Event client → server dùng dạng động: `message:send`.
 *   - Mọi payload có `ack` callback (server → client hoặc client → server)
 *     trả về `{ ok: true, data }` hoặc `{ ok: false, error: { code, message } }`.
 */

// ── Client → Server events ────────────────────────────────────────────────────

export interface ChatSendMessagePayload {
  conversationId: string;
  content: string;
  messageType?: "text" | "image" | "file" | "system";
  attachments?: Array<{
    url: string;
    publicId?: string;
    name?: string;
    mimeType?: string;
    size?: number;
  }>;
  /** Idempotency key — client tự sinh (VD: uuid). */
  clientMessageId?: string;
}

export interface ChatTypingPayload {
  conversationId: string;
  isTyping: boolean;
}

export interface ChatSubscribePayload {
  conversationId: string;
}

export interface ChatMarkReadPayload {
  conversationId: string;
}

// ── Server → Client events ────────────────────────────────────────────────────

export interface ChatMessageNewEvent {
  conversationId: string;
  message: unknown; // MessageDto
  /** Tin nhắn do chính client này gửi (client bỏ qua render lại). */
  echo: boolean;
}

export interface ChatConversationUpdatedEvent {
  conversationId: string;
  conversation: unknown; // ConversationDto
}

export interface ChatTypingEvent {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}

export interface ChatUnreadEvent {
  conversationId: string;
  unreadCount: { user: number; admin: number };
}

export interface ChatHandoffEvent {
  conversationId: string;
  handoff: unknown; // HandoffRequestDto
  status: "created" | "accepted" | "resolved" | "cancelled";
}

export interface ChatAiStatusEvent {
  conversationId: string;
  status: "thinking" | "answered" | "escalated" | "unavailable";
  /** Chỉ có khi status = "answered". */
  message?: unknown;
}

// ── Ack types ────────────────────────────────────────────────────────────────

export type ChatAck<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

// ── Event name constants ──────────────────────────────────────────────────────

export const ChatClientEvents = {
  /** Client gửi tin nhắn mới. */
  SEND_MESSAGE: "message:send",
  /** Client báo đang gõ. */
  TYPING: "message:typing",
  /** Client subscribe 1 conversation để nhận realtime. */
  SUBSCRIBE: "conversation:subscribe",
  /** Client huỷ subscribe. */
  UNSUBSCRIBE: "conversation:unsubscribe",
  /** Client đánh dấu đã đọc. */
  MARK_READ: "conversation:read",
  /** Client ping để giữ kết nối (không bắt buộc). */
  PING: "chat:ping",
} as const;

export const ChatServerEvents = {
  /** Tin nhắn mới trong conversation. */
  MESSAGE_NEW: "message:new",
  /** Conversation được cập nhật (status/supportMode/version). */
  CONVERSATION_UPDATED: "conversation:updated",
  /** Ai đó đang gõ. */
  TYPING: "message:typing",
  /** Unread count thay đổi. */
  UNREAD_CHANGED: "conversation:unread",
  /** Handoff thay đổi trạng thái. */
  HANDOFF_UPDATED: "handoff:updated",
  /** Trạng thái AI đang xử lý. */
  AI_STATUS: "ai:status",
  /** Xác nhận kết nối thành công. */
  CONNECTED: "chat:connected",
  /** Lỗi chung. */
  ERROR: "chat:error",
  /** Pong. */
  PONG: "chat:pong",
} as const;

// ── Room naming ───────────────────────────────────────────────────────────────

/**
 * Quy ước room:
 *   - `conversation:{id}` : mọi thành viên của 1 conversation.
 *   - `user:{id}`         : tất cả socket của 1 user (nhiều tab / thiết bị).
 *   - `admin`             : tất cả admin đang online (hàng đợi handoff).
 */
export const ChatRooms = {
  conversation: (id: string) => `conversation:${id}`,
  user: (id: string) => `user:${id}`,
  admins: "admins",
} as const;
