import { Request, Response } from "express";
import { Types } from "mongoose";
import { Conversation } from "../../../models/Conversation";
import { Message } from "../../../models/Message";
import { User } from "../../../models/User";
import {
  ChatActor,
  actorKey,
  normalizeSessionId,
  canAccessConversation,
  isValidConversationId,
} from "../services/chatAccess";
import {
  getOrCreateConversation as getOrCreateConvService,
  resolveConversationAccess,
  setParticipantLastRead,
  listConversationsForUser,
} from "../services/conversationService";
import {
  sendMessage as sendMsgService,
  listMessages as listMsgService,
  countUnread,
  countUnreadBatch,
} from "../services/messageService";
import { messageToDto, conversationToDto } from "../dto/chat";
import { broadcastNewMessage, broadcastStatusChange } from "../socket/chatSocket";
import { sendError, ErrorCode, handleInternalError } from "../../../utils/errors";
import { ok, created } from "../../../utils/respond";
import { isChatError, sendChatError } from "../services/chatErrors";

export function getChatActor(req: Request): ChatActor {
  const headerSession =
    req.headers["x-chat-session-id"] ||
    req.headers["x-guest-session-id"] ||
    req.headers["x-session-id"];

  const sessionId =
    normalizeSessionId(req.body?.sessionId) ||
    normalizeSessionId(req.query?.sessionId) ||
    normalizeSessionId(headerSession);

  return {
    userId: req.user?.id,
    sessionId,
    isAdmin: Boolean(req.user?.roles?.includes("admin")),
    name: (req.user as any)?.name || (req.user as any)?.email?.split("@")[0] || undefined,
  };
}

/**
 * POST /api/chat/conversations (optionalAuth)
 * Body: { channel?: "AI" | "SUPPORT", sessionId?, customerInfo? }
 */
export async function getOrCreateConversation(req: Request, res: Response): Promise<void> {
  try {
    const actor = getChatActor(req);
    const { channel, customerInfo } = req.body || {};

    const { conversation } = await getOrCreateConvService({
      channel,
      userId: actor.userId,
      sessionId: actor.sessionId,
      customerInfo,
    });

    // Lấy 50 tin nhắn đầu tiên
    const { messages } = await listMsgService({
      conversationId: conversation._id,
      limit: 50,
    });

    const actorKeyStr = actorKey(actor);
    const unread = await countUnread(conversation._id, actorKeyStr, { isAdmin: actor.isAdmin });

    ok(res, {
      conversation: conversationToDto(conversation, unread, actor.userId),
      messages: messages.map((m) => messageToDto(m, actorKeyStr)),
    });
  } catch (err: any) {
    if (isChatError(err)) {
      sendChatError(res, err);
      return;
    }
    handleInternalError(res, err, "getOrCreateConversation");
  }
}

/**
 * GET /api/chat/conversations (requireAuth)
 * Danh sách hội thoại của user (Buyer: AI + SUPPORT; Admin: tất cả)
 */
export async function listConversations(req: Request, res: Response): Promise<void> {
  try {
    const actor = getChatActor(req);
    const result = await listConversationsForUser(actor, {
      page: parseInt(req.query.page as string, 10) || 1,
      limit: parseInt(req.query.limit as string, 10) || 20,
    });

    // Batch count unread cho từng conversation
    const actorKeyStr = actorKey(actor);
    const unreadMap = await countUnreadBatch(result.conversations, {
      keys: actorKeyStr ? [actorKeyStr] : [],
      isAdmin: Boolean(actor.isAdmin),
    });

    const dtos = result.conversations.map((c: any) =>
      conversationToDto(c, unreadMap.get(String(c._id)) || 0, actor.userId)
    );

    ok(res, {
      conversations: dtos,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (err: any) {
    if (isChatError(err)) {
      sendChatError(res, err);
      return;
    }
    handleInternalError(res, err, "listConversations");
  }
}

/**
 * GET /api/chat/conversations/:id/messages (optionalAuth)
 * ?limit=&before=
 */
export async function getConversationMessages(req: Request, res: Response): Promise<void> {
  try {
    const actor = getChatActor(req);
    const id = String(req.params.id || "");

    const conv = await resolveConversationAccess(id, actor);

    const limit = parseInt(req.query.limit as string, 10) || 50;
    const before = req.query.before as string | undefined;

    const { messages, hasMore, total } = await listMsgService({
      conversationId: conv._id,
      limit,
      before,
    });

    const actorKeyStr = actorKey(actor);
    ok(res, {
      messages: messages.map((m) => messageToDto(m, actorKeyStr)),
      hasMore,
      total,
      conversationId: id,
    });
  } catch (err: any) {
    if (isChatError(err)) {
      sendChatError(res, err);
      return;
    }
    handleInternalError(res, err, "getConversationMessages");
  }
}

/**
 * POST /api/chat/conversations/:id/messages (optionalAuth)
 * Body: { content, metadata? }
 */
export async function sendMessage(req: Request, res: Response): Promise<void> {
  try {
    const actor = getChatActor(req);
    const id = String(req.params.id || "");
    const { content, metadata } = req.body || {};

    const conv = await resolveConversationAccess(id, actor);

    const senderType = actor.isAdmin ? "ADMIN" : "USER";
    const myKey = actorKey(actor);
    let senderName = actor.name;

    if (!senderName && actor.userId) {
      const user = await User.findById(actor.userId).select("name").lean();
      if (user?.name) senderName = user.name;
    }

    const saved = await sendMsgService({
      conversationId: conv._id,
      sender: {
        type: senderType,
        userId: myKey,
        name: senderName || (actor.isAdmin ? "Admin Support" : "Khách hàng"),
      },
      content,
      metadata,
    });

    // Broadcast realtime qua socket
    await broadcastNewMessage(conv._id, saved, conv);

    // Bot reply async nếu là bot conversation
    if (conv.channel === "AI" && conv.status === "BOT_ACTIVE" && senderType === "USER") {
      const { processAiChatMessage } = await import("../../../services/ai/chatbotService");
      processAiChatMessage(String(conv._id), String(content).trim(), {
        userId: actor.userId,
        sessionId: actor.sessionId,
      }).catch((err) => {
        console.error("[chatController] processAiChatMessage error:", err);
      });
    }

    created(res, {
      message: messageToDto(saved, myKey),
    });
  } catch (err: any) {
    if (isChatError(err)) {
      sendChatError(res, err);
      return;
    }
    handleInternalError(res, err, "sendMessage");
  }
}

/**
 * POST /api/chat/conversations/:id/read (optionalAuth)
 * Body: { lastMessageId? }
 */
export async function markRead(req: Request, res: Response): Promise<void> {
  try {
    const actor = getChatActor(req);
    const id = String(req.params.id || "");

    const conv = await resolveConversationAccess(id, actor);
    const myKey = actorKey(actor);

    if (myKey) {
      await setParticipantLastRead(conv._id, myKey, new Date());
    }

    ok(res, { success: true, conversationId: id });
  } catch (err: any) {
    if (isChatError(err)) {
      sendChatError(res, err);
      return;
    }
    handleInternalError(res, err, "markRead");
  }
}

/**
 * POST /api/chat/conversations/:id/escalate (optionalAuth)
 * Body: { reason? }
 */
export async function requestEscalation(req: Request, res: Response): Promise<void> {
  try {
    const actor = getChatActor(req);
    const id = String(req.params.id || "");
    const { reason } = req.body || {};

    const conv = await resolveConversationAccess(id, actor);

    conv.status = "WAITING_ADMIN";
    conv.summary = reason || "Khách hàng yêu cầu hỗ trợ từ tư vấn viên";
    await conv.save();

    const sysMsg = await Message.create({
      conversationId: conv._id,
      sender: {
        type: "SYSTEM",
        name: "Hệ thống",
      },
      content: "Đã gửi yêu cầu kết nối với tư vấn viên. Vui lòng chờ trong giây lát...",
      metadata: { action: "ESCALATION_REQUESTED", reason },
    });

    await broadcastNewMessage(conv._id, sysMsg, conv);
    broadcastStatusChange(conv._id, "WAITING_ADMIN");

    ok(res, {
      success: true,
      conversation: conversationToDto(conv, 0, actor.userId),
    });
  } catch (err: any) {
    if (isChatError(err)) {
      sendChatError(res, err);
      return;
    }
    handleInternalError(res, err, "requestEscalation");
  }
}

/**
 * GET /api/chat/unread (requireAuth)
 * Tổng unread của tôi across all channels
 */
export async function getUnreadCount(req: Request, res: Response): Promise<void> {
  try {
    const actor = getChatActor(req);
    const myKey = actorKey(actor);

    if (!myKey) {
      ok(res, { unread: 0 });
      return;
    }

    // Lấy tất cả conversation mà actor tham gia
    const query = actor.isAdmin
      ? { $or: [{ "participants.userId": actor.userId }, { status: "WAITING_ADMIN" }] }
      : { "participants.userId": myKey };

    const convs = await Conversation.find(query).select("_id participants").lean();
    const unreadMap = await countUnreadBatch(convs, {
      keys: [myKey],
      isAdmin: Boolean(actor.isAdmin),
    });

    let total = 0;
    for (const count of unreadMap.values()) {
      total += count;
    }

    ok(res, { unread: total });
  } catch (err: any) {
    if (isChatError(err)) {
      sendChatError(res, err);
      return;
    }
    handleInternalError(res, err, "getUnreadCount");
  }
}
