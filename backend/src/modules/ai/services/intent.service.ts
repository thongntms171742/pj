/**
 * intent.service.ts — phân loại intent của tin nhắn khách hàng.
 *
 * TDD v1.0 yêu cầu:
 *   - AI phải BIẾT khách hàng đang hỏi gì trước khi trả lời.
 *   - Kết quả dùng để: chọn tool phù hợp, quyết định escalate, đo chất lượng.
 *
 * Chiến lược HYBRID (không phụ thuộc 1 API call):
 *   1. Rule-based matching (nhanh, miễn phí, deterministic) — phủ ~80% câu hỏi.
 *   2. Nếu rule không chắc ⇒ dùng AI để classify (fallback).
 *   3. Nếu AI không khả dụng ⇒ dùng intent mặc định an toàn.
 *
 * Ưu điểm: không gọi AI cho mọi tin nhắn ⇒ tiết kiệm latency + quota.
 */

import {
  AiProviderError,
  type AiProvider,
} from "../providers/ai-provider.interface";

// ── Intent taxonomy ──────────────────────────────────────────────────────────

export const ChatIntent = {
  /** Chào hỏi / xác nhận bắt đầu. */
  GREETING: "greeting",
  /** Hỏi về sản phẩm (cây, chất liệu, kích thước, giá). */
  PRODUCT_INQUIRY: "product_inquiry",
  /** Tra cứu đơn hàng. */
  ORDER_STATUS: "order_status",
  /** Đổi trả / hoàn tiền / bảo hành. */
  RETURN_REFUND: "return_refund",
  /** Vấn đề giao hàng (giao chậm, sai địa chỉ, hư hỏng khi giao). */
  SHIPPING_ISSUE: "shipping_issue",
  /** Hỏi chính sách (bảo hành, đổi trả, thanh toán, hoá đơn). */
  POLICY_QUESTION: "policy_question",
  /** Yêu cầu nhân viên thật. */
  ESCALATE: "escalate",
  /** Khen / chê / góp ý. */
  FEEDBACK: "feedback",
  /** Không xác định. */
  UNKNOWN: "unknown",
} as const;

export type ChatIntentValue = (typeof ChatIntent)[keyof typeof ChatIntent];

/** Intent nào cần AI chắc chắn (không rule-match được). */
export const AI_ESCALATION_INTENTS: ChatIntentValue[] = [
  ChatIntent.ESCALATE,
  ChatIntent.RETURN_REFUND,
];

// ── Rule patterns ────────────────────────────────────────────────────────────

interface IntentRule {
  intent: ChatIntentValue;
  /** Keyword không dấu (đã chuẩn hoá). */
  keywords: string[];
  /** Confidence của rule match này. */
  confidence: number;
}

/**
 * Bảng rule. Keyword đã bỏ dấu + lowercase để so khớp nhanh.
 * Sắp xếp theo độ dài keyword giảm dần để ưu tiên cụm từ dài.
 */
const INTENT_RULES: IntentRule[] = [
  {
    intent: ChatIntent.ESCALATE,
    keywords: [
      "tu van vien", "nhan vien", "giam dinh", "goi dien cho toi", "chat voi nhan vien",
      "can người hỗ trợ", "can nguoi hỗ trợ", "chuyen sang nhan vien", "escalate",
    ],
    confidence: 0.95,
  },
  {
    intent: ChatIntent.ORDER_STATUS,
    keywords: [
      "don hang cua toi", "trang thai don", "don hang o dau", "shipped chua",
      "don hang bao lau", "theo doi don", "ma don", "order status", "đơn hàng của tôi",
    ],
    confidence: 0.9,
  },
  {
    intent: ChatIntent.RETURN_REFUND,
    keywords: [
      "doi tra", "hoan tien", "refund", "tra lai hang", "hoi gia", "bao hanh",
      "hang loi", "doi san pham", "chinh sach doi tra",
    ],
    confidence: 0.88,
  },
  {
    intent: ChatIntent.SHIPPING_ISSUE,
    keywords: [
      "giao hang", "ship lau", "giao cham", "sai dia chi", "hu hong",
      "vỡ khi giao", "theo doi van chuyen", "giao dien", "ship to",
    ],
    confidence: 0.85,
  },
  {
    intent: ChatIntent.PRODUCT_INQUIRY,
    keywords: [
      "gia bao nhieu", "bao nhieu tien", "co ton tai khong", "kich thuoc",
      "chat lieu", "mau sac", "san pham", "cay thong", "cây thông", "tien gia",
      "co dang duoc khong", "con hang khong", "inventory", "tong kho",
    ],
    confidence: 0.85,
  },
  {
    intent: ChatIntent.POLICY_QUESTION,
    keywords: [
      "chinh sach", "chinh sach bao hanh", "hoa don", "thanh toan",
      "phuong thuc thanh toan", "mua hang", "mua the nao", "huong dan",
      "lien he gi", "mo tao tai khoan",
    ],
    confidence: 0.8,
  },
  {
    intent: ChatIntent.FEEDBACK,
    keywords: [
      "cam on", "gop y", "khieu nai", "anh duong", "chat khong vui",
      "dich vu tot", "rat hanh", "phan hoi",
    ],
    confidence: 0.75,
  },
  {
    intent: ChatIntent.GREETING,
    keywords: [
      "chao", "xin chao", "hello", "hi", "good morning", "good afternoon",
      "chao ban", "co khoe khong",
    ],
    confidence: 0.7,
  },
];

/**
 * Chuẩn hoá chuỗi: bỏ dấu tiếng Việt, lowercase, gộp khoảng trắng.
 *
 * Dùng NFD + bỏ combining marks để bỏ dấu — không cần thư viện ngoài.
 */
export function normalizeText(input: string): string {
  return (input ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Rule-based classification ────────────────────────────────────────────────

export interface IntentResult {
  intent: ChatIntentValue;
  confidence: number;
  /** "rule" | "ai" | "fallback". */
  source: "rule" | "ai" | "fallback";
  /** Các intent khác có thể (để AI chọn lại nếu cần). */
  alternatives?: Array<{ intent: ChatIntentValue; confidence: number }>;
}

/**
 * Phân loại intent bằng rule (không gọi AI).
 * Trả về `null` nếu không rule nào match chắc chắn.
 */
export function classifyByRules(text: string): IntentResult | null {
  const normalized = normalizeText(text);
  if (!normalized) return null;

  let best: { intent: ChatIntentValue; confidence: number; matched: string } | null =
    null;

  for (const rule of INTENT_RULES) {
    for (const keyword of rule.keywords) {
      const kw = normalizeText(keyword);
      if (!kw) continue;

      // Keyword phải là substring. Cụm từ dài hơn ⇒ tin cậy hơn.
      if (!normalized.includes(kw)) continue;

      // Confidence tăng theo độ dài keyword (cụm từ dài ⇒ chắc chắn hơn).
      const bonus = Math.min(0.05, kw.length / 100);
      const confidence = Math.min(0.99, rule.confidence + bonus);

      if (!best || confidence > best.confidence) {
        best = { intent: rule.intent, confidence, matched: keyword };
      }
    }
  }

  if (!best) return null;

  // Rule match quá yếu (< 0.6) ⇒ coi như không chắc, để AI quyết định.
  if (best.confidence < 0.6) return null;

  return {
    intent: best.intent,
    confidence: Number(best.confidence.toFixed(2)),
    source: "rule",
  };
}

// ── AI-based classification ──────────────────────────────────────────────────

/** Prompt cho AI classify intent (rất ngắn, tiết kiệm token). */
const INTENT_CLASSIFY_PROMPT = `Phân loại ý định của tin nhắn khách hàng dưới đây vào ĐÚNG MỘT trong các nhãn:

- greeting: chào hỏi, bắt đầu cuộc trò chuyện
- product_inquiry: hỏi về sản phẩm, giá, kích thước, chất liệu, tồn kho
- order_status: tra cứu trạng thái đơn hàng
- return_refund: đổi trả, hoàn tiền, bảo hành
- shipping_issue: giao hàng chậm/sai/hư hỏng
- policy_question: hỏi chính sách, thanh toán, hóa đơn, hướng dẫn mua
- escalate: yêu cầu nói với nhân viên thật
- feedback: khen/chê/góp ý
- unknown: không xác định được

Trả lời DUY NHẤT dạng JSON: {"intent":"<nhãn>","confidence":<0.0-1.0>}`;

/**
 * Phân loại intent bằng AI (fallback khi rule không chắc).
 *
 * Dùng 1 call Gemini rẻ tiền (model nhỏ, output ngắn).
 * Nếu AI lỗi ⇒ trả `null` để caller dùng fallback an toàn.
 */
export async function classifyByAi(
  provider: AiProvider,
  text: string
): Promise<IntentResult | null> {
  try {
    const result = await provider.generateContent(
      provider.defaultModel,
      [{ role: "user", parts: [{ text }] }],
      {
        systemInstruction: INTENT_CLASSIFY_PROMPT,
        maxOutputTokens: 100,
        temperature: 0,
      }
    );

    if (result.blocked || !result.text.trim()) return null;

    // Parse JSON — bỏ qua text thừa (model đôi khi bọc ```json).
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as {
      intent?: string;
      confidence?: number;
    };

    const intent = parsed.intent as ChatIntentValue | undefined;
    if (!intent || !Object.values(ChatIntent).includes(intent)) return null;

    const confidence = Math.max(
      0,
      Math.min(1, Number(parsed.confidence ?? 0.7))
    );

    return {
      intent,
      confidence: Number(confidence.toFixed(2)),
      source: "ai",
    };
  } catch (err) {
    if (err instanceof AiProviderError) {
      // Provider lỗi ⇒ không fail, để fallback xử lý.
      console.warn(
        `[intent] AI classify failed (${err.code}), falling back to rules`
      );
      return null;
    }
    console.warn("[intent] AI classify failed:", err);
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Phân loại intent (hybrid).
 *
 * @param provider AI provider (có thể undefined nếu AI không khả dụng).
 */
export async function classifyIntent(
  text: string,
  provider?: AiProvider
): Promise<IntentResult> {
  // 1. Rule trước — nhanh & miễn phí.
  const ruleResult = classifyByRules(text);
  if (ruleResult) return ruleResult;

  // 2. Rule không match ⇒ thử AI (nếu khả dụng).
  if (provider?.isAvailable()) {
    const aiResult = await classifyByAi(provider, text);
    if (aiResult) return aiResult;
  }

  // 3. Fallback an toàn.
  return { intent: ChatIntent.UNKNOWN, confidence: 0.3, source: "fallback" };
}

/** Tin nhắn này có đáng escalate không? */
export function shouldEscalate(result: IntentResult): boolean {
  if (result.intent === ChatIntent.ESCALATE) return true;
  if (AI_ESCALATION_INTENTS.includes(result.intent) && result.confidence >= 0.8) {
    return true;
  }
  return false;
}
