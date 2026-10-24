import { Router } from "express";
import { optionalAuth, requireAuth, requireAdmin } from "../middleware/auth";
import {
  getOrCreateConversation,
  getConversationMessages,
  sendAiChatMessage,
  requestEscalation,
  listAdminConversations,
  updateAdminConversationStatus,
  listConversations,
  getMessages,
  sendMessage,
  getUnreadForPeer,
  markRead,
  getUnreadCount,
} from "../controllers/chatController";

const router = Router();

// ── AI Hybrid Chatbot Endpoints (Guests + Users) ──────────────────────────────
router.post("/conversations", optionalAuth, getOrCreateConversation);
router.post("/conversations/:id/escalate", optionalAuth, requestEscalation);
router.get("/admin/conversations", requireAuth, requireAdmin, listAdminConversations);
router.put("/admin/conversations/:id/status", requireAuth, requireAdmin, updateAdminConversationStatus);

// Explicit AI prefixes (prevents any ambiguity)
router.post("/ai/conversations", optionalAuth, getOrCreateConversation);
router.get("/ai/conversations/:id/messages", optionalAuth, getConversationMessages);
router.post("/ai/conversations/:id/messages", optionalAuth, sendAiChatMessage);
router.post("/ai/conversations/:id/escalate", optionalAuth, requestEscalation);
router.get("/ai/admin/conversations", requireAuth, requireAdmin, listAdminConversations);
router.put("/ai/admin/conversations/:id/status", requireAuth, requireAdmin, updateAdminConversationStatus);

// ── 1-1 Peer Chat Endpoints (Buyer <-> Admin) ─────────────────────────────────
router.get("/unread", requireAuth, getUnreadCount);
router.get("/conversations", requireAuth, listConversations);
router.get("/conversations/:peerId/messages", requireAuth, getMessages);
// Ghi tin nhắn 1-1 buyer↔admin. Route AI (guest / chatbot) nằm ở
// `/ai/conversations/:id/messages` với `optionalAuth`.
// Nhánh `if (!req.headers.authorization && ...)` trước đây là dead code:
// `requireAuth` đã chặn 401 mọi request không có token ⇒ nhánh không bao giờ chạy.
router.post("/conversations/:peerId/messages", requireAuth, sendMessage);
router.get("/conversations/:peerId/unread", requireAuth, getUnreadForPeer);
router.post("/conversations/:peerId/markRead", requireAuth, markRead);

export default router;
