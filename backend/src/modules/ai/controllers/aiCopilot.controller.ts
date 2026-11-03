/**
 * aiCopilot.controller.ts — REST API cho AI Copilot (TDD §6.4).
 *
 * Route prefix: /api/chat/admin/copilot
 *
 * Tất cả endpoint yêu cầu đăng nhập + role admin (guard ở routes).
 * Kết quả Copilot KHÔNG BAO GIỜ hiện với user.
 */

import { Request, Response } from "express";
import { ah } from "../../../utils/asyncRoute";
import { ok, created } from "../../../utils/respond";
import { sendError } from "../../../utils/errors";
import {
  ChatError,
  type ChatActor,
} from "../../chat/services/chatPermission.service";
import * as copilot from "../../ai/services/ai-copilot.service";

// ── Helpers ───────────────────────────────────────────────────────────────────

function actorOf(req: Request): ChatActor {
  return { userId: req.user!.id, roles: req.user!.roles ?? [] };
}

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

// ── Endpoints ─────────────────────────────────────────────────────────────────

/**
 * GET /api/chat/admin/copilot/conversations/:id/summary
 * Tóm tắt hội thoại cho admin.
 */
export const getSummary = ah(async (req, res) => {
  try {
    const summary = await copilot.generateConversationSummary(
      param(req, "id"),
      actorOf(req)
    );
    ok(res, { summary });
  } catch (err) {
    handleServiceError(res, err);
  }
});

/**
 * POST /api/chat/admin/copilot/conversations/:id/suggest-reply
 * Body: { instruction? } — chỉ dẫn bổ sung cho AI (VD: "hỏi về size").
 */
export const suggestReply = ah(async (req, res) => {
  const body = req.body ?? {};

  try {
    const result = await copilot.generateSuggestedReply(
      param(req, "id"),
      actorOf(req),
      { instruction: body.instruction ? String(body.instruction) : undefined }
    );
    ok(res, { suggestion: result });
  } catch (err) {
    handleServiceError(res, err);
  }
});

/**
 * GET /api/chat/admin/copilot/policies?query=&category=&limit=
 * Tra chính sách (admin-only).
 */
export const searchPolicies = ah(async (req, res) => {
  try {
    const results = await copilot.searchPolicyForAdmin(actorOf(req), {
      query: String(req.query.query ?? ""),
      category: req.query.category ? String(req.query.category) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    ok(res, { results, count: results.length });
  } catch (err) {
    handleServiceError(res, err);
  }
});

/**
 * POST /api/chat/admin/copilot/conversations/:id/note
 * Body: { note? } — có `note` ⇒ lưu nguyên văn; không có ⇒ AI tóm tắt.
 */
export const createNote = ah(async (req, res) => {
  const body = req.body ?? {};

  try {
    const note = await copilot.generateInternalNote(param(req, "id"), actorOf(req), {
      note: body.note ? String(body.note) : undefined,
    });
    created(res, { note });
  } catch (err) {
    handleServiceError(res, err);
  }
});

/**
 * GET /api/chat/admin/copilot/conversations/:id/context
 * Context handoff + sentiment + intent (không tốn token).
 */
export const getContext = ah(async (req, res) => {
  try {
    const context = await copilot.getHandoffContext(param(req, "id"), actorOf(req));
    ok(res, { context });
  } catch (err) {
    handleServiceError(res, err);
  }
});
