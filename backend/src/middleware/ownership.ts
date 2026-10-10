import { Request } from "express";

/**
 * Auth-derived helpers used by controllers after `requireAuth` has
 * already populated `req.user`. Centralize the "is this user the owner of
 * the resource OR an admin?" check that was inlined ~6 times.
 */

/**
 * Return `req.user.id` or throw. Use this in routes that have already
 * gone through `requireAuth`; the throw is a safety net for mis-wired
 * routes.
 */
export function requireUserId(req: Request): string {
  const id = req.user?.id;
  if (!id) {
    throw new Error(
      "requireUserId called without req.user — check that requireAuth is registered before this controller"
    );
  }
  return id;
}

/**
 * True when `req.user` is admin, OR when `ownerId` matches `req.user.id`.
 * Use for IDOR-prevention on user-scoped resources (designs, addresses,
 * orders, etc.).
 */
export function isOwnerOrAdmin(req: Request, ownerId: unknown): boolean {
  if (req.user?.roles?.includes("admin")) return true;
  if (!ownerId || !req.user?.id) return false;
  return String(ownerId) === String(req.user.id);
}

/** True when the authenticated user is admin. */
export function isAdmin(req: Request): boolean {
  return req.user?.roles?.includes("admin") ?? false;
}
