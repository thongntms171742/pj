/**
 * aiCopilot.routes.ts — REST API AI Copilot cho admin.
 * Mount tại /api/chat/admin/copilot.
 *
 * Yêu cầu: đăng nhập + role admin.
 */

import { Router } from "express";
import { requireAuth, requireAdmin } from "../../../middleware/auth";
import * as aiCopilot from "../controllers/aiCopilot.controller";

const router = Router();

router.use(requireAuth, requireAdmin);

// ── Tóm tắt hội thoại ────────────────────────────────────────────────────────
router.get("/conversations/:id/summary", aiCopilot.getSummary);

// ── Gợi ý trả lời ────────────────────────────────────────────────────────────
router.post("/conversations/:id/suggest-reply", aiCopilot.suggestReply);

// ── Ghi chú nội bộ ───────────────────────────────────────────────────────────
router.post("/conversations/:id/note", aiCopilot.createNote);

// ── Context handoff (không tốn token) ────────────────────────────────────────
router.get("/conversations/:id/context", aiCopilot.getContext);

// ── Tra chính sách ───────────────────────────────────────────────────────────
router.get("/policies", aiCopilot.searchPolicies);

export default router;
