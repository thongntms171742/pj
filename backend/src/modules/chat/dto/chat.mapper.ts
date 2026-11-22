/**
 * chat.mapper.ts — chuyển đổi Mongoose document → DTO.
 *
 * Tách riêng khỏi service để:
 *   - Controller không cần biết cấu trúc Mongoose.
 *   - FE contract ổn định, không bị ảnh hưởng khi đổi schema nội bộ.
 */

import type { HydratedDocument } from "mongoose";
import type { IConversation } from "../../../models/Conversation";
import type { IMessage } from "../../../models/Message";
import type {
  ConversationDto,
  ConversationListItemDto,
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
