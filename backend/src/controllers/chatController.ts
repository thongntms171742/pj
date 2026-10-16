import { Request, Response } from "express";
import { Types } from "mongoose";
import { Conversation, ChatStatus } from "../models/Conversation";
import { Message, MessageSenderType } from "../models/Message";
import { User } from "../models/User";
import { sendError, ErrorCode, handleInternalError } from "../utils/errors";
import { getSocketIO } from "../services/chat/socketService";
import { processAiChatMessage } from "../services/ai/chatbotService";

/**
 * Get or create an active conversation for a user or guest sessionId.
 * POST /api/chat/conversations
 */
export async function getOrCreateConversation(req: Request, res: Response): Promise<void> {
  try {
    const { sessionId, customerInfo } = req.body;
    const userId = req.user?.id ? new Types.ObjectId(req.user.id) : undefined;

    if (!sessionId && !userId) {
      sendError(res, ErrorCode.INVALID_INPUT, "Thiếu sessionId hoặc thông tin người dùng", 400);
      return;
    }

    // Try finding existing active conversation
    const query: any = {
      status: { $in: ["BOT_ACTIVE", "WAITING_ADMIN", "ADMIN_ACTIVE"] },
    };

    if (userId) {
      query.$or = [{ userId }, { sessionId: sessionId || "" }];
    } else {
      query.sessionId = sessionId;
    }

    let conversation = await Conversation.findOne(query)
      .sort({ updatedAt: -1 })
      .populate("assignedAdminId", "name email avatarUrl");

    if (!conversation) {
      // Create new conversation
      let resolvedCustomerInfo = customerInfo || {};
      if (userId) {
        const user = await User.findById(userId).select("name email phone");
        if (user) {
          resolvedCustomerInfo = {
            name: user.name,
            email: user.email,
            phone: user.phone || resolvedCustomerInfo.phone,
          };
        }
      }

      conversation = await Conversation.create({
        sessionId: sessionId || `session_${Date.now()}`,
        userId,
        customerInfo: resolvedCustomerInfo,
        status: "BOT_ACTIVE",
      });

      // Send welcome message from Bot
      await Message.create({
        conversationId: conversation._id,
        senderType: "BOT",
        senderName: "Trợ lý AI",
        content: "Xin chào! 🎄 Em là trợ lý ảo của Build Your Christmas. Em có thể giúp gì cho anh/chị hôm nay ạ? Anh/chị có thể hỏi về tư vấn cây thông, giá cả, hoặc tra cứu đơn hàng nhé!",
        metadata: {
          quickReplies: [
            "Tư vấn cây thông Noel",
            "Tra cứu đơn hàng",
            "Gặp nhân viên hỗ trợ",
          ],
        },
      });
    }

    // Fetch initial messages (latest 50)
    const messages = await Message.find({ conversationId: conversation._id })
      .sort({ createdAt: 1 })
      .limit(50);

    res.json({
      conversation,
      messages,
    });
  } catch (err) {
    handleInternalError(res, err, "getOrCreateConversation");
  }
}

/**
 * Get messages for a conversation (paginated).
 * GET /api/chat/conversations/:id/messages
 */
export async function getConversationMessages(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id || "");
    if (!Types.ObjectId.isValid(id)) {
      sendError(res, ErrorCode.INVALID_INPUT, "ID cuộc trò chuyện không hợp lệ", 400);
      return;
    }

    const conversation = await Conversation.findById(id);
    if (!conversation) {
      sendError(res, ErrorCode.CONVERSATION_NOT_FOUND, "Không tìm thấy cuộc trò chuyện", 404);
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const before = req.query.before as string | undefined;

    const query: any = { conversationId: conversation._id };
    if (before && Types.ObjectId.isValid(before)) {
      const refMsg = await Message.findById(before);
      if (refMsg) {
        query.createdAt = { $lt: refMsg.createdAt };
      }
    }

    const messages = await Message.find(query)
      .sort({ createdAt: 1 })
      .limit(limit);

    res.json({
      conversationId: conversation._id,
      messages,
    });
  } catch (err) {
    handleInternalError(res, err, "getConversationMessages");
  }
}

/**
 * Send a message via REST API (fallback for non-socket clients).
 * POST /api/chat/conversations/:id/messages
 */
export async function sendAiChatMessage(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id || "");
    const { content, metadata } = req.body;

    if (!Types.ObjectId.isValid(id)) {
      sendError(res, ErrorCode.INVALID_INPUT, "ID cuộc trò chuyện không hợp lệ", 400);
      return;
    }

    if (!content || !content.trim()) {
      sendError(res, ErrorCode.INVALID_INPUT, "Nội dung tin nhắn không được để trống", 400);
      return;
    }

    const conversation = await Conversation.findById(id);
    if (!conversation) {
      sendError(res, ErrorCode.CONVERSATION_NOT_FOUND, "Không tìm thấy cuộc trò chuyện", 404);
      return;
    }

    const isAdmin = Boolean(req.user?.roles?.includes("admin"));
    const senderType: MessageSenderType = isAdmin ? "ADMIN" : "USER";
    let senderName = isAdmin ? "Admin Support" : "Khách hàng";

    if (req.user?.id) {
      const user = await User.findById(req.user.id).select("name");
      if (user) senderName = user.name;
    }

    const message = await Message.create({
      conversationId: conversation._id,
      senderType,
      senderId: req.user?.id ? new Types.ObjectId(req.user.id) : undefined,
      senderName,
      content: content.trim(),
      metadata: metadata || {},
    });

    conversation.lastMessage = content.trim();
    conversation.lastMessageAt = new Date();
    if (isAdmin) {
      conversation.unreadUserCount += 1;
    } else {
      conversation.unreadAdminCount += 1;
    }
    await conversation.save();

    // Broadcast via Socket.io
    const io = getSocketIO();
    if (io) {
      const room = `conversation_${conversation._id}`;
      io.to(room).emit("new_message", {
        message,
        conversation: {
          id: conversation._id,
          status: conversation.status,
          lastMessageAt: conversation.lastMessageAt,
        },
      });

      io.to("admin_channel").emit("conversation_updated", {
        conversationId: conversation._id,
        lastMessage: conversation.lastMessage,
        lastMessageAt: conversation.lastMessageAt,
        status: conversation.status,
        unreadAdminCount: conversation.unreadAdminCount,
        customerInfo: conversation.customerInfo,
      });

      if (conversation.status === "BOT_ACTIVE" && senderType === "USER") {
        processAiChatMessage(String(conversation._id), content.trim()).catch((err) => {
          console.error("[chatController] processAiChatMessage error:", err);
        });
      }
    }

    res.status(201).json({ message });
  } catch (err) {
    handleInternalError(res, err, "sendMessage");
  }
}

/**
 * Escalate conversation to human admin.
 * POST /api/chat/conversations/:id/escalate
 */
export async function requestEscalation(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id || "");
    const { reason } = req.body;

    if (!Types.ObjectId.isValid(id)) {
      sendError(res, ErrorCode.INVALID_INPUT, "ID không hợp lệ", 400);
      return;
    }

    const conversation = await Conversation.findById(id);
    if (!conversation) {
      sendError(res, ErrorCode.CONVERSATION_NOT_FOUND, "Không tìm thấy cuộc trò chuyện", 404);
      return;
    }

    conversation.status = "WAITING_ADMIN";
    conversation.summary = reason || "Khách hàng yêu cầu hỗ trợ từ tư vấn viên";
    await conversation.save();

    const sysMsg = await Message.create({
      conversationId: conversation._id,
      senderType: "SYSTEM",
      senderName: "Hệ thống",
      content: "Đã gửi yêu cầu kết nối với tư vấn viên. Vui lòng chờ trong giây lát...",
      metadata: { action: "ESCALATION_REQUESTED", reason },
    });

    const io = getSocketIO();
    if (io) {
      const room = `conversation_${conversation._id}`;
      io.to(room).emit("new_message", { message: sysMsg });
      io.to(room).emit("status_changed", {
        conversationId: conversation._id,
        status: conversation.status,
      });
      io.to("admin_channel").emit("new_support_ticket", {
        conversationId: conversation._id,
        customerInfo: conversation.customerInfo,
        summary: conversation.summary,
        lastMessageAt: conversation.lastMessageAt,
        unreadAdminCount: conversation.unreadAdminCount,
      });
    }

    res.json({ success: true, conversation });
  } catch (err) {
    handleInternalError(res, err, "requestEscalation");
  }
}

/**
 * Admin: List all conversations with filters.
 * GET /api/chat/admin/conversations
 */
export async function listAdminConversations(req: Request, res: Response): Promise<void> {
  try {
    const { status, page = "1", limit = "20" } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string, 10)));
    const skip = (pageNum - 1) * limitNum;

    const filter: any = {};
    if (status && status !== "all") {
      filter.status = status;
    }

    const [conversations, total] = await Promise.all([
      Conversation.find(filter)
        .sort({ unreadAdminCount: -1, lastMessageAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate("assignedAdminId", "name email avatarUrl")
        .populate("userId", "name email phone"),
      Conversation.countDocuments(filter),
    ]);

    res.json({
      conversations,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    handleInternalError(res, err, "listAdminConversations");
  }
}

/**
 * Admin: Update conversation status (accept, resolve, return to bot).
 * PUT /api/chat/admin/conversations/:id/status
 */
export async function updateAdminConversationStatus(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id || "");
    const { status } = req.body as { status: ChatStatus };

    if (!Types.ObjectId.isValid(id)) {
      sendError(res, ErrorCode.INVALID_INPUT, "ID không hợp lệ", 400);
      return;
    }

    const validStatuses: ChatStatus[] = ["BOT_ACTIVE", "WAITING_ADMIN", "ADMIN_ACTIVE", "RESOLVED"];
    if (!validStatuses.includes(status)) {
      sendError(res, ErrorCode.CONVERSATION_STATUS_INVALID, "Trạng thái không hợp lệ", 400);
      return;
    }

    const conversation = await Conversation.findById(id);
    if (!conversation) {
      sendError(res, ErrorCode.CONVERSATION_NOT_FOUND, "Không tìm thấy cuộc trò chuyện", 404);
      return;
    }

    const prevStatus = conversation.status;
    conversation.status = status;

    let systemNote = "";
    if (status === "ADMIN_ACTIVE") {
      conversation.assignedAdminId = new Types.ObjectId(req.user!.id);
      const admin = await User.findById(req.user!.id).select("name");
      const adminName = admin?.name || "Tư vấn viên";
      systemNote = `${adminName} đã tiếp nhận cuộc trò chuyện.`;
    } else if (status === "RESOLVED") {
      systemNote = "Cuộc trò chuyện đã được kết thúc bởi tư vấn viên.";
    } else if (status === "BOT_ACTIVE") {
      systemNote = "Cuộc trò chuyện đã được chuyển lại cho Trợ lý AI.";
    }

    await conversation.save();

    let sysMsg = null;
    if (systemNote) {
      sysMsg = await Message.create({
        conversationId: conversation._id,
        senderType: "SYSTEM",
        senderName: "Hệ thống",
        content: systemNote,
        metadata: { action: `STATUS_CHANGE_TO_${status}`, prevStatus },
      });
    }

    const io = getSocketIO();
    if (io) {
      const room = `conversation_${conversation._id}`;
      if (sysMsg) io.to(room).emit("new_message", { message: sysMsg });
      io.to(room).emit("status_changed", {
        conversationId: conversation._id,
        status: conversation.status,
      });
      io.to("admin_channel").emit("conversation_status_updated", {
        conversationId: conversation._id,
        status: conversation.status,
        assignedAdminId: conversation.assignedAdminId,
      });
    }

    res.json({ success: true, conversation });
  } catch (err) {
    handleInternalError(res, err, "updateAdminConversationStatus");
  }
}

// ── 1-1 Chat (Buyer <-> Admin) Endpoints ─────────────────────────────────────
import { messageToDto, ConversationDto } from "../dto/chat";
import { ok, created } from "../utils/respond";
import { broadcastMessageFromRest } from "../services/socket";
import {
  resolveConversationBetween,
  resolveConversationBetweenAsync,
  isAdminPeer,
  parseConversationId,
  ADMIN_TEAM_ID,
  ADMIN_TEAM_ID_FALLBACK,
  getAdminTeamId,
  getOtherParticipant,
} from "../services/conversation";

const PAGE_SIZE = 50;

interface AuthUser {
  id: string;
  email?: string;
  name?: string;
  roles?: string[];
}

function currentUser(req: Request): AuthUser {
  const u = req.user as AuthUser | undefined;
  if (!u?.id) throw new Error("user not authenticated");
  return u;
}

function isAdmin(u: AuthUser): boolean {
  return Array.isArray(u.roles) && u.roles.includes("admin");
}

// ── GET /api/chat/conversations ──────────────────────────────────────────────
/**
 * List the current user's conversations, newest activity first.
 *
 * For a buyer: returns exactly 1 conversation (with admin) — but only if
 * they've sent at least one message. If they've never messaged, the array
 * is empty (FE can render an empty state and offer a "Start chat" CTA).
 *
 * For an admin: returns one entry per buyer who has chatted.
 */
export const listConversations = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const me = currentUser(req);
    const isUserAdmin = isAdmin(me);

    // Aggregate: group messages by conversationId where I'm a participant,
    // count unread, get last message.
    // We need lastMessage + unread per conversationId.
    // Two-stage approach: find latest message per conv, then count unread.

    const conversationsMap = new Map<string, ConversationDto>();

    if (isUserAdmin) {
      // Admin: list every conversation they're in
      const recent = await Message.aggregate([
        { $match: { participants: me.id } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: "$conversationId",
            lastMessage: { $first: "$$ROOT" },
          },
        },
        { $sort: { "lastMessage.createdAt": -1 } },
      ]);

      // Fetch unread counts in one query (per conversation)
      const convIds = recent.map((r: { _id: string }) => r._id);
      const unreadAgg = await Message.aggregate([
        {
          $match: {
            conversationId: { $in: convIds },
            isRead: false,
            senderId: { $ne: me.id },
          },
        },
        { $group: { _id: "$conversationId", n: { $sum: 1 } } },
      ]);
      const unreadMap = new Map<string, number>(
        unreadAgg.map((u: { _id: string; n: number }) => [u._id, u.n])
      );

      // Fetch peer (buyer) info — bulk read from User collection
      const peerIds = recent
        .map((r: { lastMessage: { participants: string[] } }) => {
          const parts = r.lastMessage.participants ?? [];
          return parts.find((p) => p !== me.id) ?? "";
        })
        .filter((id: string) => id && Types.ObjectId.isValid(id));
      const peerDocs = await User.find({ _id: { $in: peerIds } })
        .select("_id name email avatarUrl")
        .lean();
      const peerMap = new Map<string, { _id: string; name?: string; email?: string; avatarUrl?: string }>();
      for (const p of peerDocs) {
        peerMap.set(String(p._id), {
          _id: String(p._id),
          name: p.name,
          email: p.email,
          avatarUrl: p.avatarUrl,
        });
      }

      for (const r of recent as Array<{
        _id: string;
        lastMessage: {
          content: string;
          createdAt: Date;
          senderId: string;
          role: string;
          participants: string[];
        };
      }>) {
        const parts = r.lastMessage.participants ?? [];
        const peerId = parts.find((p) => p !== me.id) ?? "";
        const peer = peerId ? peerMap.get(peerId) : null;
        conversationsMap.set(r._id, {
          conversationId: r._id,
          peerId,
          peerName: peer?.name ?? peer?.email?.split("@")[0] ?? `User ${peerId.slice(-4)}`,
          peerAvatar: peer?.avatarUrl,
          lastMessage: {
            content: r.lastMessage.content,
            sentAt:
              r.lastMessage.createdAt instanceof Date
                ? r.lastMessage.createdAt.toISOString()
                : new Date(r.lastMessage.createdAt).toISOString(),
            senderId: r.lastMessage.senderId,
            role:
              r.lastMessage.role === "admin"
                ? "admin"
                : r.lastMessage.role === "system"
                  ? "system"
                  : "buyer",
          },
          unread: unreadMap.get(r._id) ?? 0,
          updatedAt:
            r.lastMessage.createdAt instanceof Date
              ? r.lastMessage.createdAt.toISOString()
              : new Date(r.lastMessage.createdAt).toISOString(),
        });
      }
    } else {
      // Buyer: derive their conversation with admin from ANY message they sent
      // or received. This works even before they send a first message.
      // We MUST use the admin's real ObjectId, not the literal "admin",
      // otherwise participants won't include the admin user's _id and the
      // admin's socket auto-join will find 0 conversations.
      const adminId = await getAdminTeamId();
      const sorted = [me.id, adminId].sort();
      const buyerConvId = `c_${sorted[0]}__${sorted[1]}`;

      const last = await Message.findOne({ conversationId: buyerConvId })
        .sort({ createdAt: -1 })
        .lean() as { content: string; createdAt: Date | string; senderId: string; role: string } | null;
      if (last) {
        const unread = await Message.countDocuments({
          conversationId: buyerConvId,
          isRead: false,
          senderId: { $ne: me.id },
        });
        const createdAtStr =
          last.createdAt instanceof Date
            ? last.createdAt.toISOString()
            : new Date(last.createdAt).toISOString();
        conversationsMap.set(buyerConvId, {
          conversationId: buyerConvId,
          peerId: ADMIN_TEAM_ID,
          peerName: "Hỗ trợ khách hàng",
          lastMessage: {
            content: last.content,
            sentAt: createdAtStr,
            senderId: last.senderId,
            role:
              last.role === "admin"
                ? "admin"
                : last.role === "system"
                  ? "system"
                  : "buyer",
          },
          unread,
          updatedAt: createdAtStr,
        });
      }
      // If no messages yet, the buyer has no conversation — FE should show
      // an empty state and a "Start chat" button that opens a draft view.
    }

    ok(res, { conversations: Array.from(conversationsMap.values()) });
  } catch (err) {
    handleInternalError(res, err, "[chat] listConversations error");
  }
};

// ── GET /api/chat/conversations/:peerId/messages ──────────────────────────────
export const getMessages = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const me = currentUser(req);
    const peerId = (req.params.peerId ?? "").toString();
    if (!peerId) {
      sendError(res, ErrorCode.MISSING_FIELD, "peerId là bắt buộc");
      return;
    }

    let conversationId: string;
    try {
      conversationId = await resolveConversationBetweenAsync(
        { id: me.id, isAdmin: isAdmin(me) },
        peerId
      );
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if (code === "INVALID_PEER") {
        sendError(res, ErrorCode.INVALID_INPUT, "peerId không hợp lệ");
        return;
      }
      if (code === "FORBIDDEN_PEER") {
        sendError(res, ErrorCode.FORBIDDEN, "Bạn chỉ có thể chat với admin");
        return;
      }
      throw e;
    }

    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.limit ?? PAGE_SIZE), 10) || PAGE_SIZE)
    );
    const before = (req.query.before as string) ?? "";
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = { conversationId };
    if (before) {
      try {
        filter._id = { $lt: new Types.ObjectId(before) };
      } catch {
        // invalid ObjectId — ignore
      }
    }

    const [messages, total] = await Promise.all([
      Message.find(filter)
        .sort({ createdAt: -1 })
        .skip(before ? 0 : skip)
        .limit(limit)
        .lean(),
      before
        ? Promise.resolve(null)
        : Message.countDocuments({ conversationId }),
    ]);

    // Best-effort: mark unread messages from peer as read
    const unreadIds = messages
      .filter((m) => !m.isRead && m.senderId !== me.id)
      .map((m) => m._id);
    if (unreadIds.length > 0) {
      Message.updateMany(
        { _id: { $in: unreadIds } },
        { isRead: true, readAt: new Date(), readBy: me.id }
      ).catch(() => {});
    }

    const dtos = messages.reverse().map((m) => messageToDto(m, me.id));

    ok(res, {
      messages: dtos,
      total: typeof total === "number" ? total : messages.length,
      hasMore: messages.length === limit,
      conversationId,
      peerId,
    });
  } catch (err) {
    handleInternalError(res, err, "[chat] getMessages error");
  }
};

// ── POST /api/chat/conversations/:peerId/messages ────────────────────────────
export const sendMessage = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const me = currentUser(req);
    const peerId = (req.params.peerId ?? "").toString();
    if (!peerId) {
      sendError(res, ErrorCode.MISSING_FIELD, "peerId là bắt buộc");
      return;
    }

    let conversationId: string;
    try {
      conversationId = await resolveConversationBetweenAsync(
        { id: me.id, isAdmin: isAdmin(me) },
        peerId
      );
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if (code === "INVALID_PEER") {
        sendError(res, ErrorCode.INVALID_INPUT, "peerId không hợp lệ");
        return;
      }
      if (code === "FORBIDDEN_PEER") {
        sendError(res, ErrorCode.FORBIDDEN, "Bạn chỉ có thể chat với admin");
        return;
      }
      throw e;
    }

    const { content } = req.body as { content?: string };
    if (!content || !content.toString().trim()) {
      sendError(res, ErrorCode.INVALID_INPUT, "Tin nhắn không được để trống");
      return;
    }
    const trimmed = content.toString().trim();
    if (trimmed.length > 2000) {
      sendError(res, ErrorCode.INVALID_INPUT, "Tin nhắn tối đa 2000 ký tự");
      return;
    }

    const role: "user" | "admin" | "system" = isAdmin(me) ? "admin" : "user";
    const senderName =
      me.name ?? me.email?.split("@")[0] ?? `User ${me.id.slice(-4)}`;
    const parts = parseConversationId(conversationId);
    if (!parts) {
      sendError(res, ErrorCode.INTERNAL_ERROR, "conversationId không hợp lệ");
      return;
    }

    // Admin path: use shared helper
    if (role === "admin") {
      const peerUserId = getOtherParticipant(conversationId, me.id) ?? "";
      await broadcastMessageFromRest(
        me.id,
        senderName,
        trimmed,
        "admin",
        conversationId,
        parts,
        peerUserId
      );
      const saved = await Message.findOne({ conversationId })
        .sort({ createdAt: -1 })
        .lean();
      const dto = saved ? messageToDto(saved, me.id) : null;
      created(res, { message: dto, conversationId });
      return;
    }

    // Buyer path
    const saved = await Message.create({
      conversationId,
      participants: [parts.a, parts.b],
      role: "user",
      senderId: me.id,
      senderName,
      content: trimmed,
      isRead: false,
    });

    try {
      const { getIO } = await import("../services/socket");
      const io = getIO();
      const dto = messageToDto(saved, me.id);
      io.to(conversationId).emit("chat:message", dto);
    } catch {
      // socket not up — REST still succeeded
    }
    created(res, { message: messageToDto(saved, me.id), conversationId });
  } catch (err) {
    handleInternalError(res, err, "[chat] sendMessage error");
  }
};

// ── GET /api/chat/conversations/:peerId/unread ───────────────────────────────
export const getUnreadForPeer = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const me = currentUser(req);
    const peerId = (req.params.peerId ?? "").toString();
    if (!peerId) {
      sendError(res, ErrorCode.MISSING_FIELD, "peerId là bắt buộc");
      return;
    }
    let conversationId: string;
    try {
      conversationId = await resolveConversationBetweenAsync(
        { id: me.id, isAdmin: isAdmin(me) },
        peerId
      );
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if (code === "INVALID_PEER") {
        sendError(res, ErrorCode.INVALID_INPUT, "peerId không hợp lệ");
        return;
      }
      if (code === "FORBIDDEN_PEER") {
        sendError(res, ErrorCode.FORBIDDEN, "Bạn chỉ có thể chat với admin");
        return;
      }
      throw e;
    }
    const unread = await Message.countDocuments({
      conversationId,
      isRead: false,
      senderId: { $ne: me.id },
    });
    ok(res, { unread, conversationId });
  } catch (err) {
    handleInternalError(res, err, "[chat] getUnreadForPeer error");
  }
};

// ── POST /api/chat/conversations/:peerId/markRead ────────────────────────────
export const markRead = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const me = currentUser(req);
    const peerId = (req.params.peerId ?? "").toString();
    if (!peerId) {
      sendError(res, ErrorCode.MISSING_FIELD, "peerId là bắt buộc");
      return;
    }
    let conversationId: string;
    try {
      conversationId = await resolveConversationBetweenAsync(
        { id: me.id, isAdmin: isAdmin(me) },
        peerId
      );
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if (code === "INVALID_PEER") {
        sendError(res, ErrorCode.INVALID_INPUT, "peerId không hợp lệ");
        return;
      }
      if (code === "FORBIDDEN_PEER") {
        sendError(res, ErrorCode.FORBIDDEN, "Bạn chỉ có thể chat với admin");
        return;
      }
      throw e;
    }
    const { lastMessageId } = req.body as { lastMessageId?: string };
    const filter: Record<string, unknown> = {
      conversationId,
      isRead: false,
      senderId: { $ne: me.id },
    };
    if (lastMessageId) {
      try {
        filter._id = { $lte: new Types.ObjectId(lastMessageId) };
      } catch {
        // ignore
      }
    }
    await Message.updateMany(filter, {
      isRead: true,
      readAt: new Date(),
      readBy: me.id,
    });
    ok(res, { success: true, conversationId });
  } catch (err) {
    handleInternalError(res, err, "[chat] markRead error");
  }
};

// ── GET /api/chat/unread — total across all my conversations ──────────────────
export const getUnreadCount = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const me = currentUser(req);
    const isUserAdmin = isAdmin(me);
    // Build the buyer-side conversationId from the resolved admin ObjectId
    // (not the legacy literal "admin") so it matches what was stored on
    // incoming messages.
    const unread = await Message.countDocuments({
      isRead: false,
      senderId: { $ne: me.id },
      // Only count messages in conversations I'm a participant of.
      // For buyers, this is the admin conv (or no conv if never chatted).
      // For admins, this is any conv where I'm a participant.
      ...(isUserAdmin
        ? { participants: me.id }
        : {
            conversationId: `c_${[me.id, await getAdminTeamId()].sort().join("__")}`,
          }),
    });
    ok(res, { unread });
  } catch (err) {
    handleInternalError(res, err, "[chat] getUnreadCount error");
  }
};
