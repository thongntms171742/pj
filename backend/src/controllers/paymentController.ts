import { Request, Response } from "express";
import { Order } from "../models/Order";
import { Notification } from "../models/Notification";
import { mapOrder } from "./orderController";
import {
  sendError,
  ErrorCode,
  handleInternalError,
} from "../utils/errors";

// ── POST /api/payments/checkout ───────────────────────────────────────────────
// Mock payment: advances order from PENDING_PAYMENT → PAID → CONFIRMED.
// Stock was deducted at createOrder time, so this just flips statuses.
export const checkout = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { orderId, method = "card", cardLast4 = "1234" } = req.body as {
      orderId?: string;
      method?: string;
      cardLast4?: string;
    };

    if (!orderId) {
      sendError(res, ErrorCode.ORDER_ID_REQUIRED, "orderId is required");
      return;
    }

    const isObjectId = /^[0-9a-fA-F]{24}$/.test(orderId);
    const orFilter: any[] = [{ orderCode: orderId }];
    if (isObjectId) orFilter.push({ _id: orderId });

    const order = await Order.findOne({ $or: orFilter, buyerId: userId });
    if (!order) {
      sendError(res, ErrorCode.ORDER_NOT_FOUND, "Không tìm thấy đơn hàng");
      return;
    }

    if (order.status === "PAID" || order.status === "CONFIRMED") {
      res.json({ order: mapOrder(order) });
      return;
    }
    if (order.status !== "PENDING_PAYMENT") {
      sendError(
        res,
        ErrorCode.ORDER_PAYMENT_INVALID_STATE,
        `Đơn hàng đang ở trạng thái ${order.status}, không thể thanh toán`
      );
      return;
    }

    order.paymentMethod = method || "card";
    order.paymentId = `PAY-${Date.now()}`;
    order.paidAt = new Date();
    order.status = "PAID";
    order.statusHistory.push({
      status: "PAID",
      by: "payment_gateway",
      at: new Date(),
      reason: `Thanh toán thành công qua ${method} (thẻ *${cardLast4})`,
    });
    order.status = "CONFIRMED";
    order.statusHistory.push({
      status: "CONFIRMED",
      by: "system",
      at: new Date(),
      reason: "Hệ thống tự động xác nhận sau khi thanh toán",
    });

    await order.save();

    await Notification.create({
      userId,
      type: "order",
      title: "Thanh toán thành công",
      message: `Đơn hàng ${order.orderCode} đã thanh toán. Build Your Christmas sẽ chuẩn bị hàng.`,
    });

    res.json({ order: mapOrder(order) });
  } catch (err) {
    handleInternalError(res, err, "[payments] checkout error");
  }
};