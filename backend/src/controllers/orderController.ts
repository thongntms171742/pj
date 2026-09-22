import { Request, Response } from "express";
import { Order, VALID_TRANSITIONS, OrderStatus } from "../models/Order";
import { Cart } from "../models/Cart";
import { CartItem } from "../models/CartItem";
import { Product } from "../models/Product";
import { Notification } from "../models/Notification";

// ── GET /api/orders ───────────────────────────────────────────────────────────
export const getOrders = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { status } = req.query;

    const filter: any = { buyerId: userId };
    if (status && typeof status === "string") {
      filter.status = status.toUpperCase();
    }

    const orders = await Order.find(filter).sort({ createdAt: -1 }).lean();

    const mapped = orders.map((o) => ({
      _id: o._id.toString(),
      orderCode: o.orderCode,
      buyerId: o.buyerId.toString(),
      items: o.items.map((it) => ({
        productId: it.productId.toString(),
        sellerId: it.sellerId.toString(),
        productName: it.productName,
        productImageUrl: it.productImageUrl,
        unitPrice: it.unitPrice,
        quantity: it.quantity,
        conditionSnapshot: it.conditionSnapshot,
        sellerAmount: it.sellerAmount,
      })),
      subtotal: o.subtotal,
      shippingFee: o.shippingFee,
      platformFee: o.platformFee,
      discount: o.discount,
      totalAmount: o.totalAmount,
      status: o.status,
      statusHistory: o.statusHistory,
      paymentMethod: o.paymentMethod,
      paymentId: o.paymentId,
      paidAt: o.paidAt?.toISOString() ?? null,
      shippingName: o.shippingName,
      shippingPhone: o.shippingPhone,
      shippingAddress: o.shippingAddress,
      trackingNumber: o.trackingNumber,
      shippingProvider: o.shippingProvider,
      idempotencyKey: o.idempotencyKey,
      createdAt: (o as any).createdAt
        ? new Date((o as any).createdAt).toISOString()
        : new Date().toISOString(),
    }));

    res.json({ orders: mapped, total: mapped.length });
  } catch (err) {
    console.error("[orders] getOrders error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── GET /api/orders/:id ───────────────────────────────────────────────────────
export const getOrderById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const filter: any[] = [{ orderCode: id }];
    if (id.match(/^[0-9a-fA-F]{24}$/)) filter.push({ _id: id });
    const order = await Order.findOne({ $or: filter }).lean();

    if (!order) {
      res.status(404).json({ error: "Không tìm thấy đơn hàng" });
      return;
    }

    res.json({ order });
  } catch (err) {
    console.error("[orders] getOrderById error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── POST /api/orders ──────────────────────────────────────────────────────────
// Creates an order from the user's checked cart items.
export const createOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { shippingName, shippingPhone, shippingAddress, paymentMethod, idempotencyKey } = req.body;

    // Idempotency check
    if (idempotencyKey) {
      const existing = await Order.findOne({ idempotencyKey });
      if (existing) {
        res.json({ order: existing });
        return;
      }
    }

    // Find checked cart items
    const cart = await Cart.findOne({ userId });
    if (!cart) {
      res.status(400).json({ error: "Giỏ hàng trống" });
      return;
    }

    const checkedItems = await CartItem.find({ cartId: cart._id, checked: true }).populate({
      path: "productId",
      populate: { path: "sellerId", select: "name email sellerProfile" },
    });

    if (checkedItems.length === 0) {
      res.status(400).json({ error: "Không có sản phẩm nào được chọn trong giỏ hàng" });
      return;
    }

    // Build order items
    const orderItems = checkedItems.map((ci: any) => {
      const prod = ci.productId;
      const seller = prod.sellerId;
      return {
        productId: prod._id,
        sellerId: seller?._id ?? prod.sellerId,
        productName: prod.title,
        productImageUrl: prod.coverImage,
        unitPrice: ci.priceSnapshot,
        quantity: ci.quantity,
        conditionSnapshot: prod.condition,
        sellerAmount: ci.priceSnapshot * ci.quantity * 0.9, // 10% platform fee
      };
    });

    const subtotal = orderItems.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);
    const shippingFee = 30000;
    const platformFee = Math.round(subtotal * 0.1);
    const totalAmount = subtotal + shippingFee;

    const orderCode = `ORD-${Date.now().toString().slice(-8)}`;

    const order = await Order.create({
      orderCode,
      buyerId: userId,
      items: orderItems,
      subtotal,
      shippingFee,
      platformFee,
      discount: 0,
      totalAmount,
      status: "PENDING_PAYMENT",
      statusHistory: [{ status: "PENDING_PAYMENT", by: "system", at: new Date() }],
      paymentMethod: paymentMethod || "COD",
      shippingName: shippingName || "",
      shippingPhone: shippingPhone || "",
      shippingAddress: shippingAddress || "",
      idempotencyKey: idempotencyKey || `auto-${Date.now()}`,
    });

    // Remove checked items from cart
    await CartItem.deleteMany({
      _id: { $in: checkedItems.map((ci) => ci._id) },
    });

    // Create notification
    await Notification.create({
      userId,
      type: "order",
      title: "Đơn hàng đã được tạo",
      message: `Đơn hàng ${orderCode} đã được tạo thành công. Vui lòng thanh toán.`,
    });

    res.status(201).json({
      order: {
        _id: order._id.toString(),
        orderCode: order.orderCode,
        buyerId: order.buyerId.toString(),
        items: order.items.map((it) => ({
          productId: it.productId.toString(),
          sellerId: it.sellerId.toString(),
          productName: it.productName,
          productImageUrl: it.productImageUrl,
          unitPrice: it.unitPrice,
          quantity: it.quantity,
          conditionSnapshot: it.conditionSnapshot,
          sellerAmount: it.sellerAmount,
        })),
        subtotal: order.subtotal,
        shippingFee: order.shippingFee,
        platformFee: order.platformFee,
        discount: order.discount,
        totalAmount: order.totalAmount,
        status: order.status,
        statusHistory: order.statusHistory,
        paymentMethod: order.paymentMethod,
        shippingName: order.shippingName,
        shippingPhone: order.shippingPhone,
        shippingAddress: order.shippingAddress,
        createdAt: (order as any).createdAt?.toISOString() ?? new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[orders] createOrder error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── PATCH /api/orders/:code/status ────────────────────────────────────────────
export const updateOrderStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.params;
    const { status, reason } = req.body;

    if (!status) {
      res.status(400).json({ error: "Thiếu trạng thái mới" });
      return;
    }

    const codeStr = code as string;
    const orFilter: any[] = [{ orderCode: codeStr }];
    if (codeStr.match(/^[0-9a-fA-F]{24}$/)) orFilter.push({ _id: codeStr });
    const order = await Order.findOne({ $or: orFilter });

    if (!order) {
      res.status(404).json({ error: "Không tìm thấy đơn hàng" });
      return;
    }

    // Validate transition
    const currentStatus = order.status as OrderStatus;
    const nextStatus = status as OrderStatus;
    const allowed = VALID_TRANSITIONS[currentStatus];

    if (!allowed || !allowed.includes(nextStatus)) {
      res.status(422).json({
        error: `Không thể chuyển từ ${currentStatus} sang ${nextStatus}`,
      });
      return;
    }

    order.status = nextStatus;
    order.statusHistory.push({
      status: nextStatus,
      by: req.user?.email ?? "system",
      at: new Date(),
      reason,
    });

    await order.save();

    res.json({
      order: {
        _id: order._id.toString(),
        orderCode: order.orderCode,
        status: order.status,
        statusHistory: order.statusHistory,
      },
    });
  } catch (err) {
    console.error("[orders] updateOrderStatus error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── GET /api/orders/:code/shipment ──────────────────────────────────────────
export const getOrderShipment = async (req: Request, res: Response): Promise<void> => {
  try {
    const code = req.params.code as string;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(code);
    const filter = isObjectId ? { $or: [{ _id: code }, { orderCode: code }] } : { orderCode: code };

    const order = await Order.findOne(filter).lean();
    if (!order) {
      res.status(404).json({ error: "Không tìm thấy đơn hàng" });
      return;
    }

    const o = order as any;
    const shipment = {
      _id: o._id.toString(),
      orderCode: o.orderCode,
      provider: o.shippingProvider || "Giao hàng tiết kiệm",
      providerShipmentId: "GHTK-" + o.orderCode,
      trackingNumber: o.trackingNumber || "TRK-" + o.orderCode,
      status:
        o.status === "DELIVERED" || o.status === "COMPLETED"
          ? "DELIVERED"
          : o.status === "DELIVERING"
          ? "DELIVERING"
          : o.status === "SHIPPING"
          ? "IN_TRANSIT"
          : "CREATED",
      shippingFee: o.shippingFee ?? 30000,
      estimatedDeliveryAt: new Date(Date.now() + 86400000 * 2).toISOString(),
      trackingUrl: "#",
    };

    res.json({ shipment });
  } catch (err) {
    console.error("[orders] getOrderShipment error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

