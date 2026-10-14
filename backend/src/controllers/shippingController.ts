import { Request, Response } from "express";
import { DEFAULT_WAREHOUSE } from "../config/business";
import {
  calculateShippingQuote,
  ShippingQuoteInput,
} from "../services/shippingService";
import { ok } from "../utils/respond";
import { handleInternalError } from "../utils/errors";

/**
 * GET /api/shipping/warehouse
 * Lấy thông tin địa chỉ kho mặc định của shop để FE hiển thị
 */
export async function getWarehouse(
  _req: Request,
  res: Response
): Promise<void> {
  ok(res, { warehouse: DEFAULT_WAREHOUSE });
}

/**
 * POST /api/shipping/quote
 * Báo giá phí vận chuyển dựa trên khoảng cách từ kho đến phường/địa chỉ của khách
 */
export async function quoteShipping(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const body = (req.body || {}) as ShippingQuoteInput;
    const result = await calculateShippingQuote(body);
    ok(res, result);
  } catch (err) {
    handleInternalError(res, err, "[shippingController] quoteShipping error");
  }
}
