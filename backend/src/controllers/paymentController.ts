import { Request, Response } from "express";
import mongoose from "mongoose";
import { Order } from "../models/Order";
import { Product } from "../models/Product";
import { Notification } from "../models/Notification";
import { Ledger } from "../models/Ledger";
import { mapOrder } from "./orderController";

// ── POST /api/payments/checkout ───────────────────────────────────────────────
// Mock payment: advances order from PENDING_PAYMENT → PAID → CONFIRMED,
// deducts inventory, clears reservations, and notifies buyer and sellers.
export const checkout = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { orderId, method = "card", cardLast4 = "1234", idempotencyKey } = req.body;

    if (!orderId) {
      res.status(400).json({ error: "orderId is required" });
      return;
    }

    const idStr = String(orderId);
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(idStr);
    const orFilter: any[] = [{ orderCode: idStr }];
    if (isObjectId) orFilter.push({ _id: idStr });

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Find order without locking just to check existence/already paid
      let order = await Order.findOne({ $or: orFilter, buyerId: userId }).session(session);
      
      if (!order) {
        res.status(404).json({ error: "Không tìm thấy đơn hàng" });
        await session.abortTransaction();
        session.endSession();
        return;
      }

      if (order.status === "PAID" || order.status === "CONFIRMED") {
        res.json({ order: mapOrder(order) });
        await session.abortTransaction();
        session.endSession();
        return;
      }

      if (order.status !== "PENDING_PAYMENT") {
        res.status(422).json({
          error: `Đơn hàng đang ở trạng thái ${order.status}, không thể thanh toán`,
        });
        await session.abortTransaction();
        session.endSession();
        return;
      }

      // Atomic update to prevent race conditions
      const paymentId = idempotencyKey || `PAY-${order.orderCode}-${Date.now()}`;
      
      order = await Order.findOneAndUpdate(
        { _id: order._id, status: "PENDING_PAYMENT" },
        {
          $set: {
            status: "CONFIRMED",
            paymentMethod: method || "card",
            paymentId,
            paidAt: new Date()
          },
          $push: {
            statusHistory: {
              $each: [
                {
                  status: "PAID",
                  by: "payment_gateway",
                  at: new Date(),
                  reason: `Thanh toán thành công qua ${method} (thẻ *${cardLast4})`
                },
                {
                  status: "CONFIRMED",
                  by: "system",
                  at: new Date(),
                  reason: "Hệ thống tự động xác nhận đơn hàng sau khi thanh toán"
                }
              ]
            }
          }
        },
        { new: true, session }
      );

      if (!order) {
        // If order became null, it means status changed concurrently
        res.status(409).json({ error: "Trạng thái đơn hàng đã thay đổi, vui lòng thử lại" });
        await session.abortTransaction();
        session.endSession();
        return;
      }

      // Create Ledger entries
      const feeAmt = order.platformFeeAmount || 0;
      const sellerPayable = order.totalAmount - feeAmt;

      await Ledger.create([{
        transactionId: order.paymentId,
        orderId: order._id,
        orderCode: order.orderCode,
        description: `Thanh toán online thành công cho đơn hàng ${order.orderCode}`,
        entries: [
          { account: "PLATFORM_CASH", type: "DR", amount: order.totalAmount },
          { account: "BUYER_CLEARING", type: "CR", amount: order.totalAmount },
          { account: "BUYER_CLEARING", type: "DR", amount: feeAmt },
          { account: "PLATFORM_REVENUE", type: "CR", amount: feeAmt },
          { account: "BUYER_CLEARING", type: "DR", amount: sellerPayable },
          { account: "SELLER_PAYABLE", type: "CR", amount: sellerPayable },
        ]
      }], { session });

      // Deduct stock for all purchased items
      for (const item of order.items) {
        const product = await Product.findById(item.productId).session(session);
        if (product) {
          product.quantity = Math.max(0, product.quantity - item.quantity);
          if (product.quantity === 0) {
            product.status = "sold";
          } else {
            product.status = "active";
          }
          product.reservedUntil = null;
          product.reservedByOrderId = null;
          await product.save({ session });
        }
      }

      // Notify buyer
      await Notification.create([{
        userId,
        type: "order",
        title: "Thanh toán thành công",
        message: `Đơn hàng ${order.orderCode} đã thanh toán thành công. Shop sẽ chuẩn bị hàng.`,
      }], { session });

      // Notify sellers
      const sellerIds = Array.from(new Set(order.items.map((it) => it.sellerId.toString())));
      for (const sId of sellerIds) {
        await Notification.create([{
          userId: sId,
          type: "order",
          title: "Đơn hàng mới đã thanh toán",
          message: `Đơn hàng #${order.orderCode} đã thanh toán và chờ giao hàng. Hãy chuẩn bị hàng và tạo vận đơn!`,
        }], { session });
      }

      await session.commitTransaction();
      session.endSession();
      res.json({ order: mapOrder(order) });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      console.error("[payments] checkout error:", err);
      res.status(500).json({ error: "Lỗi hệ thống" });
    }
  } catch (err) {
    console.error("[payments] checkout outer error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── POST /api/payments/:code/cod-collect ──────────────────────────────────────────
// Mock COD payment collection by carrier/admin
export const codCollect = async (req: Request, res: Response): Promise<void> => {
  try {
    const code = req.params.code as string;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(code);
    const filter = isObjectId ? { $or: [{ _id: code }, { orderCode: code }] } : { orderCode: code };

    // Actor authorization: Only Admin or mock shipper (we'll just use Admin for MVP)
    const isAdmin = req.user?.roles?.includes("admin");
    if (!isAdmin) {
      res.status(403).json({ error: "Chỉ Admin/Đơn vị vận chuyển mới có quyền thu tiền COD" });
      return;
    }

    const order = await Order.findOne(filter);
    if (!order) {
      res.status(404).json({ error: "Không tìm thấy đơn hàng" });
      return;
    }

    if (order.paymentMethod?.toUpperCase() !== "COD") {
      res.status(400).json({ error: "Đơn hàng này không phải là đơn COD" });
      return;
    }

    if (order.status !== "DELIVERED" && order.status !== "COMPLETED") {
      res.status(400).json({ error: "Chỉ thu tiền COD khi đơn hàng đã giao (DELIVERED/COMPLETED)" });
      return;
    }

    // Idempotency check using Ledger
    const existingLedger = await Ledger.findOne({ transactionId: `COD-COLLECT-${order.orderCode}` });
    if (existingLedger || order.paidAt) {
      res.json({ message: "Đã thu tiền COD cho đơn hàng này trước đó", order: mapOrder(order) });
      return;
    }

    const feeAmt = order.platformFeeAmount || 0;
    const sellerPayable = order.totalAmount - feeAmt;

    await Ledger.create({
      transactionId: `COD-COLLECT-${order.orderCode}`,
      orderId: order._id,
      orderCode: order.orderCode,
      description: `Thu tiền COD cho đơn hàng ${order.orderCode}`,
      entries: [
        { account: "PLATFORM_CASH", type: "DR", amount: order.totalAmount },
        { account: "BUYER_CLEARING", type: "CR", amount: order.totalAmount },
        
        { account: "BUYER_CLEARING", type: "DR", amount: feeAmt },
        { account: "PLATFORM_REVENUE", type: "CR", amount: feeAmt },
        
        { account: "BUYER_CLEARING", type: "DR", amount: sellerPayable },
        { account: "SELLER_PAYABLE", type: "CR", amount: sellerPayable },
      ]
    });

    order.paidAt = new Date();
    order.paymentId = `COD-COLLECT-${order.orderCode}`;
    
    order.statusHistory.push({
      status: order.status,
      by: req.user?.email || "admin",
      at: new Date(),
      reason: "Đã ghi nhận thu tiền mặt (COD) thành công",
    });

    await order.save();

    res.json({ 
      order: mapOrder(order),
      message: "Thu tiền COD thành công và đã ghi nhận vào sổ cái (ledger)."
    });
  } catch (err) {
    console.error("codCollect error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};
