/**
 * ai-orchestrator.service.ts — bộ điều phối AI cho hội thoại (TDD §5.3).
 *
 * Luồng xử lý 1 tin nhắn user:
 *
 *   ┌──────────────┐   ┌──────────────┐   ┌────────────────────┐
 *   │ 1. Guard     │ → │ 2. Classify  │ → │ 3. Build prompt     │
 *   │  (AI on?     │   │  intent +    │   │ + lịch sử hội thoại │
 *   │  mode=ai?)   │   │  sentiment   │   └─────────┬──────────┘
 *   └──────────────┘   └──────────────┘             │
 *                                                  ▼
 *   ┌──────────────┐   ┌──────────────┐   ┌────────────────────┐
 *   │ 6. Persist   │ ← │ 5. Follow-up │ ← │ 4. Tool loop       │
 *   │  + emit      │   │  (có tool    │   │ (model ↔ tools)     │
 *   │  socket      │   │   result)    │   └────────────────────┘
 *   └──────────────┘   └──────────────┘
 *
 * Nguyên tắc:
 *   - AI KHÔNG bao giờ tự bịa: mọi thông tin thực tế đến từ tool.
 *   - AI KHÔNG throw ra ngoài: lỗi provider ⇒ fallback + escalate.
 *   - Không ghi tin nhắn AI khi conversation không ở mode `ai`.
 *   - Idempotency: 1 user message ⇒ 1 AI reply (dùng `clientMessageId`).
 */

import { Types } from "mongoose";
import {
  Conversation,
  type IConversation,
} from "../../../models/Conversation";
import { Message, type IMessage } from "../../../models/Message";
import {
  AiProviderError,
  type AiGenerateResult,
  type AiMessage as AiChatMessage,
  type AiProvider,
  type AiToolDeclaration,
} from "../providers/ai-provider.interface";
import { geminiProvider } from "../providers/gemini.provider";
import {
  AI_DAILY_USER_LIMIT,
  AI_MAX_HISTORY_MESSAGES,
  AI_MAX_OUTPUT_TOKENS,
  AI_MAX_TOOL_CALLS,
  AI_LOW_CONFIDENCE_THRESHOLD,
  FEATURE_AI_CHAT,
  FEATURE_AI_HANDOFF,
  HANDOFF_AUTO_ESCALATE_ATTEMPTS,
  isAiAvailable,
  SYSTEM_PROMPT_VERSION,
} from "../../../config/ai.config";
import {
  SYSTEM_INSTRUCTION,
  SYSTEM_INSTRUCTION_FOLLOWUP,
} from "../prompts/systemPrompt";
import {
  ChatIntent,
  classifyIntent,
  shouldEscalate,
  type IntentResult,
} from "./intent.service";
import {
  ChatSentiment,
  classifySentiment,
  isNegativeSentiment,
  type SentimentResult,
} from "./sentiment.service";
import { AI_TOOLS, findTool, getToolDeclarations } from "../tools";
import { consume } from "../../chat/services/chatRateLimit.service";
import { sendSystemMessage } from "../../chat/services/message.service";
import {
  updateConversationState,
  incrementUnread,
  touchLastMessage,
} from "../../chat/services/conversation.service";
import { emitMessageNew, emitAiStatus } from "../../chat/socket/chat.emitter";
import { messageToDto } from "../../chat/dto/chat.mapper";
import { HandoffRequest } from "../../../models/HandoffRequest";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AiOutcome =
  | "answered"
  | "escalated"
  | "skipped"
  | "failed";

export interface AiProcessResult {
  outcome: AiOutcome;
  /** Tin nhắn AI đã ghi (null nếu không trả lời). */
  message: IMessage | null;
  intent: IntentResult | null;
  sentiment: SentimentResult | null;
  /** Các tool đã chạy. */
  toolsUsed: string[];
  /** Token đã tiêu. */
  tokensUsed: number;
  /** Latency tổng (ms). */
  latencyMs: number;
  /** Lý do escalate (nếu có). */
  escalateReason?: string;
}

export interface AiProcessOptions {
  /** Provider (inject để test được). */
  provider?: AiProvider;
  /** Bỏ qua kiểm tra quota (dùng cho test/internal). */
  skipQuota?: boolean;
  /** Tin nhắn user đã lưu — orchestrator dùng luôn, không query lại. */
  userMessage?: IMessage;
}

// ── Quota ─────────────────────────────────────────────────────────────────────

const AI_QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Kiểm tra quota AI theo user (số lượt / ngày).
 * Dùng chung rate-limit in-memory của chat module.
 */
export function checkAiQuota(userId: string): {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
} {
  const result = consume(
    `ai:quota:${userId}`,
    AI_DAILY_USER_LIMIT,
    AI_QUOTA_WINDOW_MS
  );
  return {
    allowed: result.allowed,
    remaining: result.remaining,
    retryAfterMs: result.retryAfterMs,
  };
}

// ── History ───────────────────────────────────────────────────────────────────

/**
 * Lấy lịch sử hội thoại (chỉ public) để đưa vào context cho Gemini.
 * Chỉ lấy `AI_MAX_HISTORY_MESSAGES` tin gần nhất.
 */
export async function buildHistory(
  conversationId: Types.ObjectId,
  excludeMessageId?: string,
  limit = AI_MAX_HISTORY_MESSAGES
): Promise<AiChatMessage[]> {
  const filter: Record<string, unknown> = {
    conversationId,
    visibility: "public",
  };
  if (excludeMessageId && Types.ObjectId.isValid(excludeMessageId)) {
    filter._id = { $ne: new Types.ObjectId(excludeMessageId) };
  }

  const docs = await Message.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  // Đảo lại ⇒ thứ tự thời gian tăng dần (đúng format Gemini).
  return docs
    .reverse()
    .map((m) => ({
      role: m.senderType === "user" ? ("user" as const) : ("model" as const),
      parts: [{ text: m.content }],
    }));
}

// ── Tool loop ─────────────────────────────────────────────────────────────────

interface ToolCallTrace {
  name: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

/**
 * Chạy vòng lặp tool: model → tool → model → ... tối đa `AI_MAX_TOOL_CALLS`.
 *
 * @param messages   lịch sử (đã append tin nhắn user hiện tại).
 * @param system     system instruction cho lượt đầu.
 * @param toolCtx    context truyền vào tool (userId, conversationId).
 */
async function runToolLoop(
  provider: AiProvider,
  messages: AiChatMessage[],
  system: string,
  toolCtx: { userId: string; conversationId: string },
  model: string
): Promise<{
  result: AiGenerateResult;
  traces: ToolCallTrace[];
  totalTokens: number;
}> {
  const declarations: AiToolDeclaration[] = getToolDeclarations();
  const traces: ToolCallTrace[] = [];
  let totalTokens = 0;

  const working: AiChatMessage[] = [...messages];
  let currentSystem = system;
  let lastResult: AiGenerateResult | null = null;

  for (let round = 0; round <= AI_MAX_TOOL_CALLS; round++) {
    const result = await provider.generateContent(model, working, {
      systemInstruction: currentSystem,
      tools: declarations,
      maxOutputTokens: AI_MAX_OUTPUT_TOKENS,
      temperature: 0.3,
    });

    lastResult = result;
    totalTokens += result.usage?.totalTokens ?? 0;

    // Model không yêu cầu tool ⇒ đã có câu trả lời cuối.
    if (!result.functionCalls || result.functionCalls.length === 0) {
      break;
    }

    // Đã hết lượt tool cho phép ⇒ ép model trả lời bằng text.
    if (round >= AI_MAX_TOOL_CALLS) {
      working.push({ role: "model", parts: [{ text: result.text || "" }] });
      currentSystem = SYSTEM_INSTRUCTION_FOLLOWUP;
      const final = await provider.generateContent(model, working, {
        systemInstruction: currentSystem,
        maxOutputTokens: AI_MAX_OUTPUT_TOKENS,
        temperature: 0.3,
      });
      lastResult = final;
      totalTokens += final.usage?.totalTokens ?? 0;
      break;
    }

    // Ghi lại lượt model yêu cầu tool.
    working.push({
      role: "model",
      parts: [{ text: result.text || "" }],
    });

    // Chạy từng tool.
    for (const call of result.functionCalls) {
      const tool = findTool(call.name);
      if (!tool) {
        // Tool không tồn tại ⇒ báo lại cho model, KHÔNG crash.
        working.push({
          role: "user",
          parts: [
            {
              text: `Tool "${call.name}" không tồn tại. Hãy trả lời dựa trên thông tin có sẵn hoặc đề nghị khách hàng liên hệ nhân viên.`,
            },
          ],
        });
        continue;
      }

      try {
        const toolResult = await tool.execute(call.args, toolCtx);
        traces.push({
          name: call.name,
          args: call.args,
          result: toolResult.data,
        });

        working.push({
          role: "user",
          parts: [
            {
              text: `Kết quả tool "${call.name}":\n${JSON.stringify(
                toolResult.data
              )}`,
            },
          ],
        });

        // Tool yêu cầu escalate ⇒ đánh dấu.
        if (toolResult.escalate) {
          working.push({
            role: "user",
            parts: [
              {
                text: `Lưu ý: cần chuyển nhân viên. Lý do: ${
                  toolResult.escalateReason ?? "không rõ"
                }`,
              },
            ],
          });
        }
      } catch (err) {
        console.error(
          `[ai-orchestrator] tool "${call.name}" failed:`,
          err instanceof Error ? err.message : err
        );
        working.push({
          role: "user",
          parts: [
            {
              text: `Tool "${call.name}" gặp lỗi khi chạy. Hãy thông báo khách hàng cần hỗ trợ từ nhân viên.`,
            },
          ],
        });
      }
    }

    currentSystem = SYSTEM_INSTRUCTION_FOLLOWUP;
  }

  return {
    result: lastResult!,
    traces,
    totalTokens,
  };
}

// ── Escalate ──────────────────────────────────────────────────────────────────

/**
 * Tạo handoff + chuyển conversation sang chờ admin.
 * Idempotent: đã có handoff đang mở ⇒ trả handoff cũ.
 */
export async function escalateToAdmin(
  conversation: IConversation,
  params: { reason: string; summary?: string; priority?: "low" | "normal" | "high" | "urgent" }
): Promise<void> {
  if (!FEATURE_AI_HANDOFF) return;

  const existing = await HandoffRequest.findOne({
    conversationId: conversation._id,
    status: { $in: ["waiting", "assigned", "accepted"] },
  });
  if (existing) return;

  const priority =
    params.priority ??
    (params.reason.toLowerCase().includes("buc")
      ? "high"
      : "normal");

  await HandoffRequest.create({
    conversationId: conversation._id,
    userId: conversation.userId,
    reason: params.reason,
    priority,
    status: "waiting",
    summary: params.summary ?? "",
    requestedAt: new Date(),
    version: 1,
  });

  if (conversation.supportMode === "ai") {
    await updateConversationState(conversation._id, {
      supportMode: "waiting_admin",
    });
  }
}

// ── Main entry ────────────────────────────────────────────────────────────────

/**
 * Xử lý 1 tin nhắn user bằng AI.
 *
 * Được gọi từ `message.service.sendMessage()` khi conversation ở mode `ai`.
 *
 * @param conversationId id conversation.
 * @param userMessage    tin nhắn user vừa gửi (đã persist).
 */
export async function processUserMessage(
  conversationId: string,
  userMessage: IMessage,
  options: AiProcessOptions = {}
): Promise<AiProcessResult> {
  const startedAt = Date.now();

  const empty: AiProcessResult = {
    outcome: "skipped",
    message: null,
    intent: null,
    sentiment: null,
    toolsUsed: [],
    tokensUsed: 0,
    latencyMs: 0,
  };

  if (!FEATURE_AI_CHAT) {
    return { ...empty, latencyMs: Date.now() - startedAt };
  }

  if (!Types.ObjectId.isValid(conversationId)) {
    return { ...empty, latencyMs: Date.now() - startedAt };
  }

  // Provider được inject (test / provider khác) ⇒ tin vào `provider.isAvailable()`.
  // Provider mặc định (Gemini) ⇒ phải có API key thật.
  const provider = options.provider ?? geminiProvider;
  if (options.provider) {
    if (!provider.isAvailable()) {
      return { ...empty, latencyMs: Date.now() - startedAt };
    }
  } else if (!isAiAvailable()) {
    return { ...empty, latencyMs: Date.now() - startedAt };
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation || conversation.status === "closed") {
    return { ...empty, latencyMs: Date.now() - startedAt };
  }

  // Chỉ AI phục vụ khi mode = "ai" (hoặc "ai_assisted" — con người đang hỗ trợ).
  if (conversation.supportMode !== "ai") {
    return { ...empty, latencyMs: Date.now() - startedAt };
  }

  // AI bị tắt riêng cho conversation này.
  if (conversation.aiConfig?.enabled === false) {
    return { ...empty, latencyMs: Date.now() - startedAt };
  }

  // ── Quota ───────────────────────────────────────────────────────────────
  if (!options.skipQuota) {
    const quota = checkAiQuota(String(conversation.userId));
    if (!quota.allowed) {
      await escalateToAdmin(conversation, {
        reason: "AI đã vượt quota hôm nay",
        summary: "Khách hàng vẫn đang cần hỗ trợ.",
      });
      emitAiStatus({
        conversationId,
        status: "unavailable",
      });
      return {
        ...empty,
        outcome: "escalated",
        escalateReason: "AI_QUOTA_EXCEEDED",
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  // ── Báo realtime: AI đang nghĩ ──────────────────────────────────────────
  emitAiStatus({ conversationId, status: "thinking" });

  // ── Phân loại intent + sentiment ────────────────────────────────────────
  const userText = userMessage.content ?? "";

  const [intent, sentiment] = await Promise.all([
    classifyIntent(userText, provider),
    classifySentiment(userText, provider),
  ]);

  // Khách hàng yêu cầu nhân viên ⇒ escalate ngay, không gọi AI.
  if (shouldEscalate(intent)) {
    await escalateToAdmin(conversation, {
      reason:
        intent.intent === ChatIntent.ESCALATE
          ? "Khách hàng yêu cầu tư vấn viên"
          : "Yêu cầu ngoài phạm vi AI",
      summary: `Intent: ${intent.intent} (${intent.confidence})`,
      priority: isNegativeSentiment(sentiment) ? "high" : "normal",
    });

    await sendSystemMessage(conversation._id, "Mình đã chuyển yêu cầu của bạn cho tư vấn viên. Bạn vui lòng chờ phản hồi nhé!", {
      messageType: "system",
    });

    emitAiStatus({ conversationId, status: "escalated" });
    await updateConversationAiConfig(conversation, {
      intent: intent.intent,
      intentConfidence: intent.confidence,
      sentiment: sentiment.sentiment,
      failedAttempts: 0,
    });

    return {
      outcome: "escalated",
      message: null,
      intent,
      sentiment,
      toolsUsed: [],
      tokensUsed: 0,
      latencyMs: Date.now() - startedAt,
      escalateReason: intent.intent,
    };
  }

  // ── Chạy model + tool loop ──────────────────────────────────────────────
  const history = await buildHistory(
    conversation._id,
    String(userMessage._id),
    AI_MAX_HISTORY_MESSAGES
  );

  const messages: AiChatMessage[] = [
    ...history,
    { role: "user", parts: [{ text: userText }] },
  ];

  let toolRun: Awaited<ReturnType<typeof runToolLoop>>;
  try {
    toolRun = await runToolLoop(
      provider,
      messages,
      SYSTEM_INSTRUCTION,
      {
        userId: String(conversation.userId),
        conversationId,
      },
      provider.defaultModel
    );
  } catch (err) {
    // Provider lỗi (timeout / quota / auth) ⇒ tăng failedAttempts.
    const failedAttempts = (conversation.aiConfig?.failedAttempts ?? 0) + 1;
    await updateConversationAiConfig(conversation, { failedAttempts });

    console.error(
      `[ai-orchestrator] provider error:`,
      err instanceof AiProviderError ? `${err.code}: ${err.message}` : err
    );

    // Số lần lỗi vượt ngưỡng ⇒ auto escalate.
    if (failedAttempts >= HANDOFF_AUTO_ESCALATE_ATTEMPTS) {
      await escalateToAdmin(conversation, {
        reason: "AI không phản hồi được",
        summary: `AI lỗi ${failedAttempts} lần liên tiếp.`,
        priority: "high",
      });
      emitAiStatus({ conversationId, status: "escalated" });
      await updateConversationAiConfig(conversation, { failedAttempts: 0 });
      return {
        outcome: "escalated",
        message: null,
        intent,
        sentiment,
        toolsUsed: [],
        tokensUsed: 0,
        latencyMs: Date.now() - startedAt,
        escalateReason: "AI_PROVIDER_ERROR",
      };
    }

    emitAiStatus({ conversationId, status: "unavailable" });
    return {
      outcome: "failed",
      message: null,
      intent,
      sentiment,
      toolsUsed: [],
      tokensUsed: 0,
      latencyMs: Date.now() - startedAt,
      escalateReason:
        err instanceof AiProviderError ? err.code : "AI_PROVIDER_REQUEST_FAILED",
    };
  }

  const { result, traces, totalTokens } = toolRun;

  // Model bị chặn bởi safety filter.
  if (result.blocked || !result.text.trim()) {
    await escalateToAdmin(conversation, {
      reason: "AI không thể xử lý câu hỏi này",
      summary: "Nội dung bị bộ lọc an toàn chặn.",
      priority: "normal",
    });
    emitAiStatus({ conversationId, status: "escalated" });
    return {
      outcome: "escalated",
      message: null,
      intent,
      sentiment,
      toolsUsed: traces.map((t) => t.name),
      tokensUsed: totalTokens,
      latencyMs: Date.now() - startedAt,
      escalateReason: "AI_BLOCKED",
    };
  }

  // ── Ghi tin nhắn AI ─────────────────────────────────────────────────────
  const toolsUsed = [...new Set(traces.map((t) => t.name))];
  const needsHumanReview =
    intent.confidence < AI_LOW_CONFIDENCE_THRESHOLD ||
    intent.intent === ChatIntent.UNKNOWN;

  const aiMessage = await Message.create({
    conversationId: conversation._id,
    senderId: null,
    senderType: "ai",
    content: result.text.trim(),
    messageType: "text",
    visibility: "public",
    attachments: [],
    aiMetadata: {
      model: result.model,
      promptVersion: SYSTEM_PROMPT_VERSION,
      intent: intent.intent,
      intentConfidence: intent.confidence,
      sentiment: sentiment.sentiment,
      tokensUsed: totalTokens,
      latencyMs: result.latencyMs,
      toolsUsed,
      needsHumanReview,
    },
    clientMessageId: null,
  });

  await touchLastMessage(conversation._id, aiMessage._id);
  await incrementUnread(conversation._id, "user", 1);

  // Báo realtime tới user + admin.
  emitMessageNew({
    conversationId,
    message: messageToDto(aiMessage),
  });

  await updateConversationAiConfig(conversation, {
    model: result.model,
    intent: intent.intent,
    intentConfidence: intent.confidence,
    sentiment: sentiment.sentiment,
    failedAttempts: 0,
    totalTokensAdded: totalTokens,
  });

  emitAiStatus({
    conversationId,
    status: "answered",
    message: messageToDto(aiMessage),
  });

  return {
    outcome: "answered",
    message: aiMessage,
    intent,
    sentiment,
    toolsUsed,
    tokensUsed: totalTokens,
    latencyMs: Date.now() - startedAt,
  };
}

/**
 * Cập nhật `aiConfig` của conversation (không qua state machine).
 * Tách riêng vì `aiConfig` KHÔNG phải transition ⇒ không dùng
 * `updateConversationState` (vốn validate status/supportMode).
 */
export async function updateConversationAiConfig(
  conversation: IConversation,
  params: {
    model?: string;
    intent?: string;
    intentConfidence?: number;
    sentiment?: string;
    failedAttempts?: number;
    totalTokensAdded?: number;
  }
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (params.model !== undefined) update["aiConfig.model"] = params.model;
  if (params.intent !== undefined) update["aiConfig.intent"] = params.intent;
  if (params.intentConfidence !== undefined) {
    update["aiConfig.intentConfidence"] = params.intentConfidence;
  }
  if (params.sentiment !== undefined) update["aiConfig.sentiment"] = params.sentiment;
  if (params.failedAttempts !== undefined) {
    update["aiConfig.failedAttempts"] = params.failedAttempts;
  }

  const ops: Record<string, unknown> = {};
  if (Object.keys(update).length > 0) ops.$set = update;
  // Token là bộ đếm tích luỹ ⇒ dùng $inc (KHÔNG $set để không ghi đè).
  if (params.totalTokensAdded !== undefined) {
    ops.$inc = { "aiConfig.totalTokens": params.totalTokensAdded };
  }

  if (Object.keys(ops).length === 0) return;

  await Conversation.updateOne({ _id: conversation._id }, ops);
}

export { AI_TOOLS, ChatIntent, ChatSentiment };
