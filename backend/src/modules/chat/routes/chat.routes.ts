/**
 * chat.routes.ts — REST API phía USER. Mount tại /api/chat.
 *
 * Tất cả route đều cần `requireAuth` — chat là dữ liệu riêng tư,
 * không có chế độ guest.
 */

import { Router } from "express";
import { requireAuth } from "../../../middleware/auth";
import * as chat from "../controllers/chat.controller";

const router = Router();

// ── Guard: toàn bộ chat API yêu cầu đăng nhập ───────────────────────────────
router.use(requireAuth);

// ── Conversations ─────────────────────────────────────────────────────────────
router.get("/conversations", chat.listConversations);
router.post("/conversations", chat.createConversation);
router.get("/conversations/unread-count", chat.getUnreadCount);
router.get("/conversations/:id", chat.getConversation);
router.post("/conversations/:id/close", chat.closeConversation);
router.post("/conversations/:id/reopen", chat.reopenConversation);

// ── Messages ──────────────────────────────────────────────────────────────────
router.get("/conversations/:id/messages", chat.listMessages);
router.post("/conversations/:id/messages", chat.sendMessage);
router.post("/conversations/:id/read", chat.markAsRead);

// ── Handoff ───────────────────────────────────────────────────────────────────
router.get("/conversations/:id/handoff", chat.getHandoff);
router.post("/conversations/:id/handoff", chat.createHandoff);
router.delete("/conversations/:id/handoff", chat.cancelHandoff);

export default router;
