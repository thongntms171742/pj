/**
 * adminChatBotController.ts — API quản trị cho Hybrid Chatbot.
 *
 * - FAQ: xem / cập nhật / tạo / xoá (mềm) — để运营 tự chỉnh kịch bản mà
 *   không cần deploy code.
 * - Analytics: tỉ lệ trúng intent, tỉ lệ AI, tỉ lệ chuyển người thật, độ trễ,
 *   điểm CSAT — ứng dụng bước 5 "Đánh giá và tối ưu".
 */

import { Request, Response } from "express";
import { Types } from "mongoose";
import { ChatFaq, FAQ_INTENTS } from "../../../models/ChatFaq";
import { getChatActor } from "./chatController";
import { invalidateFaqCache } from "../bot/faqStore";
import {
  getAnalyticsSummary,
  getAiFallbackGaps,
} from "../bot/analyticsService";
import { handleInternalError } from "../../../utils/errors";
import { ok, created } from "../../../utils/respond";

/**
 * GET /api/chat/admin/faqs
 * Query: ?intent=&isActive=&page=&limit=
 */
export async function listFaqs(req: Request, res: Response): Promise<void> {
  try {
    const { intent, isActive, page, limit } = req.query;

    const filter: any = {};
    if (intent && (FAQ_INTENTS as ReadonlyArray<string>).includes(String(intent))) {
      filter.intent = intent;
    }
    if (isActive !== undefined && isActive !== "") {
      filter.isActive = isActive === "true" || isActive === "1";
    }

    const pageNum = Math.max(1, parseInt(String(page || "1"), 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(String(limit || "50"), 10) || 50));

    const [docs, total] = await Promise.all([
      ChatFaq.find(filter)
        .sort({ priority: -1, createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      ChatFaq.countDocuments(filter),
    ]);

    ok(res, {
      faqs: docs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err: any) {
    handleInternalError(res, err, "listFaqs");
  }
}

/**
 * PUT /api/chat/admin/faqs/:id
 * Body: { question?, answer?, keywords?, synonyms?, quickReplies?, intent?,
 *         matchThreshold?, priority?, isActive? }
 */
export async function updateFaq(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id || "");
    if (!Types.ObjectId.isValid(id)) {
      res.status(400).json({
        error: { code: "INVALID_INPUT", message: "ID FAQ không hợp lệ" },
      });
      return;
    }

    const body = req.body || {};
    const update: Record<string, unknown> = {};

    if (typeof body.question === "string" && body.question.trim()) {
      update.question = body.question.trim();
    }
    if (typeof body.answer === "string" && body.answer.trim()) {
      update.answer = body.answer.trim();
    }
    if (Array.isArray(body.keywords)) {
      update.keywords = body.keywords.filter((k: unknown) => typeof k === "string");
    }
    if (Array.isArray(body.synonyms)) {
      update.synonyms = body.synonyms.filter((s: unknown) => typeof s === "string");
    }
    if (Array.isArray(body.quickReplies)) {
      update.quickReplies = body.quickReplies.filter((q: unknown) => typeof q === "string");
    }
    if (
      typeof body.intent === "string" &&
      (FAQ_INTENTS as ReadonlyArray<string>).includes(body.intent)
    ) {
      update.intent = body.intent;
    }
    if (typeof body.matchThreshold === "number" && body.matchThreshold >= 1) {
      update.matchThreshold = Math.min(5, Math.round(body.matchThreshold));
    }
    if (typeof body.priority === "number") {
      update.priority = Math.round(body.priority);
    }
    if (typeof body.isActive === "boolean") {
      update.isActive = body.isActive;
    }

    if (!Object.keys(update).length) {
      res.status(400).json({
        error: { code: "INVALID_INPUT", message: "Không có trường nào để cập nhật" },
      });
      return;
    }

    const updated = await ChatFaq.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true }
    ).lean();

    if (!updated) {
      res.status(404).json({
        error: { code: "NOT_FOUND", message: "Không tìm thấy FAQ" },
      });
      return;
    }

    invalidateFaqCache();

    ok(res, { faq: updated });
  } catch (err: any) {
    handleInternalError(res, err, "updateFaq");
  }
}

/**
 * POST /api/chat/admin/faqs
 * Body: { intent, question, answer, keywords?, synonyms?, quickReplies?, priority? }
 */
export async function createFaq(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body || {};
    const question = String(body.question || "").trim();
    const answer = String(body.answer || "").trim();

    if (!question || !answer) {
      res.status(400).json({
        error: {
          code: "MISSING_FIELD",
          message: "Cần đủ `question` và `answer` để tạo FAQ",
        },
      });
      return;
    }

    const doc = await ChatFaq.create({
      intent:
        typeof body.intent === "string" &&
        (FAQ_INTENTS as ReadonlyArray<string>).includes(body.intent)
          ? body.intent
          : "other",
      question,
      answer,
      keywords: Array.isArray(body.keywords)
        ? body.keywords.filter((k: unknown) => typeof k === "string")
        : [],
      synonyms: Array.isArray(body.synonyms)
        ? body.synonyms.filter((s: unknown) => typeof s === "string")
        : [],
      quickReplies: Array.isArray(body.quickReplies)
        ? body.quickReplies.filter((q: unknown) => typeof q === "string")
        : [],
      matchThreshold:
        typeof body.matchThreshold === "number" ? body.matchThreshold : 1,
      priority: typeof body.priority === "number" ? body.priority : 0,
      isActive: body.isActive !== false,
    });

    invalidateFaqCache();

    created(res, { faq: doc.toObject() });
  } catch (err: any) {
    handleInternalError(res, err, "createFaq");
  }
}

/**
 * DELETE /api/chat/admin/faqs/:id — xoá mềm (set isActive = false).
 */
export async function deactivateFaq(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id || "");
    if (!Types.ObjectId.isValid(id)) {
      res.status(400).json({
        error: { code: "INVALID_INPUT", message: "ID FAQ không hợp lệ" },
      });
      return;
    }

    const updated = await ChatFaq.findByIdAndUpdate(
      id,
      { $set: { isActive: false } },
      { new: true }
    ).lean();

    if (!updated) {
      res.status(404).json({
        error: { code: "NOT_FOUND", message: "Không tìm thấy FAQ" },
      });
      return;
    }

    invalidateFaqCache();
    ok(res, { success: true, faq: updated });
  } catch (err: any) {
    handleInternalError(res, err, "deactivateFaq");
  }
}

/**
 * GET /api/chat/admin/analytics
 * Query: ?days=7
 */
export async function getAnalytics(req: Request, res: Response): Promise<void> {
  try {
    const days = parseInt(String(req.query.days || "7"), 10) || 7;
    const [summary, gaps] = await Promise.all([
      getAnalyticsSummary(days),
      getAiFallbackGaps(10),
    ]);

    ok(res, {
      summary,
      gaps,
    });
  } catch (err: any) {
    handleInternalError(res, err, "getAnalytics");
  }
}
