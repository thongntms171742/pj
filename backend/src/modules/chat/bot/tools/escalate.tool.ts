/**
 * escalate.tool.ts — Tool 3 + hàm dùng chung: chuyển hội thoại sang tư vấn viên.
 *
 * TRƯỚC refactor Hybrid có 2 bản sao logic escalate:
 *   - services/ai/chatbotService.ts  → executeEscalateToAdmin()
 *   - modules/chat/controllers/chatController.ts → requestEscalation()
 * Nay gộp về 1 nguồn duy nhất để tránh lệch hành vi.
 */

import { Types } from "mongoose";
import { Conversation } from "../../../../models/Conversation";
import { sendMessage } from "../../services/messageService";
import { broadcastNewMessage, broadcastStatusChange } from "../../socket/chatSocket";
import {
  BOT_NAME,
  ESCALATION_REPLY,
  ESCALATION_SYSTEM_CONTENT,
  SYSTEM_NAME,
} from "../copy";

export interface EscalateResult {
  success: boolean;
  message: string;
  reason?: string;
}

/** Lý do mặc định khi khách yêu cầu gặp người thật. */
export const DEFAULT_ESCALATION_REASON = "Khách hàng yêu cầu gặp tư vấn viên trực tiếp";

/**
 * Chuyển hội thoại sang WAITING_ADMIN + tạo tin SYSTEM + broadcast.
 *
 * Idempotent: nếu hội thoại đã ở WAITING_ADMIN/ADMIN_ACTIVE thì không tạo tin
 * SYSTEM trùng, chỉ trả về thành công.
 */
export async function escalateToAdmin(
  conversationId: string | Types.ObjectId,
  reason: string = DEFAULT_ESCALATION_REASON
): Promise<EscalateResult> {
  const conv = await Conversation.findById(conversationId);
  if (!conv) return { success: false, message: "Không tìm thấy cuộc trò chuyện." };

  if (conv.status === "WAITING_ADMIN" || conv.status === "ADMIN_ACTIVE") {
    return {
      success: true,
      message: "Cuộc trò chuyện đã được chuyển cho tư vấn viên.",
      reason: conv.summary || reason,
    };
  }

  conv.status = "WAITING_ADMIN";
  conv.summary = reason;
  conv.handoffReason = reason;
  await conv.save();

  await sendMessage({
    conversationId: conv._id,
    sender: { type: "SYSTEM", name: SYSTEM_NAME },
    content: ESCALATION_SYSTEM_CONTENT,
    metadata: { action: "ESCALATION_BY_AI", reason },
    trustedMetadata: true,
  });

  broadcastStatusChange(conv._id, "WAITING_ADMIN");

  return {
    success: true,
    message: ESCALATION_REPLY,
    reason,
  };
}

/** Reply bot kèm nội dung escalate (dùng khi bot trả lời sau khi chuyển viên). */
export const ESCALATION_BOT_REPLY = ESCALATION_REPLY;

/** Tên bot hiển thị trong tin hệ thống. */
export const ESCALATION_BOT_NAME = BOT_NAME;
