import { Request, Response } from "express";
import { Order } from "../models/Order";
import { Notification } from "../models/Notification";
import { orderToDto } from "../dto/order";
import { findOrderByIdOrCode } from "../utils/ids";
import { ok, created } from "../utils/respond";
import { markOrderAsPaid } from "../services/orderService";
import {
  sendError,
  ErrorCode,
  handleInternalError,
} from "../utils/errors";

// ── POST /api/payments/checkout ───────────────────────────────────────────────
// Mock payment: advances order from PENDING_PAYMENT → PAID → CONFIRMED via
// the shared `markOrderAsPaid` service (same code path as the webhook).
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

    const order = await Order.findOne({
      ...findOrderByIdOrCode(orderId),
      buyerId: userId,
    });
    if (!order) {
      sendError(res, ErrorCode.ORDER_NOT_FOUND, "Không tìm thấy đơn hàng");
      return;
    }

    if (order.status === "PAID" || order.status === "CONFIRMED") {
      ok(res, { order: orderToDto(order) });
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
    await markOrderAsPaid(order, {
      by: "payment_gateway",
      reason: `Thanh toán thành công qua ${method} (thẻ *${cardLast4})`,
      paymentId: `PAY-${Date.now()}`,
    });

    await Notification.create({
      userId,
      type: "order",
      title: "Thanh toán thành công",
      message: `Đơn hàng ${order.orderCode} đã thanh toán. Build Your Christmas sẽ chuẩn bị hàng.`,
    });

    ok(res, { order: orderToDto(order) });
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

    const order = await Order.findOne(findOrderByIdOrCode(targetCode));
    if (!order) {
      sendError(res, ErrorCode.ORDER_NOT_FOUND, "Không tìm thấy đơn hàng", 404);
      return;
    }

    if (order.status === "PAID" || order.status === "CONFIRMED") {
      ok(res, {
        success: true,
        message: "Đơn hàng đã thanh toán trước đó",
        orderCode: order.orderCode,
      });
      return;
    }

    const txnId = transactionId || `TXN-${Date.now()}`;
    await markOrderAsPaid(order, {
      by: gateway,
      reason: `Thanh toán thành công qua ${gateway} (Mã GD: ${txnId})`,
      paymentId: txnId,
      transactionId: txnId,
    });

    await Notification.create({
      userId: order.buyerId,
      type: "order",
      title: "Thanh toán thành công qua cổng thanh toán",
      message: `Đơn hàng ${order.orderCode} đã thanh toán thành công (Mã GD: ${txnId}).`,
    });

    ok(res, {
      success: true,
      message: "Cập nhật thanh toán thành công",
      order: orderToDto(order),
    });
  } catch (err) {
    handleInternalError(res, err, "[payments] webhook error");
  }
};