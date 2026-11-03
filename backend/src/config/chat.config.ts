/**
 * chat.config.ts — cấu hình runtime cho Chat Module.
 *
 * Nguyên tắc (TDD §4.3):
 *   - Giới hạn nghiệp vụ nằm ở config, KHÔNG nằm rải rác trong controller/service.
 *   - Ai đổi rule (độ dài tin nhắn, số tin nhắn/trang) chỉ cần sửa env.
 */

function str(name: string, fallback: string): string {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : fallback;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

// ── Pagination ────────────────────────────────────────────────────────────────

/** Số item mặc định mỗi trang. */
export const CHAT_PAGE_SIZE_DEFAULT = num("CHAT_PAGE_SIZE_DEFAULT", 20);

/** Số item tối đa mỗi trang (chống client đòi page=99999). */
export const CHAT_PAGE_SIZE_MAX = num("CHAT_PAGE_SIZE_MAX", 100);

// ── Nội dung tin nhắn ──────────────────────────────────────────────────────────

/** Độ dài tối đa 1 tin nhắn (ký tự). */
export const CHAT_MESSAGE_MAX_LENGTH = num("CHAT_MESSAGE_MAX_LENGTH", 5000);

/** Số file đính kèm tối đa mỗi tin nhắn. */
export const CHAT_ATTACHMENT_MAX = num("CHAT_ATTACHMENT_MAX", 5);

/** Kích thước tối đa 1 file đính kèm (bytes). */
export const CHAT_ATTACHMENT_MAX_BYTES = num(
  "CHAT_ATTACHMENT_MAX_BYTES",
  10 * 1024 * 1024
);

// ── Handoff ───────────────────────────────────────────────────────────────────

/** Số giờ tối đa admin giữ 1 hội thoại mà không phản hồi trước khi cảnh báo. */
export const CHAT_ADMIN_RESPONSE_SLA_MS = num(
  "CHAT_ADMIN_RESPONSE_SLA_MS",
  5 * 60 * 1000
);

/** Số giờ tối đa 1 hội thoại được mở lại sau khi đóng. */
export const CHAT_REOPEN_WINDOW_MS = num("CHAT_REOPEN_WINDOW_MS", 24 * 60 * 60 * 1000);

// ── Socket ────────────────────────────────────────────────────────────────────

/** Số tin nhắn gửi liên tiếp trong 1 giây trước khi bị chặn. */
export const CHAT_SOCKET_RATE_LIMIT = num("CHAT_SOCKET_RATE_LIMIT", 10);

/** Cửa sổ thời gian rate limit socket (ms). */
export const CHAT_SOCKET_RATE_LIMIT_WINDOW_MS = num(
  "CHAT_SOCKET_RATE_LIMIT_WINDOW_MS",
  1000
);

/** Số tin nhắn/lượt tải trang tối đa trong 1 response. */
export const CHAT_MAX_MESSAGES_PER_PAGE = num("CHAT_MAX_MESSAGES_PER_PAGE", 50);
