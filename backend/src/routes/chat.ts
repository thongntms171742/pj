import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  getMessages,
  sendMessage,
  getUnreadCount,
  markRead,
} from "../controllers/chatController";

const router = Router();

// GET /api/chat/messages  — paginated history
router.get("/messages", requireAuth, getMessages);

// POST /api/chat/messages — send message (REST fallback)
router.post("/messages", requireAuth, sendMessage);

// GET /api/chat/unread — unread count
router.get("/unread", requireAuth, getUnreadCount);

// POST /api/chat/markRead — mark as read
router.post("/markRead", requireAuth, markRead);

export default router;
