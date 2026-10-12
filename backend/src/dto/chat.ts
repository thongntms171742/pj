import type { IMessage, MessageRole } from "../models/Message";

// ── DTO shapes ────────────────────────────────────────────────────────────────

export interface MessageDto {
  _id: string;
  conversationId: string;
  role: MessageRole;
  senderId: string;
  senderName: string;
  content: string;
  isRead: boolean;
  readAt: string | null;
  sentAt: string;
  isOwn: boolean; // computed: does this message belong to the requester
}

export interface ChatHistoryDto {
  messages: MessageDto[];
  total: number;
  hasMore: boolean;
}

export interface UnreadCountDto {
  unread: number;
}

// ── Mapper ───────────────────────────────────────────────────────────────────
/**
 * Map IMessage to MessageDto.
 * `currentUserId` is used to compute `isOwn` so the FE knows which messages
 * belong to the requesting user without re-fetching the senderId.
 */
export function messageToDto(
  msg: IMessage | Record<string, unknown>,
  currentUserId: string
): MessageDto {
  const senderId = String(msg.senderId ?? "");
  const sentAt = (() => {
    const t = msg.createdAt as unknown;
    if (!t) return new Date().toISOString();
    return t instanceof Date ? t.toISOString() : new Date(t as string).toISOString();
  })();
  const readAtRaw = msg.readAt as unknown;
  return {
    _id: String(msg._id ?? ""),
    conversationId: String(msg.conversationId ?? "global"),
    role: (msg.role as MessageRole) ?? "user",
    senderId,
    senderName: String(msg.senderName ?? ""),
    content: String(msg.content ?? ""),
    isRead: Boolean(msg.isRead),
    readAt: readAtRaw
      ? readAtRaw instanceof Date
        ? readAtRaw.toISOString()
        : new Date(readAtRaw as string).toISOString()
      : null,
    sentAt,
    isOwn: senderId === currentUserId,
  };
}
