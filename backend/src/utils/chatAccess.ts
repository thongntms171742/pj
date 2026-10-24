/**
 * chatAccess.ts — authorization helpers for BOTH chat systems.
 *
 * The backend currently runs two chat models side by side:
 *
 *  1. AI chatbot (GEMINI) — a `Conversation` document keyed by Mongo
 *     ObjectId. The owner is `conversation.userId` (logged-in buyer) or,
 *     for guests, `conversation.sessionId` (an opaque client-generated id).
 *
 *  2. 1-1 buyer ↔ admin — there is no `Conversation` row at all; the
 *     conversation id is deterministic: `c_<sortedParticipantA>__<B>`.
 *     Participants live in `Message.participants`.
 *
 * Both models used to be readable/writable by *anyone* who knew an id
 * (IDOR). Every controller/socket handler must now call the helpers
 * below BEFORE reading or mutating anything.
 */

import { Types } from "mongoose";
import type { IConversation } from "../models/Conversation";
import { isParticipant, isValidConversationId } from "../services/conversation";

/** Who is asking. All fields are optional because guests have no user id. */
export interface ChatActor {
  /** Mongo user id of the caller (from a verified JWT). */
  userId?: string;
  /** Guest session id (from body / query / socket handshake). */
  sessionId?: string;
  /** True when the caller has the `admin` role. */
  isAdmin?: boolean;
}

/** True when the actor is an admin (explicit flag or role already resolved). */
export function isAdminActor(actor: ChatActor | undefined | null): boolean {
  return Boolean(actor?.isAdmin);
}

/** Extract a comparable string id from a possibly-populated ObjectId ref. */
function refId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const obj = value as { _id?: unknown; toString?: () => string };
    if (obj._id) return String(obj._id);
    // Populated document without _id exposed — fall back to toString only
    // when it looks like an ObjectId hex.
    const s = typeof obj.toString === "function" ? obj.toString() : "";
    return /^[0-9a-fA-F]{24}$/.test(s) ? s : "";
  }
  return String(value);
}

/**
 * Can the actor read/write this AI-chatbot conversation?
 *
 * Rules (first match wins):
 *  - admin                     → always allowed
 *  - conversation has userId   → only that user id
 *  - conversation has sessionId → only that session id (guest credential)
 */
export function canAccessAiConversation(
  conv:
    | Pick<IConversation, "userId" | "sessionId">
    | null
    | undefined,
  actor: ChatActor
): boolean {
  if (!conv) return false;
  if (actor.isAdmin) return true;

  const convUserId = refId(conv.userId);
  if (convUserId) {
    return Boolean(actor.userId) && String(actor.userId) === convUserId;
  }

  const convSessionId = conv.sessionId ? String(conv.sessionId) : "";
  if (!convSessionId) return false;
  return Boolean(actor.sessionId) && String(actor.sessionId) === convSessionId;
}

/**
 * Can the actor read/write this 1-1 (buyer ↔ admin) conversation?
 *
 * Admins may open any well-formed conversation; buyers only their own.
 */
export function canAccessPeerConversation(
  conversationId: string,
  actor: ChatActor
): boolean {
  if (!isValidConversationId(conversationId)) return false;
  if (actor.isAdmin) return true;
  if (!actor.userId) return false;
  return isParticipant(conversationId, String(actor.userId));
}

/** True when the id looks like an AI-chatbot (ObjectId) conversation. */
export function isAiConversationId(id: string): boolean {
  return Types.ObjectId.isValid(id);
}

/** True when the id looks like a 1-1 (buyer ↔ admin) conversation. */
export function isPeerConversationId(id: string): boolean {
  return isValidConversationId(id);
}
