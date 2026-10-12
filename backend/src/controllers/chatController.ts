/**
 * chatController.ts — REST API for chat
 *
 * Endpoints:
 *   GET  /api/chat/messages          — paginated history (latest 50 by default)
 *   POST /api/chat/messages          — send message (REST fallback, socket preferred)
 *   GET  /api/chat/unread            — unread count for current user
 *   POST /api/chat/markRead          — mark messages as read
 */

import { Request, Response } from "express";
import { Types } from "mongoose";
import { Message } from "../models/Message";
import { messageToDto } from "../dto/chat";
import { ok, created } from "../utils/respond";
import { handleInternalError } from "../utils/errors";
import { broadcastMessageFromRest } from "../services/socket";

const GLOBAL_CONVERSATION = "global";
const PAGE_SIZE = 50;

// ── GET /api/chat/messages ───────────────────────────────────────────────────
export const getMessages = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.limit ?? PAGE_SIZE), 10) || PAGE_SIZE)
    );
    // before = cursor: get messages BEFORE this messageId (for infinite scroll / "load more")
    const before = (req.query.before as string) ?? "";

    const filter: Record<string, unknown> = {
      conversationId: GLOBAL_CONVERSATION,
    };
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
        .limit(limit)
        .lean(),
      before
        ? Promise.resolve(null)
        : Message.countDocuments({ conversationId: GLOBAL_CONVERSATION }),
    ]);

    // Best-effort: mark unread messages from others as read
    const unreadIds = messages
      .filter((m) => !m.isRead && m.senderId !== userId)
      .map((m) => m._id);
    if (unreadIds.length > 0) {
      Message.updateMany(
        { _id: { $in: unreadIds } },
        { isRead: true, readAt: new Date(), readBy: userId }
      ).catch(() => {});
    }

    // Reverse to oldest→newest for FE display
    const dtos = messages
      .reverse()
      .map((m) => messageToDto(m, userId));

    created(res, {
      messages: dtos,
      total: typeof total === "number" ? total : messages.length,
      hasMore: messages.length === limit,
    });
  } catch (err) {
    handleInternalError(res, err, "[chat] getMessages error");
  }
};

// ── POST /api/chat/messages ───────────────────────────────────────────────────
// REST fallback: used when socket is unavailable (e.g. reconnecting).
// Prefer socket emit for real-time — this endpoint just ensures the message
// is persisted and broadcast to all connected clients.
export const sendMessage = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const isAdmin = req.user?.roles?.includes("admin") ?? false;
    const { content } = req.body as { content?: string };

    if (!content || !content.toString().trim()) {
      res.status(400).json({ error: "Tin nhắn không được để trống" });
      return;
    }

    const trimmed = content.toString().trim();
    if (trimmed.length > 2000) {
      res.status(400).json({ error: "Tin nhắn tối đa 2000 ký tự" });
      return;
    }

    const role: "user" | "admin" | "system" = isAdmin ? "admin" : "user";
    const senderName =
      (req.user as { name?: string }).name ??
      (req.user as { email?: string }).email?.split("@")[0] ??
      `User ${userId.slice(-4)}`;

    // For buyers, save directly and broadcast via socket. For admin,
    // use the shared helper (which also updates admin notifications / unread).
    if (role === "admin") {
      await broadcastMessageFromRest(userId, senderName, trimmed, "admin");
      const saved = await Message.findOne({
        conversationId: GLOBAL_CONVERSATION,
        senderId: userId,
      })
        .sort({ createdAt: -1 })
        .lean();
      const dto = saved ? messageToDto(saved, userId) : null;
      created(res, { message: dto });
      return;
    }

    // Buyer path: persist then broadcast (if socket server is up)
    const saved = await Message.create({
      conversationId: GLOBAL_CONVERSATION,
      role: "user",
      senderId: userId,
      senderName,
      content: trimmed,
      isRead: false,
    });
    try {
      const { getIO } = await import("../services/socket");
      const io = getIO();
      const dto = messageToDto(saved, userId);
      io.to("global").emit("chat:message", dto);
    } catch {
      // socket not initialized (e.g. during unit tests) — REST still succeeded
    }
    created(res, { message: messageToDto(saved, userId) });
  } catch (err) {
    handleInternalError(res, err, "[chat] sendMessage error");
  }
};

// ── GET /api/chat/unread ──────────────────────────────────────────────────────
export const getUnreadCount = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const unread = await Message.countDocuments({
      conversationId: GLOBAL_CONVERSATION,
      isRead: false,
      senderId: { $ne: userId },
    });
    ok(res, { unread });
  } catch (err) {
    handleInternalError(res, err, "[chat] getUnreadCount error");
  }
};

// ── POST /api/chat/markRead ───────────────────────────────────────────────────
export const markRead = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { lastMessageId } = req.body as { lastMessageId?: string };

    const filter: Record<string, unknown> = {
      conversationId: GLOBAL_CONVERSATION,
      isRead: false,
      senderId: { $ne: userId },
    };
    if (lastMessageId) {
      try {
        filter._id = { $lte: new Types.ObjectId(lastMessageId) };
      } catch {
        // invalid ObjectId — ignore
      }
    }

    await Message.updateMany(filter, {
      isRead: true,
      readAt: new Date(),
      readBy: userId,
    });

    ok(res, { success: true });
  } catch (err) {
    handleInternalError(res, err, "[chat] markRead error");
  }
};
