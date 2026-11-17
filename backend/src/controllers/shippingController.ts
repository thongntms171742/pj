import { Request, Response } from "express";
import {
  AddressInfoInput,
  calculateShippingQuote,
  getActiveWarehouse,
  ShippingQuoteInput,
  updateActiveWarehouse,
} from "../services/shippingService";
import { InvalidCommuneError, WrongProvinceError } from "../services/addressService";
import { ok } from "../utils/respond";
import { ErrorCode, handleInternalError, sendError } from "../utils/errors";

/**
 * GET /api/shipping/warehouse
 * Lấy thông tin địa chỉ kho hiện tại của shop (lấy từ DB nếu đã cấu hình, fallback về DEFAULT_WAREHOUSE)
 */
export async function getWarehouse(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const warehouse = await getActiveWarehouse();
    ok(res, { warehouse });
  } catch (err) {
    handleInternalError(res, err, "[shippingController] getWarehouse error");
  }
}

/**
 * PUT / PATCH /api/shipping/warehouse (hoặc /api/admin/warehouse)
 * Cho phép FE / Admin nhập và cập nhật địa chỉ kho gửi hàng (chỉ trong TP.HCM - mã 79)
 */
export async function updateWarehouse(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const rawBody = (req.body || {}) as Record<string, any>;
    const payload: AddressInfoInput =
      rawBody.warehouse && typeof rawBody.warehouse === "object"
        ? rawBody.warehouse
        : rawBody;

    const updatedBy = req.user?.email || req.user?.id || "fe";
    const warehouse = await updateActiveWarehouse(payload, updatedBy);
    ok(res, { warehouse });
  } catch (err) {
    if (err instanceof WrongProvinceError || err instanceof InvalidCommuneError) {
      sendError(res, ErrorCode.INVALID_INPUT, err.message, err.httpCode || 400);
      return;
    }
    handleInternalError(res, err, "[shippingController] updateWarehouse error");
  }
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
