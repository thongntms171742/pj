/**
 * regex.ts — tiny regex helpers shared by search / lookup features.
 *
 * User input must NEVER be interpolated into a RegExp directly: always escape first.
 */

/**
 * Escape a string so it can be safely embedded in a RegExp.
 */
export function escapeRegExp(input: string): string {
  if (!input) return "";
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
