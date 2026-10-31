import { Request, Response } from "express";
import { Types } from "mongoose";
import { Conversation, ChatStatus, CHAT_STATUSES } from "../../../models/Conversation";
import { Message } from "../../../models/Message";
import { User } from "../../../models/User";
import { getChatActor } from "./chatController";
import { listConversationsForUser } from "../services/conversationService";
import { countUnreadBatch } from "../services/messageService";
import { conversationToDto } from "../dto/chat";
import { broadcastNewMessage, broadcastStatusChange } from "../socket/chatSocket";
import { sendError, ErrorCode, handleInternalError } from "../../../utils/errors";
import { ok } from "../../../utils/respond";
import { isChatError, sendChatError, chatErrors } from "../services/chatErrors";

/**
 * GET /api/chat/admin/conversations
 * Query: ?channel=&status=&page=&limit=
 */
export async function listAdminConversations(req: Request, res: Response): Promise<void> {
  try {
    const actor = getChatActor(req);
    const { channel, status, page, limit } = req.query;

    const result = await listConversationsForUser(actor, {
      channel: channel as any,
      status: status as string,
      page: parseInt(page as string, 10) || 1,
      limit: parseInt(limit as string, 10) || 20,
    });

    const unreadMap = await countUnreadBatch(result.conversations, {
      keys: actor.userId ? [actor.userId] : [],
      isAdmin: true,
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
    handleInternalError(res, err, "listAdminConversations");
  }
}

/**
 * PUT /api/chat/admin/conversations/:id/status
 * Body: { status }
 */
export async function updateAdminConversationStatus(req: Request, res: Response): Promise<void> {
  try {
    const actor = getChatActor(req);
    const id = String(req.params.id || "");
    const { status } = req.body as { status: ChatStatus };

    if (!Types.ObjectId.isValid(id)) {
      throw chatErrors.invalidId();
    }

    if (!CHAT_STATUSES.includes(status)) {
      throw chatErrors.statusInvalid();
    }

    const conv = await Conversation.findById(id).populate("assignedAdminId", "name email avatarUrl");
    if (!conv) {
      throw chatErrors.notFound();
    }

    const prevStatus = conv.status;
    conv.status = status;

    let systemNote = "";
    if (status === "ADMIN_ACTIVE") {
      conv.assignedAdminId = new Types.ObjectId(actor.userId!);
      const admin = await User.findById(actor.userId!).select("name").lean();
      const adminName = admin?.name || "Tư vấn viên";
      systemNote = `${adminName} đã tiếp nhận cuộc trò chuyện.`;

      // Đảm bảo admin có mặt trong participants[]
      const existingPart = conv.participants.find((p) => p.userId === actor.userId);
      if (!existingPart && actor.userId) {
        conv.participants.push({
          userId: actor.userId,
          role: "admin",
          lastReadAt: new Date(),
        });
      }
    } else if (status === "RESOLVED") {
      systemNote = "Cuộc trò chuyện đã được kết thúc bởi tư vấn viên.";
    } else if (status === "BOT_ACTIVE") {
      systemNote = "Cuộc trò chuyện đã được chuyển lại cho Trợ lý AI.";
    }

    await conv.save();

    let sysMsg: any = null;
    if (systemNote) {
      sysMsg = await Message.create({
        conversationId: conv._id,
        sender: {
          type: "SYSTEM",
          name: "Hệ thống",
        },
        content: systemNote,
        metadata: { action: `STATUS_CHANGE_TO_${status}`, prevStatus },
      });

      await broadcastNewMessage(conv._id, sysMsg, conv);
    }

    broadcastStatusChange(
      conv._id,
      conv.status,
      conv.assignedAdminId
        ? {
            id: String((conv.assignedAdminId as any)._id || conv.assignedAdminId),
            name: (conv.assignedAdminId as any).name || "Admin",
          }
        : null
    );

    ok(res, {
      success: true,
      conversation: conversationToDto(conv, 0, actor.userId),
    });
  } catch (err: any) {
    if (isChatError(err)) {
      sendChatError(res, err);
      return;
    }
    handleInternalError(res, err, "updateAdminConversationStatus");
  }
}

/**
 * POST /api/chat/admin/conversations/:id/assign
 * Admin tự nhận việc -> status=ADMIN_ACTIVE, assignedAdminId = currentAdmin
 */
export async function assignAdminConversation(req: Request, res: Response): Promise<void> {
  try {
    const actor = getChatActor(req);
    const id = String(req.params.id || "");

    if (!Types.ObjectId.isValid(id)) {
      throw chatErrors.invalidId();
    }

    const conv = await Conversation.findById(id).populate("assignedAdminId", "name email avatarUrl");
    if (!conv) {
      throw chatErrors.notFound();
    }

    const prevStatus = conv.status;
    conv.status = "ADMIN_ACTIVE";
    conv.assignedAdminId = new Types.ObjectId(actor.userId!);

    // Đảm bảo admin có mặt trong participants[]
    const existingPart = conv.participants.find((p) => p.userId === actor.userId);
    if (!existingPart && actor.userId) {
      conv.participants.push({
        userId: actor.userId,
        role: "admin",
        lastReadAt: new Date(),
      });
    }

    await conv.save();

    const admin = await User.findById(actor.userId!).select("name").lean();
    const adminName = admin?.name || "Tư vấn viên";

    const sysMsg = await Message.create({
      conversationId: conv._id,
      sender: {
        type: "SYSTEM",
        name: "Hệ thống",
      },
      content: `${adminName} đã tiếp nhận cuộc trò chuyện.`,
      metadata: { action: "ADMIN_ASSIGNED", prevStatus, adminName },
    });

    await broadcastNewMessage(conv._id, sysMsg, conv);
    broadcastStatusChange(conv._id, "ADMIN_ACTIVE", {
      id: String(conv.assignedAdminId),
      name: adminName,
    });

    ok(res, {
      success: true,
      conversation: conversationToDto(conv, 0, actor.userId),
    });
  } catch (err: any) {
    if (isChatError(err)) {
      sendChatError(res, err);
      return;
    }
    handleInternalError(res, err, "assignAdminConversation");
  }
}
