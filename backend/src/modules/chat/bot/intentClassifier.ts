/**
 * intentClassifier.ts — phân loại intent bằng rule tiếng Việt.
 *
 * Thiết kế: mỗi intent có 1 danh sách pattern (biểu thức chính quy, không dấu).
 * Điểm khớp được chấm điểm:
 *   - khớp đầy đủ cụm từ  → +3
 *   - khớp 1 từ khoá đơn   → +1
 *   - có slot liên quan     → +1
 * Confidence = điểm / ngưỡng, cắt trần 1.
 *
 * Ưu điểm so với cách hiện tại (4 cái `lower.includes` trong chatbotService):
 *   - có confidence ⇒ router biết khi nào nên tin rule, khi nào giao AI.
 *   - trả slot ⇒ không phải hỏi lại khách những gì họ đã nói.
 *   - dễ mở rộng: thêm intent = thêm 1 mục trong RULE_DEFS.
 */

import { ExtractedSlots, normalizeInput } from "./nlpNormalizer";

export const CHAT_INTENTS = [
  "greeting",
  "thanks",
  "human_request",
  "complaint",
  "order_lookup",
  "price_consult",
  "faq_highfreq",
  "smalltalk",
  "unknown",
] as const;

export type ChatIntent = (typeof CHAT_INTENTS)[number];

export interface IntentMatch {
  intent: ChatIntent;
  /** Điểm thô. */
  score: number;
  /** Confidence 0..1. */
  confidence: number;
  /** Các từ khoá đã khớp (để debug/log). */
  matched: string[];
}

export interface ClassificationResult {
  intent: ChatIntent;
  confidence: number;
  slots: ExtractedSlots;
  /** Điểm của từng intent (để debug + fallback sang intent 2). */
  scores: Array<{ intent: ChatIntent; score: number }>;
  matched: string[];
}

interface RuleDef {
  intent: ChatIntent;
  /** Cụm từ chính quy (không dấu). Khớp = +3. */
  phrases: string[];
  /** Từ khoá đơn lẻ (không dấu). Khớp = +1. */
  keywords: string[];
  /** Slot bắt buộc có để intent hợp lệ (VD order_lookup cần orderCode hoặc phone). */
  requiredSlot?: keyof ExtractedSlots;
  /** Slot cộng điểm nếu có. */
  bonusSlot?: keyof ExtractedSlots;
}

/**
 * Định nghĩa rule. Toàn bộ ở dạng KHÔNG DẤU vì so khớp trên `canonical`.
 */
export const RULE_DEFS: ReadonlyArray<RuleDef> = [
  {
    intent: "greeting",
    phrases: ["xin chao", "chao ban", "chao anh chi", "chao em", "hello", "hi ban", "good morning", "good evening"],
    keywords: ["chao", "hello", "hi"],
  },
  {
    intent: "thanks",
    phrases: ["cam on", "cam on anh", "cam on chi", "thank you", "thanks a lot"],
    keywords: ["cam on"],
  },
  {
    intent: "human_request",
    phrases: [
      "goi nhan vien",
      "can tu van vien",
      "chat voi nhan vien",
      "tu van vien",
      "nhan vien tu van",
      "goi nguoi that",
      "noi voi nhan vien",
      "can nguyen",
      "can người thật",
    ],
    keywords: ["nhan vien", "tu van vien", "nguoi that", "goi nguoi"],
  },
  {
    intent: "complaint",
    phrases: [
      "khieu nai",
      "khieu nai ve",
      "toi khieu nai",
      "khong doi dong",
      "hang hong",
      "cay hong",
      "giao sai",
      "doi tra",
      "hoan tien",
      "tra tien lai",
      "mua si",
      "so luong lon",
      "khong hài lòng",
      "khong vui",
    ],
    keywords: ["khieu nai", "hong", "sai", "doi tra", "hoan", "mua si", "that bai"],
    bonusSlot: "orderCode",
  },
  {
    intent: "order_lookup",
    phrases: [
      "tra cuu don hang",
      "tra cuu don",
      "trang thai don hang",
      "don hang cua toi",
      "don cua toi",
      "my don hang",
      "kien tra",
      "theo doi don",
    ],
    keywords: ["don hang", "tra cuu", "trang thai", "ma don", "don cua toi", "ship toan bo chua"],
  },
  {
    intent: "price_consult",
    phrases: [
      "tu van cay thong",
      "tu van cay",
      "co cay nao",
      "co mau nao",
      "cay nao dep",
      "mua cay thong",
      "gia bao nhieu",
      "bao nhieu tien",
      "cong bao nhieu",
      "gia ban",
      "tu van giay",
    ],
    keywords: ["gia", "bao nhieu", "tu van", "mua cay", "cay thong", "co cay", "mau nao", "size nao"],
    bonusSlot: "maxPrice",
  },
  {
    intent: "faq_highfreq",
    phrases: [
      "phi ship",
      "phi giao hang",
      "phi van chuyen",
      "thoi gian giao",
      "bao lao giao",
      "khi nao giao hang",
      "lap dat",
      "bao hanh",
      "hoa don",
      "thanh toan",
      "cham soc cay",
    ],
    keywords: ["ship", "giao hang", "lap dat", "bao hanh", "hoa don", "thanh toan", "cham soc"],
  },
];

/** Ngưỡng confidence tối thiểu để router tin rule. */
export const RULE_CONFIDENCE_THRESHOLD = 0.85;

/** Điểm đủ để đạt confidence 1.0. */
const MAX_SCORE = 4;

/**
 * Phân loại intent của 1 tin nhắn.
 */
export function classifyIntent(input: string): ClassificationResult {
  const { text, slots, canonical } = normalizeInput(input);

  const scores: Array<{ intent: ChatIntent; score: number }> = [];
  const bestMatched: string[] = [];

  for (const rule of RULE_DEFS) {
    let score = 0;
    const matched: string[] = [];

    for (const phrase of rule.phrases) {
      if (phrase && canonical.includes(phrase)) {
        score += 3;
        matched.push(phrase);
      }
    }
    for (const keyword of rule.keywords) {
      if (keyword && text.plain.includes(keyword)) {
        score += 1;
        matched.push(keyword);
      }
    }

    if (rule.bonusSlot && slots[rule.bonusSlot] !== undefined) {
      score += 1;
      matched.push(`slot:${rule.bonusSlot}`);
    }

    // Intent order_lookup chỉ hợp lệ khi khách đưa mã đơn hoặc SĐT.
    if (rule.requiredSlot && slots[rule.requiredSlot] === undefined) {
      score = 0;
    }

    if (score > 0) {
      scores.push({ intent: rule.intent, score });
      if (score > (bestMatched.length ? 0 : 0)) {
        // giữ matched của rule đang dẫn đầu tạm thời
      }
    }
  }

  if (!scores.length) {
    return {
      intent: "unknown",
      confidence: 0,
      slots,
      scores: [],
      matched: [],
    };
  }

  scores.sort((a, b) => b.score - a.score);
  const top = scores[0];

  // Tính matched của rule dẫn đầu.
  const topRule = RULE_DEFS.find((r) => r.intent === top.intent);
  if (topRule) {
    for (const phrase of topRule.phrases) {
      if (phrase && canonical.includes(phrase)) bestMatched.push(phrase);
    }
    for (const keyword of topRule.keywords) {
      if (keyword && text.plain.includes(keyword)) bestMatched.push(keyword);
    }
  }

  const confidence = Math.min(1, top.score / MAX_SCORE);

  return {
    intent: top.intent,
    confidence,
    slots,
    scores,
    matched: bestMatched,
  };
}

/**
 * Intent cần chuyển tư vấn viên ngay (không chờ router quyết định).
 */
export function isEscalationIntent(intent: ChatIntent): boolean {
  return intent === "human_request" || intent === "complaint";
}

/** Intent nên trả lời bằng rule (không cần AI). */
export function isRuleAnswerable(intent: ChatIntent): boolean {
  return (
    intent === "greeting" ||
    intent === "thanks" ||
    intent === "human_request" ||
    intent === "faq_highfreq" ||
    intent === "order_lookup"
  );
}
