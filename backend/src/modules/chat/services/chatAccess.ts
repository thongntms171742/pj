/**
 * chatAccess.ts — authorization helpers cho chat v3 (unified).
 *
 * Chỉ còn MỘT model: `Conversation.participants[]`. Một actor được truy cập
 * conversation khi:
 *  - là admin                                  → luôn được phép, HOẶC
 *  - `participants[].userId` chứa userId của actor (buyer đã đăng nhập), HOẶC
 *  - `participants[].userId` chứa `guest:<sessionId>` của actor (khách vãng lai).
 *
 * Mọi controller / socket handler PHẢI gọi helper này trước khi đọc / ghi.
 */

import { Types } from "mongoose";
import {
  GUEST_PREFIX,
  type ChatParticipantRole,
  type IChatParticipant,
} from "../../../models/Conversation";

/** Ai đang hỏi. Mọi field optional vì guest không có userId. */
export interface ChatActor {
  /** Mongo user id của caller (từ JWT đã verify). */
  userId?: string;
  /** Guest session id (body / query / header / socket handshake). */
  sessionId?: string;
  /** True khi caller có role `admin`. */
  isAdmin?: boolean;
  /** Tên hiển thị (best-effort) — dùng làm `sender.name`. */
  name?: string;
}

/** Chuẩn hoá sessionId: chỉ nhận chuỗi an toàn, tối đa 128 ký tự. */
export function normalizeSessionId(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim();
  if (!s || s.length > 128) return undefined;
  if (!/^[A-Za-z0-9_\-.:]+$/.test(s)) return undefined;
  return s;
}

/** `guest:<sessionId>` cho khách vãng lai. */
export function guestKey(sessionId: string): string {
  return `${GUEST_PREFIX}${sessionId}`;
}

export function isGuestKey(key: string | undefined | null): boolean {
  return typeof key === "string" && key.startsWith(GUEST_PREFIX);
}

/**
 * Participant key "chính" của actor — dùng làm `sender.userId` và để tính
 * `isOwn` / read-state. User đã đăng nhập luôn ưu tiên userId.
 */
export function actorKey(actor: ChatActor | null | undefined): string {
  if (!actor) return "";
  if (actor.userId) return String(actor.userId);
  if (actor.sessionId) return guestKey(actor.sessionId);
  return "";
}

/**
 * MỌI key mà actor có thể khớp trong `participants[].userId`.
 * User đăng nhập vẫn còn giữ sessionId cũ ⇒ cũng truy cập được conversation
 * guest chưa được claim của chính họ.
 */
export function actorKeys(actor: ChatActor | null | undefined): string[] {
  if (!actor) return [];
  const keys: string[] = [];
  if (actor.userId) keys.push(String(actor.userId));
  if (actor.sessionId) keys.push(guestKey(actor.sessionId));
  return keys;
}

/** Role participant tương ứng với actor. */
export function actorRole(actor: ChatActor): ChatParticipantRole {
  if (actor.isAdmin) return "admin";
  if (actor.userId) return "buyer";
  return "guest";
}

export function isAdminActor(actor: ChatActor | undefined | null): boolean {
  return Boolean(actor?.isAdmin);
}

/** Participant (nếu có) của actor trong conversation. */
export function findActorParticipant(
  conv: { participants?: IChatParticipant[] | null } | null | undefined,
  actor: ChatActor
): IChatParticipant | undefined {
  if (!conv?.participants?.length) return undefined;
  const keys = actorKeys(actor);
  if (!keys.length) return undefined;
  // Ưu tiên key chính (userId) trước guest key.
  for (const k of keys) {
    const p = conv.participants.find((x) => x.userId === k);
    if (p) return p;
  }
  return undefined;
}

/**
 * Actor có được đọc/ghi conversation này không?
 *  - admin               → luôn được
 *  - participant khớp key → được
 *  - còn lại             → bị chặn (kể cả conversation null)
 */
export function canAccessConversation(
  conv: { participants?: IChatParticipant[] | null } | null | undefined,
  actor: ChatActor
): boolean {
  if (!conv) return false;
  if (actor.isAdmin) return true;
  return Boolean(findActorParticipant(conv, actor));
}

/** True khi id có dạng ObjectId hợp lệ (24 hex). */
export function isValidConversationId(id: unknown): id is string {
  return typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id) && Types.ObjectId.isValid(id);
}
