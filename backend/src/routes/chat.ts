import { Router } from "express";
<<<<<<< HEAD
import { optionalAuth, requireAuth, requireAdmin } from "../middleware/auth";
import {
  getOrCreateConversation,
  getConversationMessages,
  sendMessage,
  requestEscalation,
  listAdminConversations,
  updateAdminConversationStatus,
=======
import { requireAuth } from "../middleware/auth";
import {
  listConversations,
  getMessages,
  sendMessage,
  getUnreadForPeer,
  markRead,
  getUnreadCount,
>>>>>>> e9b299b6947f2d1b4aefc82d4ac7a3b7abaf5fc8
} from "../controllers/chatController";

const router = Router();

<<<<<<< HEAD
// ── Customer / Guest Chat Endpoints ──────────────────────────────────────────
// Get or initialize active conversation (supports guest or logged-in user)
router.post("/conversations", optionalAuth, getOrCreateConversation);

// Get message history for a conversation
router.get("/conversations/:id/messages", optionalAuth, getConversationMessages);

// Send message to a conversation
router.post("/conversations/:id/messages", optionalAuth, sendMessage);

// Escalate conversation to human admin
router.post("/conversations/:id/escalate", optionalAuth, requestEscalation);

// ── Admin Chat Management Endpoints ──────────────────────────────────────────
// List all conversations with filters (status, unread, etc.)
router.get("/admin/conversations", requireAuth, requireAdmin, listAdminConversations);

// Update status of conversation (accept, resolve, return to bot)
router.put("/admin/conversations/:id/status", requireAuth, requireAdmin, updateAdminConversationStatus);
=======
// All chat endpoints require auth
router.use(requireAuth);

// Total unread across all my conversations (badge on the app)
router.get("/unread", getUnreadCount);

// List my conversations (admin: many; buyer: at most 1)
router.get("/conversations", listConversations);

// Per-conversation (param = peerId)
router.get("/conversations/:peerId/messages", getMessages);
router.post("/conversations/:peerId/messages", sendMessage);
router.get("/conversations/:peerId/unread", getUnreadForPeer);
router.post("/conversations/:peerId/markRead", markRead);
>>>>>>> e9b299b6947f2d1b4aefc82d4ac7a3b7abaf5fc8

export default router;
