/**
 * sentiment.service.ts — phân loại cảm xúc của tin nhắn khách hàng.
 *
 * Mục đích (TDD v1.0):
 *   - Sentiment "negative" ⇒ tăng ưu tiên handoff, AI cẩn thận hơn.
 *   - Sentiment dùng để đo chất lượng dịch vụ & phát hiện khách hàng
 *     đang bực ⇒ cần admin phản hồi nhanh.
 *
 * Chiến lược HYBRID:
 *   1. Rule-based (keyword cảm xúc) — nhanh, deterministic.
 *   2. AI fallback khi rule không rõ ràng.
 */

import {
  AiProviderError,
  type AiProvider,
} from "../providers/ai-provider.interface";

// ── Sentiment taxonomy ───────────────────────────────────────────────────────

export const ChatSentiment = {
  NEGATIVE: "negative",
  NEUTRAL: "neutral",
  POSITIVE: "positive",
} as const;

export type ChatSentimentValue =
  (typeof ChatSentiment)[keyof typeof ChatSentiment];

/** Sentiment nào cần ưu tiên cao hơn trong hàng đợi admin. */
export const NEGATIVE_SENTIMENT_PRIORITY_BOOST = true;

// ── Rule keywords ────────────────────────────────────────────────────────────

const NEGATIVE_KEYWORDS = [
  "khong hai long", "khong hai long", "tuc", "te", "gio", "chan", "bai",
  "khong vui", "khong hanh", "thoi", "lam sao", "bao lao", "bao gio",
  "toi phien", "doi tra ngay", "khong chuan", "sai", "hong", "huc",
  "khong ai tra loi", "wait lau qua", "phai choi", "nhan vien o dau",
  "khong bao gio", "khong duoc giai quyet", "that vong", "khong hai long",
  "khong hanh long", "rat buon", "khong vui", "phan no",
];

const POSITIVE_KEYWORDS = [
  "cam on", "hanh", "tot", "vui", "tuyet", "dep", "nhanh", "ok",
  "great", "thanks", "perfect", "love", "nice", "dieu",
];

/** Dấu hiệu bực bội trực tiếp (dấu "!" / "?" lặp / chữ in hoa). */
function detectAgitation(text: string): number {
  let score = 0;
  if (/!{2,}/.test(text)) score += 0.2;
  if (/\?{2,}/.test(text)) score += 0.15;
  if (/\b[A-Z]{5,}\b/.test(text)) score += 0.15; // CHỐNG CÁP
  if (/[A-ZÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÉÈẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤÝỲÝỶỸỴĐ]{6,}/.test(text)) {
    score += 0.15;
  }
  return score;
}

export interface SentimentResult {
  sentiment: ChatSentimentValue;
  confidence: number;
  source: "rule" | "ai" | "fallback";
}

// ── Rule-based ───────────────────────────────────────────────────────────────

/**
 * Phân loại sentiment bằng rule.
 *
 * @param text     tin nhắn gốc (chưa chuẩn hoá).
 * @param normalizedText bản đã bỏ dấu (nếu đã chuẩn hoá sẵn thì truyền luôn).
 */
export function classifySentimentByRules(
  text: string,
  normalizedText?: string
): SentimentResult | null {
  const normalized = normalizedText ?? normalizeForSentiment(text);
  if (!normalized) return null;

  let negativeHits = 0;
  for (const kw of NEGATIVE_KEYWORDS) {
    if (normalized.includes(kw)) negativeHits += 1;
  }

  let positiveHits = 0;
  for (const kw of POSITIVE_KEYWORDS) {
    if (normalized.includes(kw)) positiveHits += 1;
  }

  const agitation = detectAgitation(text);

  // Từ khoá tiêu cực trùng với tích cực (VD: "không hài lòng" chứa "lòng"?)
  // ⇒ ưu tiên đếm âm.
  const negativeScore = negativeHits * 0.35 + agitation;
  const positiveScore = positiveHits * 0.3;

  if (negativeScore <= 0 && positiveScore <= 0) return null;

  if (negativeScore > positiveScore) {
    return {
      sentiment: ChatSentiment.NEGATIVE,
      confidence: Math.min(0.98, 0.6 + negativeScore * 0.2),
      source: "rule",
    };
  }

  return {
    sentiment: ChatSentiment.POSITIVE,
    confidence: Math.min(0.95, 0.6 + positiveScore * 0.2),
    source: "rule",
  };
}

/** Chuẩn hoá chữ (bỏ dấu) cho sentiment — riêng vì cần giữ chữ in hoa để detect. */
function normalizeForSentiment(text: string): string {
  return (text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

// ── AI-based ─────────────────────────────────────────────────────────────────

const SENTIMENT_PROMPT = `Phân loại cảm xúc của tin nhắn khách hàng dưới đây vào ĐÚNG MỘT nhãn:
- negative: bất mãn, giận, thất vọng, phàn nàn
- neutral: bình thường, hỏi thông tin
- positive: hài lòng, cảm ơn, vui

Trả lời DUY NHẤT dạng JSON: {"sentiment":"<nhãn>","confidence":<0.0-1.0>}`;

/** Phân loại sentiment bằng AI (fallback). */
export async function classifySentimentByAi(
  provider: AiProvider,
  text: string
): Promise<SentimentResult | null> {
  try {
    const result = await provider.generateContent(
      provider.defaultModel,
      [{ role: "user", parts: [{ text }] }],
      {
        systemInstruction: SENTIMENT_PROMPT,
        maxOutputTokens: 80,
        temperature: 0,
      }
    );

    if (result.blocked || !result.text.trim()) return null;

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as {
      sentiment?: string;
      confidence?: number;
    };

    const sentiment = parsed.sentiment as ChatSentimentValue | undefined;
    if (
      !sentiment ||
      !Object.values(ChatSentiment).includes(sentiment)
    ) {
      return null;
    }

    const confidence = Math.max(
      0,
      Math.min(1, Number(parsed.confidence ?? 0.7))
    );

    return {
      sentiment,
      confidence: Number(confidence.toFixed(2)),
      source: "ai",
    };
  } catch (err) {
    if (err instanceof AiProviderError) {
      console.warn(
        `[sentiment] AI classify failed (${err.code}), falling back to rules`
      );
      return null;
    }
    console.warn("[sentiment] AI classify failed:", err);
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Phân loại sentiment (hybrid). */
export async function classifySentiment(
  text: string,
  provider?: AiProvider
): Promise<SentimentResult> {
  const ruleResult = classifySentimentByRules(text);
  if (ruleResult) return ruleResult;

  if (provider?.isAvailable()) {
    const aiResult = await classifySentimentByAi(provider, text);
    if (aiResult) return aiResult;
  }

  return { sentiment: ChatSentiment.NEUTRAL, confidence: 0.5, source: "fallback" };
}

/**
 * Sentiment có làm tăng ưu tiên handoff không?
 * Khách hàng bực ⇒ admin nên xử lý trước.
 */
export function isNegativeSentiment(result: SentimentResult): boolean {
  return result.sentiment === ChatSentiment.NEGATIVE;
}
