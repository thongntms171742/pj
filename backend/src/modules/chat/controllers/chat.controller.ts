/**
 * chat.controller.ts — REST API phía USER.
 *
 * Route prefix: /api/chat
 *
 * Nguyên tắc:
 *   - Controller KHÔNG chứa business logic — chỉ parse input, gọi service,
 *     map lỗi sang HTTP response.
 *   - Mọi lỗi nghiệp vụ từ service là `ChatError` (có code + status).
 */

import { Request, Response } from "express";
import { ah } from "../../../utils/asyncRoute";
import { ok, created, noContent } from "../../../utils/respond";
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
  messageToDto,
  handoffToDto,
} from "../dto/chat.mapper";
import type { PaginationMeta } from "../dto/chat.dto";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Lấy actor từ req.user (requireAuth đã đảm bảo có). */
function actorOf(req: Request): ChatActor {
  return {
    userId: req.user!.id,
    roles: req.user!.roles ?? [],
  };
}

/**
 * Lấy route param dạng string.
 * Express 5 typings coi `req.params.x` là `string | string[]` — ép về string.
 */
function param(req: Request, name: string): string {
  const value = (req.params as Record<string, string | string[] | undefined>)[name];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

/** Map lỗi service → response chuẩn. */
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

/** GET /api/chat/conversations — danh sách hội thoại của user. */
export const listConversations = ah(async (req, res) => {
  const { page, limit } = parsePage(req);
  const status = String(req.query.status ?? "all");

  try {
    const result = await conversationService.listUserConversations(actorOf(req), {
      page,
      limit,
      status: status as any,
    });

    ok(res, {
      items: result.items.map((c) => conversationToDto(c)),
      pagination: buildPagination(result.page, result.limit, result.total),
    });
  } catch (err) {
    handleServiceError(res, err);
  }
});

/** POST /api/chat/conversations — tạo (hoặc lấy lại) conversation active. */
export const createConversation = ah(async (req, res) => {
  try {
    const forceNew = String(req.query.forceNew ?? "false") === "true";
    const conversation = await conversationService.createConversation(actorOf(req), {
      forceNew,
    });
    created(res, { conversation: conversationToDto(conversation) });
  } catch (err) {
    handleServiceError(res, err);
  }
});

/** GET /api/chat/conversations/:id — chi tiết 1 conversation. */
export const getConversation = ah(async (req, res) => {
  try {
    const conversation = await conversationService.getConversation(
      param(req, "id"),
      actorOf(req)
    );
    ok(res, { conversation: conversationToDto(conversation) });
  } catch (err) {
    handleServiceError(res, err);
  }
});

/** GET /api/chat/conversations/unread-count — tổng số tin chưa đọc. */
export const getUnreadCount = ah(async (req, res) => {
  try {
    const total = await conversationService.totalUnreadForUser(req.user!.id);
    ok(res, { unreadCount: total });
  } catch (err) {
    handleServiceError(res, err);
  }
});

/** POST /api/chat/conversations/:id/close — đóng conversation. */
export const closeConversation = ah(async (req, res) => {
  try {
    const conversation = await conversationService.closeConversation(
      param(req, "id"),
      actorOf(req)
    );
    ok(res, { conversation: conversationToDto(conversation) });
  } catch (err) {
    handleServiceError(res, err);
  }
});

/** POST /api/chat/conversations/:id/reopen — mở lại conversation đã đóng. */
export const reopenConversation = ah(async (req, res) => {
  try {
    const conversation = await conversationService.reopenConversation(
      param(req, "id"),
      actorOf(req)
    );
    ok(res, { conversation: conversationToDto(conversation) });
  } catch (err) {
    handleServiceError(res, err);
  }
});

// ── Messages ──────────────────────────────────────────────────────────────────

/** GET /api/chat/conversations/:id/messages — lịch sử tin nhắn. */
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

/** POST /api/chat/conversations/:id/messages — gửi tin nhắn. */
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

/** POST /api/chat/conversations/:id/read — đánh dấu đã đọc. */
export const markAsRead = ah(async (req, res) => {
  try {
    const result = await messageService.markAsRead(param(req, "id"), actorOf(req));
    ok(res, { markedCount: result.markedCount });
  } catch (err) {
    handleServiceError(res, err);
  }
});

// ── Handoff ───────────────────────────────────────────────────────────────────

/** POST /api/chat/conversations/:id/handoff — yêu cầu chuyển nhân viên. */
export const createHandoff = ah(async (req, res) => {
  const body = req.body ?? {};

  try {
    const handoff = await handoffService.createHandoff(actorOf(req), {
      conversationId: param(req, "id"),
      reason: String(body.reason ?? "Khách hàng yêu cầu tư vấn viên"),
      priority: body.priority,
      summary: body.summary ? String(body.summary) : undefined,
    });

    const conversation = await conversationService.getConversation(
      param(req, "id"),
      actorOf(req)
    );

    created(res, {
      handoff: handoffToDto(handoff),
      conversation: conversationToDto(conversation),
      resolvedByAi: false,
    });
  } catch (err) {
    handleServiceError(res, err);
  }
});

/** GET /api/chat/conversations/:id/handoff — trạng thái handoff. */
export const getHandoff = ah(async (req, res) => {
  try {
    const handoff = await handoffService.getHandoffForConversation(
      param(req, "id"),
      actorOf(req)
    );
    ok(res, { handoff: handoff ? handoffToDto(handoff) : null });
  } catch (err) {
    handleServiceError(res, err);
  }
});

/** DELETE /api/chat/conversations/:id/handoff — user huỷ yêu cầu. */
export const cancelHandoff = ah(async (req, res) => {
  try {
    const handoff = await handoffService.cancelHandoff(param(req, "id"), actorOf(req));
    ok(res, { handoff: handoffToDto(handoff) });
  } catch (err) {
    handleServiceError(res, err);
  }
});

// ── Types (export để route dùng) ─────────────────────────────────────────────

export type { PaginationMeta };
export { Types };
