/**
 * otp.ts — helper dùng chung cho OTP 6 số (Quên mật khẩu & Xác thực Email)
 * và class lỗi nghiệp vụ chuẩn cho Auth services.
 */

import crypto from "crypto";
import { getJwtSecret } from "../config/env";
import { EmailDeliveryError } from "../services/emailService";
import { ErrorCode, type ErrorCodeValue } from "./errors";

export class AuthFlowError extends Error {
  public readonly code: ErrorCodeValue;
  public readonly status: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCodeValue,
    message: string,
    status = 400,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AuthFlowError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function readPositiveIntEnv(envName: string, fallback: number): number {
  const raw = process.env[envName]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function generateOtpCode(): string {
  return crypto.randomInt(100_000, 1_000_000).toString();
}

export function generateHexToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

export function hashOtpSecret(
  userId: string,
  secret: string,
  purpose: "otp" | "reset_token" | "email_verify"
): string {
  return crypto
    .createHmac("sha256", getJwtSecret())
    .update(`${purpose}:${userId}:${secret}`)
    .digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function isValidOtpFormat(value: unknown): value is string {
  return typeof value === "string" && /^\d{6}$/.test(value.trim());
}

/**
 * Kiểm tra & ghi nhận mốc cooldown gửi OTP theo `key`.
 * Ném `AuthFlowError` (429) kèm `retryAfterSeconds` nếu chưa hết thời gian chờ.
 */
export function enforceOtpCooldown(
  cooldownMap: Map<string, number>,
  key: string,
  cooldownMs: number,
  errorCode: ErrorCodeValue,
  buildMessage: (retryAfterSeconds: number) => string
): { now: number; prevSentAt: number | undefined } {
  const now = Date.now();
  const prevSentAt = cooldownMap.get(key);
  if (prevSentAt !== undefined && now - prevSentAt < cooldownMs) {
    const retryAfterSeconds = Math.max(1, Math.ceil((cooldownMs - (now - prevSentAt)) / 1000));
    throw new AuthFlowError(errorCode, buildMessage(retryAfterSeconds), 429, {
      retryAfterSeconds,
    });
  }
  cooldownMap.set(key, now);
  return { now, prevSentAt };
}

/** Khôi phục trạng thái cooldown khi gửi email thất bại để user có thể thử lại ngay. */
export function restoreOtpCooldown(
  cooldownMap: Map<string, number>,
  key: string,
  prevSentAt: number | undefined
): void {
  if (prevSentAt !== undefined) cooldownMap.set(key, prevSentAt);
  else cooldownMap.delete(key);
}

/** Chuyển `EmailDeliveryError` thành `AuthFlowError` chuẩn HTTP contract. */
export function rethrowAsAuthFlowError(err: unknown): never {
  if (err instanceof EmailDeliveryError) {
    throw new AuthFlowError(
      err.status === 503 ? ErrorCode.SERVICE_UNAVAILABLE : ErrorCode.UPSTREAM_ERROR,
      err.message,
      err.status
    );
  }
  throw err;
}

export interface OtpRecordGuardOptions {
  expiresAt: Date;
  attempts: number;
  maxAttempts: number;
  clearRecords: () => Promise<unknown>;
  expiredCode: ErrorCodeValue;
  expiredMessage: string;
  tooManyAttemptsCode: ErrorCodeValue;
  tooManyAttemptsMessage: string;
}

/** Đảm bảo bản ghi OTP còn hạn và chưa vượt quá số lần nhập sai cho phép. */
export async function assertOtpRecordActive(opts: OtpRecordGuardOptions): Promise<void> {
  if (opts.expiresAt.getTime() <= Date.now()) {
    await opts.clearRecords();
    throw new AuthFlowError(opts.expiredCode, opts.expiredMessage, 400);
  }
  if (opts.attempts >= opts.maxAttempts) {
    await opts.clearRecords();
    throw new AuthFlowError(opts.tooManyAttemptsCode, opts.tooManyAttemptsMessage, 429);
  }
}

export interface ConsumeInvalidOtpOptions {
  fallbackAttempts: number;
  maxAttempts: number;
  incrementAttempt: () => Promise<number | undefined>;
  clearRecords: () => Promise<unknown>;
  tooManyAttemptsCode: ErrorCodeValue;
  tooManyAttemptsMessage: string;
  invalidCode: ErrorCodeValue;
  invalidMessage: string;
}

/** Tăng bộ đếm sai OTP; xoá bản ghi và khoá tạm nếu chạm ngưỡng tối đa. */
export async function consumeInvalidOtpAttempt(opts: ConsumeInvalidOtpOptions): Promise<never> {
  const incremented = await opts.incrementAttempt();
  const nextAttempts = incremented ?? opts.fallbackAttempts + 1;
  if (nextAttempts >= opts.maxAttempts) {
    await opts.clearRecords();
    throw new AuthFlowError(opts.tooManyAttemptsCode, opts.tooManyAttemptsMessage, 429);
  }
  throw new AuthFlowError(opts.invalidCode, opts.invalidMessage, 400, {
    remainingAttempts: Math.max(0, opts.maxAttempts - nextAttempts),
  });
}
