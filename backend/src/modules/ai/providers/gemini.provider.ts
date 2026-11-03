/**
 * gemini.provider.ts — implementation của AiProvider dùng Gemini SDK.
 *
 * Yêu cầu:
 *   - Retry có giới hạn cho lỗi tạm thời (429 / 5xx / network).
 *   - Timeout ⇒ hủy request, trả lỗi rõ ràng.
 *   - KHÔNG log API key.
 *   - Chuẩn hoá lỗi SDK về `AiProviderError` để tầng trên không cần biết SDK.
 */

import { GoogleGenAI, FunctionDeclaration } from "@google/genai";
import {
  GEMINI_API_KEY,
  GEMINI_CHAT_MODEL,
  GEMINI_TIMEOUT_MS,
  GEMINI_MAX_RETRIES,
  GEMINI_RETRY_BASE_DELAY_MS,
  FEATURE_AI_CHAT,
} from "../../../config/ai.config";
import {
  AiProviderError,
  type AiGenerateConfig,
  type AiGenerateResult,
  type AiMessage,
  type AiProvider,
  type AiToolDeclaration,
  type AiUsage,
} from "./ai-provider.interface";

/** Chuyển nội dung sang format của Gemini SDK. */
function toGeminiContents(messages: AiMessage[]): unknown[] {
  return messages.map((msg) => ({
    role: msg.role === "model" ? "model" : "user",
    parts: msg.parts.map((p) => ({ text: p.text })),
  }));
}

/** Chuyển tool declaration sang format của Gemini SDK. */
function toFunctionDeclarations(
  tools: AiToolDeclaration[]
): FunctionDeclaration[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    // Gemini SDK dùng `Schema` với `type` là enum riêng — ép qua `unknown`
    // vì shape JSON Schema của ta đã đúng, chỉ khác kiểu TS.
    parameters: tool.parameters as unknown as FunctionDeclaration["parameters"],
  }));
}

/** Trích usage token từ response SDK (có thể undefined). */
function extractUsage(response: unknown): AiUsage {
  const meta = (response as { usageMetadata?: Record<string, unknown> })
    ?.usageMetadata;
  const promptTokens = Number(meta?.promptTokenCount ?? 0) || 0;
  const outputTokens = Number(meta?.candidatesTokenCount ?? 0) || 0;
  const totalTokens = Number(meta?.totalTokenCount ?? 0) || 0;
  return {
    promptTokens,
    outputTokens,
    totalTokens: totalTokens || promptTokens + outputTokens,
  };
}

/** Phân loại lỗi SDK ⇒ AiProviderError. */
function classifyError(err: unknown): AiProviderError {
  const message = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number })?.status;

  if (status === 401 || status === 403 || /API key not valid|unauthenticated|permission/i.test(message)) {
    return new AiProviderError(
      "AI_PROVIDER_AUTH_FAILED",
      "Gemini từ chối API key. Kiểm tra GEMINI_API_KEY.",
      { httpStatus: 502 }
    );
  }
  if (status === 429 || /quota|rate limit|resource_exhausted/i.test(message)) {
    return new AiProviderError(
      "AI_QUOTA_EXCEEDED",
      "Đã vượt quota Gemini. Thử lại sau.",
      { httpStatus: 429, retryable: true }
    );
  }
  if (status === 503 || status === 502 || status === 500) {
    return new AiProviderError(
      "AI_PROVIDER_UNAVAILABLE",
      `Gemini tạm thời không khả dụng: ${message.slice(0, 160)}`,
      { httpStatus: 503, retryable: true }
    );
  }
  if (/timeout|ETIMEDOUT|ESOCKETTIMEDOUT|abort/i.test(message)) {
    return new AiProviderError(
      "AI_GENERATION_TIMEOUT",
      `Gemini không phản hồi trong ${GEMINI_TIMEOUT_MS}ms`,
      { httpStatus: 504, retryable: true }
    );
  }
  return new AiProviderError(
    "AI_PROVIDER_REQUEST_FAILED",
    `Gemini lỗi: ${message.slice(0, 200)}`,
    { httpStatus: 502 }
  );
}

/** Delay backoff có jitter — tránh thundering herd. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GeminiProvider implements AiProvider {
  readonly name = "gemini";
  readonly defaultModel = GEMINI_CHAT_MODEL;

  private client: GoogleGenAI | null = null;

  isAvailable(): boolean {
    return FEATURE_AI_CHAT && GEMINI_API_KEY.length > 0;
  }

  /** Lazy init client — chỉ tạo khi thực sự cần gọi. */
  private getClient(): GoogleGenAI {
    if (!this.isAvailable()) {
      throw new AiProviderError(
        "AI_PROVIDER_NOT_CONFIGURED",
        "Gemini chưa được cấu hình (thiếu GEMINI_API_KEY hoặc FEATURE_AI_CHAT=false).",
        { httpStatus: 503 }
      );
    }
    if (!this.client) {
      this.client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    }
    return this.client;
  }

  async generateContent(
    model: string,
    messages: AiMessage[],
    config: AiGenerateConfig = {}
  ): Promise<AiGenerateResult> {
    const client = this.getClient();
    const modelName = model || this.defaultModel;
    const startedAt = Date.now();

    let lastError: AiProviderError | null = null;

    for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
      try {
        const response = (await client.models.generateContent({
          model: modelName,
          contents: toGeminiContents(messages) as never,
          config: {
            systemInstruction: config.systemInstruction,
            tools: config.tools?.length
              ? [{ functionDeclarations: toFunctionDeclarations(config.tools) }]
              : undefined,
            maxOutputTokens: config.maxOutputTokens,
            temperature: config.temperature,
          },
        } as never)) as unknown as {
          text?: string;
          functionCalls?: Array<{ name?: string; args?: unknown }>;
          candidates?: Array<{
            finishReason?: string;
            content?: { parts?: Array<{ text?: string }> };
          }>;
        };

        const finishReason = response.candidates?.[0]?.finishReason ?? "";
        const blocked =
          finishReason === "SAFETY" ||
          finishReason === "PROHIBITED_CONTENT" ||
          finishReason === "BLOCKLIST";

        const functionCalls = (response.functionCalls ?? [])
          .filter((fc) => !!fc.name)
          .map((fc) => ({
            name: String(fc.name),
            args: (fc.args ?? {}) as Record<string, unknown>,
          }));

        return {
          text: response.text ?? "",
          functionCalls,
          model: modelName,
          usage: extractUsage(response),
          latencyMs: Date.now() - startedAt,
          blocked,
          blockReason: blocked ? finishReason : undefined,
        };
      } catch (err) {
        lastError = classifyError(err);

        // Lỗi không retryable (auth, input) ⇒ throw ngay.
        if (!lastError.retryable) throw lastError;

        // Hết số lần retry.
        if (attempt >= GEMINI_MAX_RETRIES) break;

        // Backoff: 400ms, 800ms, 1600ms (+ jitter).
        const delay = GEMINI_RETRY_BASE_DELAY_MS * 2 ** attempt;
        await sleep(delay + Math.floor(Math.random() * 100));
      }
    }

    throw (
      lastError ??
      new AiProviderError(
        "AI_PROVIDER_REQUEST_FAILED",
        "Gemini không phản hồi.",
        { httpStatus: 502 }
      )
    );
  }
}

/** Singleton — dùng chung cho toàn hệ thống. */
export const geminiProvider = new GeminiProvider();
