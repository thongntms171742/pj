import { Request, Response } from "express";
import { Types } from "mongoose";
import { Order, VALID_TRANSITIONS, OrderStatus } from "../models/Order";
import { Cart } from "../models/Cart";
import { CartItem } from "../models/CartItem";
import { Notification } from "../models/Notification";
import {
  safelyBuildPricedDesign,
  buildPricedDesign,
} from "../services/catalogService";
import { reserveStock, restoreStock, restoreTreeStock } from "../services/inventoryService";
import { SHIPPING_FEE, SERVICE_PROVINCE_ID } from "../config/business";
import {
  sendError,
  ErrorCode,
  handleInternalError,
} from "../utils/errors";
import type { DesignConfig, DeliveryOption, ResolvedAccessoryRef, ResolvedVariantRef, ResolvedStyleRef } from "../models/TreeDesign";
import type { PriceBreakdown } from "../services/pricingService";

// ── Helpers ──────────────────────────────────────────────────────────────────
function genOrderCode(): string {
  return `BYC-${Date.now().toString().slice(-8)}`;
}

async function buildOrderItems(opts: {
  buyerId: string;
  paymentMethod: string;
  items: Array<{ config?: DesignConfig; designId?: string; quantity?: number }>;
}) {
  const built: any[] = [];
  const stockToReserve: Array<{ refId: Types.ObjectId; kind: "TREE" | "ACCESSORY"; quantity: number }> = [];
  let subtotal = 0;
  let decorationFeeTotal = 0;
  let productionDaysMax = 0;
  let hasPersonalization = false;

  for (const entry of opts.items) {
    let cfg = entry.config;
    if (!cfg && entry.designId) {
      const { TreeDesign } = await import("../models/TreeDesign");
      const doc = await TreeDesign.findById(entry.designId).lean();
      if (!doc) continue;
      cfg = doc.config;
    }
    if (!cfg) continue;

    const { pricing, catalog } = await buildPricedDesign(cfg);
    const quantity = Math.max(1, parseInt(String(entry.quantity ?? 1), 10) || 1);

    // Resolve a stock line per (tree + each non-loop accessory).
    stockToReserve.push({
      refId: new Types.ObjectId(String(catalog.tree._id)),
      kind: "TREE",
      quantity,
    });
    for (const line of pricing.lines) {
      stockToReserve.push({
        refId: new Types.ObjectId(line.accessoryId),
        kind: "ACCESSORY",
        quantity: line.quantity * quantity,
      });
    }

    // Build the snapshot for OrderItem
    const variantSnapshot: ResolvedVariantRef = {
      _id: String(catalog.tree._id),
      productId: catalog.tree.productId,
      codeId: catalog.tree.codeId,
      size: catalog.tree.size,
      name: catalog.tree.name,
      price: catalog.tree.price,
      unitPrice: catalog.tree.price,
      sku: "",
      bareImage: "", // FE hydrates from catalog; we keep empty here
    };
    const styleSnapshot: ResolvedStyleRef = {
      _id: String(catalog.style._id),
      code: catalog.style.code,
      name: catalog.style.name,
      coverImage: "",
      palette: [],
    };
    const lines = pricing.lines.map<any>((l: any) => ({
      kind: "ACCESSORY",
      refId: new Types.ObjectId(l.accessoryId),
      type: l.type,
      name: l.name,
      unitPrice: l.unitPrice,
      quantity: l.quantity,
      lineTotal: l.lineTotal,
      personalizationText: l.personalizationText || "",
    }));
    if (pricing.decorationFee > 0) {
      lines.push({
        kind: "SERVICE",
        refId: null,
        type: "DECORATION_SERVICE",
        name: `Phí trang trí (${catalog.tree.size})`,
        unitPrice: pricing.decorationFee,
        quantity: 1,
        lineTotal: pricing.decorationFee,
        personalizationText: "",
      });
    }

    const itemUnitTotal = pricing.unitTotal;
    const itemLineTotal = itemUnitTotal * quantity;

    built.push({
      designId: entry.designId ? new Types.ObjectId(entry.designId) : null,
      designName: entry.designId ? (await getDesignName(entry.designId)) : "My Christmas",
      previewImage: "",
      variant: variantSnapshot,
      style: styleSnapshot,
      lines,
      deliveryOption: cfg.deliveryOption as DeliveryOption,
      unitTotal: itemUnitTotal,
      quantity,
      lineTotal: itemLineTotal,
      hasPersonalization: pricing.hasPersonalization,
      productionDays: pricing.productionDays,
    });

    subtotal += itemLineTotal;
    decorationFeeTotal += pricing.decorationFee * quantity;
    if (pricing.productionDays > productionDaysMax) {
      productionDaysMax = pricing.productionDays;
    }
    if (pricing.hasPersonalization) hasPersonalization = true;
  }

  return { built, stockToReserve, subtotal, decorationFeeTotal, productionDaysMax, hasPersonalization };
}

async function getDesignName(id: string): Promise<string> {
  const { TreeDesign } = await import("../models/TreeDesign");
  const doc = await TreeDesign.findById(id).select("name").lean();
  return doc?.name || "My Christmas";
}

// ── POST /api/orders ──────────────────────────────────────────────────────────
// Two ways to create an order:
//   A) Body.items = [{ config | designId, quantity }]  — direct
//   B) Body.cartItemIds = [...] (or no body)            — checked cart items
// designConfirmed: true is required.
export const createOrder = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const {
      shippingName,
      shippingPhone,
      shippingAddress,
      shippingProvinceId,
      shippingProvinceName,
      shippingCommuneId,
      shippingCommuneName,
      addressEffectiveDate,
      paymentMethod = "COD",
      idempotencyKey,
      designConfirmed,
      cartItemIds,
      items: directItems,
    } = req.body as {
      shippingName?: string;
      shippingPhone?: string;
      shippingAddress?: string;
      shippingProvinceId?: string;
      shippingProvinceName?: string;
      shippingCommuneId?: string;
      shippingCommuneName?: string;
      addressEffectiveDate?: string;
      paymentMethod?: string;
      idempotencyKey?: string;
      designConfirmed?: boolean;
      cartItemIds?: string[];
      items?: Array<{ config?: DesignConfig; designId?: string; quantity?: number }>;
    };

    // Idempotency
    if (idempotencyKey) {
      const existing = await Order.findOne({ idempotencyKey });
      if (existing) {
        res.json({ order: mapOrder(existing) });
        return;
      }
    }

    // designConfirmed required
    if (!designConfirmed) {
      sendError(
        res,
        ErrorCode.DESIGN_NOT_CONFIRMED,
        "Bạn cần xác nhận 'Tôi đồng ý với thiết kế này' trước khi đặt hàng"
      );
      return;
    }

    // HCM-only delivery
    if (shippingProvinceId && shippingProvinceId !== SERVICE_PROVINCE_ID) {
      sendError(
        res,
        ErrorCode.DELIVERY_AREA_NOT_SUPPORTED,
        "Hiện tại Build Your Christmas chỉ giao hàng tại TP.HCM (province 79)"
      );
      return;
    }

    // Resolve items source
    let rawItems: Array<{ config?: DesignConfig; designId?: string; quantity?: number }> = [];
    if (Array.isArray(directItems) && directItems.length > 0) {
      rawItems = directItems;
    } else {
      // Pull from user's cart (checked items, or specific ids)
      const cart = await Cart.findOne({ userId });
      if (!cart) {
        sendError(res, ErrorCode.CART_EMPTY, "Giỏ hàng trống");
        return;
      }
      const query: any = { cartId: cart._id };
      if (Array.isArray(cartItemIds) && cartItemIds.length > 0) {
        query._id = { $in: cartItemIds };
      } else {
        query.checked = true;
      }
      const cartItems = await CartItem.find(query);
      if (cartItems.length === 0) {
        sendError(res, ErrorCode.NO_ITEMS_CHECKED, "Không có sản phẩm nào được chọn để đặt hàng");
        return;
      }
      rawItems = cartItems.map((ci) => ({
        config: ci.config as DesignConfig,
        designId: ci.designId ? String(ci.designId) : undefined,
        quantity: ci.quantity,
      }));
    }

    if (rawItems.length === 0) {
      sendError(res, ErrorCode.ITEMS_REQUIRED, "Không có sản phẩm để đặt hàng");
      return;
    }

    // Build, validate via pricing, and snapshot
    let built, stockToReserve, subtotal, decorationFeeTotal, productionDaysMax, hasPersonalization;
    try {
      const result = await buildOrderItems({
        buyerId: userId,
        paymentMethod,
        items: rawItems,
      });
      built = result.built;
      stockToReserve = result.stockToReserve;
      subtotal = result.subtotal;
      decorationFeeTotal = result.decorationFeeTotal;
      productionDaysMax = result.productionDaysMax;
      hasPersonalization = result.hasPersonalization;
    } catch (err) {
      if (err && typeof err === "object" && "code" in err) {
        const code = (err as { code: ErrorCodeValue }).code;
        const http = (err as { httpCode?: number }).httpCode ?? 400;
        const message = (err as unknown as Error).message || "Lỗi không xác định";
        sendError(res, code, message, http);
        return;
      }
      throw err;
    }

    if (built.length === 0) {
      sendError(res, ErrorCode.ITEMS_REQUIRED, "Không có thiết kế hợp lệ để đặt hàng");
      return;
    }

    // Reserve stock atomically. If anything fails, throw to caller.
    try {
      await reserveStock(stockToReserve);
    } catch (stockErr) {
      const msg = (stockErr as Error).message || "";
      if (msg.startsWith("OUT_OF_STOCK")) {
        sendError(res, ErrorCode.OUT_OF_STOCK, "Một hoặc nhiều món đã hết hàng trong lúc đặt");
        return;
      }
      throw stockErr;
    }

    const shippingFee = SHIPPING_FEE;
    const totalAmount = subtotal + shippingFee + decorationFeeTotal;

    const orderCode = genOrderCode();
    const isCod = String(paymentMethod).toUpperCase() === "COD";
    const initialStatus: OrderStatus = isCod ? "CONFIRMED" : "PENDING_PAYMENT";
    const statusReason = isCod
      ? "Đặt hàng thanh toán khi nhận hàng (COD)"
      : "Chờ thanh toán đơn hàng";

    const now = new Date();
    const order = await Order.create({
      orderCode,
      buyerId: new Types.ObjectId(userId),
      items: built,
      subtotal,
      shippingFee,
      decorationFee: decorationFeeTotal,
      discount: 0,
      totalAmount,
      status: initialStatus,
      statusHistory: [
        {
          status: initialStatus,
          by: "system",
          at: now,
          reason: statusReason,
        },
      ],
      paymentMethod,
      designConfirmedAt: now,
      designLockedAt: now,
      shippingName: shippingName || "",
      shippingPhone: shippingPhone || "",
      shippingAddress: shippingAddress || "",
      shippingProvinceId: shippingProvinceId || "",
      shippingProvinceName: shippingProvinceName || "",
      shippingCommuneId: shippingCommuneId || "",
      shippingCommuneName: shippingCommuneName || "",
      addressEffectiveDate: addressEffectiveDate || "latest",
      idempotencyKey: idempotencyKey || `auto-${now.getTime()}`,
    });

    // Clean up cart items that were used
    const usedDesignIds = new Set(
      rawItems.map((i) => i.designId).filter((x): x is string => !!x)
    );
    if (Array.isArray(cartItemIds) && cartItemIds.length > 0) {
      await CartItem.deleteMany({ _id: { $in: cartItemIds } });
    } else if (rawItems.length > 0) {
      // Generic: drop all checked items
      const cart = await Cart.findOne({ userId });
      if (cart) {
        await CartItem.deleteMany({ cartId: cart._id, checked: true });
      }
    }

    // Notifications
    await Notification.create({
      userId,
      type: "order",
      title: isCod ? "Đơn hàng đã được xác nhận (COD)" : "Đơn hàng đã được tạo",
      message: isCod
        ? `Đơn hàng ${orderCode} đã được tạo thành công (COD). Đội ngũ Build Your Christmas sẽ chuẩn bị hàng.`
        : `Đơn hàng ${orderCode} đã được tạo thành công. Vui lòng thanh toán để xác nhận.`,
    });

    res.status(201).json({ order: mapOrder(order) });
  } catch (err) {
    handleInternalError(res, err, "[orders] createOrder error");
  }
};

// ── GET /api/orders ───────────────────────────────────────────────────────────
// Buyer lists their own orders.
export const getMyOrders = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { status } = req.query;
    const filter: any = { buyerId: userId };
    if (typeof status === "string") filter.status = status.toUpperCase();
    const orders = await Order.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ orders: orders.map(mapOrder) });
  } catch (err) {
    handleInternalError(res, err, "[orders] getMyOrders error");
  }
};

// ── GET /api/orders/:id ───────────────────────────────────────────────────────
export const getOrderById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id);
    const userId = req.user!.id;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    const filter = isObjectId
      ? { $or: [{ _id: id }, { orderCode: id }] }
      : { orderCode: id };
    const order = await Order.findOne(filter).lean();
    if (!order) {
      sendError(res, ErrorCode.ORDER_NOT_FOUND, "Không tìm thấy đơn hàng");
      return;
    }
    const isBuyer = String(order.buyerId) === userId;
    const isAdmin = req.user?.roles?.includes("admin") ?? false;
    if (!isBuyer && !isAdmin) {
      sendError(res, ErrorCode.FORBIDDEN, "Bạn không có quyền xem đơn hàng này");
      return;
    }
    res.json({ order: mapOrder(order) });
  } catch (err) {
    handleInternalError(res, err, "[orders] getOrderById error");
  }
};

// ── PATCH /api/orders/:id/status ──────────────────────────────────────────────
// Buyer allowed: CANCELLED (PENDING_PAYMENT/PAID), CANCEL_REQUESTED (other),
// DELIVERED, COMPLETED, DISPUTED. Admin: any valid transition.
// Hủy đơn cá nhân hóa khi đã PACKING → ORDER_CANCEL_NOT_ALLOWED.
export const updateOrderStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id);
    const { status: nextStatus, reason } = req.body as {
      status?: OrderStatus;
      reason?: string;
    };
    const userId = req.user!.id;
    const isAdmin = req.user?.roles?.includes("admin") ?? false;

    if (!nextStatus) {
      sendError(res, ErrorCode.ORDER_STATUS_REQUIRED, "Thiếu trạng thái mới");
      return;
    }

    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    const filter = isObjectId
      ? { $or: [{ _id: id }, { orderCode: id }] }
      : { orderCode: id };
    const order = await Order.findOne(filter);
    if (!order) {
      sendError(res, ErrorCode.ORDER_NOT_FOUND, "Không tìm thấy đơn hàng");
      return;
    }

    const isBuyer = String(order.buyerId) === userId;
    if (!isBuyer && !isAdmin) {
      sendError(res, ErrorCode.FORBIDDEN, "Bạn không có quyền cập nhật đơn hàng này");
      return;
    }

    const currentStatus = order.status as OrderStatus;
    const allowed = VALID_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(nextStatus)) {
      sendError(
        res,
        ErrorCode.ORDER_INVALID_TRANSITION,
        `Không thể chuyển từ trạng thái ${currentStatus} sang ${nextStatus}`
      );
      return;
    }

    // Role-based gating
    if (!isAdmin && isBuyer) {
      const buyerAllowed = ["CANCELLED", "CANCEL_REQUESTED", "DELIVERED", "COMPLETED", "DISPUTED"];
      if (!buyerAllowed.includes(nextStatus)) {
        sendError(
          res,
          ErrorCode.ORDER_INVALID_TRANSITION,
          "Người mua chỉ có thể hủy/yêu cầu hủy/báo đã nhận/hoàn tất/khiếu nại"
        );
        return;
      }
      if (nextStatus === "CANCELLED" && !["PENDING_PAYMENT", "PAID"].includes(currentStatus)) {
        sendError(
          res,
          ErrorCode.ORDER_INVALID_TRANSITION,
          "Sau khi đơn đã được xác nhận, bạn chỉ có thể Yêu cầu hủy (CANCEL_REQUESTED)"
        );
        return;
      }
      // Q5: personalization + PACKING → block cancellation
      if (
        nextStatus === "CANCEL_REQUESTED" &&
        order.items.some((it) => it.hasPersonalization) &&
        currentStatus === "PACKING"
      ) {
        sendError(
          res,
          ErrorCode.ORDER_CANCEL_NOT_ALLOWED,
          "Đơn có món cá nhân hóa đã vào sản xuất — không thể yêu cầu hủy"
        );
        return;
      }
    }

    // Persist
    if (nextStatus === "CANCEL_REQUESTED") {
      order.cancelReason = reason || "";
      order.cancelRequestedAt = new Date();
    }

    if (nextStatus === "CANCELLED") {
      // Restore stock for every variant + accessory in the order
      const restore: Array<{ refId: Types.ObjectId; quantity: number }> = [];
      for (const item of order.items) {
        if (item.variant && item.variant._id) {
          await restoreTreeStock(new Types.ObjectId(String(item.variant._id)), item.quantity);
        }
        for (const line of item.lines) {
          if (line.kind === "ACCESSORY" && line.refId) {
            restore.push({ refId: new Types.ObjectId(String(line.refId)), quantity: line.quantity * item.quantity });
          }
        }
      }
      if (restore.length) await restoreStock(restore);
    }

    if (nextStatus === "DELIVERED") {
      order.deliveredAt = new Date();
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
    handleInternalError(res, err, "[orders] updateOrderStatus error");
  }
};

// ── POST /api/orders/:id/shipment (admin) ──────────────────────────────────────
export const createOrderShipment = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id);
    const userId = req.user!.id;
    const isAdmin = req.user?.roles?.includes("admin") ?? false;
    if (!isAdmin) {
      sendError(res, ErrorCode.FORBIDDEN, "Chỉ admin mới có thể tạo vận đơn");
      return;
    }

    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    const filter = isObjectId
      ? { $or: [{ _id: id }, { orderCode: id }] }
      : { orderCode: id };
    const order = await Order.findOne(filter);
    if (!order) {
      sendError(res, ErrorCode.ORDER_NOT_FOUND, "Không tìm thấy đơn hàng");
      return;
    }

    if (order.status === "CANCELLED") {
      sendError(res, ErrorCode.ORDER_ALREADY_CANCELLED, "Đơn đã hủy — không thể tạo vận đơn");
      return;
    }
    if (["SHIPPING", "DELIVERING", "DELIVERED"].includes(order.status)) {
      sendError(res, ErrorCode.ORDER_ALREADY_SHIPPED, "Đơn đã có vận đơn");
      return;
    }

    const { pickup = {}, trackingUrl: externalTracking } = req.body as {
      pickup?: any;
      trackingUrl?: string;
    };

    const random = Math.floor(1e8 + Math.random() * 9e8);
    const trackingNumber = `BYC${random}`;
    const provider = "Build Your Christmas - HCM Delivery";

    order.status = "SHIPPING";
    order.shippingProvider = provider;
    order.trackingNumber = trackingNumber;
    order.trackingUrl =
      externalTracking || `https://buildyourchristmas.vn/track/${trackingNumber}`;
    order.pickupInfo = {
      name: pickup.name || "",
      phone: pickup.phone || "",
      address: pickup.address || "",
      province: pickup.province || "",
      district: pickup.district || "",
      ward: pickup.ward || "",
      email: pickup.email || "",
      note: pickup.note || "",
    };
    order.shippedAt = new Date();
    order.estimatedDeliveryAt = new Date(Date.now() + 2 * 86400_000);
    order.shippingEvents = [
      {
        status: "CREATED",
        description: "Đã tạo vận đơn",
        timestamp: new Date(),
        location: order.pickupInfo.address || "Kho Build Your Christmas",
      },
      {
        status: "IN_TRANSIT",
        description: "Đang giao hàng tới khách",
        timestamp: new Date(Date.now() + 3_600_000),
        location: "HCM Delivery Hub",
      },
    ];

    order.statusHistory.push({
      status: "SHIPPING",
      by: req.user?.email ?? "admin",
      at: new Date(),
      reason: `Tạo vận đơn ${trackingNumber}`,
    });

    await order.save();

    res.status(201).json({
      shipment: {
        id: String(order._id),
        orderId: order.orderCode,
        provider: order.shippingProvider,
        trackingNumber: order.trackingNumber,
        trackingUrl: order.trackingUrl,
        status: "IN_TRANSIT" as const,
        shippedAt: order.shippedAt!.toISOString(),
        estimatedDeliveryAt: order.estimatedDeliveryAt!.toISOString(),
        events: order.shippingEvents.map((e) => ({
          status: e.status,
          description: e.description,
          timestamp: e.timestamp.toISOString(),
          location: e.location,
        })),
      },
    });
  } catch (err) {
    handleInternalError(res, err, "[orders] createOrderShipment error");
  }
};

// ── GET /api/orders/:id/shipment ──────────────────────────────────────────────
export const getOrderShipment = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id);
    const userId = req.user!.id;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    const filter = isObjectId
      ? { $or: [{ _id: id }, { orderCode: id }] }
      : { orderCode: id };
    const order = await Order.findOne(filter).lean();
    if (!order) {
      sendError(res, ErrorCode.ORDER_NOT_FOUND, "Không tìm thấy đơn hàng");
      return;
    }
    const isBuyer = String(order.buyerId) === userId;
    const isAdmin = req.user?.roles?.includes("admin") ?? false;
    if (!isBuyer && !isAdmin) {
      sendError(res, ErrorCode.FORBIDDEN, "Bạn không có quyền xem vận đơn này");
      return;
    }

    let shipmentStatus:
      | "PENDING"
      | "CREATED"
      | "PICKED_UP"
      | "IN_TRANSIT"
      | "DELIVERING"
      | "DELIVERED"
      | "CANCELLED" = "PENDING";
    if (order.status === "DELIVERED" || order.status === "COMPLETED") {
      shipmentStatus = "DELIVERED";
    } else if (order.status === "DELIVERING") {
      shipmentStatus = "DELIVERING";
    } else if (order.status === "SHIPPING") {
      shipmentStatus = "IN_TRANSIT";
    } else if (order.status === "PACKING") {
      shipmentStatus = "PICKED_UP";
    } else if (order.status === "CANCELLED") {
      shipmentStatus = "CANCELLED";
    } else if (order.trackingNumber) {
      shipmentStatus = "CREATED";
    }

    const events = (order.shippingEvents || []).map((e) => ({
      status: e.status,
      description: e.description,
      timestamp: e.timestamp
        ? new Date(e.timestamp).toISOString()
        : new Date().toISOString(),
      location: e.location || "",
    }));

    res.json({
      shipment: {
        id: String(order._id),
        orderId: order.orderCode,
        provider: order.shippingProvider || "Build Your Christmas - HCM Delivery",
        trackingNumber: order.trackingNumber || "",
        trackingUrl: order.trackingUrl || "",
        status: shipmentStatus,
        shippedAt: order.shippedAt
          ? new Date(order.shippedAt).toISOString()
          : undefined,
        estimatedDeliveryAt: order.estimatedDeliveryAt
          ? new Date(order.estimatedDeliveryAt).toISOString()
          : undefined,
        deliveredAt: order.deliveredAt
          ? new Date(order.deliveredAt).toISOString()
          : undefined,
        events,
      },
    });
  } catch (err) {
    handleInternalError(res, err, "[orders] getOrderShipment error");
  }
};

// ── mapOrder — FE-facing shape ───────────────────────────────────────────────
type ErrorCodeValue =
  (typeof import("../utils/errors").ErrorCode)[keyof typeof import("../utils/errors").ErrorCode];

export const mapOrder = (o: any) => ({
  _id: String(o._id),
  orderCode: o.orderCode,
  buyerId: o.buyerId ? String(o.buyerId) : "",
  items: (o.items || []).map((it: any) => ({
    designId: it.designId ? String(it.designId) : null,
    designName: it.designName,
    previewImage: it.previewImage || "",
    variant: it.variant ?? it.tree, // tolerate legacy docs
    style: it.style,
    lines: (it.lines || []).map((l: any) => ({
      kind: l.kind,
      refId: l.refId ? String(l.refId) : null,
      type: l.type,
      name: l.name,
      unitPrice: l.unitPrice,
      quantity: l.quantity,
      lineTotal: l.lineTotal,
      personalizationText: l.personalizationText || "",
    })),
    deliveryOption: it.deliveryOption,
    unitTotal: it.unitTotal,
    quantity: it.quantity,
    lineTotal: it.lineTotal,
    hasPersonalization: it.hasPersonalization,
    productionDays: it.productionDays,
  })),
  subtotal: o.subtotal,
  shippingFee: o.shippingFee,
  decorationFee: o.decorationFee || 0,
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
  designConfirmedAt: o.designConfirmedAt
    ? new Date(o.designConfirmedAt).toISOString()
    : null,
  designLockedAt: o.designLockedAt
    ? new Date(o.designLockedAt).toISOString()
    : null,
  shippingName: o.shippingName || "",
  shippingPhone: o.shippingPhone || "",
  shippingAddress: o.shippingAddress || "",
  shippingProvinceId: o.shippingProvinceId || "",
  shippingProvinceName: o.shippingProvinceName || "",
  shippingCommuneId: o.shippingCommuneId || "",
  shippingCommuneName: o.shippingCommuneName || "",
  addressEffectiveDate: o.addressEffectiveDate || "",
  trackingNumber: o.trackingNumber || "",
  shippingProvider: o.shippingProvider || "",
  trackingUrl: o.trackingUrl || "",
  pickupInfo: o.pickupInfo || null,
  shippedAt: o.shippedAt ? new Date(o.shippedAt).toISOString() : null,
  estimatedDeliveryAt: o.estimatedDeliveryAt
    ? new Date(o.estimatedDeliveryAt).toISOString()
    : null,
  deliveredAt: o.deliveredAt ? new Date(o.deliveredAt).toISOString() : null,
  cancelReason: o.cancelReason || "",
  cancelRequestedAt: o.cancelRequestedAt
    ? new Date(o.cancelRequestedAt).toISOString()
    : null,
  idempotencyKey: o.idempotencyKey,
  createdAt: o.createdAt
    ? new Date(o.createdAt).toISOString()
    : new Date().toISOString(),
});