/**
 * chat.mapper.ts — chuyển đổi Mongoose document → DTO.
 *
 * Tách riêng khỏi service để:
 *   - Controller không cần biết cấu trúc Mongoose.
 *   - FE contract ổn định, không bị ảnh hưởng khi đổi schema nội bộ.
 */

import type { HydratedDocument, Types } from "mongoose";
import { Conversation, type IConversation } from "../../../models/Conversation";
import { Message, type IMessage } from "../../../models/Message";
import {
  HandoffRequest,
  type IHandoffRequest,
} from "../../../models/HandoffRequest";
import type {
  ConversationDto,
  ConversationListItemDto,
  ConversationPreviewDto,
  HandoffRequestDto,
  MessageDto,
} from "../dto/chat.dto";

type MaybeUser = {
  _id?: unknown;
  name?: string;
  email?: string;
  avatarUrl?: string;
} | null;

function strId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && "_id" in (value as Record<string, unknown>)) {
    return String((value as { _id: unknown })._id);
  }
  return String(value);
}

/**
 * Chuyển Date → ISO string, an toàn cho document chưa lưu (createdAt undefined).
 */
function isoDate(value: Date | string | null | undefined): string {
  if (!value) return new Date(0).toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
}

function iso(value: Date | null | undefined): string | null {
  return value ? isoDate(value) : null;
}

// ── Message ───────────────────────────────────────────────────────────────────

export function messageToDto(doc: IMessage | HydratedDocument<IMessage>): MessageDto {
  const m = doc as IMessage;
  return {
    id: String(m._id),
    conversationId: String(m.conversationId),
    senderId: strId(m.senderId),
    senderType: m.senderType,
    content: m.content,
    messageType: m.messageType,
    visibility: m.visibility,
    attachments: (m.attachments ?? []).map((a) => ({
      url: a.url,
      publicId: a.publicId ?? "",
      name: a.name ?? "",
      mimeType: a.mimeType ?? "",
      size: a.size ?? 0,
    })),
    aiMetadata: m.aiMetadata
      ? {
          model: m.aiMetadata.model ?? "",
          promptVersion: m.aiMetadata.promptVersion ?? "",
          intent: m.aiMetadata.intent ?? "",
          intentConfidence: m.aiMetadata.intentConfidence ?? 0,
          sentiment: m.aiMetadata.sentiment ?? "",
          tokensUsed: m.aiMetadata.tokensUsed ?? 0,
          latencyMs: m.aiMetadata.latencyMs ?? 0,
          toolsUsed: m.aiMetadata.toolsUsed ?? [],
          needsHumanReview: m.aiMetadata.needsHumanReview ?? false,
        }
      : null,
    clientMessageId: m.clientMessageId ?? null,
    userReadAt: iso(m.userReadAt),
    adminReadAt: iso(m.adminReadAt),
    createdAt: isoDate(m.createdAt),
    updatedAt: isoDate(m.updatedAt),
  };
}

// ── Conversation ──────────────────────────────────────────────────────────────

export function conversationToDto(
  doc: IConversation | HydratedDocument<IConversation>,
  options: { admin?: MaybeUser } = {}
): ConversationDto {
  const c = doc as IConversation;
  return {
    id: String(c._id),
    userId: String(c.userId),
    status: c.status,
    supportMode: c.supportMode,
    assignedAdminId: strId(c.assignedAdminId),
    assignedAdminName: options.admin?.name ?? null,
    aiConfig: {
      model: c.aiConfig?.model ?? "",
      promptVersion: c.aiConfig?.promptVersion ?? "",
      intent: c.aiConfig?.intent ?? "",
      intentConfidence: c.aiConfig?.intentConfidence ?? 0,
      sentiment: c.aiConfig?.sentiment ?? "",
      enabled: c.aiConfig?.enabled ?? true,
    },
    lastMessageId: strId(c.lastMessageId),
    lastMessageAt: iso(c.lastMessageAt),
    unreadCount: {
      user: c.unreadCount?.user ?? 0,
      admin: c.unreadCount?.admin ?? 0,
    },
    version: c.version,
    closedAt: iso(c.closedAt),
    closedBy: strId(c.closedBy),
    createdAt: isoDate(c.createdAt),
    updatedAt: isoDate(c.updatedAt),
  };
}

export function conversationToListItemDto(
  doc: IConversation | HydratedDocument<IConversation>,
  user?: MaybeUser
): ConversationListItemDto {
  const c = doc as IConversation;
  return {
    id: String(c._id),
    userId: String(c.userId),
    userName: user?.name ?? "",
    userAvatarUrl: user?.avatarUrl ?? null,
    status: c.status,
    supportMode: c.supportMode,
    assignedAdminId: strId(c.assignedAdminId),
    assignedAdminName: null,
    lastMessageAt: iso(c.lastMessageAt),
    unreadCount: {
      user: c.unreadCount?.user ?? 0,
      admin: c.unreadCount?.admin ?? 0,
    },
    version: c.version,
    createdAt: isoDate(c.createdAt),
  };
}

export function conversationToPreviewDto(
  doc: IConversation | HydratedDocument<IConversation>,
  user?: MaybeUser,
  lastMessage?: IMessage | HydratedDocument<IMessage> | null
): ConversationPreviewDto {
  const c = doc as IConversation;
  const lm = lastMessage as IMessage | undefined;
  return {
    id: String(c._id),
    userId: String(c.userId),
    userName: user?.name ?? "",
    status: c.status,
    supportMode: c.supportMode,
    assignedAdminId: strId(c.assignedAdminId),
    lastMessage: lm
      ? {
          id: String(lm._id),
          content: lm.content,
          senderType: lm.senderType,
          createdAt: isoDate(lm.createdAt),
        }
      : null,
    unreadCount: {
      user: c.unreadCount?.user ?? 0,
      admin: c.unreadCount?.admin ?? 0,
    },
    version: c.version,
    lastMessageAt: iso(c.lastMessageAt),
  };
}

// ── Handoff ───────────────────────────────────────────────────────────────────

export function handoffToDto(
  doc: IHandoffRequest | HydratedDocument<IHandoffRequest>
): HandoffRequestDto {
  const h = doc as IHandoffRequest;
  return {
    id: String(h._id),
    conversationId: String(h.conversationId),
    userId: String(h.userId),
    reason: h.reason,
    priority: h.priority,
    status: h.status,
    summary: h.summary,
    requestedAt: isoDate(h.requestedAt),
    assignedAdminId: strId(h.assignedAdminId),
    acceptedAt: iso(h.acceptedAt),
    resolvedAt: iso(h.resolvedAt),
    version: h.version,
    createdAt: isoDate(h.createdAt),
    updatedAt: isoDate(h.updatedAt),
  };
}

/**
 * Load lại `assignedAdminId` để mapper trả kèm tên admin.
 * Dùng cho các endpoint cần hiển thị "Tư vấn viên: <name>".
 *
 * KHÔNG populate — populate trả `null` khi user đã bị xoá ⇒ mất luôn
 * ObjectId gốc. Lookup riêng giữ được cả 2 thông tin.
 */
export async function populateAdminName(
  conversationId: Types.ObjectId
): Promise<MaybeUser> {
  const conv = await Conversation.findById(conversationId).lean();
  const adminId = conv?.assignedAdminId;
  if (!adminId) return null;

  const { User } = await import("../../../models/User");
  const admin = await User.findById(adminId).select("name email avatarUrl").lean();
  return admin ?? null;
}

/**
 * Load conversation (không populate admin — xem `populateAdminName`).
 */
export async function loadConversationWithAdmin(
  conversationId: Types.ObjectId
): Promise<IConversation | null> {
  return Conversation.findById(conversationId)
    .lean() as unknown as Promise<IConversation | null>;
}

export { Message, Conversation, HandoffRequest };
