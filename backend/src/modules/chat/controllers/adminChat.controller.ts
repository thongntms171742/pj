/**
 * adminChat.controller.ts — REST API phía ADMIN.
 *
 * Route prefix: /api/chat/admin
 *
 * Admin quản lý toàn bộ hội thoại: xem danh sách, claim, trả lời,
 * đọc tin nhắn nội bộ, đóng/mở, quản lý handoff queue.
 */

import { Request, Response } from "express";
import { ah } from "../../../utils/asyncRoute";
import { ok } from "../../../utils/respond";
import { sendError } from "../../../utils/errors";
import { Types } from "mongoose";
import {
  CHAT_PAGE_SIZE_DEFAULT,
  CHAT_PAGE_SIZE_MAX,
} from "../../../config/chat.config";
import {
  ChatError,
  type ChatActor,
} from "../services/chatPermission.service";
import * as conversationService from "../services/conversation.service";
import * as messageService from "../services/message.service";
import * as handoffService from "../services/handoff.service";
import {
  conversationToDto,
  conversationToListItemDto,
  messageToDto,
  handoffToDto,
} from "../dto/chat.mapper";
import type { PaginationMeta } from "../dto/chat.dto";

// ── Helpers ───────────────────────────────────────────────────────────────────

function actorOf(req: Request): ChatActor {
  return { userId: req.user!.id, roles: req.user!.roles ?? [] };
}

/**
 * Lấy route param dạng string.
 * Express 5 typings coi `req.params.x` là `string | string[]` — ép về string.
 */
function param(req: Request, name: string): string {
  const value = (req.params as Record<string, string | string[] | undefined>)[name];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function handleServiceError(res: Response, err: unknown): void {
  if (err instanceof ChatError) {
    sendError(res, err.code as any, err.message, err.status, err.details);
    return;
  }
  throw err;
}

function parsePage(req: Request): { page: number; limit: number } {
  const page = Number.parseInt(String(req.query.page ?? "1"), 10);
  const limit = Number.parseInt(String(req.query.limit ?? ""), 10);
  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    limit:
      Number.isFinite(limit) && limit > 0
        ? Math.min(limit, CHAT_PAGE_SIZE_MAX)
        : CHAT_PAGE_SIZE_DEFAULT,
  };
}

function buildPagination(page: number, limit: number, total: number): PaginationMeta {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

// ── Conversations ─────────────────────────────────────────────────────────────

/**
 * GET /api/chat/admin/conversations
 * Query: scope=unassigned|mine|all, status, supportMode, page, limit
 */
export const listConversations = ah(async (req, res) => {
  const { page, limit } = parsePage(req);
  const scope = String(req.query.scope ?? "all");
  const supportMode = String(req.query.supportMode ?? "all");

  try {
    const result = await conversationService.listAdminConversations(actorOf(req), {
      page,
      limit,
      scope: scope as any,
      supportMode: supportMode as any,
    });

    // Tên admin được lookup riêng — không populate (populate trả null khi
    // user đã bị xoá ⇒ mất luôn ObjectId gốc của assignedAdminId).
    const adminNames = await conversationService.loadAdminNames(
      result.items.map((c) => c.assignedAdminId as any)
    );

    ok(res, {
      items: result.items.map((c) => {
        const conv = c as any;
        const item = conversationToListItemDto(c, conv.userId);
        const adminId = conversationService.rawAssignedAdminId(c);
        item.assignedAdminName = adminId
          ? adminNames.get(String(adminId)) ?? null
          : null;
        return item;
      }),
      pagination: buildPagination(result.page, result.limit, result.total),
    });
  } catch (err) {
    handleServiceError(res, err);
  }
});

/** GET /api/chat/admin/conversations/:id — chi tiết (kèm tên admin). */
export const getConversation = ah(async (req, res) => {
  try {
    const conversation = await conversationService.getConversation(
      param(req, "id"),
      actorOf(req)
    );

    // Populate tên admin để FE hiển thị "Tư vấn viên: <name>".
    let adminName: string | null = null;
    const adminId = conversationService.rawAssignedAdminId(conversation);
    if (adminId) {
      const adminNames = await conversationService.loadAdminNames([adminId]);
      adminName = adminNames.get(String(adminId)) ?? null;
    }

    ok(res, {
      conversation: conversationToDto(
        conversation,
        { admin: adminName ? { name: adminName } : null }
      ),
    });
  } catch (err) {
    handleServiceError(res, err);
  }
});

/**
 * POST /api/chat/admin/conversations/:id/assign
 * Admin nhận hội thoại. Body: { expectedVersion? }
 */
export const assignConversation = ah(async (req, res) => {
  const body = req.body ?? {};

  try {
    const conversation = await conversationService.transitionConversation(
      param(req, "id"),
      actorOf(req),
      {
        supportMode: "human",
        assignedAdminId: new Types.ObjectId(req.user!.id),
        expectedVersion:
          typeof body.expectedVersion === "number" ? body.expectedVersion : undefined,
      }
    );

    ok(res, { conversation: conversationToDto(conversation) });
  } catch (err) {
    handleServiceError(res, err);
  }
});

/**
 * POST /api/chat/admin/conversations/:id/accept
 * Admin nhận handoff (assigned → accepted) + conversation sang mode human.
 */
export const acceptHandoff = ah(async (req, res) => {
  const body = req.body ?? {};

  try {
    const handoff = await handoffService.acceptHandoff(param(req, "id"), actorOf(req), {
      expectedVersion:
        typeof body.expectedVersion === "number" ? body.expectedVersion : undefined,
    });
    const conversation = await conversationService.getConversation(
      param(req, "id"),
      actorOf(req)
    );

    ok(res, {
      handoff: handoffToDto(handoff),
      conversation: conversationToDto(conversation),
    });
  } catch (err) {
    handleServiceError(res, err);
  }
});

/** POST /api/chat/admin/conversations/:id/close — admin đóng hội thoại. */
export const closeConversation = ah(async (req, res) => {
  try {
    const conversation = await conversationService.transitionConversation(
      param(req, "id"),
      actorOf(req),
      { status: "closed", closedBy: new Types.ObjectId(req.user!.id) }
    );
    ok(res, { conversation: conversationToDto(conversation) });
  } catch (err) {
    handleServiceError(res, err);
  }
});

/** POST /api/chat/admin/conversations/:id/reopen — admin mở lại. */
export const reopenConversation = ah(async (req, res) => {
  try {
    const conversation = await conversationService.transitionConversation(
      param(req, "id"),
      actorOf(req),
      { status: "open", supportMode: "ai" }
    );
    ok(res, { conversation: conversationToDto(conversation) });
  } catch (err) {
    handleServiceError(res, err);
  }
});

/** GET /api/chat/admin/unread-count — tổng unread trong hàng đợi. */
export const getUnreadCount = ah(async (req, res) => {
  try {
    const total = await conversationService.totalUnreadForAdmin();
    ok(res, { unreadCount: total });
  } catch (err) {
    handleServiceError(res, err);
  }
});

// ── Messages ──────────────────────────────────────────────────────────────────

/** GET /api/chat/admin/conversations/:id/messages — gồm tin nhắn nội bộ. */
export const listMessages = ah(async (req, res) => {
  const limitRaw = Number.parseInt(String(req.query.limit ?? ""), 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 20;

  try {
    const result = await messageService.listMessages(param(req, "id"), actorOf(req), {
      limit,
      before: req.query.before ? String(req.query.before) : undefined,
      after: req.query.after ? String(req.query.after) : undefined,
    });

    ok(res, {
      items: result.items.map((m) => messageToDto(m)),
      pagination: {
        hasMore: result.hasMore,
        nextCursor: result.nextCursor,
      },
    });
  } catch (err) {
    handleServiceError(res, err);
  }
});

/**
 * POST /api/chat/admin/conversations/:id/messages
 * Body: { content, messageType?, attachments?, clientMessageId?, visibility? }
 */
export const sendMessage = ah(async (req, res) => {
  const body = req.body ?? {};

  try {
    const result = await messageService.sendMessage(actorOf(req), {
      conversationId: param(req, "id"),
      content: String(body.content ?? ""),
      messageType: body.messageType,
      attachments: body.attachments,
      clientMessageId: body.clientMessageId
        ? String(body.clientMessageId)
        : undefined,
      visibility: body.visibility === "internal" ? "internal" : "public",
    });

    ok(res, {
      message: messageToDto(result.message),
      acknowledged: true,
      duplicate: result.duplicate,
    });
  } catch (err) {
    handleServiceError(res, err);
  }
});

/** POST /api/chat/admin/conversations/:id/read — admin đánh dấu đã đọc. */
export const markAsRead = ah(async (req, res) => {
  try {
    const result = await messageService.markAsRead(param(req, "id"), actorOf(req));
    ok(res, { markedCount: result.markedCount });
  } catch (err) {
    handleServiceError(res, err);
  }
});

// ── Handoff queue ─────────────────────────────────────────────────────────────

/** GET /api/chat/admin/handoffs — hàng đợi yêu cầu chuyển nhân viên. */
export const listHandoffs = ah(async (req, res) => {
  const { page, limit } = parsePage(req);
  const status = String(req.query.status ?? "all");

  try {
    const result = await handoffService.listHandoffs(actorOf(req), {
      page,
      limit,
      status: status as any,
    });

    ok(res, {
      items: result.items.map((h) => handoffToDto(h)),
      pagination: buildPagination(result.page, result.limit, result.total),
    });
  } catch (err) {
    handleServiceError(res, err);
  }
});

/** POST /api/chat/admin/conversations/:id/handoff/assign — claim handoff. */
export const assignHandoff = ah(async (req, res) => {
  const body = req.body ?? {};

  try {
    const handoff = await handoffService.assignHandoff(param(req, "id"), actorOf(req), {
      expectedVersion:
        typeof body.expectedVersion === "number" ? body.expectedVersion : undefined,
    });
    ok(res, { handoff: handoffToDto(handoff) });
  } catch (err) {
    handleServiceError(res, err);
  }
});

/** POST /api/chat/admin/conversations/:id/handoff/resolve — kết thúc handoff. */
export const resolveHandoff = ah(async (req, res) => {
  const body = req.body ?? {};

  try {
    const handoff = await handoffService.resolveHandoff(param(req, "id"), actorOf(req), {
      expectedVersion:
        typeof body.expectedVersion === "number" ? body.expectedVersion : undefined,
      returnToAi: body.returnToAi !== false,
    });
    const conversation = await conversationService.getConversation(
      param(req, "id"),
      actorOf(req)
    );

    ok(res, {
      handoff: handoffToDto(handoff),
      conversation: conversationToDto(conversation),
    });
  } catch (err) {
    handleServiceError(res, err);
  }
});
