/**
 * ai-copilot.service.ts — trợ lý AI cho tư vấn viên (TDD §6.4).
 *
 * 4 chức năng:
 *   1. `generateConversationSummary` — tóm tắt hội thoại (admin đọc nhanh).
 *   2. `generateSuggestedReply`     — gợi ý câu trả lời cho admin.
 *   3. `searchPolicyForAdmin`       — tra chính sách cho admin (admin-only).
 *   4. `generateInternalNote`       — ghi chú nội bộ (visibility=internal).
 *
 * Bảo mật:
 *   - Tất cả hàm đều yêu cầu actor có role `admin`.
 *   - Kết quả của Copilot KHÔNG bao giờ hiện với user.
 *   - `generateSuggestedReply` chỉ đọc tin nhắn `public` (admin đọc được
 *     cả internal nhưng Copilot chỉ nên dựa trên lịch sử khách hàng).
 */

import { Types } from "mongoose";
import {
  AiProviderError,
  type AiMessage as AiChatMessage,
  type AiProvider,
} from "../providers/ai-provider.interface";
import { geminiProvider } from "../providers/gemini.provider";
import {
  AI_MAX_HISTORY_MESSAGES,
  AI_MAX_OUTPUT_TOKENS,
  FEATURE_AI_COPILOT,
  SYSTEM_PROMPT_VERSION,
} from "../../../config/ai.config";
import {
  SYSTEM_INSTRUCTION_COPILOT,
  SYSTEM_INSTRUCTION_FOLLOWUP,
} from "../prompts/systemPrompt";
import { Message } from "../../../models/Message";
import { Conversation } from "../../../models/Conversation";
import { HandoffRequest } from "../../../models/HandoffRequest";
import { retrieveKnowledge } from "./knowledge.service";
import { getToolDeclarations, findTool } from "../tools";
import { ChatError, isAdmin, type ChatActor } from "../../chat/services/chatPermission.service";
import { ErrorCode } from "../../../utils/errors";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CopilotSummary {
  conversationId: string;
  /** Tóm tắt nội dung hội thoại. */
  summary: string;
  /** Ý chính khách hàng cần giải quyết. */
  customerIntent: string;
  /** Trạng thái hiện tại (đơn hàng, vấn đề...). */
  currentStatus: string;
  /** Việc admin nên làm tiếp theo. */
  suggestedNextSteps: string[];
  /** Tin nhắn gần nhất để admin nắm context. */
  lastMessagePreview: string | null;
  /** Có nên ưu tiên xử lý không (sentiment negative / handoff urgent). */
  urgent: boolean;
  tokensUsed: number;
  latencyMs: number;
}

export interface CopilotSuggestedReply {
  conversationId: string;
  /** Gợi ý câu trả lời cho khách hàng. */
  suggestion: string;
  /** Tóm tắt nhanh (1 câu) để admin nắm ý. */
  summary: string;
  /** Cần hỏi thêm gì. */
  needMoreInfo: string[];
  /** Tool đã dùng để lấy dữ liệu. */
  toolsUsed: string[];
  tokensUsed: number;
  latencyMs: number;
}

export interface CopilotPolicyHit {
  id: string;
  title: string;
  category: string;
  summary: string;
  content: string;
  relevance: number;
}

export interface CopilotInternalNote {
  conversationId: string;
  noteId: string;
  note: string;
  createdAt: string;
}

export interface CopilotOptions {
  provider?: AiProvider;
}

// ── Guards ───────────────────────────────────────────────────────────────────

function assertAdmin(actor: ChatActor): void {
  if (!isAdmin(actor)) {
    throw new ChatError(
      ErrorCode.CHAT_FORBIDDEN,
      "Chỉ admin mới được dùng AI Copilot",
      403
    );
  }
}

function assertCopilotEnabled(): void {
  if (!FEATURE_AI_COPILOT) {
    throw new ChatError(
      ErrorCode.CHAT_AI_UNAVAILABLE,
      "Tính năng AI Copilot đang tắt. Bật FEATURE_AI_COPILOT=true để sử dụng.",
      503
    );
  }
}

function assertAiAvailable(provider: AiProvider): void {
  // Chỉ kiểm tra provider — cho phép inject mock provider trong test.
  if (!provider.isAvailable()) {
    throw new ChatError(
      ErrorCode.CHAT_AI_UNAVAILABLE,
      "AI hiện không khả dụng. Vui lòng thử lại sau.",
      503
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Lấy lịch sử tin nhắn (chỉ public) cho Copilot. */
async function loadPublicHistory(
  conversationId: Types.ObjectId,
  limit = AI_MAX_HISTORY_MESSAGES
): Promise<AiChatMessage[]> {
  const docs = await Message.find({
    conversationId,
    visibility: "public",
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return docs.reverse().map((m) => ({
    role: m.senderType === "user" ? ("user" as const) : ("model" as const),
    parts: [{ text: m.content }],
  }));
}

/** Parse JSON bọc trong text (model hay trả về ```json ... ```). */
export function parseJsonBlock<T>(text: string): T | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

/** Tách "Tóm tắt" / "Gợi ý trả lời" trong output Copilot (nếu model không trả JSON). */
export function splitCopilotText(text: string): {
  summary: string;
  suggestion: string;
} {
  const parts = text.split(/\n-{3,}\n/);
  if (parts.length < 2) {
    return { summary: "", suggestion: text.trim() };
  }
  const summary = (parts[0] ?? "").trim();
  const suggestion = (parts.slice(1).join("\n") ?? "").trim();
  return { summary, suggestion };
}

// ── 1. Conversation summary ───────────────────────────────────────────────────

const SUMMARY_PROMPT = `Bạn là trợ lý AI hỗ trợ TƯ VẤN VIÊN của Build Your Christmas.

Dựa trên lịch sử hội thoại dưới đây, hãy tóm tắt cho tư vấn viên.

Trả lời DUY NHẤT dạng JSON:
{
  "summary": "Tóm tắt 1-3 câu về vấn đề khách hàng đang gặp",
  "customerIntent": "Khách hàng muốn gì (1 câu)",
  "currentStatus": "Trạng thái hiện tại đã biết (đơn hàng, chính sách, ...)",
  "suggestedNextSteps": ["Bước 1", "Bước 2"],
  "urgent": true|false
}

KHÔNG bịa thông tin không có trong lịch sử.`;

/**
 * Tóm tắt hội thoại cho admin.
 */
export async function generateConversationSummary(
  conversationId: string,
  actor: ChatActor,
  options: CopilotOptions = {}
): Promise<CopilotSummary> {
  assertAdmin(actor);
  assertCopilotEnabled();

  const provider = options.provider ?? geminiProvider;
  assertAiAvailable(provider);

  if (!Types.ObjectId.isValid(conversationId)) {
    throw new ChatError(ErrorCode.CHAT_INVALID_ID, "Conversation ID không hợp lệ");
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw new ChatError(
      ErrorCode.CHAT_CONVERSATION_NOT_FOUND,
      "Không tìm thấy hội thoại"
    );
  }

  const startedAt = Date.now();
  const history = await loadPublicHistory(conversation._id);

  if (history.length === 0) {
    return {
      conversationId,
      summary: "Hội thoại chưa có tin nhắn nào.",
      customerIntent: "",
      currentStatus: "",
      suggestedNextSteps: [],
      lastMessagePreview: null,
      urgent: false,
      tokensUsed: 0,
      latencyMs: 0,
    };
  }

  const result = await provider.generateContent(
    provider.defaultModel,
    history,
    {
      systemInstruction: SUMMARY_PROMPT,
      maxOutputTokens: AI_MAX_OUTPUT_TOKENS,
      temperature: 0.2,
    }
  );

  const parsed = parseJsonBlock<{
    summary?: string;
    customerIntent?: string;
    currentStatus?: string;
    suggestedNextSteps?: string[];
    urgent?: boolean;
  }>(result.text);

  const lastMessage = history[history.length - 1];

  return {
    conversationId,
    summary: parsed?.summary?.trim() || result.text.trim(),
    customerIntent: parsed?.customerIntent?.trim() ?? "",
    currentStatus: parsed?.currentStatus?.trim() ?? "",
    suggestedNextSteps: Array.isArray(parsed?.suggestedNextSteps)
      ? parsed!.suggestedNextSteps.filter((s) => typeof s === "string")
      : [],
    urgent:
      parsed?.urgent ?? conversation.aiConfig?.sentiment === "negative",
    lastMessagePreview: lastMessage
      ? lastMessage.parts.map((p) => p.text).join(" ").slice(0, 200)
      : null,
    tokensUsed: result.usage?.totalTokens ?? 0,
    latencyMs: Date.now() - startedAt,
  };
}

// ── 2. Suggested reply ────────────────────────────────────────────────────────

/**
 * Gợi ý câu trả lời cho admin.
 *
 * Cho phép AI gọi tool (tra đơn hàng, sản phẩm, chính sách) để gợi ý có
 * số liệu thật — nhưng tool vẫn tự kiểm tra phân quyền.
 */
export async function generateSuggestedReply(
  conversationId: string,
  actor: ChatActor,
  options: CopilotOptions & { instruction?: string } = {}
): Promise<CopilotSuggestedReply> {
  assertAdmin(actor);
  assertCopilotEnabled();

  const provider = options.provider ?? geminiProvider;
  assertAiAvailable(provider);

  if (!Types.ObjectId.isValid(conversationId)) {
    throw new ChatError(ErrorCode.CHAT_INVALID_ID, "Conversation ID không hợp lệ");
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw new ChatError(
      ErrorCode.CHAT_CONVERSATION_NOT_FOUND,
      "Không tìm thấy hội thoại"
    );
  }

  const startedAt = Date.now();
  const history = await loadPublicHistory(conversation._id);
  const toolsUsed: string[] = [];

  if (history.length === 0) {
    return {
      conversationId,
      suggestion: "Hội thoại chưa có tin nhắn nào để gợi ý.",
      summary: "",
      needMoreInfo: [],
      toolsUsed,
      tokensUsed: 0,
      latencyMs: Date.now() - startedAt,
    };
  }

  // Vòng lặp tool (tối đa 3 lượt) — gợi ý phải dựa trên dữ liệu thật.
  const working: AiChatMessage[] = [...history];
  let system = SYSTEM_INSTRUCTION_COPILOT;
  let last = null;
  let tokensUsed = 0;

  for (let round = 0; round <= 3; round++) {
    const result = await provider.generateContent(
      provider.defaultModel,
      working,
      {
        systemInstruction: system,
        tools: round < 3 ? getToolDeclarations() : undefined,
        maxOutputTokens: AI_MAX_OUTPUT_TOKENS,
        temperature: 0.3,
      }
    );
    last = result;
    tokensUsed += result.usage?.totalTokens ?? 0;

    if (!result.functionCalls?.length) break;
    if (round >= 3) break;

    working.push({ role: "model", parts: [{ text: result.text || "" }] });

    for (const call of result.functionCalls) {
      const tool = findTool(call.name);
      if (!tool) continue;

      try {
        const toolResult = await tool.execute(call.args, {
          userId: String(conversation.userId),
          conversationId,
        });
        if (!toolsUsed.includes(call.name)) toolsUsed.push(call.name);
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
      } catch (err) {
        console.error(
          `[ai-copilot] tool "${call.name}" failed:`,
          err instanceof Error ? err.message : err
        );
        working.push({
          role: "user",
          parts: [
            {
              text: `Tool "${call.name}" gặp lỗi. Hãy gợi ý dựa trên thông tin đã có.`,
            },
          ],
        });
      }
    }

    system = SYSTEM_INSTRUCTION_FOLLOWUP;
  }

  const text = last?.text?.trim() ?? "";
  const parsed = parseJsonBlock<{
    summary?: string;
    suggestion?: string;
    needMoreInfo?: string[];
  }>(text);

  let suggestion = parsed?.suggestion?.trim() ?? "";
  let summary = parsed?.summary?.trim() ?? "";

  if (!parsed) {
    const split = splitCopilotText(text);
    suggestion = split.suggestion || text;
    summary = split.summary;
  }

  return {
    conversationId,
    suggestion,
    summary,
    needMoreInfo: Array.isArray(parsed?.needMoreInfo)
      ? parsed!.needMoreInfo.filter((s) => typeof s === "string")
      : [],
    toolsUsed,
    tokensUsed,
    latencyMs: Date.now() - startedAt,
  };
}

// ── 3. Policy search (admin) ──────────────────────────────────────────────────

/**
 * Tra chính sách cho admin.
 * Không cần AI — dùng trực tiếp knowledge service (nhanh, 0 token).
 */
export async function searchPolicyForAdmin(
  actor: ChatActor,
  params: { query: string; category?: string; limit?: number }
): Promise<CopilotPolicyHit[]> {
  assertAdmin(actor);

  const query = (params.query ?? "").trim();
  if (!query) {
    throw new ChatError(ErrorCode.INVALID_INPUT, "Cần từ khoá để tra chính sách");
  }

  const matches = await retrieveKnowledge(query, {
    category: params.category as never,
    limit: params.limit ?? 5,
  });

  return matches.map((m) => ({
    id: m.entry.id,
    title: m.entry.title,
    category: m.entry.category,
    summary: m.entry.summary,
    content: m.entry.content,
    relevance: Number(m.score.toFixed(2)),
  }));
}

// ── 4. Internal note ──────────────────────────────────────────────────────────

/**
 * Tạo ghi chú nội bộ cho admin.
 *
 * Tin nhắn lưu với `visibility: "internal"` ⇒ user KHÔNG BAO GIỜ thấy
 * (enforce ở `message.service.listMessages` + `chat.emitter`).
 */
export async function generateInternalNote(
  conversationId: string,
  actor: ChatActor,
  options: CopilotOptions & { note?: string } = {}
): Promise<CopilotInternalNote> {
  assertAdmin(actor);
  assertCopilotEnabled();

  const provider = options.provider ?? geminiProvider;
  assertAiAvailable(provider);

  if (!Types.ObjectId.isValid(conversationId)) {
    throw new ChatError(ErrorCode.CHAT_INVALID_ID, "Conversation ID không hợp lệ");
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw new ChatError(
      ErrorCode.CHAT_CONVERSATION_NOT_FOUND,
      "Không tìm thấy hội thoại"
    );
  }

  // Admin tự viết note ⇒ không cần gọi AI.
  if (options.note && options.note.trim()) {
    const noteText = options.note.trim();
    const message = await Message.create({
      conversationId: conversation._id,
      senderId: new Types.ObjectId(actor.userId),
      senderType: "admin",
      content: noteText,
      messageType: "text",
      visibility: "internal",
      attachments: [],
      aiMetadata: null,
      clientMessageId: null,
    });

    return {
      conversationId,
      noteId: String(message._id),
      note: noteText,
      createdAt: new Date(message.createdAt).toISOString(),
    };
  }

  const startedAt = Date.now();
  const history = await loadPublicHistory(conversation._id);

  if (history.length === 0) {
    throw new ChatError(
      ErrorCode.CHAT_EMPTY_CONTENT,
      "Hội thoại chưa có tin nhắn nào để tạo ghi chú"
    );
  }

  const result = await provider.generateContent(
    provider.defaultModel,
    history,
    {
      systemInstruction: `Từ lịch sử hội thoại, viết MỘT ghi chú nội bộ ngắn (tối đa 4 dòng) cho tư vấn viên về:
- Điểm mấu chốt cần nhớ
- Thông tin đã xác nhận (mã đơn, số tiền, sản phẩm...)
- Việc cần làm tiếp
Viết tiếng Việt, dạng gạch đầu dòng. KHÔNG bịa thông tin.`,
      maxOutputTokens: 400,
      temperature: 0.2,
    }
  );

  const noteText = result.text.trim() || "(Không tạo được ghi chú)";
  const message = await Message.create({
    conversationId: conversation._id,
    senderId: new Types.ObjectId(actor.userId),
    senderType: "admin",
    content: noteText,
    messageType: "text",
    visibility: "internal",
    attachments: [],
    aiMetadata: {
      model: result.model,
      promptVersion: SYSTEM_PROMPT_VERSION,
      tokensUsed: result.usage?.totalTokens ?? 0,
      latencyMs: result.latencyMs,
      toolsUsed: [],
    },
    clientMessageId: null,
  });

  return {
    conversationId,
    noteId: String(message._id),
    note: noteText,
    createdAt: new Date(message.createdAt).toISOString(),
  };
}

// ── 5. Handoff context (admin dashboard) ──────────────────────────────────────

/**
 * Lấy context handoff để admin ưu tiên xử lý hội thoại nào.
 */
export async function getHandoffContext(
  conversationId: string,
  actor: ChatActor
): Promise<{
  handoff: {
    id: string;
    reason: string;
    priority: string;
    status: string;
    summary: string;
    requestedAt: string;
  } | null;
  sentiment: string;
  intent: string;
  urgent: boolean;
}> {
  assertAdmin(actor);

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw new ChatError(
      ErrorCode.CHAT_CONVERSATION_NOT_FOUND,
      "Không tìm thấy hội thoại"
    );
  }

  const handoff = await HandoffRequest.findOne({
    conversationId: conversation._id,
    status: { $in: ["waiting", "assigned", "accepted"] },
  });

  const sentiment = conversation.aiConfig?.sentiment ?? "neutral";

  return {
    handoff: handoff
      ? {
          id: String(handoff._id),
          reason: handoff.reason,
          priority: handoff.priority,
          status: handoff.status,
          summary: handoff.summary,
          requestedAt: new Date(handoff.requestedAt).toISOString(),
        }
      : null,
    sentiment,
    intent: conversation.aiConfig?.intent ?? "",
    urgent:
      handoff?.priority === "urgent" ||
      handoff?.priority === "high" ||
      sentiment === "negative",
  };
}
