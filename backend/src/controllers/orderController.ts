import { Request, Response } from "express";
import { Order, VALID_TRANSITIONS, OrderStatus, IOrder } from "../models/Order";
import { Cart } from "../models/Cart";
import { CartItem } from "../models/CartItem";
import { Product } from "../models/Product";
import { Notification } from "../models/Notification";
import { PlatformFeeConfig } from "../models/PlatformFeeConfig";
import { Ledger } from "../models/Ledger";

// ── Helper: Map Order to frontend ApiOrder shape ──────────────────────────────
export const mapOrder = (o: any) => ({
  _id: o._id.toString(),
  orderCode: o.orderCode,
  buyerId: o.buyerId ? o.buyerId.toString() : "",
  items: (o.items || []).map((it: any) => ({
    productId: it.productId ? it.productId.toString() : "",
    sellerId: it.sellerId ? it.sellerId.toString() : "",
    productName: it.productName,
    productImageUrl: it.productImageUrl || "",
    unitPrice: it.unitPrice,
    quantity: it.quantity,
    conditionSnapshot: it.conditionSnapshot,
    sellerAmount: it.sellerAmount,
  })),
  subtotal: o.subtotal,
  shippingFee: o.shippingFee,
  platformFeeRate: o.platformFeeRate,
  platformFeeAmount: o.platformFeeAmount,
  sellerAmount: o.sellerAmount,
  discount: o.discount,
  totalAmount: o.totalAmount,
  status: o.status,
  statusHistory: (o.statusHistory || []).map((h: any) => ({
    status: h.status,
    by: h.by,
    at: h.at ? new Date(h.at).toISOString() : new Date().toISOString(),
    reason: h.reason,
  })),
  paymentMethod: o.paymentMethod || "",
  paymentId: o.paymentId || "",
  paidAt: o.paidAt ? new Date(o.paidAt).toISOString() : null,
  shippingName: o.shippingName || "",
  shippingPhone: o.shippingPhone || "",
  shippingAddress: o.shippingAddress || "",
  trackingNumber: o.trackingNumber || "",
  shippingProvider: o.shippingProvider || "",
  trackingUrl: o.trackingUrl || "",
  pickupInfo: o.pickupInfo || null,
  shippedAt: o.shippedAt ? new Date(o.shippedAt).toISOString() : null,
  estimatedDeliveryAt: o.estimatedDeliveryAt
    ? new Date(o.estimatedDeliveryAt).toISOString()
    : null,
  deliveredAt: o.deliveredAt ? new Date(o.deliveredAt).toISOString() : null,
  idempotencyKey: o.idempotencyKey,
  createdAt: o.createdAt
    ? new Date(o.createdAt).toISOString()
    : new Date().toISOString(),
});

// ── GET /api/orders ───────────────────────────────────────────────────────────
// Buyer gets all their placed orders
export const getOrders = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { status } = req.query;

    const filter: any = { buyerId: userId };
    if (status && typeof status === "string") {
      filter.status = status.toUpperCase();
    }

    const orders = await Order.find(filter).sort({ createdAt: -1 }).lean();
    const mapped = orders.map(mapOrder);

    res.json({ orders: mapped, total: mapped.length });
  } catch (err) {
    console.error("[orders] getOrders error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── GET /api/orders/seller ────────────────────────────────────────────────────
// Seller gets all orders containing their sold items
export const getSellerOrders = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { status } = req.query;

    const filter: any = { "items.sellerId": userId };
    if (status && typeof status === "string") {
      filter.status = status.toUpperCase();
    }

    const orders = await Order.find(filter).sort({ createdAt: -1 }).lean();
    const mapped = orders.map(mapOrder);

    res.json({ orders: mapped, total: mapped.length });
  } catch (err) {
    console.error("[orders] getSellerOrders error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── GET /api/orders/:id ───────────────────────────────────────────────────────
// Get order details by orderCode or ObjectId
export const getOrderById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = req.user!.id;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    const filter = isObjectId ? { $or: [{ _id: id }, { orderCode: id }] } : { orderCode: id };

    const order = await Order.findOne(filter).lean();
    if (!order) {
      res.status(404).json({ error: "Không tìm thấy đơn hàng" });
      return;
    }

    // Access control: buyer, seller of an item, or admin
    const isBuyer = order.buyerId.toString() === userId;
    const isSeller = order.items.some((it: any) => it.sellerId.toString() === userId);
    const isAdmin = req.user?.roles?.includes("admin");

    if (!isBuyer && !isSeller && !isAdmin) {
      res.status(403).json({ error: "Bạn không có quyền truy cập đơn hàng này" });
      return;
    }

    res.json({ order: mapOrder(order) });
  } catch (err) {
    console.error("[orders] getOrderById error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── POST /api/orders ──────────────────────────────────────────────────────────
// Creates an order from checked cart items or direct items
export const createOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const {
      shippingName,
      shippingPhone,
      shippingAddress,
      paymentMethod = "COD",
      idempotencyKey,
      items: directItems,
    } = req.body;

    // Idempotency check
    if (idempotencyKey) {
      const existing = await Order.findOne({ idempotencyKey });
      if (existing) {
        res.json({ order: mapOrder(existing) });
        return;
      }
    }

    interface ProcessItem {
      productId: string;
      quantity: number;
      cartItemId?: string;
    }

    let itemsToProcess: ProcessItem[] = [];

    if (Array.isArray(directItems) && directItems.length > 0) {
      itemsToProcess = directItems.map((it: any) => ({
        productId: it.productId || it.id,
        quantity: Math.max(1, parseInt(it.quantity || it.qty || 1, 10)),
      }));
    } else {
      // Find user cart and checked items
      const cart = await Cart.findOne({ userId });
      if (!cart) {
        res.status(400).json({ error: "Giỏ hàng trống" });
        return;
      }

      const checkedItems = await CartItem.find({ cartId: cart._id, checked: true });
      if (checkedItems.length === 0) {
        res.status(400).json({ error: "Không có sản phẩm nào được chọn trong giỏ hàng" });
        return;
      }

      itemsToProcess = checkedItems.map((ci) => ({
        productId: ci.productId.toString(),
        quantity: ci.quantity,
        cartItemId: ci._id.toString(),
      }));
    }

    // Validate each product
    const orderItems: any[] = [];
    const productsToUpdate: any[] = [];
    
    const feeConfig = await PlatformFeeConfig.findOne({ active: true }).sort({ effectiveFrom: -1 }).lean();
    if (!feeConfig) {
      res.status(500).json({ error: "Lỗi cấu hình: Chưa có biểu phí nền tảng" });
      return;
    }
    const platformFeeRate = feeConfig.rate;

    for (const item of itemsToProcess) {
      const product = await Product.findById(item.productId).populate("sellerId");
      if (!product) {
        res.status(404).json({ error: `Sản phẩm không tồn tại: ${item.productId}` });
        return;
      }

      if (product.status !== "active") {
        res.status(400).json({
          error: `Sản phẩm "${product.title}" hiện không còn mở bán (${product.status})`,
        });
        return;
      }

      if (product.quantity < item.quantity) {
        res.status(400).json({
          error: `Sản phẩm "${product.title}" chỉ còn lại ${product.quantity} cái`,
        });
        return;
      }

      if (product.sellerId?._id?.toString() === userId || (product.sellerId as any).toString() === userId) {
        res.status(400).json({
          error: `Bạn không thể tự mua sản phẩm của chính mình ("${product.title}")`,
        });
        return;
      }

      const sellerId = product.sellerId?._id ?? product.sellerId;
      const unitPrice = product.price;
      const quantity = item.quantity;
      const sellerAmount = unitPrice * quantity * (1 - platformFeeRate);

      orderItems.push({
        productId: product._id,
        sellerId,
        productName: product.title,
        productImageUrl: product.coverImage || "",
        unitPrice,
        quantity,
        conditionSnapshot: product.condition,
        sellerAmount,
      });

      productsToUpdate.push({ product, quantity });
    }

    const subtotal = orderItems.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);
    const shippingFee = 30000;
    const platformFeeAmount = Math.round(subtotal * platformFeeRate);
    const totalSellerAmount = subtotal - platformFeeAmount;
    const totalAmount = subtotal + shippingFee;

    const orderCode = `ORD-${Date.now().toString().slice(-8)}`;
    const isCod = paymentMethod.toUpperCase() === "COD";

    const initialStatus: OrderStatus = isCod ? "CONFIRMED" : "PENDING_PAYMENT";
    const statusReason = isCod ? "Đặt hàng thanh toán khi nhận hàng (COD)" : "Chờ thanh toán đơn hàng";

    const order = await Order.create({
      orderCode,
      buyerId: userId,
      items: orderItems,
      subtotal,
      shippingFee,
      platformFeeRate,
      platformFeeAmount,
      sellerAmount: totalSellerAmount,
      discount: 0,
      totalAmount,
      status: initialStatus,
      statusHistory: [{ status: initialStatus, by: "system", at: new Date(), reason: statusReason }],
      paymentMethod,
      shippingName: shippingName || "",
      shippingPhone: shippingPhone || "",
      shippingAddress: shippingAddress || "",
      idempotencyKey: idempotencyKey || `auto-${Date.now()}`,
    });

    // Handle stock or reservations based on payment method
    for (const { product, quantity } of productsToUpdate) {
      if (isCod) {
        // COD confirms immediately -> deduct stock
        product.quantity = Math.max(0, product.quantity - quantity);
        if (product.quantity === 0) {
          product.status = "sold";
        }
      } else {
        // Online payment -> temporarily reserve for 30 minutes
        product.status = "reserved";
        product.reservedUntil = new Date(Date.now() + 30 * 60 * 1000);
        product.reservedByOrderId = order._id;
      }
      await product.save();
    }

    // Clean up cart
    const cartItemIds = itemsToProcess
      .map((it) => it.cartItemId)
      .filter((id): id is string => Boolean(id));

    if (cartItemIds.length > 0) {
      await CartItem.deleteMany({ _id: { $in: cartItemIds } });
    } else {
      // Also delete any cart items matching ordered products for this user
      const userCart = await Cart.findOne({ userId });
      if (userCart) {
        const prodIds = itemsToProcess.map((it) => it.productId);
        await CartItem.deleteMany({ cartId: userCart._id, productId: { $in: prodIds } });
      }
    }

    // Send notifications
    await Notification.create({
      userId,
      type: "order",
      title: isCod ? "Đơn hàng đã được xác nhận (COD)" : "Đơn hàng đã được tạo",
      message: isCod
        ? `Đơn hàng ${orderCode} đã được tạo thành công (COD). Người bán sẽ chuẩn bị hàng.`
        : `Đơn hàng ${orderCode} đã được tạo thành công. Vui lòng thanh toán để xác nhận.`,
    });

    if (isCod) {
      // Notify sellers
      const sellerIds = Array.from(new Set(orderItems.map((it) => it.sellerId.toString())));
      for (const sId of sellerIds) {
        await Notification.create({
          userId: sId,
          type: "order",
          title: "Đơn hàng mới cần chuẩn bị (COD)",
          message: `Bạn có đơn hàng mới #${orderCode} (COD). Hãy chuẩn bị và tạo vận đơn vận chuyển!`,
        });
      }
    }

    res.status(201).json({ order: mapOrder(order) });
  } catch (err) {
    console.error("[orders] createOrder error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── PATCH /api/orders/:code/status ────────────────────────────────────────────
// Transitions order status and handles inventory restoration on cancellation
export const updateOrderStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.params;
    const { status, reason } = req.body;
    const userId = req.user!.id;

    if (!status) {
      res.status(400).json({ error: "Thiếu trạng thái mới" });
      return;
    }

    const codeStr = code as string;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(codeStr);
    const filter = isObjectId ? { $or: [{ _id: codeStr }, { orderCode: codeStr }] } : { orderCode: codeStr };

    const order = await Order.findOne(filter);
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
        error: `Không thể chuyển từ trạng thái ${currentStatus} sang ${nextStatus}`,
      });
      return;
    }

    // If cancelling, restore inventory and release holds
    if (nextStatus === "CANCELLED") {
      for (const item of order.items) {
        const prod = await Product.findById(item.productId);
        if (prod) {
          if (prod.reservedByOrderId?.toString() === order._id.toString()) {
            // Revert reservation
            prod.status = "active";
            prod.reservedUntil = null;
            prod.reservedByOrderId = null;
          } else if (
            currentStatus === "CONFIRMED" ||
            currentStatus === "PAID" ||
            currentStatus === "PACKING" ||
            currentStatus === "SHIPPING"
          ) {
            // Restore quantity
            prod.quantity += item.quantity;
            if (prod.status === "sold" || prod.status === "reserved") {
              prod.status = "active";
            }
          }
          await prod.save();
        }
      }

      // Notify buyer
      await Notification.create({
        userId: order.buyerId,
        type: "order",
        title: "Đơn hàng đã hủy",
        message: `Đơn hàng #${order.orderCode} đã bị hủy.${reason ? ` Lý do: ${reason}` : ""}`,
      });

      // Notify sellers
      const sellerIds = Array.from(new Set(order.items.map((it) => it.sellerId.toString())));
      for (const sId of sellerIds) {
        await Notification.create({
          userId: sId,
          type: "order",
          title: "Đơn hàng đã bị hủy",
          message: `Đơn hàng #${order.orderCode} đã bị hủy bởi người mua hoặc hệ thống.`,
        });
      }
    }

    // Handling delivery tracking steps
    if (nextStatus === "DELIVERING") {
      order.shippingEvents.push({
        status: "DELIVERING",
        description: "Bưu tá đang trên đường giao hàng đến bạn",
        timestamp: new Date(),
        location: order.shippingAddress,
      });
    } else if (nextStatus === "DELIVERED") {
      order.deliveredAt = new Date();
      order.shippingEvents.push({
        status: "DELIVERED",
        description: "Giao hàng thành công",
        timestamp: new Date(),
        location: order.shippingAddress,
      });

      // Notify buyer
      await Notification.create({
        userId: order.buyerId,
        type: "order",
        title: "Đơn hàng đã giao thành công",
        message: `Đơn hàng #${order.orderCode} đã được giao thành công! Bạn có thể vào xem và đánh giá sản phẩm.`,
      });
    } else if (nextStatus === "COMPLETED") {
      // Notify sellers that transaction is finalized
      const sellerIds = Array.from(new Set(order.items.map((it) => it.sellerId.toString())));
      for (const sId of sellerIds) {
        await Notification.create({
          userId: sId,
          type: "order",
          title: "Đơn hàng đã hoàn tất",
          message: `Đơn hàng #${order.orderCode} đã hoàn tất. Doanh thu đã được ghi nhận.`,
        });
      }
    }

    order.status = nextStatus;
    order.statusHistory.push({
      status: nextStatus,
      by: req.user?.email ?? "user",
      at: new Date(),
      reason,
    });

    await order.save();

    res.json({ order: mapOrder(order) });
  } catch (err) {
    console.error("[orders] updateOrderStatus error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── POST /api/orders/:code/shipment ───────────────────────────────────────────
// Seller creates a shipping label / shipment for an order
export const createOrderShipment = async (req: Request, res: Response): Promise<void> => {
  try {
    const code = req.params.code as string;
    const userId = req.user!.id;
    const { pickup = {} } = req.body;

    const isObjectId = /^[0-9a-fA-F]{24}$/.test(code);
    const filter = isObjectId ? { $or: [{ _id: code }, { orderCode: code }] } : { orderCode: code };

    const order = await Order.findOne(filter);
    if (!order) {
      res.status(404).json({ error: "Không tìm thấy đơn hàng" });
      return;
    }

    // Authorization: seller of an item in the order or admin
    const isSeller = order.items.some((it) => it.sellerId.toString() === userId);
    const isAdmin = req.user?.roles?.includes("admin");

    if (!isSeller && !isAdmin) {
      res.status(403).json({ error: "Bạn không có quyền tạo vận đơn cho đơn hàng này" });
      return;
    }

    // Check status
    if (order.status === "SHIPPING" || order.status === "DELIVERING" || order.status === "DELIVERED") {
      res.status(400).json({ error: "Đơn hàng này đã được tạo vận đơn trước đó" });
      return;
    }

    if (order.status === "CANCELLED") {
      res.status(400).json({ error: "Không thể tạo vận đơn cho đơn hàng đã hủy" });
      return;
    }

    // Generate tracking info
    const randomDigits = Math.floor(100000000 + Math.random() * 900000000);
    const trackingNumber = `GHTK${randomDigits}`;
    const provider = "Giao hàng tiết kiệm";
    const trackingUrl = `https://i.ghtk.vn/${trackingNumber}`;
    const shippedAt = new Date();
    const estimatedDeliveryAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days

    const pickupAddressStr = [pickup.address, pickup.ward, pickup.district, pickup.province]
      .filter(Boolean)
      .join(", ") || pickup.address || "Kho người bán";

    const initialEvents = [
      {
        status: "CREATED",
        description: "Đã tạo vận đơn trên hệ thống giao hàng",
        timestamp: new Date(),
        location: pickupAddressStr,
      },
      {
        status: "PICKED_UP",
        description: "Bưu tá đã lấy hàng thành công từ người bán",
        timestamp: new Date(Date.now() + 1000 * 60 * 15),
        location: pickup.province || "Bưu cục gửi",
      },
      {
        status: "IN_TRANSIT",
        description: "Kiện hàng đang trung chuyển giữa các bưu cục",
        timestamp: new Date(Date.now() + 1000 * 60 * 45),
        location: "Trung tâm phân loại",
      },
    ];

    order.status = "SHIPPING";
    order.shippingProvider = provider;
    order.trackingNumber = trackingNumber;
    order.trackingUrl = trackingUrl;
    order.pickupInfo = pickup;
    order.shippedAt = shippedAt;
    order.estimatedDeliveryAt = estimatedDeliveryAt;
    order.shippingEvents = initialEvents;

    order.statusHistory.push({
      status: "SHIPPING",
      by: req.user?.email || "seller",
      at: new Date(),
      reason: `Đã tạo vận đơn ${trackingNumber} qua ${provider}`,
    });

    await order.save();

    // Notify buyer
    await Notification.create({
      userId: order.buyerId,
      type: "order",
      title: "Đơn hàng đang được giao",
      message: `Đơn hàng #${order.orderCode} đã được giao cho đơn vị vận chuyển (${provider} - Mã: ${trackingNumber}).`,
    });

    const shipment = {
      id: order._id.toString(),
      orderId: order.orderCode,
      provider: order.shippingProvider,
      trackingNumber: order.trackingNumber,
      trackingUrl: order.trackingUrl,
      status: "IN_TRANSIT" as const,
      shippedAt: order.shippedAt.toISOString(),
      estimatedDeliveryAt: order.estimatedDeliveryAt.toISOString(),
      events: order.shippingEvents.map((e) => ({
        status: e.status,
        description: e.description,
        timestamp: e.timestamp.toISOString(),
        location: e.location,
      })),
    };

    res.status(201).json({ shipment });
  } catch (err) {
    console.error("[orders] createOrderShipment error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── GET /api/orders/:code/shipment ──────────────────────────────────────────
// Retrieves shipment and live delivery tracking timeline
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

    let shipmentStatus: "PENDING" | "CREATED" | "PICKED_UP" | "IN_TRANSIT" | "DELIVERING" | "DELIVERED" | "CANCELLED" = "PENDING";
    if (o.status === "DELIVERED" || o.status === "COMPLETED") {
      shipmentStatus = "DELIVERED";
    } else if (o.status === "DELIVERING") {
      shipmentStatus = "DELIVERING";
    } else if (o.status === "SHIPPING") {
      shipmentStatus = "IN_TRANSIT";
    } else if (o.status === "PACKING") {
      shipmentStatus = "PICKED_UP";
    } else if (o.status === "CANCELLED") {
      shipmentStatus = "CANCELLED";
    } else if (o.trackingNumber) {
      shipmentStatus = "CREATED";
    }

    // Assemble events
    let events = (o.shippingEvents || []).map((e: any) => ({
      status: e.status,
      description: e.description,
      timestamp: e.timestamp ? new Date(e.timestamp).toISOString() : new Date().toISOString(),
      location: e.location || "",
    }));

    // If no explicit events saved yet, provide realistic timeline based on status
    if (events.length === 0 && o.trackingNumber) {
      const baseTime = o.shippedAt ? new Date(o.shippedAt) : new Date(o.createdAt);
      events = [
        {
          status: "CREATED",
          description: "Đã tạo vận đơn trên hệ thống GHTK",
          timestamp: baseTime.toISOString(),
          location: o.pickupInfo?.address || "Kho người bán",
        },
        {
          status: "PICKED_UP",
          description: "Bưu tá đã nhận hàng từ người bán",
          timestamp: new Date(baseTime.getTime() + 15 * 60 * 1000).toISOString(),
          location: o.pickupInfo?.province || "Bưu cục trung tâm",
        },
        {
          status: "IN_TRANSIT",
          description: "Đang trung chuyển qua hệ thống kho vận",
          timestamp: new Date(baseTime.getTime() + 45 * 60 * 1000).toISOString(),
          location: "Kho chia chọn",
        },
      ];

      if (shipmentStatus === "DELIVERING" || shipmentStatus === "DELIVERED") {
        events.push({
          status: "DELIVERING",
          description: "Shipper đang giao hàng đến bạn",
          timestamp: new Date(baseTime.getTime() + 24 * 3600 * 1000).toISOString(),
          location: o.shippingAddress,
        });
      }

      if (shipmentStatus === "DELIVERED") {
        events.push({
          status: "DELIVERED",
          description: "Giao hàng thành công",
          timestamp: o.deliveredAt
            ? new Date(o.deliveredAt).toISOString()
            : new Date(baseTime.getTime() + 28 * 3600 * 1000).toISOString(),
          location: o.shippingAddress,
        });
      }
    }

    const shipment = {
      id: o._id.toString(),
      orderId: o.orderCode,
      provider: o.shippingProvider || "Giao hàng tiết kiệm",
      trackingNumber: o.trackingNumber || "",
      trackingUrl: o.trackingUrl || (o.trackingNumber ? `https://i.ghtk.vn/${o.trackingNumber}` : ""),
      status: shipmentStatus,
      shippedAt: o.shippedAt ? new Date(o.shippedAt).toISOString() : undefined,
      estimatedDeliveryAt: o.estimatedDeliveryAt
        ? new Date(o.estimatedDeliveryAt).toISOString()
        : new Date(Date.now() + 86400000 * 2).toISOString(),
      deliveredAt: o.deliveredAt ? new Date(o.deliveredAt).toISOString() : undefined,
      events,
    };

    res.json({ shipment });
  } catch (err) {
    console.error("[orders] getOrderShipment error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── POST /api/orders/:code/cod-collect ─────────────────────────────────────────
export const collectCOD = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.params;
    const order = await Order.findOne({ orderCode: code });
    if (!order) {
      res.status(404).json({ error: "Không tìm thấy đơn hàng" });
      return;
    }

    if (order.paymentMethod?.toUpperCase() !== "COD") {
      res.status(400).json({ error: "Đơn hàng này không phải thanh toán COD" });
      return;
    }

    if (order.status !== "DELIVERED" && order.status !== "COMPLETED") {
      res.status(400).json({ error: "Chỉ thu tiền COD khi đơn hàng đã giao (DELIVERED/COMPLETED)" });
      return;
    }

    // Check if COD already collected (idempotency check using Ledger)
    const existingLedger = await Ledger.findOne({ transactionId: `COD-COLLECT-${order.orderCode}` });
    if (existingLedger) {
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

    res.json({ message: "Ghi nhận thu tiền COD thành công", order: mapOrder(order) });
  } catch (err) {
    console.error("[orders] collectCOD error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

