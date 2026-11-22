/**
 * otp.ts — helper dùng chung cho OTP 6 số (Quên mật khẩu & Xác thực Email)
 * và class lỗi nghiệp vụ chuẩn cho Auth services.
 */

import crypto from "crypto";
import { getJwtSecret } from "../config/env";
import type { ErrorCodeValue } from "./errors";

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
