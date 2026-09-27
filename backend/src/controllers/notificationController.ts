import { Request, Response } from "express";
import { Notification } from "../models/Notification";

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
    console.error("[notifications] getNotifications error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── PATCH /api/notifications/:id/read ─────────────────────────────────────────
export const markAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const notification = await Notification.findOneAndUpdate(
      { _id: id, userId },
      { isRead: true },
      { new: true }
    );
    if (!notification) {
      res.status(404).json({ error: "Không tìm thấy thông báo hoặc không có quyền" });
      return;
    }
    res.json({ success: true, notification });
  } catch (err) {
    console.error("[notifications] markAsRead error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};
