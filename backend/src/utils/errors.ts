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

  // ── Christmas catalog (Tree only) ──────────────────────────────────────
  TREE_NOT_FOUND: "TREE_NOT_FOUND",
  BANNER_NOT_FOUND: "BANNER_NOT_FOUND",
  CATALOG_ITEM_UNAVAILABLE: "CATALOG_ITEM_UNAVAILABLE",
  OUT_OF_STOCK: "OUT_OF_STOCK",

  // ── Room Design ───────────────────────────────────────────────────────
  DESIGN_NOT_FOUND: "DESIGN_NOT_FOUND",
  DESIGN_NOT_CONFIRMED: "DESIGN_NOT_CONFIRMED",
  ROOM_IMAGE_REQUIRED: "ROOM_IMAGE_REQUIRED",
  /** POST /api/designs/:id/result thiếu file `compositeImage`. */
  COMPOSITE_IMAGE_REQUIRED: "COMPOSITE_IMAGE_REQUIRED",
  /** Endpoint đã bị gỡ (VD: /generate-image khi AI_ROOM_DESIGN_ENABLED=true). */
  ENDPOINT_GONE: "ENDPOINT_GONE",

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
  ORDER_IN_PROGRESS: "ORDER_IN_PROGRESS",

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

  // ── AI Designer ─────────────────────────────────────────────────────────
  AI_GENERATION_FAILED: "AI_GENERATION_FAILED",
  AI_DESIGNER_NOT_CONFIGURED: "AI_DESIGNER_NOT_CONFIGURED",
  AI_PROVIDER_AUTH_FAILED: "AI_PROVIDER_AUTH_FAILED",
  AI_PROVIDER_REQUEST_FAILED: "AI_PROVIDER_REQUEST_FAILED",
  AI_PROVIDER_INVALID_RESPONSE: "AI_PROVIDER_INVALID_RESPONSE",
  AI_PROVIDER_UNAVAILABLE: "AI_PROVIDER_UNAVAILABLE",
  AI_QUOTA_EXCEEDED: "AI_QUOTA_EXCEEDED",
  AI_IMAGE_DOWNLOAD_FAILED: "AI_IMAGE_DOWNLOAD_FAILED",
  AI_IMAGE_TOO_LARGE: "AI_IMAGE_TOO_LARGE",
  AI_GENERATION_TIMEOUT: "AI_GENERATION_TIMEOUT",
  GREETING_CARD_GENERATION_FAILED: "GREETING_CARD_GENERATION_FAILED",

  // ── Chat (v3 unified) ───────────────────────────────────────────────────
  CHAT_CONVERSATION_NOT_FOUND: "CHAT_CONVERSATION_NOT_FOUND",
  CHAT_STATUS_INVALID: "CHAT_STATUS_INVALID",
  CHAT_FORBIDDEN: "CHAT_FORBIDDEN",
  CHAT_INVALID_ID: "CHAT_INVALID_ID",
  CHAT_EMPTY_CONTENT: "CHAT_EMPTY_CONTENT",
  CHAT_MESSAGE_TOO_LONG: "CHAT_MESSAGE_TOO_LONG",

  // ── Review ──────────────────────────────────────────────────────────────
  REVIEW_NOT_FOUND: "REVIEW_NOT_FOUND",
  REVIEW_RATING_INVALID: "REVIEW_RATING_INVALID",
  REVIEW_NOT_ALLOWED: "REVIEW_NOT_ALLOWED",
  REVIEW_ALREADY_EXISTS: "REVIEW_ALREADY_EXISTS",
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
  BANNER_NOT_FOUND: 404,
  CATALOG_ITEM_UNAVAILABLE: 409,
  OUT_OF_STOCK: 409,

  // Design
  DESIGN_NOT_FOUND: 404,
  DESIGN_NOT_CONFIRMED: 400,
  ROOM_IMAGE_REQUIRED: 400,
  COMPOSITE_IMAGE_REQUIRED: 400,
  ENDPOINT_GONE: 410,

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
  ORDER_IN_PROGRESS: 409,

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

  // AI Designer
  AI_GENERATION_FAILED: 502,
  AI_DESIGNER_NOT_CONFIGURED: 503,
  AI_PROVIDER_AUTH_FAILED: 502,
  AI_PROVIDER_REQUEST_FAILED: 502,
  AI_PROVIDER_INVALID_RESPONSE: 502,
  AI_PROVIDER_UNAVAILABLE: 502,
  AI_QUOTA_EXCEEDED: 429,
  AI_IMAGE_DOWNLOAD_FAILED: 502,
  AI_IMAGE_TOO_LARGE: 502,
  AI_GENERATION_TIMEOUT: 504,
  GREETING_CARD_GENERATION_FAILED: 502,

  // Chat
  CHAT_CONVERSATION_NOT_FOUND: 404,
  CHAT_STATUS_INVALID: 400,
  CHAT_FORBIDDEN: 403,
  CHAT_INVALID_ID: 400,
  CHAT_EMPTY_CONTENT: 400,
  CHAT_MESSAGE_TOO_LONG: 400,

  // Review
  REVIEW_NOT_FOUND: 404,
  REVIEW_RATING_INVALID: 400,
  REVIEW_NOT_ALLOWED: 403,
  REVIEW_ALREADY_EXISTS: 409,
};

// ── Main helper: sendError ───────────────────────────────────────────────────
// Every error response in BE MUST go through this helper for consistent
// format: { error: { code, message, requestId? } }.
export function sendError(
  res: Response,
  code: ErrorCodeValue,
  message: string,
  status?: number,
  details?: unknown
): Response {
  const httpStatus = status ?? ErrorStatus[code] ?? 500;
  // Attach requestId so FE can quote it back to dev when reporting bugs.
  const reqId =
    typeof res.req === "object" && res.req !== null && "id" in res.req
      ? String((res.req as { id?: unknown }).id ?? "")
      : "";
  return res.status(httpStatus).json({
    error: {
      code,
      message,
      requestId: reqId || undefined,
      ...(details !== undefined ? { details } : {}),
    },
  });
}

// ── Catch-block shorthand ────────────────────────────────────────────────────
// Use in catch(err) to standardize log + return INTERNAL_ERROR.
//
// Trước đây hàm này nuốt error.message và chỉ trả "Lỗi hệ thống" — khiến
// frontend và dev không biết lỗi gốc. Giờ: vẫn log đầy đủ server-side, và
// TRẢ message gốc cho client để debug nhanh (chỉ leak message, không leak
// stack). requestId đính kèm để FE quote lại cho dev.
export function handleInternalError(
  res: Response,
  err: unknown,
  context: string
): Response {
  const req = res.req as { id?: string } | undefined;
  const reqId = req?.id ?? "—";
  const errorMessage = err instanceof Error ? err.message : String(err);
  console.error(`[req=${reqId}] ${context}:`, err);

  // Build a message that surfaces the real cause, but stays concise and
  // doesn't include stack traces or internal file paths.
  const safeMessage = buildSafeErrorMessage(err, context);

  return sendError(res, ErrorCode.INTERNAL_ERROR, safeMessage, 500);
}

// ── Helper: build a safe-but-useful message for internal errors ────────────
//
// Trade-off: trước đây nuốt hoàn toàn → user/dev không debug được. Giờ:
//   - Log đầy đủ server-side (giữ nguyên).
//   - Trả client 1 message CÓ ÍCH để dev quote lại, nhưng:
//       + Không bao giờ chứa stack trace hay file path
//       + Không chứa keyword nhạy cảm (password, secret, token, key, mongodb://...)
//       + Bị truncate nếu quá dài (Cloudinary đôi khi trả về JSON >1KB)
//       + Luôn kèm `[context]` để biết lỗi từ đâu
const MAX_LEN = 240;
const SENSITIVE_PATTERNS: RegExp[] = [
  /\bpassword\b/i,
  /\bpasswd\b/i,
  /\bsecret\b/i,
  /\btoken\b/i,
  /\bapikey\b/i,
  /\bapi[_-]?key\b/i,
  /\baccess[_-]?key\b/i,
  /\bauth[_-]?key\b/i,
  /\bprivate[_-]?key\b/i,
  /mongodb(\+srv)?:\/\/[^\s]+/i,
  /postgres(ql)?:\/\/[^\s]+/i,
  /redis:\/\/[^\s]+/i,
  /-----BEGIN [A-Z ]+-----/i,
];

function containsSensitive(message: string): boolean {
  return SENSITIVE_PATTERNS.some((re) => re.test(message));
}

function buildSafeErrorMessage(err: unknown, context: string): string {
  const rawMessage =
    err instanceof Error ? err.message : String(err) || "Lỗi không xác định";

  // Nếu message gốc có keyword nhạy cảm → fallback về generic.
  if (containsSensitive(rawMessage)) {
    return `[${context}] Lỗi hệ thống (đã ghi log)`;
  }

  const trimmed =
    rawMessage.length > MAX_LEN
      ? `${rawMessage.slice(0, MAX_LEN)}…`
      : rawMessage;

  return `[${context}] ${trimmed}`;
}

// ── Type for FE consumer ─────────────────────────────────────────────────────
export interface ApiErrorBody {
  error: {
    code: ErrorCodeValue;
    message: string;
  };
}