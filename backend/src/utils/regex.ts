/**
 * regex.ts — tiny regex helpers shared by search / lookup features.
 *
 * User input must NEVER be interpolated into a RegExp directly: a query
 * like `cây thông (` throws `SyntaxError: Unterminated group` and takes
 * down the whole request. Always escape first.
 */

/**
 * Escape a string so it can be safely embedded in a RegExp.
 *
 *   escapeRegExp("cây (1m8)")  →  "cây \\(1m8\\)"
 *   new RegExp(escapeRegExp("cây (1m8)"), "i")  →  matches literally
 */
export function escapeRegExp(input: string): string {
  if (!input) return "";
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Normalize a Vietnamese phone number to the digits we store, keeping the
 * leading `0` (e.g. "0901 234 567" → "0901234567").
 */
export function normalizePhone(input: string): string {
  return (input || "").replace(/[^\d+]/g, "").replace(/^\+/, "0");
}
