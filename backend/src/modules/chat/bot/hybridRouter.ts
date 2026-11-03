/**
 * hybridRouter.ts — cửa ngõ DUY NHẤT xử lý tin nhắn của chatbot.
 *
 * Đây là xương sống của kiến trúc Hybrid Chatbot:
 *
 *   Tin khách
 *      ↓
 *   1. Chuẩn hoá NLP + trích slot
 *      ↓
 *   2. Phân loại intent (rule) + confidence
 *      ↓
 *   3. Quyết định route:
 *      ├── human_request / complaint        → escalate (người thật)
 *      ├── confidence >= 0.85 & rule xử lý được → scenario (0 token, <300ms)
 *      ├── còn lại                           → AI + tools
 *      └── AI lỗi / không có Key            → fallback scenario hoặc reply mặc định
 *
 * Điểm khác biệt so với bản cũ (`try AI catch fallback`):
 *   - Rule được thử TRƯỚC AI ⇒ câu hỏi thường gặp không tốn token.
 *   - Escalate có thể xảy ra TRƯỚC khi gọi AI ⇒ phản hồi nhanh, không lãng phí.
 *   - Mọi lượt đều được ghi analytics để đo tỉ lệ trúng intent.
 */

import { Conversation } from "../../../models/Conversation";
import { classifyIntent, RULE_CONFIDENCE_THRESHOLD, isEscalationIntent } from "./intentClassifier";
import { normalizeInput } from "./nlpNormalizer";
import {
  runScenario,
  loadScenarioState,
  saveScenarioState,
  defaultScenarioState,
} from "./scenarioEngine";
import { runAiAgent, persistBotMessage, type ChatCallerContext } from "./aiAgent";
import { escalateToAdmin } from "./tools/escalate.tool";
import { logChatEvent } from "./analyticsService";
import {
  AI_UNAVAILABLE_REPLY,
  DEFAULT_QUICK_REPLIES,
  ESCALATION_REPLY,
  UNKNOWN_INTENT_REPLY,
  formatVnd,
} from "./copy";

/** Ngưỡng số lần AI không tìm thấy kết quả liên tiếp ⇒ auto escalate. */
export const MAX_AI_ATTEMPTS = 2;

/** Kết quả xử lý 1 lượt chat (dùng cho test + log). */
export interface RouteResult {
  /** Đường đi đã chọn. */
  route: "RULE" | "AI" | "HUMAN" | "FALLBACK";
  /** Intent nhận diện. */
  intent: string;
  /** Confidence của intent. */
  confidence: number;
  /** Nội dung bot đã gửi (rỗng nếu không gửi gì). */
  text: string;
  /** Đã escalate hay chưa. */
  escalated: boolean;
  /** Thời gian xử lý (ms). */
  latencyMs: number;
  /** Tool AI đã dùng. */
  toolsUsed: string[];
}

/**
 * Xử lý 1 tin nhắn của khách trong hội thoại AI.
 */
export async function route(
  conversationId: string,
  userText: string,
  caller?: ChatCallerContext
): Promise<RouteResult> {
  const startedAt = Date.now();

  const conv = await Conversation.findById(conversationId);
  if (!conv || conv.status !== "BOT_ACTIVE") {
    return {
      route: "FALLBACK",
      intent: "unknown",
      confidence: 0,
      text: "",
      escalated: false,
      latencyMs: Date.now() - startedAt,
      toolsUsed: [],
    };
  }

  // ── 1. Chuẩn hoá + trích slot ────────────────────────────────────────────
  const { text: normalizedText, slots: extractedSlots, canonical } = normalizeInput(userText);
  const state = await loadScenarioState(conversationId);

  // Merge slot mới vào slot đã có.
  const slots = { ...state.slots, ...extractedSlots };

  // ── 2. Phân loại intent ─────────────────────────────────────────────────
  const classification = classifyIntent(userText);
  const intent = classification.intent;
  const confidence = classification.confidence;

  // ── 3a. Rủi ro cao → chuyển người thật TRƯỚC khi gọi AI ───────────────
  if (isEscalationIntent(intent)) {
    const reason =
      intent === "human_request"
        ? "Khách hàng yêu cầu gặp tư vấn viên trực tiếp"
        : "Khách hàng có dấu hiệu khiếu nại / vấn đề cần nhân viên xử lý";

    const escalated = await escalateToAdmin(conversationId, reason);
    const replyText = escalated.success ? ESCALATION_REPLY : UNKNOWN_INTENT_REPLY;

    if (escalated.success) {
      await persistBotMessage(conversationId, replyText, { escalationReason: reason });
    }

    await saveScenarioState(conversationId, {
      currentNode: "complaint_handoff",
      slots,
      attempts: state.attempts,
      visited: [...state.visited, "complaint_handoff"],
    });

    await Conversation.updateOne(
      { _id: conversationId },
      { $set: { lastIntent: intent, handoffReason: reason } }
    );

    const latencyMs = Date.now() - startedAt;
    await logChatEvent({
      conversationId,
      input: userText,
      normalized: canonical,
      intent,
      confidence,
      route: "HUMAN",
      slots,
      latencyMs,
      escalated: true,
      reason,
    });

    return {
      route: "HUMAN",
      intent,
      confidence,
      text: replyText,
      escalated: true,
      latencyMs,
      toolsUsed: [],
    };
  }

  // ── 3b. Rule đủ tin tin cậy → scenario (không tốn token) ─────────────────
  const wantsScenario =
    confidence >= RULE_CONFIDENCE_THRESHOLD &&
    (intent === "greeting" ||
      intent === "thanks" ||
      intent === "faq_highfreq" ||
      intent === "order_lookup" ||
      intent === "price_consult");

  if (wantsScenario) {
    const scenarioInput = {
      conversationId,
      userText,
      slots,
      currentNode: state.currentNode,
      attempts: state.attempts,
      caller,
    };

    // Node phù hợp với intent hiện tại.
    const node = pickNodeForIntent(intent, state.currentNode);
    const scenario = await runScenario({ ...scenarioInput, currentNode: node });

    if (scenario.handled) {
      await persistBotMessage(conversationId, scenario.text, scenario.metadata);
      await saveScenarioState(conversationId, {
        currentNode: scenario.nextNode,
        slots: scenario.slots,
        attempts: 0,
        visited: [...state.visited, scenario.node],
      });
      await Conversation.updateOne(
        { _id: conversationId },
        { $set: { lastIntent: intent } }
      );

      const latencyMs = Date.now() - startedAt;
      await logChatEvent({
        conversationId,
        input: userText,
        normalized: canonical,
        intent,
        confidence,
        route: "RULE",
        slots,
        latencyMs,
        escalated: false,
      });

      return {
        route: "RULE",
        intent,
        confidence,
        text: scenario.text,
        escalated: false,
        latencyMs,
        toolsUsed: [],
      };
    }
  }

  // ── 3c. Còn lại → AI + tools ────────────────────────────────────────────
  const aiResult = await runAiAgent(conversationId, userText, caller);

  if (!aiResult.failed && aiResult.text.trim()) {
    const metadata: Record<string, unknown> = {};
    if (aiResult.suggestedProducts?.length) {
      metadata.suggestedProducts = aiResult.suggestedProducts;
    }
    if (aiResult.orderInfo) {
      metadata.orderInfo = aiResult.orderInfo;
    }
    if (aiResult.escalationReason) {
      metadata.escalationReason = aiResult.escalationReason;
    }
    if (!Object.keys(metadata).length) {
      metadata.quickReplies = [...DEFAULT_QUICK_REPLIES];
    }

    await persistBotMessage(conversationId, aiResult.text, metadata);

    const newAttempts = aiResult.escalated ? 0 : state.attempts + 1;
    await saveScenarioState(conversationId, {
      currentNode: aiResult.escalated ? "complaint_handoff" : state.currentNode,
      slots,
      attempts: newAttempts,
      visited: state.visited,
    });
    await Conversation.updateOne(
      { _id: conversationId },
      {
        $set: {
          lastIntent: intent,
          ...(aiResult.escalationReason
            ? { handoffReason: aiResult.escalationReason }
            : {}),
        },
      }
    );

    const latencyMs = Date.now() - startedAt;
    await logChatEvent({
      conversationId,
      input: userText,
      normalized: canonical,
      intent,
      confidence,
      route: "AI",
      slots,
      latencyMs,
      toolsUsed: aiResult.toolsUsed,
      escalated: aiResult.escalated,
      reason: aiResult.escalationReason,
    });

    return {
      route: aiResult.escalated ? "HUMAN" : "AI",
      intent,
      confidence,
      text: aiResult.text,
      escalated: aiResult.escalated,
      latencyMs,
      toolsUsed: aiResult.toolsUsed,
    };
  }

  // ── 3d. AI không chạy được (thiếu Key / lỗi) → fallback ─────────────────
  // Ưu tiên scenario fallback, sau đó mới tới reply mặc định.
  const fallback = await runScenario({
    conversationId,
    userText,
    slots,
    currentNode: "faq_highfreq",
    attempts: state.attempts,
    caller,
  });

  const replyText = fallback.handled ? fallback.text : AI_UNAVAILABLE_REPLY;
  const metadata = fallback.handled
    ? fallback.metadata
    : { quickReplies: [...DEFAULT_QUICK_REPLIES] };

  await persistBotMessage(conversationId, replyText, metadata);

  const latencyMs = Date.now() - startedAt;
  await logChatEvent({
    conversationId,
    input: userText,
    normalized: canonical,
    intent,
    confidence,
    route: "FALLBACK",
    slots,
    latencyMs,
    escalated: false,
  });

  return {
    route: "FALLBACK",
    intent,
    confidence,
    text: replyText,
    escalated: false,
    latencyMs,
    toolsUsed: [],
  };
}

/**
 * Chọn node scenario phù hợp với intent hiện tại.
 * Ưu tiên intent trước; nếu intent trung tính thì giữ node hiện tại.
 */
function pickNodeForIntent(
  intent: string,
  currentNode: string
): "greeting" | "consult_tree" | "order_lookup" | "faq_highfreq" | "complaint_handoff" | "closing_csat" {
  switch (intent) {
    case "greeting":
      return "greeting";
    case "order_lookup":
      return "order_lookup";
    case "faq_highfreq":
      return "faq_highfreq";
    case "price_consult":
      return "consult_tree";
    case "thanks":
      return currentNode === "closing_csat" ? "closing_csat" : "greeting";
    default:
      return (currentNode as any) || "consult_tree";
  }
}

/**
 * Ghi nhận điểm CSAT từ câu trả lời của khách.
 */
export async function recordSatisfaction(
  conversationId: string,
  rating: number
): Promise<void> {
  const safe = Math.min(5, Math.max(1, Math.round(rating)));
  await Conversation.updateOne(
    { _id: conversationId },
    { $set: { satisfaction: safe } }
  );
  await logChatEvent({
    conversationId,
    input: `CSAT ${safe}/5`,
    route: "RULE",
    latencyMs: 0,
  });
}

/** Re-export cho tiện import từ nơi khác. */
export { defaultScenarioState, formatVnd };
