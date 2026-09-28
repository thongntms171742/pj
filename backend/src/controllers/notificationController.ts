import { Request, Response } from "express";
import { Notification } from "../models/Notification";
import { sendError, ErrorCode, handleInternalError } from "../utils/errors";

// ── GET /api/notifications ────────────────────────────────────────────────────
export const getNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const notifications = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const mapped = notifications.map((n) => ({
      _id: n._id.toString(),
      userId: n.userId.toString(),
      type: n.type,
      title: n.title,
      message: n.message,
      isRead: n.isRead,
      createdAt: (n as any).createdAt?.toISOString() ?? new Date().toISOString(),
    }));

    res.json({ notifications: mapped });
  } catch (err) {
    handleInternalError(res, err, "[notifications] getNotifications error");
  }
};

// ── PATCH /api/notifications/:id/read ─────────────────────────────────────────
// Mark a notification as read.
// NOTE: Now enforces ownership to prevent IDOR (user A marking user B's notification).
export const markAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const notif = await Notification.findOne({ _id: id, userId });
    if (!notif) {
      sendError(res, ErrorCode.NOT_FOUND, "Không tìm thấy notification");
      return;
    }

    notif.isRead = true;
    await notif.save();

    res.json({ success: true });
  } catch (err) {
    handleInternalError(res, err, "[notifications] markAsRead error");
  }
};