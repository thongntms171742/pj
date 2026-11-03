/**
 * chatbotService.ts — facade giữ lại API cũ (backward compatible).
 *
 * Trước refactor Hybrid, toàn bộ logic bot nằm trong file này (~480 dòng).
 * Nay đã tách:
 *   - modules/chat/bot/hybridRouter.ts   → điều phối rule / AI / human
 *   - modules/chat/bot/aiAgent.ts         → gọi Gemini + chạy tool
 *   - modules/chat/bot/scenarioEngine.ts  → máy trạng thái kịch bản
 *   - modules/chat/bot/tools/*            → từng tool riêng biệt
 *   - modules/chat/bot/copy.ts            → nguồn nội dung hội thoại
 *
 * File này giữ lại `processAiChatMessage` để không phá vỡ code đang gọi và
 * test cũ (`backend/src/tests/chat.test.ts`).
 */

import { route as hybridRoute } from "../../modules/chat/bot/hybridRouter";

export interface ChatCallerContext {
  /** Mongo user id của người gọi (nếu đã đăng nhập). */
  userId?: string;
  /** Guest session id (nếu là khách vãng lai). */
  sessionId?: string;
}

/**
 * Xử lý tin nhắn của khách bằng Hybrid router (rule → AI → người thật).
 */
export async function processAiChatMessage(
  conversationId: string,
  latestUserText: string,
  caller?: ChatCallerContext
): Promise<void> {
  await hybridRoute(conversationId, latestUserText, caller);
}
