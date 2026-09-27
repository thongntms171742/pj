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

    const notification = await Notification.findById(id);
    if (!notification) {
      res.status(404).json({ error: "Không tìm thấy thông báo" });
      return;
    }

    if (notification.userId.toString() !== userId) {
      res.status(403).json({ error: "Không có quyền sửa thông báo này" });
      return;
    }

    notification.isRead = true;
    await notification.save();

    res.json({ success: true });
  } catch (err) {
    console.error("[notifications] markAsRead error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── PATCH /api/notifications/read-all ─────────────────────────────────────────
export const markAllAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    await Notification.updateMany({ userId, isRead: false }, { isRead: true });
    res.json({ success: true });
  } catch (err) {
    console.error("[notifications] markAllAsRead error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};
