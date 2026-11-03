/**
 * conversation.service.ts — nghiệp vụ vòng đời hội thoại (TDD §6.1).
 *
 * Trách nhiệm:
 *   - Tạo / list / lấy conversation.
 *   - Chuyển `supportMode` & `status` theo state machine hợp lệ.
 *   - Quản lý `unreadCount` (2 chiều: user ↔ admin).
 *   - Optimistic locking qua `version` để chống race khi 2 admin cùng claim.
 *
 * Mọi hàm export nhận `actor: ChatActor` và tự kiểm tra quyền — controller
 * không được tự kiểm tra `userId === req.user.id`.
 */

import { Types } from "mongoose";
import {
  Conversation,
  type ConversationStatus,
  type IConversation,
  type SupportMode,
} from "../../../models/Conversation";
import { Message } from "../../../models/Message";
import { ErrorCode } from "../../../utils/errors";
import { CHAT_REOPEN_WINDOW_MS } from "../../../config/chat.config";
import {
  ChatError,
  isAdmin,
  loadConversationForActor,
  loadOwnedConversation,
  type ChatActor,
} from "./chatPermission.service";
import {
  emitConversationUpdated,
  emitUnreadChanged,
} from "../socket/chat.emitter";
import { conversationToDto } from "../dto/chat.mapper";

// ── State machine ─────────────────────────────────────────────────────────────

/**
 * Transition hợp lệ của `status`.
 *   open   → pending, closed
 *   pending→ open, closed
 *   closed → open (chỉ trong cửa sổ reopen)
 */
const STATUS_TRANSITIONS: Record<ConversationStatus, ConversationStatus[]> = {
  open: ["pending", "closed"],
  pending: ["open", "closed"],
  closed: ["open"],
};

/**
 * Transition hợp lệ của `supportMode`.
 *   ai           → waiting_admin (escalate), human (admin nhận), ai_assisted
 *   waiting_admin→ human (admin nhận), ai (user hủy / AI tiếp tục)
 *   human        → ai_assisted (admin bật copilot), ai (trả về AI)
 *   ai_assisted  → human, ai
 */
const MODE_TRANSITIONS: Record<SupportMode, SupportMode[]> = {
  ai: ["waiting_admin", "human", "ai_assisted"],
  waiting_admin: ["human", "ai"],
  human: ["ai_assisted", "ai", "waiting_admin"],
  ai_assisted: ["human", "ai"],
};

export function canTransitionStatus(
  from: ConversationStatus,
  to: ConversationStatus
): boolean {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canTransitionMode(
  from: SupportMode,
  to: SupportMode
): boolean {
  return MODE_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ListConversationsOptions {
  page?: number;
  limit?: number;
  status?: ConversationStatus | "all";
}

export interface ConversationUserInfo {
  _id: Types.ObjectId;
  name: string;
  email: string;
  avatarUrl?: string;
}

export interface ConversationAdminInfo {
  _id: Types.ObjectId;
  name: string;
}

/**
 * Lấy raw ObjectId của `assignedAdminId`.
 *
 * Sau khi `populate`, field này là document `{ _id, name }` chứ không phải
 * ObjectId thuần. Helper này chuẩn hoá về ObjectId để so sánh/filter.
 */
export function rawAssignedAdminId(
  conversation: IConversation
): Types.ObjectId | null {
  const value = conversation.assignedAdminId as unknown;
  if (!value) return null;
  if (value instanceof Types.ObjectId) return value;
  if (typeof value === "object" && "_id" in (value as Record<string, unknown>)) {
    return new Types.ObjectId(String((value as { _id: unknown })._id));
  }
  return new Types.ObjectId(String(value));
}

/**
 * Load tên admin theo danh sách ObjectId.
 *
 * KHÔNG dùng `populate("assignedAdminId")` vì populate trả `null` khi user
 * không còn tồn tại ⇒ mất luôn ObjectId gốc. Lookup riêng giữ được cả 2.
 */
export async function loadAdminNames(
  adminIds: Array<Types.ObjectId | null | undefined>
): Promise<Map<string, string>> {
  const valid = adminIds.filter(
    (id): id is Types.ObjectId => id instanceof Types.ObjectId
  );
  const unique = [...new Map(valid.map((id) => [String(id), id])).values()];
  if (unique.length === 0) return new Map();

  const { User } = await import("../../../models/User");
  const users = await User.find({ _id: { $in: unique } })
    .select("name")
    .lean();

  const map = new Map<string, string>();
  for (const u of users) {
    map.set(String(u._id), u.name ?? "");
  }
  return map;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function assertTransition(
  from: ConversationStatus,
  to: ConversationStatus,
  modeFrom: SupportMode,
  modeTo: SupportMode
): void {
  // Status không đổi ⇒ chỉ đổi supportMode (VD: admin nhận hội thoại).
  if (from !== to && !canTransitionStatus(from, to)) {
    throw new ChatError(
      ErrorCode.CHAT_STATUS_INVALID,
      `Không thể chuyển trạng thái từ "${from}" sang "${to}"`,
      400
    );
  }
  if (modeFrom !== modeTo && !canTransitionMode(modeFrom, modeTo)) {
    throw new ChatError(
      ErrorCode.CHAT_STATUS_INVALID,
      `Không thể chuyển chế độ hỗ trợ từ "${modeFrom}" sang "${modeTo}"`,
      400
    );
  }
}

function normalizePagination(page?: number, limit?: number) {
  const safePage = Number.isFinite(page) && page! > 0 ? Math.floor(page!) : 1;
  const safeLimit =
    Number.isFinite(limit) && limit! > 0 ? Math.floor(limit!) : 20;
  return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
}

// ── Create ────────────────────────────────────────────────────────────────────

/**
 * Tạo conversation mới cho user.
 *
 * - Idempotent: nếu user đã có conversation `open`/`pending` thì trả lại
 *   conversation đó thay vì tạo trùng (1 user — 1 hội thoại active).
 * - `supportMode` khởi tạo là `ai` nếu AI khả dụng, ngược lại `waiting_admin`.
 */
export async function createConversation(
  actor: ChatActor,
  options: { forceNew?: boolean } = {}
): Promise<IConversation> {
  if (!actor?.userId || !Types.ObjectId.isValid(actor.userId)) {
    throw new ChatError(ErrorCode.CHAT_INVALID_ID, "User ID không hợp lệ");
  }

  if (!options.forceNew) {
    const existing = await Conversation.findOne({
      userId: actor.userId,
      status: { $in: ["open", "pending"] },
    }).sort({ lastMessageAt: -1, createdAt: -1 });

    if (existing) return existing;
  }

  // AI khả dụng → bắt đầu ở mode AI. Ngược lại → chờ admin.
  const { isAiAvailable } = await import("../../../config/ai.config");
  const supportMode: SupportMode = isAiAvailable() ? "ai" : "waiting_admin";

  return Conversation.create({
    userId: actor.userId,
    status: "open",
    supportMode,
    aiConfig: { enabled: supportMode === "ai" },
    unreadCount: { user: 0, admin: 0 },
    version: 1,
  });
}

// ── Read ──────────────────────────────────────────────────────────────────────

/** List conversation của user (mới nhất trước). */
export async function listUserConversations(
  actor: ChatActor,
  options: ListConversationsOptions = {}
): Promise<{ items: IConversation[]; total: number; page: number; limit: number }> {
  const { page, limit, skip } = normalizePagination(options.page, options.limit);

  const filter: Record<string, unknown> = { userId: actor.userId };
  if (options.status && options.status !== "all") {
    filter.status = options.status;
  }

  const [items, total] = await Promise.all([
    Conversation.find(filter)
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean() as unknown as Promise<IConversation[]>,
    Conversation.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

/**
 * List conversation cho admin.
 *
 * Filter:
 *   - `scope=unassigned` : conversation mở, chưa có admin (hàng đợi chờ).
 *   - `scope=mine`       : conversation đã gán cho admin hiện tại.
 *   - `scope=all`        : tất cả conversation đang mở.
 */
export async function listAdminConversations(
  actor: ChatActor,
  options: ListConversationsOptions & {
    scope?: "unassigned" | "mine" | "all";
    supportMode?: SupportMode | "all";
  } = {}
): Promise<{ items: IConversation[]; total: number; page: number; limit: number }> {
  if (!isAdmin(actor)) {
    throw new ChatError(ErrorCode.CHAT_FORBIDDEN, "Chỉ admin mới có quyền này", 403);
  }

  const { page, limit, skip } = normalizePagination(options.page, options.limit);
  const scope = options.scope ?? "all";

  const filter: Record<string, unknown> = {};
  if (scope === "unassigned") {
    filter.status = { $in: ["open", "pending"] };
    filter.assignedAdminId = null;
  } else if (scope === "mine") {
    filter.assignedAdminId = actor.userId;
    filter.status = { $in: ["open", "pending"] };
  } else {
    filter.status = { $in: ["open", "pending"] };
  }

  if (options.supportMode && options.supportMode !== "all") {
    filter.supportMode = options.supportMode;
  }

  const [items, total] = await Promise.all([
    Conversation.find(filter)
      // KHÔNG populate assignedAdminId: populate trả null khi user đã bị
      // xoá ⇒ mất luôn ObjectId gốc. Tên admin được lookup riêng (loadAdminNames).
      .populate<{ userId: ConversationUserInfo }>("userId", "name email avatarUrl")
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean() as unknown as Promise<IConversation[]>,
    Conversation.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

/** Lấy 1 conversation (đã kiểm tra quyền). */
export async function getConversation(
  conversationId: string,
  actor: ChatActor
): Promise<IConversation> {
  return loadConversationForActor(conversationId, actor);
}

// ── Mutation: supportMode / status ───────────────────────────────────────────

/**
 * Chuyển trạng thái conversation — dùng NỘI BỘ (handoff, AI orchestrator).
 *
 * KHÔNG kiểm tra quyền actor — caller đã chịu trách nhiệm kiểm tra trước.
 * Vẫn validate state machine + optimistic locking.
 */
export async function updateConversationState(
  conversationId: Types.ObjectId,
  params: {
    status?: ConversationStatus;
    supportMode?: SupportMode;
    expectedVersion?: number;
    assignedAdminId?: Types.ObjectId | null;
    closedBy?: Types.ObjectId | null;
  }
): Promise<IConversation> {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw new ChatError(
      ErrorCode.CHAT_CONVERSATION_NOT_FOUND,
      "Không tìm thấy hội thoại"
    );
  }

  const nextStatus = params.status ?? conversation.status;
  const nextMode = params.supportMode ?? conversation.supportMode;

  assertTransition(conversation.status, nextStatus, conversation.supportMode, nextMode);

  const now = new Date();
  const update: Record<string, unknown> = {
    status: nextStatus,
    supportMode: nextMode,
    $inc: { version: 1 },
  };

  if (params.assignedAdminId !== undefined) {
    update.assignedAdminId = params.assignedAdminId;
  }
  if (nextStatus === "closed") {
    update.closedAt = now;
    update.closedBy = params.closedBy ?? null;
  } else if (conversation.status === "closed") {
    update.closedAt = null;
    update.closedBy = null;
  }

  const filter: Record<string, unknown> = { _id: conversation._id };
  if (params.expectedVersion !== undefined) {
    filter.version = params.expectedVersion;
  }

  const updated = await Conversation.findOneAndUpdate(filter, update, { new: true });

  if (!updated) {
    throw new ChatError(
      ErrorCode.CHAT_VERSION_CONFLICT,
      "Hội thoại vừa được cập nhật bởi người khác. Vui lòng tải lại.",
      409
    );
  }

  // Báo realtime cho các client đang subscribe conversation này.
  emitConversationUpdated({
    conversationId: String(updated._id),
    conversation: conversationToDto(updated),
  });
  emitUnreadChanged({
    userId: String(updated.userId),
    conversationId: String(updated._id),
    unreadCount: {
      user: updated.unreadCount?.user ?? 0,
      admin: updated.unreadCount?.admin ?? 0,
    },
  });

  return updated;
}

/**
 * Chuyển `supportMode` (và tuỳ chọn `status`) — API CÔNG KHAI.
 *
 * Quyền:
 *   - Admin: mọi thao tác.
 *   - Owner (user sở hữu conversation): được đóng & mở lại conversation
 *     của chính mình. KHÔNG được tự đổi supportMode.
 *   - Người khác: không được đổi trạng thái.
 *
 * Dùng optimistic locking: truyền `expectedVersion` (nếu có) để đảm bảo
 * client đã đọc trạng thái mới nhất. Sai version ⇒ CHAT_VERSION_CONFLICT.
 */
export async function transitionConversation(
  conversationId: string,
  actor: ChatActor,
  params: {
    status?: ConversationStatus;
    supportMode?: SupportMode;
    expectedVersion?: number;
    assignedAdminId?: Types.ObjectId | null;
    closedBy?: Types.ObjectId | null;
  }
): Promise<IConversation> {
  const conversation = await loadConversationForActor(conversationId, actor);

  const nextStatus = params.status ?? conversation.status;
  const nextMode = params.supportMode ?? conversation.supportMode;

  if (!isAdmin(actor)) {
    const isOwner = String(conversation.userId) === actor.userId;

    if (!isOwner) {
      throw new ChatError(
        ErrorCode.CHAT_FORBIDDEN,
        "Bạn không có quyền thay đổi trạng thái hội thoại này",
        403
      );
    }
    if (params.assignedAdminId !== undefined) {
      throw new ChatError(
        ErrorCode.CHAT_FORBIDDEN,
        "Chỉ admin mới có quyền gán nhân viên phụ trách",
        403
      );
    }

    // Owner được đóng (open/pending → closed) và mở lại (closed → open).
    const ownerAllowed =
      (nextStatus === "closed" && conversation.status !== "closed") ||
      (nextStatus === "open" && conversation.status === "closed");

    if (!ownerAllowed) {
      throw new ChatError(
        ErrorCode.CHAT_FORBIDDEN,
        "Bạn không có quyền thay đổi trạng thái hội thoại này",
        403
      );
    }

    // Owner được đổi supportMode kèm khi mở lại (→ AI), không đổi tùy ý.
    const modeChangeAllowed =
      nextMode === conversation.supportMode ||
      (nextStatus === "open" && conversation.status === "closed");

    if (!modeChangeAllowed) {
      throw new ChatError(
        ErrorCode.CHAT_FORBIDDEN,
        "Bạn không có quyền đổi chế độ hỗ trợ của hội thoại này",
        403
      );
    }
  }

  return updateConversationState(conversation._id, params);
}

// ── Unread count ──────────────────────────────────────────────────────────────

/**
 * Tăng unread count cho phía nhận.
 *
 * @param target "user" | "admin" — phía nào CHƯA ĐỌC.
 */
export async function incrementUnread(
  conversationId: Types.ObjectId,
  target: "user" | "admin",
  delta = 1
): Promise<void> {
  if (delta === 0) return;
  const path = target === "user" ? "unreadCount.user" : "unreadCount.admin";
  await Conversation.updateOne(
    { _id: conversationId },
    { $inc: { [path]: delta }, $set: { lastMessageAt: new Date() } }
  );
}

/** Reset unread count của 1 phía về 0. */
export async function resetUnread(
  conversationId: Types.ObjectId,
  target: "user" | "admin"
): Promise<void> {
  const path = target === "user" ? "unreadCount.user" : "unreadCount.admin";
  await Conversation.updateOne({ _id: conversationId }, { $set: { [path]: 0 } });
}

/** Đọc tổng unread của user trong tất cả conversation. */
export async function totalUnreadForUser(userId: string): Promise<number> {
  if (!Types.ObjectId.isValid(userId)) return 0;
  const result = await Conversation.aggregate<{ total: number }>([
    { $match: { userId: new Types.ObjectId(userId) } },
    { $group: { _id: null, total: { $sum: "$unreadCount.user" } } },
  ]);
  return result[0]?.total ?? 0;
}

/** Đọc tổng unread của admin (toàn bộ hàng đợi). */
export async function totalUnreadForAdmin(): Promise<number> {
  const result = await Conversation.aggregate<{ total: number }>([
    { $match: { status: { $in: ["open", "pending"] } } },
    { $group: { _id: null, total: { $sum: "$unreadCount.admin" } } },
  ]);
  return result[0]?.total ?? 0;
}

// ── Close / reopen ────────────────────────────────────────────────────────────

/** Đóng conversation (user hoặc admin). */
export async function closeConversation(
  conversationId: string,
  actor: ChatActor
): Promise<IConversation> {
  const conversation = await loadOwnedConversation(conversationId, actor);
  if (conversation.status === "closed") {
    throw new ChatError(ErrorCode.CHAT_STATUS_INVALID, "Hội thoại đã đóng", 400);
  }
  return transitionConversation(conversationId, actor, {
    status: "closed",
    closedBy: new Types.ObjectId(actor.userId),
  });
}

/**
 * Mở lại conversation đã đóng.
 * Chỉ trong cửa sổ `CHAT_REOPEN_WINDOW_MS` (mặc định 24h).
 */
export async function reopenConversation(
  conversationId: string,
  actor: ChatActor
): Promise<IConversation> {
  const conversation = await loadOwnedConversation(conversationId, actor);
  if (conversation.status !== "closed") {
    throw new ChatError(ErrorCode.CHAT_STATUS_INVALID, "Hội thoại chưa đóng", 400);
  }

  if (conversation.closedAt) {
    const elapsed = Date.now() - new Date(conversation.closedAt).getTime();
    if (elapsed > CHAT_REOPEN_WINDOW_MS) {
      throw new ChatError(
        ErrorCode.CHAT_REOPEN_WINDOW_EXPIRED,
        "Đã quá thời gian cho phép mở lại hội thoại",
        409
      );
    }
  }

  return transitionConversation(conversationId, actor, {
    status: "open",
    supportMode: "ai",
  });
}

// ── AI lock (Phase 5) ────────────────────────────────────────────────────────

/**
 * Khoá conversation để AI xử lý — chống 2 request AI chạy song song.
 *
 * Dùng `version` làm token: chỉ request có `expectedVersion` khớp mới
 * thắng. Request sau thất bại ⇒ đã có request khác đang xử lý.
 */
export async function acquireAiLock(
  conversationId: Types.ObjectId,
  expectedVersion: number
): Promise<IConversation | null> {
  return Conversation.findOneAndUpdate(
    { _id: conversationId, version: expectedVersion, status: { $ne: "closed" } },
    { $inc: { version: 1 } },
    { new: true }
  );
}

/** Nhả khoá AI (trả conversation về trạng thái trước khi AI xử lý). */
export async function releaseAiLock(
  conversationId: Types.ObjectId,
  expectedVersion: number
): Promise<void> {
  await Conversation.updateOne(
    { _id: conversationId, version: expectedVersion },
    { $inc: { version: 1 } }
  );
}

// ── Messages helper ───────────────────────────────────────────────────────────

/**
 * Cập nhật `lastMessageId` / `lastMessageAt` sau khi ghi tin nhắn mới.
 */
export async function touchLastMessage(
  conversationId: Types.ObjectId,
  messageId: Types.ObjectId
): Promise<void> {
  await Conversation.updateOne(
    { _id: conversationId },
    { $set: { lastMessageId: messageId, lastMessageAt: new Date() } }
  );
}

/** Đếm số tin nhắn public trong conversation. */
export async function countPublicMessages(conversationId: Types.ObjectId): Promise<number> {
  return Message.countDocuments({ conversationId, visibility: "public" });
}
