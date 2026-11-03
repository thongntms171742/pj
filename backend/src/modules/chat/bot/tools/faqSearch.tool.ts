/**
 * faqSearch.tool.ts — Tool 4 (mới): tra cứu FAQ vận hành được.
 *
 * Mục đích: cho Gemini có nguồn sự thật đã được con người duyệt, tránh ảo giác
 * về chính sách giao hàng / bảo hành / hoá đơn.
 *
 * Nguồn dữ liệu: collection `chatfaqs` (model ChatFaq).
 */

import { ChatFaq, IChatFaq } from "../../../../models/ChatFaq";
import { escapeRegExp } from "../../../../utils/regex";

export interface FaqSearchArgs {
  query?: string;
  intent?: string;
  limit?: number;
}

export interface FaqSearchResult {
  found: boolean;
  matches: Array<{
    id: string;
    intent: string;
    question: string;
    answer: string;
    quickReplies?: string[];
  }>;
}

/**
 * Tìm FAQ khớp theo từ khoá / intent.
 *
 * - Khớp `keywords` hoặc `synonyms` (không phân biệt hoa thường, không dấu).
 * - Ưu tiên theo `priority` cao → thấp.
 */
export async function executeFaqSearch(args: FaqSearchArgs): Promise<FaqSearchResult> {
  const query = (args.query || "").trim();
  const limit = Math.min(10, Math.max(1, args.limit || 3));

  const filter: any = { isActive: true };
  if (args.intent) filter.intent = args.intent;

  if (query) {
    const regex = new RegExp(escapeRegExp(query), "i");
    filter.$or = [
      { question: regex },
      { answer: regex },
      { keywords: regex },
      { synonyms: regex },
    ];
  }

  const docs = (await ChatFaq.find(filter)
    .sort({ priority: -1 })
    .limit(limit)
    .lean()) as unknown as IChatFaq[];

  const matches = docs.map((d) => ({
    id: String(d._id),
    intent: d.intent,
    question: d.question,
    answer: d.answer,
    quickReplies: d.quickReplies?.length ? d.quickReplies : undefined,
  }));

  return { found: matches.length > 0, matches };
}
