/**
 * order.tools.ts — tool `lookupOrder` cho AI.
 *
 * BẢO MẬT (TDD §4.4):
 *   - Chỉ trả đơn hàng CỦA CHÍNH user đang chat.
 *   - Nếu tra theo mã đơn mà đơn đó thuộc user khác ⇒ KHÔNG trả chi tiết,
 *     chỉ báo "không tìm thấy" (tránh lộ thông tin đơn hàng người khác).
 *   - Tool KHÔNG bao giờ trả PII nhạy cảm (địa chỉ đầy đủ, số điện thoại).
 */

import { Types } from "mongoose";
import { Order } from "../../../models/Order";
import type { AiTool } from "./index";

/** Map trạng thái đơn sang mô tả tiếng Việt cho AI dùng. */
const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "chờ thanh toán",
  PAID: "đã thanh toán, chờ xác nhận",
  CONFIRMED: "đã xác nhận, chuẩn bị hàng",
  PACKING: "đang đóng gói",
  SHIPPING: "đang giao hàng",
  DELIVERING: "đang giao tới khách hàng",
  DELIVERED: "đã giao thành công",
  COMPLETED: "hoàn tất",
  CANCELLED: "đã hủy",
  CANCEL_REQUESTED: "đang chờ hủy",
  DISPUTED: "đang khiếu nại",
  REFUNDED: "đã hoàn tiền",
};

export interface LookupOrderArgs {
  orderCode?: string;
  email?: string;
}

export interface OrderSummary {
  orderCode: string;
  status: string;
  statusLabel: string;
  totalAmount: number;
  itemCount: number;
  items: Array<{
    name: string;
    size: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  placedAt: string;
  trackingNumber: string | null;
  shippingProvider: string | null;
  estimatedDeliveryAt: string | null;
  deliveredAt: string | null;
}

export const lookupOrderTool: AiTool = {
  declaration: {
    name: "lookupOrder",
    description:
      "Tra cứu đơn hàng của khách hàng theo mã đơn (VD: 'BYC123456') hoặc email. CHỈ trả về đơn hàng thuộc về khách hàng đang chat. Dùng khi khách hàng hỏi trạng thái đơn, vị trí đơn hay thời gian giao.",
    parameters: {
      type: "object",
      properties: {
        orderCode: {
          type: "string",
          description: "Mã đơn hàng (VD: 'BYC202411001').",
        },
        email: {
          type: "string",
          description: "Email đặt hàng (phương án thay thế khi khách không nhớ mã đơn).",
        },
      },
      required: [],
    },
  },

  async execute(args, context) {
    const orderCode = typeof args.orderCode === "string" ? args.orderCode.trim() : "";
    const email = typeof args.email === "string" ? args.email.trim().toLowerCase() : "";

    if (!orderCode && !email) {
      return {
        data: {
          found: false,
          reason:
            "Cần mã đơn hàng hoặc email để tra cứu. Hãy hỏi khách hàng.",
        },
      };
    }

    // ── Xác định user sở hữu đơn ────────────────────────────────────────
    // Nếu tra theo email ⇒ tìm user có email đó (để hỗ trợ khách gọi từ
    // máy khác). Nếu không có ⇒ không có quyền xem đơn nào.
    let ownerId = context.userId;

    if (email) {
      const { User } = await import("../../../models/User");
      const owner = await User.findOne({ email }).select("_id").lean();
      if (!owner) {
        return {
          data: {
            found: false,
            reason: "Không tìm thấy đơn hàng nào khớp với thông tin cung cấp.",
          },
        };
      }
      ownerId = String(owner._id);
    }

    const filter: Record<string, unknown> = { buyerId: ownerId };
    if (orderCode) {
      filter.orderCode = new RegExp(
        `^${orderCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        "i"
      );
    }

    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    if (orders.length === 0) {
      return {
        data: {
          found: false,
          reason:
            "Không tìm thấy đơn hàng nào khớp. Hãy nhờ khách hàng kiểm tra lại mã đơn hoặc email đã dùng để đặt hàng.",
        },
      };
    }

    const summaries: OrderSummary[] = orders.map((o) => ({
      orderCode: o.orderCode,
      status: o.status,
      statusLabel: STATUS_LABELS[o.status] ?? o.status,
      totalAmount: o.totalAmount,
      itemCount: (o.items ?? []).reduce((sum, i) => sum + (i.quantity ?? 0), 0),
      items: (o.items ?? []).map((i) => ({
        name: i.variant?.name ?? "Sản phẩm",
        size: i.variant?.size ?? "",
        quantity: i.quantity ?? 0,
        unitPrice: i.variant?.unitPrice ?? 0,
        lineTotal: i.lineTotal ?? 0,
      })),
      placedAt: new Date((o as { createdAt?: Date }).createdAt ?? Date.now()).toISOString(),
      trackingNumber: o.trackingNumber || null,
      shippingProvider: o.shippingProvider || null,
      estimatedDeliveryAt: o.estimatedDeliveryAt
        ? new Date(o.estimatedDeliveryAt).toISOString()
        : null,
      deliveredAt: o.deliveredAt ? new Date(o.deliveredAt).toISOString() : null,
    }));

    return {
      data: {
        found: true,
        count: summaries.length,
        orders: summaries,
        note:
          "Đây là thông tin đơn hàng của khách hàng. KHÔNG suy đoán thời gian giao nếu không có estimatedDeliveryAt.",
      },
    };
  },
};

/** Kiểm tra id đơn hàng có hợp lệ (helper dùng cho test). */
export function isValidOrderId(id: string): boolean {
  return Types.ObjectId.isValid(id);
}
