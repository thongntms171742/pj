import { Request, Response } from "express";
import { Types } from "mongoose";
import { Order, VALID_TRANSITIONS, OrderStatus } from "../models/Order";
import { Cart } from "../models/Cart";
import { CartItem } from "../models/CartItem";
import { Notification } from "../models/Notification";
import { TreeDesign } from "../models/TreeDesign";
import { restoreStock, restoreTreeStock } from "../services/inventoryService";
import { SHIPPING_FEE } from "../config/business";
import {
  sendError,
  ErrorCode,
  handleInternalError,
} from "../utils/errors";
import {
  findOrderByIdOrCode,
} from "../utils/ids";
import { ok, created } from "../utils/respond";
import { orderToDto } from "../dto/order";
import {
  buildOrderItems,
  assertDeliveryArea,
  applyCoupon,
  cleanupCartAfterOrder,
  resolveOrderItems,
} from "../services/orderService";
import {
  assertValidHcmCommune,
  InvalidCommuneError,
  WrongProvinceError,
} from "../services/addressService";
import { SERVICE_PROVINCE_ID } from "../config/business";
import type { DesignConfig } from "../models/TreeDesign";

// ── Helpers ──────────────────────────────────────────────────────────────────
function genOrderCode(): string {
  return `BYC-${Date.now().toString().slice(-8)}`;
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
    const body = req.body as {
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
      couponCode?: string;
      discountCode?: string;
      internalNotes?: string;
    };
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
    } = body;

    // 1) Idempotency
    if (idempotencyKey) {
      const existing = await Order.findOne({ idempotencyKey });
      if (existing) {
        ok(res, { order: orderToDto(existing) });
        return;
      }
    }

    // 2) designConfirmed required
    if (!designConfirmed) {
      sendError(
        res,
        ErrorCode.DESIGN_NOT_CONFIRMED,
        "Bạn cần xác nhận 'Tôi đồng ý với thiết kế này' trước khi đặt hàng"
      );
      return;
    }

    // 3) Resolve items source (direct body or cart)
    let rawItems = Array.isArray(directItems) && directItems.length > 0
      ? directItems
      : await resolveOrderItems(userId, cartItemIds);
    if (rawItems.length === 0) {
      const hasCart = await Cart.findOne({ userId });
      if (!hasCart) {
        sendError(res, ErrorCode.CART_EMPTY, "Giỏ hàng trống");
        return;
      }
      sendError(
        res,
        ErrorCode.NO_ITEMS_CHECKED,
        "Không có sản phẩm nào được chọn để đặt hàng"
      );
      return;
    }

    // 4) Build snapshots + totals (rethrows validation errors as 4xx)
    let builtResult;
    try {
      builtResult = await buildOrderItems(rawItems);
    } catch (err) {
      if (err && typeof err === "object" && "code" in err) {
        const code = (err as { code: string }).code as Parameters<typeof sendError>[1];
        const http = (err as { httpCode?: number }).httpCode ?? 400;
        const message = (err as unknown as Error).message || "Lỗi không xác định";
        sendError(res, code, message, http);
        return;
      }
      throw err;
    }
    const { items: built, stockToReserve, subtotal, decorationFee: decorationFeeTotal, productionDaysMax, hasPersonalization } = builtResult;
    if (built.length === 0) {
      sendError(res, ErrorCode.ITEMS_REQUIRED, "Không có thiết kế hợp lệ để đặt hàng");
      return;
    }

    // 5) Delivery area check
    try {
      assertDeliveryArea(built, shippingProvinceId);
    } catch (err) {
      const e = err as { code?: string; message?: string };
      if (e && typeof e === "object" && e.code) {
        sendError(
          res,
          e.code as Parameters<typeof sendError>[1],
          e.message || "Lỗi không xác định",
          400
        );
        return;
      }
      throw err;
    }

    // 6) Reserve stock atomically
    try {
      const { reserveStock } = await import("../services/inventoryService");
      await reserveStock(stockToReserve);
    } catch (stockErr) {
      const msg = (stockErr as Error).message || "";
      if (msg.startsWith("OUT_OF_STOCK")) {
        sendError(
          res,
          ErrorCode.OUT_OF_STOCK,
          "Một hoặc nhiều món đã hết hàng trong lúc đặt"
        );
        return;
      }
      throw stockErr;
    }

    // 7) Apply coupon (never blocks order placement on coupon error)
    const couponInput = (body.couponCode || body.discountCode || "").toString();
    const { discount: appliedDiscount, code: appliedCouponCode } =
      await applyCoupon(couponInput, subtotal);

    // 8) Persist order
    const shippingFee = SHIPPING_FEE;
    const totalAmount = Math.max(
      0,
      subtotal + shippingFee + decorationFeeTotal - appliedDiscount
    );
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
      discount: appliedDiscount,
      discountCode: appliedCouponCode,
      discountAmount: appliedDiscount,
      totalAmount,
      internalNotes: (body.internalNotes || "").toString().trim(),
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

    // 9) Cleanup cart items that were used
    await cleanupCartAfterOrder(userId, {
      cartItemIds,
      usedItemsCount: rawItems.length,
    });

    // 10) Notify
    await Notification.create({
      userId,
      type: "order",
      title: isCod ? "Đơn hàng đã được xác nhận (COD)" : "Đơn hàng đã được tạo",
      message: isCod
        ? `Đơn hàng ${orderCode} đã được tạo thành công (COD). Đội ngũ Build Your Christmas sẽ chuẩn bị hàng.`
        : `Đơn hàng ${orderCode} đã được tạo thành công. Vui lòng thanh toán để xác nhận.`,
    });

    created(res, { order: orderToDto(order) });
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
    ok(res, { orders: orders.map(orderToDto) });
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
    const order = await Order.findOne(findOrderByIdOrCode(id)).lean();
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
    ok(res, { order: orderToDto(order) });
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

    const order = await Order.findOne(findOrderByIdOrCode(id));
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
    ok(res, { order: orderToDto(order) });
  } catch (err) {
    handleInternalError(res, err, "[orders] updateOrderStatus error");
  }
};

// ── POST /api/orders/:id/shipment (admin) ──────────────────────────────────────
// Admin books the shipment manually (Grab / Ahamove / etc.) and pastes the
// tracking number + URL into the system. We DO NOT auto-generate a fake
// tracking number anymore — the admin types it.
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

    const order = await Order.findOne(findOrderByIdOrCode(id));
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

    const { trackingNumber, trackingUrl, provider, pickup = {} } = req.body as {
      trackingNumber?: string;
      trackingUrl?: string;
      provider?: string;
      pickup?: {
        name?: string;
        phone?: string;
        address?: string;
        provinceId?: string;
        communeId?: string;
        district?: string;
        email?: string;
        note?: string;
        addressEffectiveDate?: string;
      };
    };

    // Validate: trackingNumber is now required (admin types it after booking)
    const cleanTracking = (trackingNumber || "").trim();
    if (!cleanTracking) {
      sendError(
        res,
        ErrorCode.MISSING_FIELD,
        "Thiếu mã vận đơn (trackingNumber) — admin cần nhập sau khi book Grab/Ahamove"
      );
      return;
    }

    // Validate pickup address: must be inside TP.HCM, commune must exist
    // in AddressKit. provinceId defaults to HCM if FE doesn't send it.
    const pickupProvinceId =
      (pickup.provinceId || SERVICE_PROVINCE_ID).trim() || SERVICE_PROVINCE_ID;
    const pickupCommuneId = (pickup.communeId || "").trim();
    if (!pickupCommuneId) {
      sendError(
        res,
        ErrorCode.MISSING_FIELD,
        "Thiếu mã phường/xã (pickup.communeId) — admin cần chọn từ dropdown AddressKit"
      );
      return;
    }

    let communeName = "";
    let provinceName = "";
    try {
      const lookup = await assertValidHcmCommune(
        pickupProvinceId,
        pickupCommuneId,
        pickup.addressEffectiveDate || "latest"
      );
      communeName = lookup.name;
      provinceName = lookup.provinceName;
    } catch (err) {
      if (err instanceof InvalidCommuneError || err instanceof WrongProvinceError) {
        sendError(
          res,
          ErrorCode.INVALID_INPUT,
          err.message,
          err.httpCode
        );
        return;
      }
      throw err;
    }

    order.status = "SHIPPING";
    order.shippingProvider =
      (provider || "").trim() || "Grab / Ahamove (admin-booked)";
    order.trackingNumber = cleanTracking;
    order.trackingUrl =
      (trackingUrl || "").trim() ||
      `https://buildyourchristmas.vn/track/${cleanTracking}`;
    order.pickupInfo = {
      name: pickup.name || "",
      phone: pickup.phone || "",
      address: pickup.address || "",
      provinceId: pickupProvinceId,
      provinceName,
      communeId: pickupCommuneId,
      communeName,
      district: pickup.district || "",
      email: pickup.email || "",
      note: pickup.note || "",
    };
    order.shippedAt = new Date();
    order.estimatedDeliveryAt = new Date(Date.now() + 2 * 86400_000);
    order.shippingEvents = [
      {
        status: "CREATED",
        description: "Admin đã tạo vận đơn",
        timestamp: new Date(),
        location:
          [order.pickupInfo.address, communeName].filter(Boolean).join(", ") ||
          "Kho Build Your Christmas",
      },
    ];

    order.statusHistory.push({
      status: "SHIPPING",
      by: req.user?.email ?? "admin",
      at: new Date(),
      reason: `Tạo vận đơn ${cleanTracking}`,
    });

    await order.save();

    created(res, {
      shipment: {
        id: String(order._id),
        orderId: order.orderCode,
        provider: order.shippingProvider,
        trackingNumber: order.trackingNumber,
        trackingUrl: order.trackingUrl,
        status: "CREATED" as const,
        shippedAt: order.shippedAt!.toISOString(),
        estimatedDeliveryAt: order.estimatedDeliveryAt!.toISOString(),
        pickupAddress: order.pickupInfo,
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

// ── PATCH /api/orders/:id/shipment (admin) ────────────────────────────────────
// Admin updates tracking number / URL / pickup info AFTER booking
// (e.g. they pasted the wrong tracking, or want to switch from Grab to Ahamove).
// Does NOT change order status — use PATCH /:id/status for that.
export const updateOrderShipment = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id);
    const isAdmin = req.user?.roles?.includes("admin") ?? false;
    if (!isAdmin) {
      sendError(res, ErrorCode.FORBIDDEN, "Chỉ admin mới có thể cập nhật vận đơn");
      return;
    }

    const order = await Order.findOne(findOrderByIdOrCode(id));
    if (!order) {
      sendError(res, ErrorCode.ORDER_NOT_FOUND, "Không tìm thấy đơn hàng");
      return;
    }

    if (order.status === "CANCELLED") {
      sendError(res, ErrorCode.ORDER_ALREADY_CANCELLED, "Đơn đã hủy — không thể cập nhật vận đơn");
      return;
    }
    if (!order.trackingNumber) {
      sendError(
        res,
        ErrorCode.ORDER_NOT_FOUND,
        "Đơn chưa có vận đơn — hãy tạo vận đơn trước"
      );
      return;
    }

    const { trackingNumber, trackingUrl, provider, pickup, addressEffectiveDate } = req.body as {
      trackingNumber?: string;
      trackingUrl?: string;
      provider?: string;
      addressEffectiveDate?: string;
      pickup?: Partial<{
        name: string;
        phone: string;
        address: string;
        provinceId: string;
        communeId: string;
        district: string;
        email: string;
        note: string;
      }>;
    };

    const previousTracking = order.trackingNumber;

    if (typeof trackingNumber === "string" && trackingNumber.trim()) {
      order.trackingNumber = trackingNumber.trim();
    }
    if (typeof trackingUrl === "string" && trackingUrl.trim()) {
      order.trackingUrl = trackingUrl.trim();
    } else if (
      typeof trackingNumber === "string" &&
      trackingNumber.trim() &&
      trackingNumber.trim() !== previousTracking
    ) {
      // If admin changed tracking number but didn't supply a new URL, refresh
      // the default URL so it points at the new code.
      order.trackingUrl = `https://buildyourchristmas.vn/track/${order.trackingNumber}`;
    }
    if (typeof provider === "string" && provider.trim()) {
      order.shippingProvider = provider.trim();
    }
    if (pickup && typeof pickup === "object") {
      const current = order.pickupInfo || {
        name: "",
        phone: "",
        address: "",
        provinceId: "",
        provinceName: "",
        communeId: "",
        communeName: "",
        district: "",
        email: "",
        note: "",
      };
      // If the admin changed the commune (or province), re-validate it against
      // AddressKit. Text fields (name/phone/address/email/note/district) are
      // taken as-is.
      const nextProvinceId =
        (pickup.provinceId ?? current.provinceId) || SERVICE_PROVINCE_ID;
      const nextCommuneId = (pickup.communeId ?? current.communeId) || "";

      let communeName = current.communeName || "";
      let provinceName = current.provinceName || "";

      const communeChanged =
        nextCommuneId &&
        (nextCommuneId !== current.communeId ||
          nextProvinceId !== current.provinceId);
      if (communeChanged) {
        try {
          const lookup = await assertValidHcmCommune(
            nextProvinceId,
            nextCommuneId,
            addressEffectiveDate || "latest"
          );
          communeName = lookup.name;
          provinceName = lookup.provinceName;
        } catch (err) {
          if (
            err instanceof InvalidCommuneError ||
            err instanceof WrongProvinceError
          ) {
            sendError(
              res,
              ErrorCode.INVALID_INPUT,
              err.message,
              err.httpCode
            );
            return;
          }
          throw err;
        }
      }

      order.pickupInfo = {
        name: pickup.name ?? current.name,
        phone: pickup.phone ?? current.phone,
        address: pickup.address ?? current.address,
        provinceId: nextProvinceId,
        provinceName,
        communeId: nextCommuneId,
        communeName,
        district: pickup.district ?? current.district,
        email: pickup.email ?? current.email,
        note: pickup.note ?? current.note,
      };
    }

    order.shippingEvents.push({
      status: "UPDATED",
      description:
        trackingNumber && trackingNumber.trim() !== previousTracking
          ? `Admin cập nhật mã vận đơn: ${previousTracking} → ${order.trackingNumber}`
          : "Admin cập nhật thông tin vận đơn",
      timestamp: new Date(),
      location: order.pickupInfo?.address || "",
    });

    order.statusHistory.push({
      status: order.status,
      by: req.user?.email ?? "admin",
      at: new Date(),
      reason:
        trackingNumber && trackingNumber.trim() !== previousTracking
          ? `Cập nhật vận đơn: ${previousTracking} → ${order.trackingNumber}`
          : "Cập nhật thông tin vận đơn",
    });

    await order.save();

    ok(res, {
      shipment: {
        id: String(order._id),
        orderId: order.orderCode,
        provider: order.shippingProvider,
        trackingNumber: order.trackingNumber,
        trackingUrl: order.trackingUrl,
        status: "UPDATED" as const,
        events: order.shippingEvents.map((e) => ({
          status: e.status,
          description: e.description,
          timestamp: e.timestamp.toISOString(),
          location: e.location,
        })),
      },
    });
  } catch (err) {
    handleInternalError(res, err, "[orders] updateOrderShipment error");
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
    const order = await Order.findOne(findOrderByIdOrCode(id)).lean();
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

    ok(res, {
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
        pickupAddress: order.pickupInfo
          ? {
              address: order.pickupInfo.address || "",
              provinceId: order.pickupInfo.provinceId || "",
              provinceName: order.pickupInfo.provinceName || "",
              communeId: order.pickupInfo.communeId || "",
              communeName: order.pickupInfo.communeName || "",
              district: order.pickupInfo.district || "",
            }
          : null,
        events,
      },
    });
  } catch (err) {
    handleInternalError(res, err, "[orders] getOrderShipment error");
  }
};
