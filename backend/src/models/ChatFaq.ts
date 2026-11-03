import mongoose, { Schema, Document, Types } from "mongoose";

// ── ChatFaq — FAQ vận hành được cho Hybrid Chatbot ──────────────────────────
//
// Mỗi record = 1 câu hỏi thường gặp + câu trả lời đã được con người duyệt.
//
// Vì sao cần bảng này (thay vì hard-code trong prompt):
//   - Rule engine đọc trực tiếp để trả lời tức thì (0 token, <300ms).
//   - Gemini dùng tool `faq_search` để lấy nguồn sự thật, chống ảo giác.
//   - Nhân viên运营 tự sửa câu trả lời qua API admin, không cần deploy code.

export const FAQ_INTENTS = [
  "shipping_fee",
  "delivery_time",
  "installation",
  "warranty",
  "invoice",
  "payment",
  "return_policy",
  "bulk_order",
  "tree_care",
  "other",
] as const;

export type FaqIntent = (typeof FAQ_INTENTS)[number];

export interface IChatFaq extends Document {
  /** Nhóm intent để rule engine định tuyến nhanh. */
  intent: FaqIntent;
  /** Câu hỏi gốc (hiển thị cho admin). */
  question: string;
  /** Câu trả lời hiển thị cho khách. */
  answer: string;
  /** Từ khoá để match nhanh (không dấu hoặc có dấu đều được). */
  keywords: string[];
  /** Từ đồng nghĩa mở rộng (VD: "phí ship" → "phí vận chuyển"). */
  synonyms: string[];
  /** Quick replies gợi ý sau khi trả lời. */
  quickReplies: string[];
  /** Số lượt từ khoá phải khớp để match (mặc định 1). */
  matchThreshold: number;
  /** Ưu tiên cao = thử trước. */
  priority: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ChatFaqSchema = new Schema<IChatFaq>(
  {
    intent: {
      type: String,
      enum: FAQ_INTENTS,
      required: true,
      default: "other",
      index: true,
    },
    question: { type: String, required: true, trim: true },
    answer: { type: String, required: true, trim: true },
    keywords: { type: [String], default: [] },
    synonyms: { type: [String], default: [] },
    quickReplies: { type: [String], default: [] },
    matchThreshold: { type: Number, default: 1, min: 1, max: 5 },
    priority: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

// Tìm FAQ đang active theo intent, sắp theo priority.
ChatFaqSchema.index({ isActive: 1, intent: 1, priority: -1 });
// Text index phục vụ tìm kiếm nhanh khi admin thao tác.
ChatFaqSchema.index({ question: "text", answer: "text", keywords: "text" });

export const ChatFaq = mongoose.model<IChatFaq>("ChatFaq", ChatFaqSchema);
