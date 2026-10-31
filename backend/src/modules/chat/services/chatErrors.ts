import type { Response } from "express";
import { ErrorCode, sendError, type ErrorCodeValue } from "../../../utils/errors";

/**
 * Lỗi nghiệp vụ của module chat. Service ném `ChatError`, controller REST map
 * sang `sendError()` và socket map sang `chat:error { code, message }`.
 */
export class ChatError extends Error {
  readonly code: ErrorCodeValue;
  readonly status?: number;

  constructor(code: ErrorCodeValue, message: string, status?: number) {
    super(message);
    this.name = "ChatError";
    this.code = code;
    this.status = status;
  }
}

export function isChatError(err: unknown): err is ChatError {
  return err instanceof ChatError;
}

/** Gửi ChatError dưới dạng HTTP error chuẩn `{ error: { code, message } }`. */
export function sendChatError(res: Response, err: ChatError): Response {
  return sendError(res, err.code, err.message, err.status);
}

// ── Shorthand constructors ──────────────────────────────────────────────────
export const chatErrors = {
  invalidId: (what = "ID cuộc trò chuyện") =>
    new ChatError(ErrorCode.CHAT_INVALID_ID, `${what} không hợp lệ`),
  notFound: () =>
    new ChatError(ErrorCode.CHAT_CONVERSATION_NOT_FOUND, "Không tìm thấy cuộc trò chuyện"),
  forbidden: (message = "Bạn không có quyền truy cập cuộc trò chuyện này") =>
    new ChatError(ErrorCode.CHAT_FORBIDDEN, message),
  emptyContent: () =>
    new ChatError(ErrorCode.CHAT_EMPTY_CONTENT, "Nội dung tin nhắn không được để trống"),
  tooLong: (max: number) =>
    new ChatError(ErrorCode.CHAT_MESSAGE_TOO_LONG, `Tin nhắn tối đa ${max} ký tự`),
  statusInvalid: (message = "Trạng thái không hợp lệ") =>
    new ChatError(ErrorCode.CHAT_STATUS_INVALID, message),
  identityRequired: () =>
    new ChatError(ErrorCode.MISSING_FIELD, "Thiếu sessionId hoặc thông tin đăng nhập"),
  loginRequired: (message = "Cần đăng nhập để sử dụng kênh hỗ trợ") =>
    new ChatError(ErrorCode.UNAUTHORIZED, message),
  invalidInput: (message: string) => new ChatError(ErrorCode.INVALID_INPUT, message),
};
