import { Request, Response } from "express";
import { Coupon } from "../models/Coupon";
import { sendError, ErrorCode, handleInternalError } from "../utils/errors";

export function computeCouponDiscount(
  coupon: { discountType: string; value: number; maxDiscount?: number | null },
  orderTotal: number
): { discountAmount: number; finalTotal: number } {
  let discountAmount = 0;
  if (coupon.discountType === "FIXED") {
    discountAmount = Math.min(orderTotal, coupon.value);
  } else if (coupon.discountType === "PERCENT") {
    const raw = Math.round((orderTotal * coupon.value) / 100);
    discountAmount = coupon.maxDiscount ? Math.min(raw, coupon.maxDiscount) : raw;
    discountAmount = Math.min(orderTotal, discountAmount);
  }
  const finalTotal = Math.max(0, orderTotal - discountAmount);
  return { discountAmount, finalTotal };
}

export const applyCoupon = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, orderTotal } = req.body as {
      code?: string;
      orderTotal?: number;
    };

    if (!code || typeof code !== "string" || !code.trim()) {
      sendError(res, ErrorCode.MISSING_FIELD, "Vui lòng nhập mã giảm giá");
      return;
    }

    const cleanTotal = Math.max(0, Number(orderTotal) || 0);
    const cleanCode = code.trim().toUpperCase();

    const coupon = await Coupon.findOne({ code: cleanCode, isActive: true });
    if (!coupon) {
      sendError(
        res,
        ErrorCode.COUPON_NOT_FOUND,
        "Không tìm thấy mã giảm giá hoặc mã không hợp lệ",
        404
      );
      return;
    }

    const now = new Date();
    if (now < coupon.startDate || now > coupon.endDate) {
      sendError(res, ErrorCode.COUPON_EXPIRED, "Mã giảm giá đã hết thời gian áp dụng", 400);
      return;
    }

    if (coupon.usedCount >= coupon.usageLimit) {
      sendError(res, ErrorCode.COUPON_LIMIT_REACHED, "Mã giảm giá đã hết lượt sử dụng", 400);
      return;
    }

    if (cleanTotal < coupon.minOrderValue) {
      sendError(
        res,
        ErrorCode.COUPON_MIN_ORDER_NOT_MET,
        `Giá trị đơn hàng chưa đạt mức tối thiểu ${coupon.minOrderValue.toLocaleString("vi-VN")}đ`,
        400
      );
      return;
    }

    const { discountAmount, finalTotal } = computeCouponDiscount(coupon, cleanTotal);

    res.json({
      valid: true,
      code: coupon.code,
      discountType: coupon.discountType,
      value: coupon.value,
      discountAmount,
      finalTotal,
      message: `Áp dụng mã giảm giá ${coupon.code} thành công! Giảm ${discountAmount.toLocaleString("vi-VN")}đ`,
    });
  } catch (err) {
    handleInternalError(res, err, "[coupon] applyCoupon error");
  }
};
