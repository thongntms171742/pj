import type { IMessage, MessageRole, MessageSenderType } from "../models/Message";

// ── DTO shapes ────────────────────────────────────────────────────────────────

export interface MessageDto {
  _id: string;
  conversationId: string;
  role: MessageRole; // "buyer" | "admin" | "system" — for FE display
  senderId: string;
  senderName: string;
  content: string;
  isRead: boolean;
  readAt: string | null;
  sentAt: string;
  isOwn: boolean;
}

/**
 * One row in the conversation list (admin inbox / buyer "current chat").
 *
 * For BUYER: there is exactly ONE of these — their chat with admin.
 * For ADMIN: many — one per buyer they've chatted with.
 */
export interface ConversationDto {
  conversationId: string;
  peerId: string;          // the OTHER participant
  peerName: string;        // best-effort display name
  peerAvatar?: string;     // optional, if FE has it
  lastMessage: {
    content: string;
    sentAt: string;
    senderId: string;
    role: MessageRole;
  } | null;
  unread: number;          // unread messages from peer in this conversation
  updatedAt: string;       // last activity timestamp
}

export interface ChatHistoryDto {
  messages: MessageDto[];
  total: number;
  hasMore: boolean;
}

export interface UnreadCountDto {
  unread: number;
}

export interface ConversationListDto {
  conversations: ConversationDto[];
}

/**
 * Convert internal sender type ("user") to FE-friendly DTO role ("buyer").
 */
function toDtoRole(role: unknown): MessageRole {
  if (role === "admin") return "admin";
  if (role === "system") return "system";
  return "buyer"; // "user" → "buyer", and default fallback
}

// ── Mapper ───────────────────────────────────────────────────────────────────
/**
 * Map IMessage to MessageDto.
 * `currentUserId` is used to compute `isOwn` so the FE knows which messages
 * belong to the requesting user without re-fetching the senderId.
 *
 * Accepts any object — Mongoose document, lean document, or plain object.
 */
export function messageToDto(
  msg: unknown,
  currentUserId: string
): MessageDto {
  const m = msg as Record<string, unknown> | null | undefined;
  if (!m) {
    return {
      _id: "",
      conversationId: "c_unknown",
      role: "buyer",
      senderId: "",
      senderName: "",
      content: "",
      isRead: false,
      readAt: null,
      sentAt: new Date().toISOString(),
      isOwn: false,
    };
  }

  const senderId = String(m.senderId ?? "");
  const createdAtRaw = m.createdAt;
  const sentAt = ((): string => {
    if (!createdAtRaw) return new Date().toISOString();
    return createdAtRaw instanceof Date
      ? createdAtRaw.toISOString()
      : new Date(createdAtRaw as string | number).toISOString();
  })();
  const readAtRaw = m.readAt;
  return {
    _id: String(m._id ?? ""),
    conversationId: String(m.conversationId ?? "c_unknown"),
    role: toDtoRole(m.role),
    senderId,
    senderName: String(m.senderName ?? ""),
    content: String(m.content ?? ""),
    isRead: Boolean(m.isRead),
    readAt: readAtRaw
      ? readAtRaw instanceof Date
        ? readAtRaw.toISOString()
        : new Date(readAtRaw as string | number).toISOString()
      : null,
    sentAt,
    isOwn: senderId === currentUserId,
  };
}
