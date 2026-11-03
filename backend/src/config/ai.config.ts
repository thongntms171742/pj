/**
 * ai.config.ts — cấu hình runtime cho toàn bộ AI Module.
 *
 * Nguyên tắc (TDD §5.1):
 *   - KHÔNG hardcode Model ID trong Service. Model đọc từ env để đổi dễ.
 *   - Mọi giới hạn (history, output tokens, tool calls, quota) cũng từ env.
 *   - Feature flag cho phép tắt AI/Copilot/Knowledge mà không cần deploy code.
 *
 * Biến môi trường liên quan: xem `backend/.env.example`.
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

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  if (raw === "false" || raw === "0" || raw === "no") return false;
  return fallback;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export const AI_PROVIDER = "gemini" as const;
export type AiProviderName = typeof AI_PROVIDER;

/** API key Gemini. Rỗng ⇒ AI bị tắt (graceful degradation sang rule/fallback). */
export const GEMINI_API_KEY = str("GEMINI_API_KEY", "");

/** Model ID. KHÔNG hardcode ở service — luôn đọc từ đây. */
export const GEMINI_CHAT_MODEL = str("GEMINI_CHAT_MODEL", "gemini-2.5-flash");

/** Model dùng cho embedding (Phase 4 — semantic search). */
export const GEMINI_EMBEDDING_MODEL = str("GEMINI_EMBEDDING_MODEL", "gemini-embedding-2");

/** Timeout mỗi lần gọi Gemini (ms). */
export const GEMINI_TIMEOUT_MS = num("GEMINI_TIMEOUT_MS", 20_000);

/** Số lần retry có giới hạn khi Gemini lỗi (timeout / 5xx / rate limit). */
export const GEMINI_MAX_RETRIES = num("GEMINI_MAX_RETRIES", 2);

/** Delay backoff cơ sở giữa các lần retry (ms). */
export const GEMINI_RETRY_BASE_DELAY_MS = num("GEMINI_RETRY_BASE_DELAY_MS", 400);

// ── Giới hạn AI ───────────────────────────────────────────────────────────────

/** Số tin nhắn gần nhất đưa vào context cho Gemini. */
export const AI_MAX_HISTORY_MESSAGES = num("AI_MAX_HISTORY_MESSAGES", 20);

/** Token tối đa cho 1 response. */
export const AI_MAX_OUTPUT_TOKENS = num("AI_MAX_OUTPUT_TOKENS", 1024);

/** Số function call tối đa trong 1 lượt xử lý. */
export const AI_MAX_TOOL_CALLS = num("AI_MAX_TOOL_CALLS", 3);

/** Số lượt AI mà 1 user được phép gọi trong 1 ngày. */
export const AI_DAILY_USER_LIMIT = num("AI_DAILY_USER_LIMIT", 100);

/** Ngưỡng confidence dưới đây ⇒ coi như "AI không chắc". */
export const AI_LOW_CONFIDENCE_THRESHOLD = Number(
  str("AI_LOW_CONFIDENCE_THRESHOLD", "0.5")
);

/** Số lần AI thất bại liên tiếp ⇒ auto escalate sang Admin. */
export const AI_MAX_FAILED_ATTEMPTS = num("AI_MAX_FAILED_ATTEMPTS", 2);

// ── Feature flags ─────────────────────────────────────────────────────────────

export const FEATURE_AI_CHAT = bool("FEATURE_AI_CHAT", true);
export const FEATURE_AI_HANDOFF = bool("FEATURE_AI_HANDOFF", true);
export const FEATURE_AI_COPILOT = bool("FEATURE_AI_COPILOT", false);
export const FEATURE_KNOWLEDGE_BASE = bool("FEATURE_KNOWLEDGE_BASE", true);

// ── Prompt ────────────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT_VERSION = str("SYSTEM_PROMPT_VERSION", "v1");

// ── Handoff ───────────────────────────────────────────────────────────────────

/** Số lần escalate tối đa cho 1 user trong cửa sổ thời gian. */
export const HANDOFF_RATE_LIMIT = num("HANDOFF_RATE_LIMIT", 3);

/** Cửa sổ thời gian rate-limit escalate (ms). */
export const HANDOFF_RATE_LIMIT_WINDOW_MS = num(
  "HANDOFF_RATE_LIMIT_WINDOW_MS",
  10 * 60 * 1000
);

/** Số lần AI thất bại liên tiếp trước khi tự chuyển Admin. */
export const HANDOFF_AUTO_ESCALATE_ATTEMPTS = num("HANDOFF_AUTO_ESCALATE_ATTEMPTS", 2);

// ── Kiểm tra nhanh ────────────────────────────────────────────────────────────

/** AI có khả dụng để gọi Gemini không? */
export function isAiAvailable(): boolean {
  return FEATURE_AI_CHAT && GEMINI_API_KEY.length > 0;
}
