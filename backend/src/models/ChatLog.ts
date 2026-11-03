import mongoose, { Schema, Document, Types } from "mongoose";

// ── ChatLog — nhật ký hành vi chatbot (bước 5 "đánh giá và tối ưu") ────────
//
// Mỗi lượt hội thoại bot ghi 1 record để admin xem báo cáo hiệu suất:
//   - Tỉ lệ trúng intent (rule) vs rơi sang AI vs chuyển người thật.
//   - Tỉ lệ "AI không tìm thấy kết quả" → đề xuất viết thêm FAQ.
//   - Độ trễ trung bình mỗi route.
//   - CSAT sau khi cuộc trò chuyện RESOLVED.

/** Loại đường đi mà bot đã chọn. */
export const CHAT_ROUTES = ["RULE", "AI", "HUMAN", "FALLBACK"] as const;
export type ChatRoute = (typeof CHAT_ROUTES)[number];

export interface IChatLog extends Document {
  conversationId: Types.ObjectId;
  /** Tin nhắn gốc của khách (đã cắt ngắn). */
  input: string;
  /** Chuẩn hoá sau NLP (không dấu, lowercase). */
  normalized: string;
  /** Intent nhận diện được. */
  intent?: string;
  /** Độ tin cậy của intent (0..1). */
  confidence?: number;
  /** Đường đi đã chọn. */
  route: ChatRoute;
  /** Slot đã trích xuất (size, budget, phone...). */
  slots?: Record<string, unknown>;
  /** Thời gian xử lý (ms). */
  latencyMs: number;
  /** Tool AI đã gọi trong lượt này. */
  toolsUsed?: string[];
  /** Có escalate sang người thật không. */
  escalated?: boolean;
  /** Lý do escalate. */
  reason?: string;
  /** Điểm CSAT (1..5) nếu có. */
  satisfaction?: number;
  createdAt: Date;
}

const ChatLogSchema = new Schema<IChatLog>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    input: { type: String, required: true, trim: true, maxlength: 2000 },
    normalized: { type: String, default: "", trim: true },
    intent: { type: String, trim: true },
    confidence: { type: Number, min: 0, max: 1 },
    route: { type: String, enum: CHAT_ROUTES, required: true, index: true },
    slots: { type: Schema.Types.Mixed, default: {} },
    latencyMs: { type: Number, default: 0, min: 0 },
    toolsUsed: { type: [String], default: [] },
    escalated: { type: Boolean, default: false },
    reason: { type: String, trim: true },
    satisfaction: { type: Number, min: 1, max: 5 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Báo cáo theo ngày + route.
ChatLogSchema.index({ createdAt: -1 });
ChatLogSchema.index({ createdAt: -1, route: 1 });
// Tìm lượt hội thoại theo intent (để biết intent nào hay rơi sang AI).
ChatLogSchema.index({ intent: 1, createdAt: -1 });

export const ChatLog = mongoose.model<IChatLog>("ChatLog", ChatLogSchema);
