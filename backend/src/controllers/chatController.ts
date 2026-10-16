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
export async function sendMessage(req: Request, res: Response): Promise<void> {
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
