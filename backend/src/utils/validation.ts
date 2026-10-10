import { Response } from "express";
import { sendError, ErrorCode } from "./errors";

/**
 * Reusable validators and a "parse + send 400 on failure" helper.
 * Goal: kill the hand-rolled
 *   `if (!body.foo || typeof body.foo !== "string") {
 *      sendError(res, ErrorCode.MISSING_FIELD, "Thiếu foo");
 *      return;
 *    }`
 * pattern that appears ~30 times.
 *
 * Each validator returns `null` when the value is invalid, or the
 * normalized value when it's valid. Controllers chain them with
 * `requireField` to short-circuit on the first invalid field.
 */

export type Validator<T> = (v: unknown) => T | null;

/**
 * Validate a single field. On failure, sends a 400 response and returns
 * `null` so the controller can early-return:
 *
 *   const name = requireField(res, req.body?.name, V.string(200), "name");
 *   if (!name) return;
 */
export function requireField<T>(
  res: Response,
  raw: unknown,
  validator: Validator<T>,
  fieldName: string
): T | null {
  const v = validator(raw);
  if (v === null) {
    sendError(
      res,
      ErrorCode.MISSING_FIELD,
      `Thiếu hoặc sai kiểu dữ liệu: ${fieldName}`
    );
    return null;
  }
  return v;
}

/** Like requireField, but raises INVALID_INPUT with a custom message. */
export function requireValid<T>(
  res: Response,
  raw: unknown,
  validator: Validator<T>,
  fieldName: string,
  hint?: string
): T | null {
  const v = validator(raw);
  if (v === null) {
    sendError(
      res,
      ErrorCode.INVALID_INPUT,
      hint ?? `${fieldName} không hợp lệ`
    );
    return null;
  }
  return v;
}

/** Reusable validator factory. */
export const V = {
  /** Trimmed non-empty string with max length. */
  string: (maxLen = 254): Validator<string> => (v) => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t.length > 0 && t.length <= maxLen ? t : null;
  },
  /** Optional string — returns the trimmed value (possibly empty). */
  stringOptional: (maxLen = 254): Validator<string> => (v) => {
    if (v === undefined || v === null) return "";
    if (typeof v !== "string") return null;
    return v.trim().slice(0, maxLen);
  },
  /** Non-negative integer. */
  positiveInt: (): Validator<number> => (v) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isInteger(n) && n >= 0 ? n : null;
  },
  /** Integer >= 1. */
  positiveIntStrict: (): Validator<number> => (v) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isInteger(n) && n >= 1 ? n : null;
  },
  /** 24-char hex Mongo ObjectId. */
  objectId: (): Validator<string> => (v) =>
    typeof v === "string" && /^[0-9a-fA-F]{24}$/.test(v) ? v : null,
  /** Boolean (coerce from "true"/"false" strings). */
  boolean: (): Validator<boolean> => (v) => {
    if (typeof v === "boolean") return v;
    if (v === "true") return true;
    if (v === "false") return false;
    return null;
  },
  /** String array. */
  stringArray: (): Validator<string[]> => (v) => {
    if (!Array.isArray(v)) return null;
    if (!v.every((x) => typeof x === "string")) return null;
    return v as string[];
  },
};
