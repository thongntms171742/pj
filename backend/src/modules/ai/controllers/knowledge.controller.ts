/**
 * knowledge.controller.ts — quản lý kho tri thức (admin).
 *
 * Route prefix: /api/chat/admin/knowledge
 *
 * Admin duyệt / soạn tài liệu ⇒ AI dùng làm nguồn sự thật (tool `policySearch`).
 */

import { Request, Response } from "express";
import { ah } from "../../../utils/asyncRoute";
import { ok, created } from "../../../utils/respond";
import { sendError } from "../../../utils/errors";
import { Types } from "mongoose";
import {
  ChatError,
  type ChatActor,
} from "../../chat/services/chatPermission.service";
import {
  KNOWLEDGE_CATEGORIES,
  KNOWLEDGE_STATUSES,
  KnowledgeDocument,
  type KnowledgeCategory,
  type KnowledgeStatus,
} from "../../../models/KnowledgeDocument";
import { invalidateKnowledgeCache } from "../../ai/services/knowledge.service";

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

function toDto(doc: any) {
  return {
    id: String(doc._id),
    title: doc.title,
    slug: doc.slug,
    category: doc.category,
    content: doc.content,
    summary: doc.summary,
    keywords: doc.keywords,
    tags: doc.tags,
    status: doc.status,
    priority: doc.priority,
    isActive: doc.isActive,
    version: doc.version,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** Sinh slug từ tiêu đề (bỏ dấu, gọn, phân biệt hoa thường). */
export function slugify(input: string): string {
  return (input ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

/**
 * GET /api/chat/admin/knowledge
 * Query: status, category, q (tìm theo tiêu đề), page, limit
 */
export const listKnowledge = ah(async (req, res) => {
  const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(String(req.query.limit ?? "20"), 10) || 20)
  );
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};
  const status = String(req.query.status ?? "");
  const category = String(req.query.category ?? "");
  const q = String(req.query.q ?? "").trim();

  if (status && (KNOWLEDGE_STATUSES as readonly string[]).includes(status)) {
    filter.status = status;
  }
  if (category && (KNOWLEDGE_CATEGORIES as readonly string[]).includes(category)) {
    filter.category = category;
  }
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ title: rx }, { summary: rx }, { keywords: rx }];
  }

  try {
    const [items, total] = await Promise.all([
      KnowledgeDocument.find(filter)
        .sort({ priority: -1, updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      KnowledgeDocument.countDocuments(filter),
    ]);

    ok(res, {
      items: items.map((d) => toDto(d)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    });
  } catch (err) {
    handleServiceError(res, err);
  }
});

/**
 * GET /api/chat/admin/knowledge/:id
 */
export const getKnowledge = ah(async (req, res) => {
  try {
    const doc = await KnowledgeDocument.findById(param(req, "id")).lean();
    if (!doc) {
      sendError(res, "NOT_FOUND", "Không tìm thấy tài liệu", 404);
      return;
    }
    ok(res, { document: toDto(doc) });
  } catch (err) {
    handleServiceError(res, err);
  }
});

/**
 * POST /api/chat/admin/knowledge
 * Body: { title, content, category?, summary?, keywords?, tags?, status?, priority? }
 */
export const createKnowledge = ah(async (req, res) => {
  const body = req.body ?? {};
  const title = String(body.title ?? "").trim();
  const content = String(body.content ?? "").trim();

  if (!title || !content) {
    sendError(res, "INVALID_INPUT", "Cần đủ `title` và `content`", 400);
    return;
  }

  try {
    const slug = slugify(body.slug ? String(body.slug) : title);
    if (!slug) {
      sendError(res, "INVALID_INPUT", "Tiêu đề không tạo được slug hợp lệ", 400);
      return;
    }

    // Slug phải unique ⇒ thêm hậu tố nếu trùng.
    let finalSlug = slug;
    let suffix = 1;
    while (await KnowledgeDocument.exists({ slug: finalSlug })) {
      finalSlug = `${slug}-${++suffix}`;
    }

    const doc = await KnowledgeDocument.create({
      title,
      slug: finalSlug,
      category: (body.category ?? "faq") as KnowledgeCategory,
      content,
      summary: String(body.summary ?? ""),
      keywords: Array.isArray(body.keywords) ? body.keywords.map(String) : [],
      tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
      status: (body.status ?? "published") as KnowledgeStatus,
      priority: Number(body.priority ?? 0) || 0,
      isActive: body.isActive !== false,
      version: 1,
      updatedBy: new Types.ObjectId(actorOf(req).userId),
    });

    invalidateKnowledgeCache();
    created(res, { document: toDto(doc.toObject()) });
  } catch (err) {
    handleServiceError(res, err);
  }
});

/**
 * PUT /api/chat/admin/knowledge/:id
 */
export const updateKnowledge = ah(async (req, res) => {
  const body = req.body ?? {};

  try {
    const id = param(req, "id");
    const existing = await KnowledgeDocument.findById(id);
    if (!existing) {
      sendError(res, "NOT_FOUND", "Không tìm thấy tài liệu", 404);
      return;
    }

    if (body.title !== undefined) existing.title = String(body.title).trim();
    if (body.content !== undefined) existing.content = String(body.content).trim();
    if (body.summary !== undefined) existing.summary = String(body.summary);
    if (body.category !== undefined) {
      existing.category = body.category as KnowledgeCategory;
    }
    if (body.keywords !== undefined) {
      existing.keywords = Array.isArray(body.keywords)
        ? body.keywords.map(String)
        : [];
    }
    if (body.tags !== undefined) {
      existing.tags = Array.isArray(body.tags) ? body.tags.map(String) : [];
    }
    if (body.status !== undefined) {
      existing.status = body.status as KnowledgeStatus;
    }
    if (body.priority !== undefined) {
      existing.priority = Number(body.priority) || 0;
    }
    if (body.isActive !== undefined) {
      existing.isActive = Boolean(body.isActive);
    }

    existing.version = (existing.version ?? 1) + 1;
    existing.updatedBy = new Types.ObjectId(actorOf(req).userId);

    await existing.save();
    invalidateKnowledgeCache();

    ok(res, { document: toDto(existing.toObject()) });
  } catch (err) {
    handleServiceError(res, err);
  }
});

/**
 * DELETE /api/chat/admin/knowledge/:id
 * Xoá mềm (status = archived) ⇒ không mất lịch sử.
 */
export const archiveKnowledge = ah(async (req, res) => {
  try {
    const id = param(req, "id");
    const existing = await KnowledgeDocument.findById(id);
    if (!existing) {
      sendError(res, "NOT_FOUND", "Không tìm thấy tài liệu", 404);
      return;
    }

    existing.status = "archived";
    existing.isActive = false;
    existing.version = (existing.version ?? 1) + 1;
    existing.updatedBy = new Types.ObjectId(actorOf(req).userId);
    await existing.save();

    invalidateKnowledgeCache();
    ok(res, { document: toDto(existing.toObject()) });
  } catch (err) {
    handleServiceError(res, err);
  }
});
