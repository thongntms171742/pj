/**
 * faqStore.ts — lớp truy cập FAQ vận hành được.
 *
 * 2 nơi dùng:
 *   1. Rule engine: match FAQ theo từ khoá để trả lời tức thì (0 token).
 *   2. Gemini tool `faq_search`: lấy nguồn sự thật đã duyệt.
 *
 * Cache in-memory TTL 60s để không query DB mỗi lượt chat.
 */

import { ChatFaq, IChatFaq } from "../../../models/ChatFaq";
import { stripDiacritics } from "./nlpNormalizer";

export interface FaqEntry {
  id: string;
  intent: string;
  question: string;
  answer: string;
  keywords: string[];
  synonyms: string[];
  quickReplies: string[];
  matchThreshold: number;
  priority: number;
}

const CACHE_TTL_MS = 60 * 1000;

let cache: FaqEntry[] | null = null;
let cacheExpiry = 0;

/** Xoá cache (dùng cho test hoặc sau khi admin sửa FAQ). */
export function invalidateFaqCache(): void {
  cache = null;
  cacheExpiry = 0;
}

/** Chuẩn hoá chuỗi để so khớp: lowercase + bỏ dấu + gộp khoảng trắng. */
function canon(input: string): string {
  return stripDiacritics((input || "").toLowerCase()).replace(/\s+/g, " ").trim();
}

/** Load tất cả FAQ active (có cache). */
export async function loadActiveFaqs(): Promise<FaqEntry[]> {
  const now = Date.now();
  if (cache && now < cacheExpiry) return cache;

  const docs = (await ChatFaq.find({ isActive: true })
    .sort({ priority: -1 })
    .lean()) as unknown as IChatFaq[];

  cache = docs.map((d) => ({
    id: String(d._id),
    intent: d.intent,
    question: d.question,
    answer: d.answer,
    keywords: (d.keywords || []).map(canon).filter(Boolean),
    synonyms: (d.synonyms || []).map(canon).filter(Boolean),
    quickReplies: d.quickReplies || [],
    matchThreshold: Math.max(1, d.matchThreshold || 1),
    priority: d.priority || 0,
  }));

  cacheExpiry = now + CACHE_TTL_MS;
  return cache;
}

export interface FaqMatchResult {
  entry: FaqEntry | null;
  /** Điểm khớp. */
  score: number;
  /** Các từ khoá đã khớp. */
  matched: string[];
}

/**
 * Chấm điểm 1 FAQ với 1 câu hỏi (đã chuẩn hoá).
 *
 * Trả về `{ raw, effective }`:
 *   - `raw`       = điểm từ từ khoá + bonus câu hỏi.
 *   - `effective` = `raw + priority / 100` ⇒ priority của admin quyết định
 *                   khi có nhiều FAQ cùng khớp.
 *
 * Tách riêng để test được không cần DB.
 */
export function scoreFaq(
  faq: FaqEntry,
  haystackCanon: string
): { raw: number; effective: number } {
  let raw = 0;
  for (const kw of [...faq.keywords, ...faq.synonyms]) {
    if (!kw) continue;
    if (haystackCanon.includes(kw)) raw += 1;
  }

  const questionCanon = canon(faq.question);
  if (questionCanon && haystackCanon.includes(questionCanon)) raw += 2;

  return { raw, effective: raw + faq.priority / 100 };
}

/**
 * Tìm FAQ khớp nhất với 1 câu hỏi.
 *
 * Cách tính điểm:
 *   - Mỗi từ khoá/synonym xuất hiện trong câu → +1.
 *   - Cụm từ trùng khớp trong `question` → +2 (mạnh hơn).
 *   - FAQ phải đạt `matchThreshold` từ khoá mới được coi là khớp.
 *
 * `priority` được cộng thêm (chia 100) vào điểm: nhờ vậy admin có thể đẩy một
 * FAQ cụ thể lên trên các FAQ chung có cùng từ khoá. Nếu không cộng priority,
 * FAQ "phí giao hàng" (chung) sẽ luôn thắng FAQ "phí giao hàng ngoài thành phố"
 * (riêng) chỉ vì nó có nhiều từ khoá khớp hơn.
 */
export async function matchFaq(input: string): Promise<FaqMatchResult> {
  const faqs = await loadActiveFaqs();
  if (!faqs.length) return { entry: null, score: 0, matched: [] };

  const haystack = canon(input);
  if (!haystack) return { entry: null, score: 0, matched: [] };

  let best: FaqMatchResult = { entry: null, score: 0, matched: [] };

  for (const faq of faqs) {
    const { raw, effective } = scoreFaq(faq, haystack);

    // FAQ không đạt ngưỡng từ khoá ⇒ loại (dù priority có cao).
    if (raw < faq.matchThreshold) continue;

    const matched: string[] = [];
    for (const kw of [...faq.keywords, ...faq.synonyms]) {
      if (kw && haystack.includes(kw)) matched.push(kw);
    }

    if (effective > best.score) {
      best = { entry: faq, score: effective, matched };
    }
  }

  return best;
}

/**
 * Tìm FAQ theo intent (dùng khi rule engine đã biết intent).
 */
export async function findFaqByIntent(intent: string): Promise<FaqEntry | null> {
  const faqs = await loadActiveFaqs();
  const forIntent = faqs.filter((f) => f.intent === intent);
  return forIntent.length ? forIntent[0] : null;
}
