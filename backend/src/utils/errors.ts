import { Response } from "express";

// ── Error code catalog (Build Your Christmas) ────────────────────────────────
// Single source of truth for every business error code BE returns. FE
// branches UI logic off this enum (see docs/ERROR_CODES.md).
//
// Rules:
//   - SUFFIXES: _REQUIRED, _INVALID, _NOT_FOUND, _OUT_OF_STOCK, _FORBIDDEN,
//     _CONFLICT, _LIMIT, _EXPIRED, _UNAVAILABLE.
//   - DO NOT use Vietnamese strings as codes (messages only).
//   - Every code MUST be documented in docs/ERROR_CODES.md.
export const ErrorCode = {
  // ── Generic ──────────────────────────────────────────────────────────────
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

  // ── Address ─────────────────────────────────────────────────────────────
  INVALID_EFFECTIVE_DATE: "INVALID_EFFECTIVE_DATE",
  PROVINCE_NOT_FOUND: "PROVINCE_NOT_FOUND",
  ADDRESS_UPSTREAM_TIMEOUT: "ADDRESS_UPSTREAM_TIMEOUT",
  ADDRESS_UPSTREAM_ERROR: "ADDRESS_UPSTREAM_ERROR",

  // ── Auth ────────────────────────────────────────────────────────────────
  EMAIL_ALREADY_USED: "EMAIL_ALREADY_USED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  ITEMS_REQUIRED: "ITEMS_REQUIRED",

  // ── Christmas catalog (Tree / Style / Accessory) ────────────────────────
  TREE_NOT_FOUND: "TREE_NOT_FOUND",
  STYLE_NOT_FOUND: "STYLE_NOT_FOUND",
  ACCESSORY_NOT_FOUND: "ACCESSORY_NOT_FOUND",
  CATALOG_ITEM_UNAVAILABLE: "CATALOG_ITEM_UNAVAILABLE",
  ACCESSORY_STYLE_MISMATCH: "ACCESSORY_STYLE_MISMATCH",
  ACCESSORY_QUANTITY_INVALID: "ACCESSORY_QUANTITY_INVALID",
  ACCESSORY_DUPLICATED: "ACCESSORY_DUPLICATED",
  OUT_OF_STOCK: "OUT_OF_STOCK",

  // ── Design (TreeDesign) ─────────────────────────────────────────────────
  DESIGN_NOT_FOUND: "DESIGN_NOT_FOUND",
  DESIGN_CONFIG_INVALID: "DESIGN_CONFIG_INVALID",
  DESIGN_NOT_CONFIRMED: "DESIGN_NOT_CONFIRMED",
  DESIGN_NAME_REQUIRED: "DESIGN_NAME_REQUIRED",
  DESIGN_SLUG_TAKEN: "DESIGN_SLUG_TAKEN",

  // ── Personalization ─────────────────────────────────────────────────────
  PERSONALIZATION_REQUIRED: "PERSONALIZATION_REQUIRED",
  PERSONALIZATION_INVALID: "PERSONALIZATION_INVALID",

  // ── Delivery ────────────────────────────────────────────────────────────
  DELIVERY_OPTION_INVALID: "DELIVERY_OPTION_INVALID",
  DELIVERY_AREA_NOT_SUPPORTED: "DELIVERY_AREA_NOT_SUPPORTED",

  // ── Cart ────────────────────────────────────────────────────────────────
  CART_EMPTY: "CART_EMPTY",
  NO_ITEMS_CHECKED: "NO_ITEMS_CHECKED",
  CART_NOT_FOUND: "CART_NOT_FOUND",
  CART_ITEM_NOT_FOUND: "CART_ITEM_NOT_FOUND",

  // ── Order ───────────────────────────────────────────────────────────────
  ORDER_NOT_FOUND: "ORDER_NOT_FOUND",
  ORDER_STATUS_REQUIRED: "ORDER_STATUS_REQUIRED",
  ORDER_INVALID_TRANSITION: "ORDER_INVALID_TRANSITION",
  ORDER_ALREADY_SHIPPED: "ORDER_ALREADY_SHIPPED",
  ORDER_ALREADY_CANCELLED: "ORDER_ALREADY_CANCELLED",
  ORDER_PAYMENT_INVALID_STATE: "ORDER_PAYMENT_INVALID_STATE",
  ORDER_ID_REQUIRED: "ORDER_ID_REQUIRED",
  ORDER_CANCEL_NOT_ALLOWED: "ORDER_CANCEL_NOT_ALLOWED",

  // ── Account / User ──────────────────────────────────────────────────────
  ACCOUNT_NOT_FOUND: "ACCOUNT_NOT_FOUND",
  USER_NOT_FOUND: "USER_NOT_FOUND",

  // ── Coupon ──────────────────────────────────────────────────────────────
  COUPON_NOT_FOUND: "COUPON_NOT_FOUND",
  COUPON_EXPIRED: "COUPON_EXPIRED",
  COUPON_MIN_ORDER_NOT_MET: "COUPON_MIN_ORDER_NOT_MET",
  COUPON_LIMIT_REACHED: "COUPON_LIMIT_REACHED",

  // ── Delivery extension ──────────────────────────────────────────────────
  READY_TO_DISPLAY_HCM_ONLY: "READY_TO_DISPLAY_HCM_ONLY",

  // ── Media upload & webhook ──────────────────────────────────────────────
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  UNSUPPORTED_MEDIA_TYPE: "UNSUPPORTED_MEDIA_TYPE",
  WEBHOOK_INVALID_SIGNATURE: "WEBHOOK_INVALID_SIGNATURE",
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

// ── HTTP status for each ErrorCode ───────────────────────────────────────────
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

  // Address
  INVALID_EFFECTIVE_DATE: 400,
  PROVINCE_NOT_FOUND: 404,
  ADDRESS_UPSTREAM_TIMEOUT: 504,
  ADDRESS_UPSTREAM_ERROR: 502,

  // Christmas catalog
  TREE_NOT_FOUND: 404,
  STYLE_NOT_FOUND: 404,
  ACCESSORY_NOT_FOUND: 404,
  CATALOG_ITEM_UNAVAILABLE: 409,
  ACCESSORY_STYLE_MISMATCH: 400,
  ACCESSORY_QUANTITY_INVALID: 400,
  ACCESSORY_DUPLICATED: 400,
  OUT_OF_STOCK: 409,

  // Design
  DESIGN_NOT_FOUND: 404,
  DESIGN_CONFIG_INVALID: 400,
  DESIGN_NOT_CONFIRMED: 400,
  DESIGN_NAME_REQUIRED: 400,
  DESIGN_SLUG_TAKEN: 409,

  // Personalization
  PERSONALIZATION_REQUIRED: 400,
  PERSONALIZATION_INVALID: 400,

  // Delivery
  DELIVERY_OPTION_INVALID: 400,
  DELIVERY_AREA_NOT_SUPPORTED: 422,

  // Cart
  CART_EMPTY: 400,
  NO_ITEMS_CHECKED: 400,
  CART_NOT_FOUND: 404,
  CART_ITEM_NOT_FOUND: 404,

  // Order
  ORDER_NOT_FOUND: 404,
  ORDER_STATUS_REQUIRED: 400,
  ORDER_INVALID_TRANSITION: 422,
  ORDER_ALREADY_SHIPPED: 400,
  ORDER_ALREADY_CANCELLED: 400,
  ORDER_PAYMENT_INVALID_STATE: 422,
  ORDER_ID_REQUIRED: 400,
  ORDER_CANCEL_NOT_ALLOWED: 409,

  // Account / User
  ACCOUNT_NOT_FOUND: 404,
  USER_NOT_FOUND: 404,

  // Coupon
  COUPON_NOT_FOUND: 404,
  COUPON_EXPIRED: 400,
  COUPON_MIN_ORDER_NOT_MET: 400,
  COUPON_LIMIT_REACHED: 400,

  // Delivery
  READY_TO_DISPLAY_HCM_ONLY: 400,

  // Upload & Webhook
  FILE_TOO_LARGE: 400,
  UNSUPPORTED_MEDIA_TYPE: 415,
  WEBHOOK_INVALID_SIGNATURE: 401,
};

// ── Main helper: sendError ───────────────────────────────────────────────────
// Every error response in BE MUST go through this helper for consistent
// format: { error: { code, message } }.
export function sendError(
  res: Response,
  code: ErrorCodeValue,
  message: string,
  status?: number
): Response {
  const httpStatus = status ?? ErrorStatus[code] ?? 500;
  return res.status(httpStatus).json({
    error: { code, message },
  });
}

// ── Catch-block shorthand ────────────────────────────────────────────────────
// Use in catch(err) to standardize log + return INTERNAL_ERROR.
export function handleInternalError(
  res: Response,
  err: unknown,
  context: string
): Response {
  const errorMessage = err instanceof Error ? err.message : String(err);
  console.error(`${context}:`, err);
  return sendError(res, ErrorCode.INTERNAL_ERROR, "Lỗi hệ thống", 500);
}

// ── Type for FE consumer ─────────────────────────────────────────────────────
export interface ApiErrorBody {
  error: {
    code: ErrorCodeValue;
    message: string;
  };
}