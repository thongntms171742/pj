import { Types } from "mongoose";
import { MessageSenderType } from "../../../models/Message";
import { ChatChannel, ChatStatus } from "../../../models/Conversation";

export interface ChatMessageDto {
  id: string;
  conversationId: string;
  senderType: MessageSenderType;
  senderId: string | null;
  senderName: string;
  content: string;
  metadata: Record<string, unknown>;
  sentAt: string;
  isOwn: boolean;
}

export interface ChatConversationDto {
  id: string;
  channel: ChatChannel;
  status: ChatStatus;
  peer: {
    id: string;
    name: string;
    avatarUrl?: string;
    role: string;
  };
  lastMessage: {
    content: string;
    sentAt: string;
    senderType: string;
  } | null;
  unread: number;
  updatedAt: string;
  assignedAdmin?: {
    id: string;
    name: string;
  } | null;
}

/**
 * Chuyển đổi bản ghi Message từ DB sang ChatMessageDto.
 * `currentActorKey`: userId hoặc guest:<sessionId> của người đang gọi để xác định `isOwn`.
 */
export function messageToDto(msg: any, currentActorKey?: string): ChatMessageDto {
  if (!msg) {
    return {
      id: "",
      conversationId: "",
      senderType: "USER",
      senderId: null,
      senderName: "",
      content: "",
      metadata: {},
      sentAt: new Date().toISOString(),
      isOwn: false,
    };
  }

  const id = String(msg._id || msg.id || "");
  const conversationId = String(msg.conversationId || "");
  const senderType: MessageSenderType = msg.sender?.type || msg.senderType || "USER";
  const senderId = msg.sender?.userId || (msg.senderId ? String(msg.senderId) : null);
  const senderName = msg.sender?.name || msg.senderName || "";
  const content = msg.content || "";
  const metadata = msg.metadata || {};

  const createdAt = msg.createdAt ? new Date(msg.createdAt) : new Date();
  const sentAt = createdAt.toISOString();

  const isOwn = Boolean(currentActorKey && senderId && currentActorKey === senderId);

  return {
    id,
    conversationId,
    senderType,
    senderId,
    senderName,
    content,
    metadata,
    sentAt,
    isOwn,
  };
}

/**
 * Chuyển đổi Conversation document sang ChatConversationDto.
 */
export function conversationToDto(
  conv: any,
  unreadCount: number = 0,
  currentUserId?: string
): ChatConversationDto {
  const id = String(conv._id || conv.id || "");
  const channel: ChatChannel = conv.channel || "AI";
  const status: ChatStatus = conv.status || "BOT_ACTIVE";

  // Xác định peer hiển thị:
  // Kênh AI: peer luôn là "Trợ lý AI"
  // Kênh SUPPORT:
  //   - Nếu người xem là admin: peer là buyer (thông tin customerInfo hoặc participant buyer)
  //   - Nếu người xem là buyer: peer là "Hỗ trợ khách hàng" hoặc assignedAdmin
  let peer = {
    id: "ai_bot",
    name: "Trợ lý AI",
    avatarUrl: undefined as string | undefined,
    role: "bot",
  };

  if (channel === "SUPPORT") {
    const isCurrentAdmin =
      conv.assignedAdminId && currentUserId && String(conv.assignedAdminId?._id || conv.assignedAdminId) === currentUserId;

    if (conv.customerInfo && isCurrentAdmin) {
      peer = {
        id: conv.participants?.find((p: any) => p.role === "buyer")?.userId || "buyer",
        name: conv.customerInfo.name || "Khách hàng",
        avatarUrl: undefined,
        role: "buyer",
      };
    } else if (conv.assignedAdminId && typeof conv.assignedAdminId === "object" && conv.assignedAdminId.name) {
      peer = {
        id: String(conv.assignedAdminId._id),
        name: conv.assignedAdminId.name,
        avatarUrl: conv.assignedAdminId.avatarUrl,
        role: "admin",
      };
    } else {
      peer = {
        id: "support_admin",
        name: "Hỗ trợ khách hàng",
        avatarUrl: undefined,
        role: "admin",
      };
    }
  }

  const lastMessage = conv.lastMessage
    ? {
        content: conv.lastMessage,
        sentAt: conv.lastMessageAt ? new Date(conv.lastMessageAt).toISOString() : new Date().toISOString(),
        senderType: conv.lastMessageSenderType || "USER",
      }
    : null;

  let assignedAdmin: { id: string; name: string } | null = null;
  if (conv.assignedAdminId) {
    if (typeof conv.assignedAdminId === "object" && conv.assignedAdminId.name) {
      assignedAdmin = {
        id: String(conv.assignedAdminId._id),
        name: conv.assignedAdminId.name,
      };
    } else {
      assignedAdmin = {
        id: String(conv.assignedAdminId),
        name: "Admin",
      };
    }
  }

  const updatedAt = conv.updatedAt
    ? new Date(conv.updatedAt).toISOString()
    : conv.lastMessageAt
    ? new Date(conv.lastMessageAt).toISOString()
    : new Date().toISOString();

  return {
    id,
    channel,
    status,
    peer,
    lastMessage,
    unread: unreadCount,
    updatedAt,
    assignedAdmin,
  };
}
