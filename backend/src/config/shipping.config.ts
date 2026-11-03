/**
 * shipping.config.ts — cấu hình chính sách giao hàng cho AI + FE.
 *
 * Nguồn sự thật duy nhất về: phí ship, thời gian sản xuất, vùng giao,
 * thanh toán khi giao. AI tool `shippingInfo` đọc từ đây ⇒ không bao giờ
 * bịa số liệu trong prompt.
 */

import { SHIPPING_FEE, DELIVERY_OPTIONS } from "./business";

function num(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export const SHIPPING_CONFIG = {
  /** Phí giao hàng mặc định (VND). */
  shippingFee: num("CHAT_SHIPPING_FEE", SHIPPING_FEE),

  /** Số ngày làm sản phẩm handmade trước khi gửi. */
  productionDays: num("CHAT_PRODUCTION_DAYS", 2),

  /** Số ngày giao hàng dự kiến (sau khi đã sản xong). */
  estimatedDeliveryDays: num("CHAT_DELIVERY_DAYS", 3),

  /** Có hỗ trợ thanh toán khi nhận hàng không. */
  codSupported: (process.env.CHAT_COD_SUPPORTED?.trim() ?? "true") === "true",

  /** Phí COD (VND). */
  codFee: num("CHAT_COD_FEE", 0),

  /**
   * Tỉnh/thành giao được. Rỗng ⇒ chưa cấu hình ⇒ AI phải chuyển nhân viên.
   */
  supportedProvinces: (process.env.CHAT_SUPPORTED_PROVINCES?.trim() ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0),

  /** Các lựa chọn giao hàng. */
  deliveryOptions: DELIVERY_OPTIONS,
} as const;
