/**
 * adminChat.routes.ts — REST API phía ADMIN. Mount tại /api/chat/admin.
 *
 * Yêu cầu: đăng nhập + role admin.
 */

import { Router } from "express";
import { requireAuth, requireAdmin } from "../../../middleware/auth";
import * as adminChat from "../controllers/adminChat.controller";

const router = Router();

router.use(requireAuth, requireAdmin);

// ── Conversations ─────────────────────────────────────────────────────────────
router.get("/conversations", adminChat.listConversations);
router.get("/conversations/:id", adminChat.getConversation);
router.post("/conversations/:id/assign", adminChat.assignConversation);
router.post("/conversations/:id/accept", adminChat.acceptHandoff);
router.post("/conversations/:id/close", adminChat.closeConversation);
router.post("/conversations/:id/reopen", adminChat.reopenConversation);

// ── Messages ──────────────────────────────────────────────────────────────────
router.get("/conversations/:id/messages", adminChat.listMessages);
router.post("/conversations/:id/messages", adminChat.sendMessage);
router.post("/conversations/:id/read", adminChat.markAsRead);

// ── Handoff queue ─────────────────────────────────────────────────────────────
router.get("/handoffs", adminChat.listHandoffs);
router.post("/conversations/:id/handoff/assign", adminChat.assignHandoff);
router.post("/conversations/:id/handoff/resolve", adminChat.resolveHandoff);

// ── Metrics ───────────────────────────────────────────────────────────────────
router.get("/unread-count", adminChat.getUnreadCount);

export default router;
