/**
 * ai-provider.interface.ts — hợp đồng abstraction cho AI provider.
 *
 * Mục đích:
 *   - Tách business logic (orchestrator) khỏi SDK cụ thể (Gemini).
 *   - Sau này đổi sang OpenAI / Claude chỉ cần implement interface này.
 *   - Test được bằng mock provider, không cần gọi API thật.
 */

// ── Messages ──────────────────────────────────────────────────────────────────

export type AiRole = "user" | "model" | "system";

export interface AiContentPart {
  text: string;
}

export interface AiMessage {
  role: AiRole;
  parts: AiContentPart[];
}

export interface AiFunctionCall {
  /** Tên tool, VD: "lookupOrder". */
  name: string;
  /** Arguments dạng object (SDK trả về object đã parse). */
  args: Record<string, unknown>;
}

export interface AiToolDeclaration {
  name: string;
  description: string;
  /** JSON Schema của parameters. */
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// ── Config ────────────────────────────────────────────────────────────────────

export interface AiGenerateConfig {
  systemInstruction?: string;
  tools?: AiToolDeclaration[];
  maxOutputTokens?: number;
  temperature?: number;
  /** Cho phép model trả về function call thay vì text. */
  allowFunctionCalls?: boolean;
}

export interface AiUsage {
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
}

// ── Response ──────────────────────────────────────────────────────────────────

export interface AiGenerateResult {
  /** Text trả lời (rỗng nếu model chỉ trả function call). */
  text: string;
  /** Function calls model yêu cầu (có thể rỗng). */
  functionCalls: AiFunctionCall[];
  /** Model đã dùng. */
  model: string;
  usage: AiUsage;
  /** Thời gian xử lý (ms). */
  latencyMs: number;
  /** True nếu model bị chặn bởi safety filter. */
  blocked: boolean;
  /** Lý do bị chặn (nếu có). */
  blockReason?: string;
}

// ── Interface ─────────────────────────────────────────────────────────────────

export interface AiProvider {
  /** Tên provider (VD: "gemini") — để log & debug. */
  readonly name: string;

  /** Model mặc định của provider. */
  readonly defaultModel: string;

  /**
   * Sinh nội dung.
   * @throws {AiProviderError} khi provider lỗi / timeout / auth fail.
   */
  generateContent(
    model: string,
    messages: AiMessage[],
    config?: AiGenerateConfig
  ): Promise<AiGenerateResult>;

  /** Provider có sẵn sàng dùng không (có API key, feature flag bật)? */
  isAvailable(): boolean;
}

// ── Errors ────────────────────────────────────────────────────────────────────

export type AiProviderErrorCode =
  | "AI_PROVIDER_NOT_CONFIGURED"
  | "AI_PROVIDER_AUTH_FAILED"
  | "AI_PROVIDER_REQUEST_FAILED"
  | "AI_PROVIDER_INVALID_RESPONSE"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_QUOTA_EXCEEDED"
  | "AI_GENERATION_TIMEOUT";

export class AiProviderError extends Error {
  readonly code: AiProviderErrorCode;
  readonly httpStatus: number;
  readonly retryable: boolean;

  constructor(
    code: AiProviderErrorCode,
    message: string,
    options: { httpStatus?: number; retryable?: boolean } = {}
  ) {
    super(message);
    this.name = "AiProviderError";
    this.code = code;
    this.httpStatus = options.httpStatus ?? 502;
    this.retryable = options.retryable ?? false;
  }
}
