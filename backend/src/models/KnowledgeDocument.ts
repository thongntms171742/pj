import mongoose, { Schema, Document, Types } from "mongoose";

/**
 * KnowledgeDocument (TDD v1.0 §6.5) — kho tri thức cho AI.
 *
 * Mỗi record = 1 tài liệu/chính sách đã được con người duyệt, dùng làm
 * nguồn sự thật cho tool `policySearch` (và cho AI Copilot).
 *
 * Vì sao cần bảng này (thay vì hardcode trong prompt):
 *   - AI KHÔNG được bịa chính sách ⇒ mọi câu trả lời về chính sách phải
 *     tra từ đây.
 *   - Admin sửa nội dung qua API ⇒ không cần deploy code.
 *   - Có `status`/`version` ⇒ có thể soạn thảo (draft) rồi mới publish.
 *
 * LƯU Ý: đây là bảng MỚI, không phải bảng `ChatFaq` cũ (đã bị xoá).
 * Khác biệt: mỗi tài liệu có `content` dài + `keywords` + `category`,
 * phục vụ cả trả lời tức thì lẫn retrieval cho Copilot.
 */

export const KNOWLEDGE_CATEGORIES = [
  "policy",
  "faq",
  "guide",
  "product_care",
  "shipping",
  "payment",
  "return",
  "warranty",
] as const;

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

export const KNOWLEDGE_STATUSES = ["draft", "published", "archived"] as const;

export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];

export interface IKnowledgeDocument extends Document {
  title: string;
  slug: string;
  category: KnowledgeCategory;
  /** Nội dung chính (markdown) — nguồn sự thật cho AI. */
  content: string;
  /** Tóm tắt 1-2 câu — dùng cho quick answer & Copilot summary. */
  summary: string;
  /** Từ khoá để match nhanh (không dấu hoặc có dấu đều được). */
  keywords: string[];
  /** Tag để lọc theo chủ đề. */
  tags: string[];
  status: KnowledgeStatus;
  /** Ưu tiên cao = thử trước khi nhiều tài liệu cùng khớp. */
  priority: number;
  isActive: boolean;
  version: number;
  updatedBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const KnowledgeDocumentSchema = new Schema<IKnowledgeDocument>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, unique: true },
    category: {
      type: String,
      enum: KNOWLEDGE_CATEGORIES,
      required: true,
      default: "faq",
      index: true,
    },
    content: { type: String, required: true, trim: true },
    summary: { type: String, default: "" },
    keywords: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    status: {
      type: String,
      enum: KNOWLEDGE_STATUSES,
      required: true,
      default: "published",
      index: true,
    },
    priority: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true, index: true },
    version: { type: Number, default: 1, min: 1 },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

// Truy vấn chính: tài liệu đang publish, sắp theo priority.
KnowledgeDocumentSchema.index({ status: 1, isActive: 1, priority: -1 });
// Lọc theo category.
KnowledgeDocumentSchema.index({ category: 1, status: 1 });
// Text index phục vụ tìm kiếm nhanh.
KnowledgeDocumentSchema.index({ title: "text", content: "text", keywords: "text" });

export const KnowledgeDocument = mongoose.model<IKnowledgeDocument>(
  "KnowledgeDocument",
  KnowledgeDocumentSchema
);
