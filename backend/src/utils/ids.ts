import { Types } from "mongoose";

// ── ID helpers ──────────────────────────────────────────────────────────────
// Centralize ObjectId → string conversion so we don't sprinkle
// `String(o._id)` / `o._id.toString()` everywhere. Also centralize the
// "is this string a valid Mongo ObjectId?" check + the order-id-or-code
// filter that was duplicated in 5+ controllers.

/** Convert an unknown id-like value to a plain string. */
export function toStr(id: unknown): string {
  if (id === null || id === undefined) return "";
  if (id instanceof Types.ObjectId) return id.toString();
  if (typeof id === "string") return id;
  if (typeof id === "object" && id !== null && "_id" in id) {
    return toStr((id as { _id: unknown })._id);
  }
  return String(id);
}

/** True if `s` looks like a 24-char hex Mongo ObjectId. */
export function isObjectIdLike(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-fA-F]{24}$/.test(s);
}

/**
 * Build a Mongo filter that matches an order by either its `_id` (if the
 * input is ObjectId-shaped) or its `orderCode` (e.g. "BYC-12345678").
 * Use this in any controller that accepts both lookup forms:
 *
 *   const order = await Order.findOne(findOrderByIdOrCode(id));
 */
export function findOrderByIdOrCode(id: string): Record<string, unknown> {
  return isObjectIdLike(id)
    ? { $or: [{ _id: id }, { orderCode: id }] }
    : { orderCode: id };
}

/**
 * Build a Mongo `$or` filter that matches by orderCode and, when
 * `buyerId` is provided, is scoped to a single user. Keeps the
 * "is this an ObjectId?" branching in one place.
 */
export function findOrderByIdOrCodeForUser(
  id: string,
  buyerId: string
): Record<string, unknown> {
  const or: Record<string, unknown>[] = [{ orderCode: id }];
  if (isObjectIdLike(id)) or.push({ _id: id });
  return { $and: [{ $or: or }, { buyerId }] };
}
