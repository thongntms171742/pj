/**
 * tools/index.ts — registry của các tool AI có thể gọi.
 *
 * Mỗi tool gồm:
 *   - `declaration`: mô tả cho AI (tên, mô tả, JSON schema params).
 *   - `execute`: hàm thực thi thật.
 *
 * Tool PHẢI tự kiểm tra phân quyền — AI không được đọc dữ liệu của user khác.
 */

import type { AiToolDeclaration } from "../providers/ai-provider.interface";

export interface AiToolContext {
  /** User hiện tại (người đang chat) — dùng để kiểm tra quyền. */
  userId: string;
  /** Id conversation (để audit / context). */
  conversationId: string;
}

export interface AiToolResult {
  /** Kết quả dạng object — sẽ serialize thành JSON cho AI. */
  data: Record<string, unknown>;
  /** Ghi chú thêm cho hệ thống (VD: escalate). */
  escalate?: boolean;
  escalateReason?: string;
}

export interface AiTool {
  declaration: AiToolDeclaration;
  execute(
    args: Record<string, unknown>,
    context: AiToolContext
  ): Promise<AiToolResult>;
}

// ── Tool implementations ─────────────────────────────────────────────────────

import { searchProductsTool } from "./product.tools";
import { lookupOrderTool } from "./order.tools";
import { shippingInfoTool } from "./shipping.tools";
import { policySearchTool } from "./support.tools";

/** Danh sách tool theo thứ tự ưu tiên (AI có thể gọi nhiều lần). */
export const AI_TOOLS: AiTool[] = [
  searchProductsTool,
  lookupOrderTool,
  shippingInfoTool,
  policySearchTool,
];

/** Map tên tool → tool (để tra cứu nhanh khi AI yêu cầu). */
export const AI_TOOL_MAP: Map<string, AiTool> = new Map(
  AI_TOOLS.map((tool) => [tool.declaration.name, tool])
);

/** Declarations đưa cho AI. */
export function getToolDeclarations(): AiToolDeclaration[] {
  return AI_TOOLS.map((tool) => tool.declaration);
}

/** Tìm tool theo tên — trả null nếu không tồn tại (chống AI bịa tên tool). */
export function findTool(name: string): AiTool | null {
  return AI_TOOL_MAP.get(name) ?? null;
}
