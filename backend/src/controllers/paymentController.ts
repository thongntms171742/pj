import { Request, Response } from "express";
import { Order } from "../models/Order";
import { Notification } from "../models/Notification";
import { orderToDto } from "../dto/order";
import { findOrderByIdOrCode } from "../utils/ids";
import { ok, created } from "../utils/respond";
import { markOrderAsPaid } from "../services/orderService";
import {
  getSepayPaymentInfo,
  extractOrderCode,
  verifySepayWebhookAuth,
  SepayWebhookPayload,
} from "../services/sepayService";
import { emitOrderPaymentUpdate } from "../services/socket";
import {
  sendError,
  ErrorCode,
  handleInternalError,
} from "../utils/errors";

// ── GET /api/payments/sepay/info/:orderId ────────────────────────────────────
// Trả về thông tin chuyển khoản VietQR chi tiết cho đơn hàng
export const getSepayInfo = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const isAdmin = Boolean(req.user?.roles?.includes("admin"));
    const { orderId } = req.params;

    if (!orderId) {
      sendError(res, ErrorCode.ORDER_ID_REQUIRED, "Thiếu orderId");
      return;
    }

    const order = await Order.findOne(findOrderByIdOrCode(orderId));
    if (!order) {
      sendError(res, ErrorCode.ORDER_NOT_FOUND, "Không tìm thấy đơn hàng", 404);
      return;
    }

    // Chỉ người mua hoặc admin mới có quyền xem thông tin thanh toán
    if (!isAdmin && order.buyerId.toString() !== userId) {
      sendError(
        res,
        ErrorCode.FORBIDDEN,
        "Bạn không có quyền xem thông tin đơn hàng này",
        403
      );
      return;
    }

    const sepayInfo = getSepayPaymentInfo(order);
    ok(res, {
      payment: sepayInfo,
      order: orderToDto(order),
    });
  } catch (err) {
    handleInternalError(res, err, "[payments] getSepayInfo error");
  }
};

// ── GET /api/payments/sepay/check/:orderCode ─────────────────────────────────
// Kiểm tra nhanh trạng thái thanh toán (polling fallback cho FE)
export const checkPaymentStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { orderCode } = req.params;
    if (!orderCode) {
      sendError(res, ErrorCode.MISSING_FIELD, "Thiếu mã đơn hàng");
      return;
    }

    const order = await Order.findOne(findOrderByIdOrCode(orderCode));
    if (!order) {
      sendError(res, ErrorCode.ORDER_NOT_FOUND, "Không tìm thấy đơn hàng", 404);
      return;
    }

    const isPaid = order.status === "PAID" || order.status === "CONFIRMED";
    ok(res, {
      orderCode: order.orderCode,
      status: order.status,
      isPaid,
      paidAt: order.paidAt,
      paymentMethod: order.paymentMethod,
    });
  } catch (err) {
    handleInternalError(res, err, "[payments] checkPaymentStatus error");
  }
};

// ── POST /api/payments/sepay/webhook ─────────────────────────────────────────
// Nhận webhook tự động từ SePay khi có biến động số dư chuyển khoản
export const handleSepayWebhook = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    // 1. Xác thực webhook SePay (qua Header Authorization: Apikey <KEY>)
    if (!verifySepayWebhookAuth(authHeader)) {
      sendError(
        res,
        ErrorCode.WEBHOOK_INVALID_SIGNATURE,
        "Xác thực Webhook SePay thất bại: API Key không hợp lệ",
        401
      );
      return;
    }

    const body = req.body as SepayWebhookPayload;
    console.log("[sepay-webhook] Nhận payload:", JSON.stringify(body));

    // 2. Chỉ xử lý tiền vào (transferType: "in")
    if (body.transferType && body.transferType.toLowerCase() === "out") {
      ok(res, {
        success: true,
        message: "Bỏ qua giao dịch chuyển tiền ra (transferType=out)",
      });
      return;
    }

    // 3. Bóc tách mã đơn hàng
    const orderCode = extractOrderCode(body.content, body.code);
    if (!orderCode) {
      console.warn(
        `[sepay-webhook] Không nhận diện được mã đơn hàng trong nội dung: "${body.content}"`
      );
      // Trả 200 để SePay không retry vô ích với các giao dịch không thuộc đơn hàng
      ok(res, {
        success: false,
        message: "Không tìm thấy mã đơn hàng phù hợp trong nội dung chuyển khoản",
      });
      return;
    }

    // 4. Tìm đơn hàng trong DB
    const order = await Order.findOne(findOrderByIdOrCode(orderCode));
    if (!order) {
      console.warn(`[sepay-webhook] Đơn hàng không tồn tại: ${orderCode}`);
      ok(res, {
        success: false,
        message: `Đơn hàng ${orderCode} không tồn tại`,
      });
      return;
    }

    // 5. Kiểm tra tính Idempotent (nếu đã thanh toán thì return ngay)
    if (order.status === "PAID" || order.status === "CONFIRMED") {
      ok(res, {
        success: true,
        message: "Đơn hàng đã được thanh toán trước đó",
        orderCode: order.orderCode,
      });
      return;
    }

    // 6. Kiểm tra số tiền chuyển khoản
    const transferAmount = Number(body.transferAmount || 0);
    if (transferAmount < order.totalAmount) {
      console.warn(
        `[sepay-webhook] Đơn ${order.orderCode} thiếu tiền: chuyển ${transferAmount}, cần ${order.totalAmount}`
      );
      // Ghi chú lịch sử đơn hàng
      order.statusHistory.push({
        status: order.status,
        by: "sepay",
        at: new Date(),
        reason: `Chuyển thiếu tiền: Đã chuyển ${transferAmount} đ / Cần ${order.totalAmount} đ`,
      });
      await order.save();

      ok(res, {
        success: false,
        message: "Số tiền chuyển khoản chưa đủ",
        received: transferAmount,
        expected: order.totalAmount,
      });
      return;
    }

    // 7. Cập nhật trạng thái đơn hàng sang PAID -> CONFIRMED
    const gateway = body.gateway || "SePay";
    const txnId = body.referenceCode || String(body.id || `SP-${Date.now()}`);

    order.paymentMethod = "SEPAY";
    await markOrderAsPaid(order, {
      by: `SePay (${gateway})`,
      reason: `Thanh toán thành công qua SePay (${gateway}) - Mã GD: ${txnId}`,
      paymentId: String(body.id || txnId),
      transactionId: txnId,
    });

    // 8. Tạo thông báo cho Buyer
    await Notification.create({
      userId: order.buyerId,
      type: "order",
      title: "Thanh toán thành công",
      message: `Đơn hàng ${order.orderCode} đã thanh toán thành công qua chuyển khoản ngân hàng (Mã GD: ${txnId}). Build Your Christmas sẽ chuẩn bị hàng.`,
    });

    // 9. Bắn sự kiện realtime Socket.io tới các tab của người mua
    emitOrderPaymentUpdate(String(order.buyerId), {
      orderCode: order.orderCode,
      orderId: String(order._id),
      status: "CONFIRMED",
      totalAmount: order.totalAmount,
      transactionId: txnId,
    });

    console.log(
      `[sepay-webhook] ✅ Đơn hàng ${order.orderCode} đã thanh toán thành công (Mã GD: ${txnId})`
    );

    ok(res, {
      success: true,
      message: "Cập nhật thanh toán thành công qua SePay",
      orderCode: order.orderCode,
      status: "CONFIRMED",
    });
  } catch (err) {
    handleInternalError(res, err, "[payments] handleSepayWebhook error");
  }
};

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

    emitOrderPaymentUpdate(userId, {
      orderCode: order.orderCode,
      orderId: String(order._id),
      status: "CONFIRMED",
      totalAmount: order.totalAmount,
    });

    ok(res, { order: orderToDto(order) });
  } catch (err) {
    handleInternalError(res, err, "[payments] checkout error");
  }
};

// ── POST /api/payments/webhook ────────────────────────────────────────────────
// General payment webhook (tương thích PayOS / chữ ký HMAC và tự động điều hướng nếu là SePay)
export const handlePaymentWebhook = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // Nếu request đến có đặc trưng của SePay (chứa trường content, gateway, transferAmount)
    if (req.body && (req.body.content || req.body.transferAmount !== undefined)) {
      return handleSepayWebhook(req, res);
    }

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

    emitOrderPaymentUpdate(String(order.buyerId), {
      orderCode: order.orderCode,
      orderId: String(order._id),
      status: "CONFIRMED",
      totalAmount: order.totalAmount,
      transactionId: txnId,
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