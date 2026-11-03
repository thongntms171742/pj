/**
 * handoff.service.ts — chuyển hội thoại từ AI sang nhân viên thật (TDD §6.3).
 *
 * Vòng đời handoff:
 *   waiting → assigned → accepted → resolved
 *   (cancelled khi user hủy / admin từ chối)
 *
 * Ràng buộc:
 *   - 1 conversation chỉ có tối đa 1 handoff ĐANG MỞ (unique partial index).
 *   - Dùng `version` chống race khi 2 admin cùng claim.
 *   - Khi handoff mở ⇒ conversation chuyển `supportMode = waiting_admin`.
 */

import { Types } from "mongoose";
import {
  HandoffRequest,
  type HandoffPriority,
  type HandoffStatus,
  type IHandoffRequest,
} from "../../../models/HandoffRequest";
import { ErrorCode } from "../../../utils/errors";
import {
  ChatError,
  isAdmin,
  loadConversationForActor,
  loadOwnedConversation,
  type ChatActor,
} from "./chatPermission.service";
import {
  transitionConversation,
  updateConversationState,
} from "./conversation.service";

// ── State machine ─────────────────────────────────────────────────────────────

const HANDOFF_TRANSITIONS: Record<HandoffStatus, HandoffStatus[]> = {
  waiting: ["assigned", "cancelled"],
  assigned: ["accepted", "waiting", "cancelled"],
  accepted: ["resolved", "cancelled"],
  resolved: [],
  cancelled: [],
};

export function canTransitionHandoff(
  from: HandoffStatus,
  to: HandoffStatus
): boolean {
  return HANDOFF_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── Create ────────────────────────────────────────────────────────────────────

export interface CreateHandoffInput {
  conversationId: string;
  reason: string;
  priority?: HandoffPriority;
  summary?: string;
}

/**
 * Tạo yêu cầu chuyển sang admin.
 *
 * - User tự yêu cầu (nút "Escalate") hoặc AI tự escalate.
 * - Nếu đã có handoff đang mở ⇒ trả lại handoff cũ (idempotent).
 */
export async function createHandoff(
  actor: ChatActor,
  input: CreateHandoffInput
): Promise<IHandoffRequest> {
  const conversation = await loadOwnedConversation(input.conversationId, actor);

  const reason = (input.reason ?? "").trim();
  if (!reason) {
    throw new ChatError(ErrorCode.CHAT_EMPTY_CONTENT, "Cần lý do để chuyển hỗ trợ");
  }

  // Idempotent: đã có handoff đang mở ⇒ trả lại cái cũ.
  const existing = await HandoffRequest.findOne({
    conversationId: conversation._id,
    status: { $in: ["waiting", "assigned", "accepted"] },
  });
  if (existing) {
    throw new ChatError(
      ErrorCode.CHAT_HANDOFF_ALREADY_EXISTS,
      "Hội thoại đã có yêu cầu chuyển nhân viên đang chờ",
      409,
      { handoffId: String(existing._id) }
    );
  }

  const handoff = await HandoffRequest.create({
    conversationId: conversation._id,
    userId: conversation.userId,
    reason,
    priority: input.priority ?? "normal",
    status: "waiting",
    summary: input.summary ?? "",
    requestedAt: new Date(),
    version: 1,
  });

  // Chuyển conversation sang chờ admin (nếu đang ở mode AI).
  if (conversation.supportMode === "ai") {
    await updateConversationState(conversation._id, { supportMode: "waiting_admin" });
  }

  return handoff;
}

// ── Read ──────────────────────────────────────────────────────────────────────

/** Handoff của 1 conversation (nếu có). */
export async function getHandoffForConversation(
  conversationId: string,
  actor: ChatActor
): Promise<IHandoffRequest | null> {
  const conversation = await loadConversationForActor(conversationId, actor);
  return HandoffRequest.findOne({
    conversationId: conversation._id,
    status: { $in: ["waiting", "assigned", "accepted"] },
  });
}

/** List handoff cho admin hàng đợi. */
export async function listHandoffs(
  actor: ChatActor,
  options: {
    page?: number;
    limit?: number;
    status?: HandoffStatus | "all";
  } = {}
): Promise<{ items: IHandoffRequest[]; total: number; page: number; limit: number }> {
  if (!isAdmin(actor)) {
    throw new ChatError(ErrorCode.CHAT_FORBIDDEN, "Chỉ admin mới có quyền này", 403);
  }

  const page = Number.isFinite(options.page) && options.page! > 0 ? Math.floor(options.page!) : 1;
  const limit = Number.isFinite(options.limit) && options.limit! > 0 ? Math.floor(options.limit!) : 20;
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};
  if (options.status && options.status !== "all") {
    filter.status = options.status;
  }

  const [items, total] = await Promise.all([
    HandoffRequest.find(filter)
      .sort({ priority: -1, requestedAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean() as unknown as Promise<IHandoffRequest[]>,
    HandoffRequest.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

// ── Mutation ──────────────────────────────────────────────────────────────────

/**
 * Admin claim 1 handoff (waiting → assigned).
 *
 * Optimistic locking qua `version`: nếu 2 admin cùng claim, chỉ 1 người
 * thắng, người còn lại nhận CHAT_VERSION_CONFLICT.
 */
export async function assignHandoff(
  conversationId: string,
  actor: ChatActor,
  options: { expectedVersion?: number } = {}
): Promise<IHandoffRequest> {
  if (!isAdmin(actor)) {
    throw new ChatError(ErrorCode.CHAT_FORBIDDEN, "Chỉ admin mới có quyền này", 403);
  }

  const handoff = await HandoffRequest.findOne({
    conversationId,
    status: { $in: ["waiting", "assigned"] },
  });
  if (!handoff) {
    throw new ChatError(
      ErrorCode.CHAT_HANDOFF_NOT_FOUND,
      "Không tìm thấy yêu cầu chuyển nhân viên"
    );
  }

  const filter: Record<string, unknown> = { _id: handoff._id };
  if (options.expectedVersion !== undefined) {
    filter.version = options.expectedVersion;
  }

  const updated = await HandoffRequest.findOneAndUpdate(
    filter,
    {
      $set: {
        status: "assigned",
        assignedAdminId: actor.userId,
      },
      $inc: { version: 1 },
    },
    { new: true }
  );

  if (!updated) {
    throw new ChatError(
      ErrorCode.CHAT_VERSION_CONFLICT,
      "Yêu cầu vừa được xử lý bởi người khác. Vui lòng tải lại.",
      409
    );
  }

  return updated;
}

/** Admin nhận handoff (assigned → accepted) + conversation sang mode human. */
export async function acceptHandoff(
  conversationId: string,
  actor: ChatActor,
  options: { expectedVersion?: number } = {}
): Promise<IHandoffRequest> {
  if (!isAdmin(actor)) {
    throw new ChatError(ErrorCode.CHAT_FORBIDDEN, "Chỉ admin mới có quyền này", 403);
  }

  const handoff = await HandoffRequest.findOne({
    conversationId,
    status: { $in: ["assigned", "waiting"] },
  });
  if (!handoff) {
    throw new ChatError(
      ErrorCode.CHAT_HANDOFF_NOT_FOUND,
      "Không tìm thấy yêu cầu chuyển nhân viên"
    );
  }

  const filter: Record<string, unknown> = { _id: handoff._id };
  if (options.expectedVersion !== undefined) {
    filter.version = options.expectedVersion;
  }

  const updated = await HandoffRequest.findOneAndUpdate(
    filter,
    {
      $set: {
        status: "accepted",
        assignedAdminId: actor.userId,
        acceptedAt: new Date(),
      },
      $inc: { version: 1 },
    },
    { new: true }
  );

  if (!updated) {
    throw new ChatError(
      ErrorCode.CHAT_VERSION_CONFLICT,
      "Yêu cầu vừa được xử lý bởi người khác. Vui lòng tải lại.",
      409
    );
  }

  // Chuyển conversation sang do admin phục vụ.
  await updateConversationState(new Types.ObjectId(conversationId), {
    supportMode: "human",
    assignedAdminId: new Types.ObjectId(actor.userId),
  });

  return updated;
}

/** Kết thúc handoff (accepted → resolved) + trả conversation về AI. */
export async function resolveHandoff(
  conversationId: string,
  actor: ChatActor,
  options: { expectedVersion?: number; returnToAi?: boolean } = {}
): Promise<IHandoffRequest> {
  if (!isAdmin(actor)) {
    throw new ChatError(ErrorCode.CHAT_FORBIDDEN, "Chỉ admin mới có quyền này", 403);
  }

  const handoff = await HandoffRequest.findOne({
    conversationId,
    status: { $in: ["accepted", "assigned"] },
  });
  if (!handoff) {
    throw new ChatError(
      ErrorCode.CHAT_HANDOFF_NOT_FOUND,
      "Không tìm thấy yêu cầu chuyển nhân viên"
    );
  }

  if (!canTransitionHandoff(handoff.status, "resolved")) {
    throw new ChatError(
      ErrorCode.CHAT_HANDOFF_INVALID_TRANSITION,
      `Không thể chuyển handoff từ "${handoff.status}" sang "resolved"`,
      409
    );
  }

  const filter: Record<string, unknown> = { _id: handoff._id };
  if (options.expectedVersion !== undefined) {
    filter.version = options.expectedVersion;
  }

  const updated = await HandoffRequest.findOneAndUpdate(
    filter,
    {
      $set: { status: "resolved", resolvedAt: new Date() },
      $inc: { version: 1 },
    },
    { new: true }
  );

  if (!updated) {
    throw new ChatError(
      ErrorCode.CHAT_VERSION_CONFLICT,
      "Yêu cầu vừa được xử lý bởi người khác. Vui lòng tải lại.",
      409
    );
  }

  if (options.returnToAi !== false) {
    await updateConversationState(new Types.ObjectId(conversationId), { supportMode: "ai" });
  }

  return updated;
}

/** User hủy yêu cầu chuyển nhân viên (waiting/assigned → cancelled). */
export async function cancelHandoff(
  conversationId: string,
  actor: ChatActor
): Promise<IHandoffRequest> {
  const handoff = await HandoffRequest.findOne({
    conversationId,
    status: { $in: ["waiting", "assigned"] },
  });
  if (!handoff) {
    throw new ChatError(
      ErrorCode.CHAT_HANDOFF_NOT_FOUND,
      "Không tìm thấy yêu cầu chuyển nhân viên"
    );
  }

  const updated = await HandoffRequest.findOneAndUpdate(
    { _id: handoff._id, status: { $in: ["waiting", "assigned"] } },
    { $set: { status: "cancelled" }, $inc: { version: 1 } },
    { new: true }
  );

  if (!updated) {
    throw new ChatError(
      ErrorCode.CHAT_HANDOFF_INVALID_TRANSITION,
      "Không thể huỷ yêu cầu này",
      409
    );
  }

  // Trả conversation về AI.
  await updateConversationState(new Types.ObjectId(conversationId), { supportMode: "ai" });

  return updated;
}
