/**
 * chatController.ts — REST API for chat (1-1 model)
 *
 * Endpoints (1-1 buyer ↔ admin):
 *   GET  /api/chat/conversations                 — list my conversations
 *   GET  /api/chat/conversations/:peerId/messages — history with a specific peer
 *   POST /api/chat/conversations/:peerId/messages — send (REST fallback)
 *   GET  /api/chat/conversations/:peerId/unread   — unread count in this conv
 *   POST /api/chat/conversations/:peerId/markRead — mark as read in this conv
 *   GET  /api/chat/unread                          — total unread across all convs
 *
 * Back-compat (returns 404 now — old plan endpoint removed):
 *   GET  /api/chat/messages
 *   POST /api/chat/messages
 *   POST /api/chat/markRead
 */

import { Request, Response } from "express";
import { Types } from "mongoose";
import { Message } from "../models/Message";
import { messageToDto, ConversationDto } from "../dto/chat";
import { ok, created } from "../utils/respond";
import { sendError, ErrorCode, handleInternalError } from "../utils/errors";
import { broadcastMessageFromRest } from "../services/socket";
import {
  resolveConversationBetween,
  isAdminPeer,
  parseConversationId,
  ADMIN_TEAM_ID,
  getOtherParticipant,
} from "../services/conversation";
import { User } from "../models/User";

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
      const sorted = [me.id, ADMIN_TEAM_ID].sort();
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
      conversationId = resolveConversationBetween(
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
      conversationId = resolveConversationBetween(
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
      conversationId = resolveConversationBetween(
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
      conversationId = resolveConversationBetween(
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
    const unread = await Message.countDocuments({
      isRead: false,
      senderId: { $ne: me.id },
      // Only count messages in conversations I'm a participant of.
      // For buyers, this is the admin conv (or no conv if never chatted).
      // For admins, this is any conv where I'm a participant.
      ...(isAdmin(me)
        ? { participants: me.id }
        : {
            $or: [
              { conversationId: `c_${[me.id, ADMIN_TEAM_ID].sort().join("__")}` },
            ],
          }),
    });
    ok(res, { unread });
  } catch (err) {
    handleInternalError(res, err, "[chat] getUnreadCount error");
  }
};
