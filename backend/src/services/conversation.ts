/**
 * conversation.ts — 1-1 conversation helpers
 *
 * Design: each buyer ↔ admin pair has EXACTLY ONE conversation.
 * We compute the conversationId deterministically from sorted participant
 * IDs, so we never need a separate Conversation collection (saves a round
 * trip + keeps the data model simple).
 *
 * Format: `c_<sortedIdA>_<sortedIdB>`
 *   - "c_" prefix namespaces our room IDs (in case other features
 *     reuse socket.io rooms in the future)
 *   - sorted ascending so (A,B) and (B,A) yield the same ID
 *   - ObjectId is hex (24 chars), so the result is safe to use as a
 *     socket.io room name and a Mongo string field
 *
 * Edge case: what if a user chats with another user (not admin)?
 *  - We disallow this in the controller: a buyer's only valid peer is
 *    "admin". A user with role "admin" can chat with any buyer.
 *  - This keeps the security model simple: buyer-side queries always
 *    pin the admin peer, so they can't peek at other buyers' chats.
 */

import { Types } from "mongoose";
import { User } from "../models/User";

/**
 * Admin "team" identifier.
 *
 * IMPORTANT: this is the admin USER's MongoDB ObjectId (as a string), NOT
 * the literal word "admin". Using the literal would mean the participants
 * field on saved messages never matches the real admin's _id, which
 * breaks:
 *   - Admin's auto-join on socket connect (auto-joined 0 conversations)
 *   - Admin's inbox / listConversations (empty)
 *   - countUnreadForUser when called for the admin
 *
 * We resolve it lazily from the DB on first access and cache in memory
 * for the rest of the process lifetime. If you add a second admin
 * account, restart the server.
 */
let _cachedAdminTeamId: string | null = null;
export const ADMIN_TEAM_ID_FALLBACK = "admin"; // legacy literal — never used in new messages
export async function getAdminTeamId(): Promise<string> {
  if (_cachedAdminTeamId) return _cachedAdminTeamId;
  // Prefer a dedicated admin email; otherwise pick any user with role=admin
  const admin =
    (await User.findOne({ email: "admin@buildyourchristmas.vn" })
      .select("_id")
      .lean()) ||
    (await User.findOne({ roles: "admin" }).select("_id").lean());
  if (!admin) {
    // No admin exists yet — fall back to literal so the API still
    // responds gracefully until one is seeded. log a warning.
    console.warn(
      "[conversation] No admin user found in DB — using literal 'admin' as fallback. Seed an admin first."
    );
    return ADMIN_TEAM_ID_FALLBACK;
  }
  _cachedAdminTeamId = String(admin._id);
  return _cachedAdminTeamId;
}

// Legacy synchronous constant for callers that can't await.
// In practice, prefer getAdminTeamId(). Anything that uses this literal
// should be migrated.
export const ADMIN_TEAM_ID = ADMIN_TEAM_ID_FALLBACK;
const PREFIX = "c_";

/**
 * The default peer for a buyer (every buyer chats with the admin team).
 * Returns the admin user's ObjectId (as a string).
 */
export async function getDefaultPeerForBuyer(_userId: string): Promise<string> {
  return getAdminTeamId();
}

/**
 * Check if a userId is the admin team pseudo-ID.
 */
export function isAdminPeer(userId: string): boolean {
  return userId === ADMIN_TEAM_ID;
}

/**
 * Compute the deterministic conversation ID for a pair of participants.
 * Both userA and userB can be real ObjectIds or the admin pseudo-id.
 * The result is stable regardless of argument order.
 */
export function getConversationId(userA: string, userB: string): string {
  if (!userA || !userB) {
    throw new Error("conversation: both participants are required");
  }
  const [a, b] = [userA, userB].sort();
  return `${PREFIX}${a}__${b}`;
}

/**
 * Validate that a string looks like a conversation ID we generated.
 * Used to reject arbitrary input from the client.
 */
export function isValidConversationId(id: string): boolean {
  return typeof id === "string" && id.startsWith(PREFIX) && id.includes("__");
}

/**
 * Extract participant IDs from a conversation ID.
 * Returns null if the format is invalid.
 */
export function parseConversationId(id: string): { a: string; b: string } | null {
  if (!isValidConversationId(id)) return null;
  const body = id.slice(PREFIX.length); // strip "c_"
  const sep = body.indexOf("__");
  if (sep < 0) return null;
  return { a: body.slice(0, sep), b: body.slice(sep + 2) };
}

/**
 * Check whether `userId` is a participant in the given conversation.
 */
export function isParticipant(conversationId: string, userId: string): boolean {
  const p = parseConversationId(conversationId);
  if (!p) return false;
  return p.a === userId || p.b === userId;
}

/**
 * Get the OTHER participant in a 1-1 conversation. Returns null if
 * the user is not a participant.
 */
export function getOtherParticipant(
  conversationId: string,
  userId: string
): string | null {
  const p = parseConversationId(conversationId);
  if (!p) return null;
  if (p.a === userId) return p.b;
  if (p.b === userId) return p.a;
  return null;
}

/**
 * Convenience: assert that a conversationId is valid AND that userId is
 * one of its participants. Throws an Error with a code property on failure.
 */
export function assertMember(
  conversationId: string,
  userId: string
): void {
  if (!isValidConversationId(conversationId)) {
    const err = new Error("INVALID_CONVERSATION_ID");
    (err as Error & { code: string }).code = "INVALID_CONVERSATION_ID";
    throw err;
  }
  if (!isParticipant(conversationId, userId)) {
    const err = new Error("FORBIDDEN_NOT_PARTICIPANT");
    (err as Error & { code: string }).code = "FORBIDDEN_NOT_PARTICIPANT";
    throw err;
  }
}

/**
 * Resolve the conversationId between currentUser and peer.
 * - For buyers: peer must be the admin team (we don't allow buyer↔buyer).
 * - For admins: peer is the buyer's id (must be a valid ObjectId).
 *
 * Returns the conversationId, or throws with .code on invalid peer.
 */
export function resolveConversationBetween(
  currentUser: { id: string; isAdmin: boolean },
  peerId: string
): string {
  if (currentUser.isAdmin) {
    // Admin → buyer
    if (!Types.ObjectId.isValid(peerId)) {
      const err = new Error("INVALID_PEER");
      (err as Error & { code: string }).code = "INVALID_PEER";
      throw err;
    }
    return getConversationId(currentUser.id, peerId);
  }
  // Buyer → must be the admin team's ObjectId. We accept BOTH the
  // resolved ObjectId AND the legacy literal "admin" for back-compat
  // with FE that still sends the old constant.
  if (peerId !== ADMIN_TEAM_ID && peerId !== ADMIN_TEAM_ID_FALLBACK) {
    const err = new Error("FORBIDDEN_PEER");
    (err as Error & { code: string }).code = "FORBIDDEN_PEER";
    throw err;
  }
  // For new conversationIds, use the resolved admin ObjectId so the
  // admin's auto-join query actually finds the message.
  // Since this is sync, we have to fall back to the literal here. The
  // proper fix is in the controller — see chatController.sendMessage
  // which awaits getAdminTeamId() before resolving.
  return getConversationId(currentUser.id, peerId);
}

/**
 * Async variant that resolves the admin ObjectId before building the
 * conversationId. Use this everywhere on the buyer→admin path.
 */
export async function resolveConversationBetweenAsync(
  currentUser: { id: string; isAdmin: boolean },
  peerId: string
): Promise<string> {
  if (currentUser.isAdmin) {
    if (!Types.ObjectId.isValid(peerId)) {
      const err = new Error("INVALID_PEER");
      (err as Error & { code: string }).code = "INVALID_PEER";
      throw err;
    }
    return getConversationId(currentUser.id, peerId);
  }
  // Buyer — replace legacy "admin" with the real ObjectId.
  const adminId = await getAdminTeamId();
  return getConversationId(currentUser.id, adminId);
}
