import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  listConversations,
  getMessages,
  sendMessage,
  getUnreadForPeer,
  markRead,
  getUnreadCount,
} from "../controllers/chatController";

const router = Router();

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

export default router;
