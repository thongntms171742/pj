import { Request, Response } from "express";
import { Order, OrderStatus, VALID_TRANSITIONS } from "../models/Order";
import { Notification } from "../models/Notification";

// ── POST /api/payments/checkout ───────────────────────────────────────────────
// Mock payment: advances order from PENDING_PAYMENT → PAID → CONFIRMED.
export const checkout = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { orderId, method, cardLast4 } = req.body;

    if (!orderId) {
      res.status(400).json({ error: "orderId is required" });
      return;
    }

    const idStr = String(orderId);
    const orFilter: any[] = [{ orderCode: idStr }];
    if (idStr.match(/^[0-9a-fA-F]{24}$/)) orFilter.push({ _id: idStr });

    const order = await Order.findOne({
      $or: orFilter,
      buyerId: userId,
    });

    if (!order) {
      res.status(404).json({ error: "Không tìm thấy đơn hàng" });
      return;
    }

    if (order.status !== "PENDING_PAYMENT") {
      res.status(422).json({ error: `Đơn hàng đang ở trạng thái ${order.status}, không thể thanh toán` });
      return;
    }

    // Simulate payment processing
    order.status = "PAID";
    order.paymentMethod = method || "card";
    order.paymentId = `PAY-${Date.now()}`;
    order.paidAt = new Date();
    order.statusHistory.push(
      { status: "PAID", by: "payment_gateway", at: new Date() },
    );

    // Auto-confirm (mock — in production this would be seller action or scheduled)
    order.status = "CONFIRMED";
    order.statusHistory.push(
      { status: "CONFIRMED", by: "system", at: new Date() },
    );

    await order.save();

    // Notification
    await Notification.create({
      userId,
      type: "order",
      title: "Thanh toán thành công",
      message: `Đơn hàng ${order.orderCode} đã thanh toán thành công. Shop sẽ chuẩn bị hàng.`,
    });

    res.json({
      order: {
        _id: order._id.toString(),
        orderCode: order.orderCode,
        status: order.status,
        paymentId: order.paymentId,
        paidAt: order.paidAt?.toISOString(),
      },
    });
  } catch (err) {
    console.error("[payments] checkout error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};
