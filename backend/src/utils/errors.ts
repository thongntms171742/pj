import { Response } from "express";

// ── Error code catalog ────────────────────────────────────────────────────────
// Single source of truth cho mọi business error code mà BE trả về.
// Frontend dựa vào enum này để branch logic UI (xem docs/ERROR_CODES.md).
//
// Quy tắc:
//   - HẬU TỐ: _REQUIRED, _INVALID, _NOT_FOUND, _OUT_OF_STOCK, _FORBIDDEN,
//     _CONFLICT, _LIMIT, _EXPIRED, _UNAVAILABLE.
//   - KHÔNG dùng string tiếng Việt làm code (chỉ dùng làm message).
//   - Mỗi code PHẢI có mapping trong docs/ERROR_CODES.md.
export const ErrorCode = {
  // ── Generic ────────────────────────────────────────────────────────────────
  INTERNAL_ERROR: "INTERNAL_ERROR",
  INVALID_INPUT: "INVALID_INPUT",
  MISSING_FIELD: "MISSING_FIELD",
  UNAUTHORIZED: "UNAUTHORIZED",
  TOKEN_INVALID: "TOKEN_INVALID",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  UPSTREAM_ERROR: "UPSTREAM_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",

  // ── Auth ──────────────────────────────────────────────────────────────────
  EMAIL_ALREADY_USED: "EMAIL_ALREADY_USED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  ITEMS_REQUIRED: "ITEMS_REQUIRED",
  SELLER_HANDLE_TAKEN: "SELLER_HANDLE_TAKEN",
  SELLER_SHOP_NAME_TAKEN: "SELLER_SHOP_NAME_TAKEN",
  SELLER_ALREADY_APPROVED: "SELLER_ALREADY_APPROVED",

  // ── Seller ────────────────────────────────────────────────────────────────
  SELLER_NOT_APPROVED: "SELLER_NOT_APPROVED",

  // ── Product ──────────────────────────────────────────────────────────────
  PRODUCT_NOT_FOUND: "PRODUCT_NOT_FOUND",
  PRODUCT_NOT_AVAILABLE: "PRODUCT_NOT_AVAILABLE",
  PRODUCT_OUT_OF_STOCK: "PRODUCT_OUT_OF_STOCK",
  PRODUCT_TITLE_REQUIRED: "PRODUCT_TITLE_REQUIRED",
  PRODUCT_PRICE_REQUIRED: "PRODUCT_PRICE_REQUIRED",
  PRODUCT_CONDITION_REQUIRED: "PRODUCT_CONDITION_REQUIRED",
  PRODUCT_SIZE_REQUIRED: "PRODUCT_SIZE_REQUIRED",
  PRODUCT_QUANTITY_INVALID: "PRODUCT_QUANTITY_INVALID",

  // ── Cart ──────────────────────────────────────────────────────────────────
  CART_EMPTY: "CART_EMPTY",
  NO_ITEMS_CHECKED: "NO_ITEMS_CHECKED",
  CART_NOT_FOUND: "CART_NOT_FOUND",
  CART_ITEM_NOT_FOUND: "CART_ITEM_NOT_FOUND",
  SELF_PURCHASE_NOT_ALLOWED: "SELF_PURCHASE_NOT_ALLOWED",
  QUANTITY_EXCEEDS_STOCK: "QUANTITY_EXCEEDS_STOCK",
  PRODUCT_ALREADY_NOT_FOR_SALE: "PRODUCT_ALREADY_NOT_FOR_SALE",

  // ── Order ────────────────────────────────────────────────────────────────
  ORDER_NOT_FOUND: "ORDER_NOT_FOUND",
  ORDER_STATUS_REQUIRED: "ORDER_STATUS_REQUIRED",
  ORDER_INVALID_TRANSITION: "ORDER_INVALID_TRANSITION",
  ORDER_BUYER_NOT_PARTICIPANT: "ORDER_BUYER_NOT_PARTICIPANT",
  ORDER_SELLER_CANNOT_DELIVER: "ORDER_SELLER_CANNOT_DELIVER",
  ORDER_ALREADY_SHIPPED: "ORDER_ALREADY_SHIPPED",
  ORDER_ALREADY_CANCELLED: "ORDER_ALREADY_CANCELLED",
  ORDER_PAYMENT_INVALID_STATE: "ORDER_PAYMENT_INVALID_STATE",
  ORDER_ID_REQUIRED: "ORDER_ID_REQUIRED",

  // ── Review ───────────────────────────────────────────────────────────────
  REVIEW_NOT_ALLOWED: "REVIEW_NOT_ALLOWED",
  REVIEW_ALREADY_EXISTS: "REVIEW_ALREADY_EXISTS",
  REVIEW_RATING_INVALID: "REVIEW_RATING_INVALID",

  // ── AI ────────────────────────────────────────────────────────────────────
  AI_QUERY_INVALID_LENGTH: "AI_QUERY_INVALID_LENGTH",
  AI_IMAGE_INVALID: "AI_IMAGE_INVALID",
  AI_IMAGE_TYPE_INVALID: "AI_IMAGE_TYPE_INVALID",
  AI_QUERY_OR_IMAGE_REQUIRED: "AI_QUERY_OR_IMAGE_REQUIRED",
  AI_UPSTREAM_ERROR: "AI_UPSTREAM_ERROR",
  AI_NOT_CONFIGURED: "AI_NOT_CONFIGURED",
  AI_RECOMMENDATIONS_UNAVAILABLE: "AI_RECOMMENDATIONS_UNAVAILABLE",

  // ── Account ───────────────────────────────────────────────────────────────
  ACCOUNT_NOT_FOUND: "ACCOUNT_NOT_FOUND",
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

// ── HTTP status cho từng ErrorCode ────────────────────────────────────────────
// Cho phép FE đọc trực tiếp statusCode từ error nếu cần,
// nhưng helper sendError luôn set HTTP status explicit.
export const ErrorStatus: Record<ErrorCodeValue, number> = {
  // Generic
  INTERNAL_ERROR: 500,
  INVALID_INPUT: 400,
  MISSING_FIELD: 400,
  UNAUTHORIZED: 401,
  TOKEN_INVALID: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UPSTREAM_ERROR: 502,
  SERVICE_UNAVAILABLE: 503,

  // Auth
  EMAIL_ALREADY_USED: 409,
  INVALID_CREDENTIALS: 401,
  ITEMS_REQUIRED: 400,
  SELLER_HANDLE_TAKEN: 409,
  SELLER_SHOP_NAME_TAKEN: 409,
  SELLER_ALREADY_APPROVED: 409,

  // Seller
  SELLER_NOT_APPROVED: 403,

  // Product
  PRODUCT_NOT_FOUND: 404,
  PRODUCT_NOT_AVAILABLE: 400,
  PRODUCT_OUT_OF_STOCK: 400,
  PRODUCT_TITLE_REQUIRED: 400,
  PRODUCT_PRICE_REQUIRED: 400,
  PRODUCT_CONDITION_REQUIRED: 400,
  PRODUCT_SIZE_REQUIRED: 400,
  PRODUCT_QUANTITY_INVALID: 400,

  // Cart
  CART_EMPTY: 400,
  NO_ITEMS_CHECKED: 400,
  CART_NOT_FOUND: 404,
  CART_ITEM_NOT_FOUND: 404,
  SELF_PURCHASE_NOT_ALLOWED: 400,
  QUANTITY_EXCEEDS_STOCK: 400,
  PRODUCT_ALREADY_NOT_FOR_SALE: 400,

  // Order
  ORDER_NOT_FOUND: 404,
  ORDER_STATUS_REQUIRED: 400,
  ORDER_INVALID_TRANSITION: 422,
  ORDER_BUYER_NOT_PARTICIPANT: 403,
  ORDER_SELLER_CANNOT_DELIVER: 403,
  ORDER_ALREADY_SHIPPED: 400,
  ORDER_ALREADY_CANCELLED: 400,
  ORDER_PAYMENT_INVALID_STATE: 422,
  ORDER_ID_REQUIRED: 400,

  // Review
  REVIEW_NOT_ALLOWED: 403,
  REVIEW_ALREADY_EXISTS: 409,
  REVIEW_RATING_INVALID: 400,

  // AI
  AI_QUERY_INVALID_LENGTH: 400,
  AI_IMAGE_INVALID: 400,
  AI_IMAGE_TYPE_INVALID: 400,
  AI_QUERY_OR_IMAGE_REQUIRED: 400,
  AI_UPSTREAM_ERROR: 502,
  AI_NOT_CONFIGURED: 503,
  AI_RECOMMENDATIONS_UNAVAILABLE: 500,

  // Account
  ACCOUNT_NOT_FOUND: 404,
};

// ── Helper chính: sendError ───────────────────────────────────────────────────
// Mọi error response trong BE PHẢI đi qua helper này để đảm bảo format thống nhất.
//
// Trả về response với format:
//   { error: { code: string, message: string } }
//
// Sử dụng:
//   import { sendError, ErrorCode } from "../utils/errors";
//   sendError(res, ErrorCode.PRODUCT_NOT_FOUND, "Không tìm thấy sản phẩm");
//
// Nếu không truyền status thì helper tự động lấy từ ErrorStatus map.
export function sendError(
  res: Response,
  code: ErrorCodeValue,
  message: string,
  status?: number
): Response {
  const httpStatus = status ?? ErrorStatus[code] ?? 500;
  return res.status(httpStatus).json({
    error: {
      code,
      message,
    },
  });
}

// ── Helper shorthand cho catch block ──────────────────────────────────────────
// Dùng trong catch(err) để thống nhất log + trả INTERNAL_ERROR.
// Trước đây: res.status(500).json({ error: "Lỗi hệ thống" });
// Bây giờ:   handleInternalError(res, err, "[products] getProducts error");
export function handleInternalError(
  res: Response,
  err: unknown,
  context: string
): Response {
  const errorMessage = err instanceof Error ? err.message : String(err);
  console.error(`${context}:`, err);
  return sendError(
    res,
    ErrorCode.INTERNAL_ERROR,
    "Lỗi hệ thống",
    500
    // Note: errorMessage đã được log ở trên nhưng KHÔNG trả ra ngoài
    // để tránh leak thông tin nội bộ (stack trace, DB schema, ...)
  );
}

// ── Type cho FE consumer ──────────────────────────────────────────────────────
// FE nên import type này để có type-safe error handling:
//   type ApiError = { error: { code: ErrorCodeValue; message: string } };
export interface ApiErrorBody {
  error: {
    code: ErrorCodeValue;
    message: string;
  };
}