import { Router } from "express";
import { optionalAuth, requireAuth, requireAdmin } from "../middleware/auth";
import {
  getOrCreateConversation,
  getConversationMessages,
  sendMessage,
  requestEscalation,
  listAdminConversations,
  updateAdminConversationStatus,
} from "../controllers/chatController";

const router = Router();

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

export default router;
