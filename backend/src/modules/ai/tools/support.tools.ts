/**
 * support.tools.ts — tool `policySearch` cho AI.
 *
 * Tra chính sách từ kho tri thức (KnowledgeDocument) — nguồn sự thật DUY NHẤT
 * cho các câu hỏi về đổi trả / bảo hành / thanh toán / hoá đơn.
 *
 * AI KHÔNG được bịa chính sách: nếu tool không tìm thấy ⇒ escalate hoặc
 * hỏi khách hàng, tuyệt đối không tự đột "tra Google".
 */

import type { AiTool } from "./index";
import { retrieveKnowledge } from "../services/knowledge.service";
import type { KnowledgeCategory } from "../../../models/KnowledgeDocument";

export interface PolicySearchArgs {
  query?: string;
  category?: KnowledgeCategory;
  limit?: number;
}

/** Map intent → category gợi ý (giúp tool lọc đúng nhóm tài liệu). */
const INTENT_TO_CATEGORY: Record<string, KnowledgeCategory> = {
  return_refund: "return",
  policy_question: "policy",
  shipping_issue: "shipping",
  product_inquiry: "product_care",
};

export const policySearchTool: AiTool = {
  declaration: {
    name: "policySearch",
    description:
      "Tra chính sách của Build Your Christmas: đổi trả, bảo hành, thanh toán, hoá đơn, giao hàng, hướng dẫn sử dụng. Dùng khi khách hàng hỏi về quy định, điều khoản hoặc thủ tục. Trả về nội dung chính sách thật đã được duyệt.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Câu hỏi / từ khoá cần tra (VD: 'đổi trả trong bao lâu', 'bảo hành bao lâu').",
        },
        category: {
          type: "string",
          description:
            "Nhóm tài liệu: 'policy', 'faq', 'guide', 'product_care', 'shipping', 'payment', 'return', 'warranty'.",
        },
        limit: {
          type: "number",
          description: "Số tài liệu tối đa cần trả về (mặc định 3).",
        },
      },
      required: ["query"],
    },
  },

  async execute(args, context) {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    const rawCategory = typeof args.category === "string" ? args.category.trim() : "";
    const limit = Math.min(
      5,
      Math.max(1, Number(args.limit) > 0 ? Number(args.limit) : 3)
    );

    if (!query) {
      return {
        data: {
          found: false,
          results: [],
          reason: "Cần câu hỏi để tra chính sách.",
        },
      };
    }

    const category = (rawCategory || undefined) as
      | KnowledgeCategory
      | undefined;

    const matches = await retrieveKnowledge(query, { category, limit });

    if (matches.length === 0) {
      return {
        data: {
          found: false,
          results: [],
          reason:
            "Không tìm thấy chính sách phù hợp trong kho tri thức. Hãy nói với khách hàng là cần nhân viên hỗ trợ thêm.",
          suggestEscalation: true,
        },
        escalate: true,
        escalateReason:
          "Không tìm thấy chính sách trong kho tri thức ⇒ cần nhân viên xác nhận.",
      };
    }

    return {
      data: {
        found: true,
        count: matches.length,
        results: matches.map((m) => ({
          title: m.entry.title,
          category: m.entry.category,
          summary: m.entry.summary,
          // Nội dung bị cắt bớt để tiết kiệm token — AI vẫn đủ dùng.
          content:
            m.entry.content.length > 1200
              ? `${m.entry.content.slice(0, 1200)}…`
              : m.entry.content,
          tags: m.entry.tags,
          matchedKeywords: m.matched,
          relevance: Number(m.score.toFixed(2)),
        })),
        note:
          "Trích dẫn nội dung trên một cách trung thực. KHÔNG thêm điều khoản nào không có trong kết quả.",
      },
    };
  },
};

/** Helper cho orchestrator: suy ra category từ intent. */
export function categoryForIntent(intent: string): KnowledgeCategory | undefined {
  return INTENT_TO_CATEGORY[intent];
}

export { INTENT_TO_CATEGORY };
