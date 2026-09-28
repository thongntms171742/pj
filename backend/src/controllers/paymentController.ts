import { Request, Response } from "express";
import { Order } from "../models/Order";
import { Product } from "../models/Product";
import { Notification } from "../models/Notification";
import { mapOrder } from "./orderController";
import { sendError, ErrorCode, handleInternalError } from "../utils/errors";

// ── POST /api/payments/checkout ───────────────────────────────────────────────
// Mock payment: advances order from PENDING_PAYMENT → PAID → CONFIRMED,
// deducts inventory, clears reservations, and notifies buyer and sellers.
export const checkout = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { orderId, method = "card", cardLast4 = "1234" } = req.body;

    if (!orderId) {
      sendError(res, ErrorCode.ORDER_ID_REQUIRED, "orderId is required");
      return;
    }

    const idStr = String(orderId);
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(idStr);
    const orFilter: any[] = [{ orderCode: idStr }];
    if (isObjectId) orFilter.push({ _id: idStr });

    const order = await Order.findOne({
      $or: orFilter,
      buyerId: userId,
    });

    if (!order) {
      sendError(res, ErrorCode.ORDER_NOT_FOUND, "Không tìm thấy đơn hàng");
      return;
    }

    // If order was already paid or confirmed, return current state idempotently
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

    // Process payment simulation
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

    // Advance to CONFIRMED
    order.status = "CONFIRMED";
    order.statusHistory.push({
      status: "CONFIRMED",
      by: "system",
      at: new Date(),
      reason: "Hệ thống tự động xác nhận đơn hàng sau khi thanh toán",
    });

    await order.save();

    // Deduct stock for all purchased items
    for (const item of order.items) {
      const product = await Product.findById(item.productId);
      if (product) {
        product.quantity = Math.max(0, product.quantity - item.quantity);
        if (product.quantity === 0) {
          product.status = "sold";
        } else {
          product.status = "active";
        }
        product.reservedUntil = null;
        product.reservedByOrderId = null;
        await product.save();
      }
    }

    // Notify buyer
    await Notification.create({
      userId,
      type: "order",
      title: "Thanh toán thành công",
      message: `Đơn hàng ${order.orderCode} đã thanh toán thành công. Shop sẽ chuẩn bị hàng.`,
    });

    // Notify sellers
    const sellerIds = Array.from(new Set(order.items.map((it) => it.sellerId.toString())));
    for (const sId of sellerIds) {
      await Notification.create({
        userId: sId,
        type: "order",
        title: "Đơn hàng mới đã thanh toán",
        message: `Đơn hàng #${order.orderCode} đã thanh toán và chờ giao hàng. Hãy chuẩn bị hàng và tạo vận đơn!`,
      });
    }

    res.json({ order: mapOrder(order) });
  } catch (err) {
    handleInternalError(res, err, "[payments] checkout error");
  }
};