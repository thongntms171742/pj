/**
 * chatRateLimit.service.ts — rate limit in-memory cho chat.
 *
 * Vì sao in-memory:
 *   - Chat rate limit là "chống spam 1 user gửi 1000 tin nhắn/lần" — không
 *     cần chính xác phân tán toàn cục, chỉ cần đủ chặn 1 instance.
 *   - Tránh thêm 1 collection Redis/DB cho mỗi endpoint.
 *
 * Lưu ý production: nếu chạy nhiều instance backend, nên chuyển sang
 * Redis (shared store). Interface `consume()` giữ nguyên nên chỉ cần đổi impl.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Dọn bucket đã hết hạn (chạy mỗi N lần gọi để tránh leak memory). */
let cleanupCounter = 0;
const CLEANUP_INTERVAL = 500;

function cleanupExpired(now: number): void {
  cleanupCounter += 1;
  if (cleanupCounter % CLEANUP_INTERVAL !== 0) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Milliseconds cần chờ trước lần gọi kế tiếp. */
  retryAfterMs: number;
}

/**
 * Tiêu thụ 1 lần trong quota.
 *
 * @param key       định danh bucket (VD: `msg:user123`)
 * @param limit     số lần tối đa trong window
 * @param windowMs  độ dài window (ms)
 */
export function consume(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  cleanupExpired(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, existing.resetAt - now),
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: limit - existing.count,
    retryAfterMs: 0,
  };
}

/** Xem trạng thái quota mà KHÔNG tiêu thụ (dùng để hiển thị cho FE). */
export function peek(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    return { allowed: true, remaining: limit, retryAfterMs: 0 };
  }
  const remaining = Math.max(0, limit - existing.count);
  return {
    allowed: remaining > 0,
    remaining,
    retryAfterMs: remaining > 0 ? 0 : Math.max(0, existing.resetAt - now),
  };
}

/** Xoá bucket (dùng khi test, hoặc reset quota theo user). */
export function reset(key: string): void {
  buckets.delete(key);
}

/** Xoá toàn bộ bucket (test). */
export function resetAll(): void {
  buckets.clear();
}
