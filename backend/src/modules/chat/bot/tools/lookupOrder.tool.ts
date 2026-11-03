/**
 * lookupOrder.tool.ts — Tool 2: tra cứu trạng thái đơn hàng.
 *
 * Tách từ services/ai/chatbotService.ts (P0 refactor Hybrid).
 * Cải tiến:
 *   - Nhánh SĐT riêng: guest chỉ được tra cứu tối đa 3 lần / 10 phút
 *     (chống dò số điện thoại để lộ đơn người khác).
 *   - Luôn khoanh vùng theo buyerId khi caller đã đăng nhập (như bản cũ).
 *   - Mask SĐT cho guest.
 */

import { Types } from "mongoose";
import { Order } from "../../../../models/Order";
import { escapeRegExp } from "../../../../utils/regex";
import { formatVnd } from "../copy";

/** Ngữ cảnh người gọi — dùng để giới hạn tool lookup_order. */
export interface ChatCallerContext {
  /** Mongo user id của người gọi (nếu đã đăng nhập). */
  userId?: string;
  /** Guest session id (nếu là khách vãng lai). */
  sessionId?: string;
}

/** Số lần tra cứu bằng SĐT tối đa cho 1 guest trong 10 phút. */
export const PHONE_LOOKUP_LIMIT = 3;
export const PHONE_LOOKUP_WINDOW_MS = 10 * 60 * 1000;

// ── Rate-limit in-memory cho guest tra cứu bằng SĐT ────────────────────────
// key = `${sessionId}:${phoneDigits}` → mảng timestamp các lần gần đây.
const phoneLookupAttempts = new Map<string, number[]>();

/** Xoá toàn bộ bộ đếm (dùng cho test). */
export function resetPhoneLookupAttempts(): void {
  phoneLookupAttempts.clear();
}

/** Kiểm tra guest đã vượt giới hạn tra cứu bằng SĐT chưa. */
export function isPhoneLookupLimited(sessionId: string | undefined, phone: string): boolean {
  if (!sessionId) return true;
  const key = `${sessionId}:${phone.replace(/\D/g, "")}`;
  const now = Date.now();
  const recent = (phoneLookupAttempts.get(key) || []).filter((t) => now - t < PHONE_LOOKUP_WINDOW_MS);
  phoneLookupAttempts.set(key, recent);
  return recent.length >= PHONE_LOOKUP_LIMIT;
}

/** Ghi nhận 1 lần tra cứu bằng SĐT. */
export function recordPhoneLookupAttempt(sessionId: string | undefined, phone: string): void {
  if (!sessionId) return;
  const key = `${sessionId}:${phone.replace(/\D/g, "")}`;
  const now = Date.now();
  const recent = (phoneLookupAttempts.get(key) || []).filter((t) => now - t < PHONE_LOOKUP_WINDOW_MS);
  recent.push(now);
  phoneLookupAttempts.set(key, recent);
}

/** Dịch trạng thái đơn sang tiếng Việt. */
export const ORDER_STATUS_VI: Record<string, string> = {
  PENDING_PAYMENT: "Chờ thanh toán",
  PAID: "Đã thanh toán",
  CONFIRMED: "Đã xác nhận",
  PACKING: "Đang đóng gói cây",
  SHIPPING: "Đang bàn giao vận chuyển",
  DELIVERING: "Đang trên đường giao tới bạn",
  DELIVERED: "Đã giao hàng thành công",
  COMPLETED: "Hoàn tất đơn hàng",
  CANCEL_REQUESTED: "Đã gửi yêu cầu hủy đơn",
  CANCELLED: "Đã hủy",
  DISPUTED: "Đang trong quá trình khiếu nại",
  REFUNDED: "Đã hoàn tiền",
};

/** Che SĐT cho guest: "0901234567" → "090***67". */
export function maskPhone(phone: string | undefined | null): string | undefined {
  if (!phone) return undefined;
  const s = String(phone);
  if (s.length < 5) return "***";
  return `${s.slice(0, 3)}***${s.slice(-2)}`;
}

export interface LookupOrderResult {
  found: boolean;
  message?: string;
  orderCode?: string;
  status?: string;
  rawStatus?: string;
  totalAmount?: number;
  itemCount?: number;
  trackingNumber?: string;
  createdAt?: Date;
  recipient?: string;
  shippingAddress?: string;
  shippingPhone?: string;
  maskedPhone?: string;
}

/**
 * Tra cứu đơn hàng theo mã đơn hoặc số điện thoại.
 */
export async function executeLookupOrder(
  args: { orderCode?: string; phoneNumber?: string },
  caller?: ChatCallerContext
): Promise<LookupOrderResult> {
  const { orderCode, phoneNumber } = args;
  if (!orderCode && !phoneNumber) {
    return { found: false, message: "Cần cung cấp mã đơn hoặc số điện thoại để tra cứu." };
  }

  // ── Nhánh SĐT: giới hạn tần suất cho guest ──────────────────────────────
  if (!orderCode && phoneNumber) {
    const phone = phoneNumber.trim();
    if (!caller?.userId) {
      if (isPhoneLookupLimited(caller?.sessionId, phone)) {
        return {
          found: false,
          message:
            "Anh/chị đã tra cứu bằng số điện thoại quá nhiều lần. Vui lòng thử lại sau ít phút, hoặc liên hệ tư vấn viên để được hỗ trợ nhanh hơn.",
        };
      }
      recordPhoneLookupAttempt(caller?.sessionId, phone);
    }

    const query: any = { shippingPhone: new RegExp(escapeRegExp(phone)) };
    if (caller?.userId) query.buyerId = new Types.ObjectId(caller.userId);

    const order = await Order.findOne(query).sort({ createdAt: -1 });
    if (!order) {
      return {
        found: false,
        message: "Không tìm thấy đơn hàng phù hợp với số điện thoại anh/chị đã cung cấp.",
      };
    }
    return buildOrderResult(order, Boolean(caller?.userId));
  }

  // ── Nhánh mã đơn ──────────────────────────────────────────────────────────
  const query: any = {};
  const code = (orderCode || "").trim();
  query.$or = [{ orderCode: code }];
  if (Types.ObjectId.isValid(code)) {
    query.$or.push({ _id: new Types.ObjectId(code) });
  }

  if (caller?.userId) {
    query.buyerId = new Types.ObjectId(caller.userId);
  }

  const order = await Order.findOne(query).sort({ createdAt: -1 });
  if (!order) {
    if (caller?.userId) {
      return {
        found: false,
        message:
          "Không tìm thấy đơn hàng nào thuộc tài khoản của bạn với thông tin đã cung cấp. Vui lòng kiểm tra lại mã đơn.",
      };
    }
    return { found: false, message: "Không tìm thấy đơn hàng phù hợp với thông tin đã cung cấp." };
  }

  return buildOrderResult(order, Boolean(caller?.userId));
}

/** Chuẩn hoá record Order → shape trả về cho tool + metadata DTO. */
function buildOrderResult(order: any, isAuthenticated: boolean): LookupOrderResult {
  const base: LookupOrderResult = {
    found: true,
    orderCode: order.orderCode,
    status: ORDER_STATUS_VI[order.status] || order.status,
    rawStatus: order.status,
    totalAmount: order.totalAmount,
    itemCount: order.items?.length || 0,
    trackingNumber: order.trackingNumber || "Chưa có",
    createdAt: order.createdAt || new Date(),
  };

  if (isAuthenticated) {
    return {
      ...base,
      recipient: order.shippingName,
      shippingAddress: order.shippingAddress,
      shippingPhone: order.shippingPhone,
    };
  }

  return {
    ...base,
    recipient: undefined,
    shippingAddress: undefined,
    maskedPhone: maskPhone(order.shippingPhone),
  };
}

/** Format kết quả tra cứu ra text (dùng khi AI không trả lời được). */
export function formatLookupOrderFallback(result: LookupOrderResult): string {
  if (!result.found) {
    return "Dạ, em đã kiểm tra nhưng không tìm thấy đơn hàng theo thông tin trên. Anh/chị vui lòng kiểm tra lại mã đơn hoặc số điện thoại giúp em nhé!";
  }
  const recipientLine = result.recipient ? `\nNgười nhận: ${result.recipient}.` : "";
  const phoneLine = result.maskedPhone ? `\nSố điện thoại: ${result.maskedPhone}.` : "";
  return `Đơn hàng **${result.orderCode}** của anh/chị hiện có trạng thái: **${result.status}**.\nTổng tiền: ${formatVnd(result.totalAmount)}.${recipientLine}${phoneLine}`;
}
