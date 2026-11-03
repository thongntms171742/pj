import { Router } from "express";
import { optionalAuth, requireAuth, requireAdmin } from "../../../middleware/auth";
import {
  getOrCreateConversation,
  listConversations,
  getConversationMessages,
  sendMessage,
  markRead,
  requestEscalation,
  getUnreadCount,
} from "../controllers/chatController";
import {
  listAdminConversations,
  updateAdminConversationStatus,
  assignAdminConversation,
} from "../controllers/adminChatController";
import {
  listFaqs,
  updateFaq,
  createFaq,
  deactivateFaq,
  getAnalytics,
} from "../controllers/adminChatBotController";

const router = Router();

// ── User / Guest endpoints ───────────────────────────────────────────────────
router.post("/conversations", optionalAuth, getOrCreateConversation);
router.get("/conversations", requireAuth, listConversations);
router.get("/conversations/:id/messages", optionalAuth, getConversationMessages);
router.post("/conversations/:id/messages", optionalAuth, sendMessage);
router.post("/conversations/:id/read", optionalAuth, markRead);
router.post("/conversations/:id/escalate", optionalAuth, requestEscalation);
router.get("/unread", requireAuth, getUnreadCount);

// ── Admin endpoints ──────────────────────────────────────────────────────────
router.get("/admin/conversations", requireAuth, requireAdmin, listAdminConversations);
router.put("/admin/conversations/:id/status", requireAuth, requireAdmin, updateAdminConversationStatus);
router.post("/admin/conversations/:id/assign", requireAuth, requireAdmin, assignAdminConversation);

// ── Admin endpoints: Hybrid chatbot (FAQ vận hành + analytics) ───────────────
router.get("/admin/faqs", requireAuth, requireAdmin, listFaqs);
router.post("/admin/faqs", requireAuth, requireAdmin, createFaq);
router.put("/admin/faqs/:id", requireAuth, requireAdmin, updateFaq);
router.delete("/admin/faqs/:id", requireAuth, requireAdmin, deactivateFaq);
router.get("/admin/analytics", requireAuth, requireAdmin, getAnalytics);

export default router;
