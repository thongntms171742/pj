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

// ── POST /api/payments/webhook ────────────────────────────────────────────────
export const handlePaymentWebhook = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const signature = (req.headers["x-signature"] ||
      req.headers["x-webhook-signature"] ||
      req.query.signature) as string | undefined;
    const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET;

    if (webhookSecret && signature) {
      const crypto = await import("crypto");
      const expectedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(JSON.stringify(req.body))
        .digest("hex");
      if (signature !== expectedSignature) {
        sendError(
          res,
          ErrorCode.WEBHOOK_INVALID_SIGNATURE,
          "Chữ ký xác thực webhook thanh toán không khớp",
          401
        );
        return;
      }
    }

    const {
      orderCode,
      orderId,
      transactionId,
      gateway = "PayOS",
    } = req.body as {
      orderCode?: string;
      orderId?: string;
      transactionId?: string;
      gateway?: string;
    };

    const targetCode = orderCode || orderId;
    if (!targetCode) {
      sendError(
        res,
        ErrorCode.MISSING_FIELD,
        "Thiếu orderCode hoặc orderId trong webhook payload"
      );
      return;
    }

    const isObjectId = /^[0-9a-fA-F]{24}$/.test(targetCode);
    const orFilter: any[] = [{ orderCode: targetCode }];
    if (isObjectId) orFilter.push({ _id: targetCode });

    const order = await Order.findOne({ $or: orFilter });
    if (!order) {
      sendError(res, ErrorCode.ORDER_NOT_FOUND, "Không tìm thấy đơn hàng", 404);
      return;
    }

    if (order.status === "PAID" || order.status === "CONFIRMED") {
      res.json({
        success: true,
        message: "Đơn hàng đã thanh toán trước đó",
        orderCode: order.orderCode,
      });
      return;
    }

    const now = new Date();
    const txnId = transactionId || `TXN-${Date.now()}`;
    order.status = "PAID";
    order.paidAt = now;
    order.paymentTransactionId = txnId;
    order.paymentId = txnId;
    order.statusHistory.push({
      status: "PAID",
      by: gateway,
      at: now,
      reason: `Thanh toán thành công qua ${gateway} (Mã GD: ${txnId})`,
      note: `Giao dịch ${txnId}`,
    });

    order.status = "CONFIRMED";
    order.statusHistory.push({
      status: "CONFIRMED",
      by: "system",
      at: now,
      reason: "Hệ thống tự động xác nhận sau khi nhận webhook thanh toán",
      note: "Auto-confirmed",
    });

    await order.save();

    await Notification.create({
      userId: order.buyerId,
      type: "order",
      title: "Thanh toán thành công qua cổng thanh toán",
      message: `Đơn hàng ${order.orderCode} đã thanh toán thành công (Mã GD: ${txnId}).`,
    });

    res.json({
      success: true,
      message: "Cập nhật thanh toán thành công",
      order: mapOrder(order),
    });
  } catch (err) {
    handleInternalError(res, err, "[payments] webhook error");
  }
};