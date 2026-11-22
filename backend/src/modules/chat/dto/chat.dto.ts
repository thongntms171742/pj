/**
 * chat.dto.ts — hợp đồng dữ liệu cho toàn bộ Chat Module.
 *
 * Đây là "source of truth" cho FE: mọi response REST và Socket.IO đều
 * dùng chính các type này, nên FE chỉ cần import là khớp.
 *
 * Quy ước:
 *   - Tất cả date serialize thành ISO string (JSON tự động).
 *   - `id` luôn là string (ObjectId hex) — không bao giờ leak ObjectId object.
 *   - ObjectId trong DB, string trong DTO.
 */

import type {
  ConversationStatus,
  SupportMode,
} from "../../../models/Conversation";
import type {
  IMessageAttachment,
  MessageSenderType,
  MessageType,
  MessageVisibility,
} from "../../../models/Message";

// ── Conversation ───────────────────────────────────────────────────────────────

export interface ConversationDto {
  id: string;
  userId: string;
  status: ConversationStatus;
  supportMode: SupportMode;
  assignedAdminId: string | null;
  assignedAdminName: string | null;
  lastMessageId: string | null;
  lastMessageAt: string | null;
  unreadCount: { user: number; admin: number };
  version: number;
  closedAt: string | null;
  closedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationListItemDto {
  id: string;
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
  status: ConversationStatus;
  supportMode: SupportMode;
  assignedAdminId: string | null;
  assignedAdminName: string | null;
  lastMessageAt: string | null;
  unreadCount: { user: number; admin: number };
  version: number;
  createdAt: string;
}

// ── Message ───────────────────────────────────────────────────────────────────

export interface MessageAttachmentDto {
  url: string;
  publicId: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderType: MessageSenderType;
  content: string;
  messageType: MessageType;
  visibility: MessageVisibility;
  attachments: MessageAttachmentDto[];
  clientMessageId: string | null;
  userReadAt: string | null;
  adminReadAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SendMessageRequest {
  content: string;
  messageType?: MessageType;
  attachments?: IMessageAttachment[];
  clientMessageId?: string;
}

export interface SendMessageResponse {
  message: MessageDto;
  /** true nếu đây là tin nhắn user gửi (client cần phát event). */
  acknowledged: boolean;
  /** true nếu tin nhắn đã tồn tại trước đó (idempotency hit). */
  duplicate: boolean;
}

// ── Pagination ────────────────────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationMeta;
}

// ── Admin list ────────────────────────────────────────────────────────────────

export interface AdminConversationListItemDto {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  status: ConversationStatus;
  supportMode: SupportMode;
  assignedAdminId: string | null;
  assignedAdminName: string | null;
  lastMessageAt: string | null;
  unreadCount: { user: number; admin: number };
  version: number;
  createdAt: string;
}

// ── Type re-export để tiện import 1 chỗ ──────────────────────────────────────

export type {
  ConversationStatus,
  SupportMode,
  MessageSenderType,
  MessageType,
  MessageVisibility,
  IMessageAttachment,
};
