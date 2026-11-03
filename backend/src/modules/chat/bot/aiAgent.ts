/**
 * aiAgent.ts — AI Agent (Gemini + Function Calling) của Hybrid Chatbot.
 *
 * Tách từ services/ai/chatbotService.ts (P0/P1 refactor Hybrid).
 * Ở đây chỉ còn vai trò "gọi AI + chạy tool + trả lời".
 * Việc quyết định route (rule / AI / người thật) nằm ở hybridRouter.ts.
 *
 * Tool đã tách sang modules/chat/bot/tools/*:
 *   - searchProducts.tool.ts
 *   - lookupOrder.tool.ts
 *   - faqSearch.tool.ts
 *   - escalate.tool.ts
 */

import { GoogleGenAI, FunctionDeclaration } from "@google/genai";
import { Types } from "mongoose";
import { Conversation } from "../../../models/Conversation";
import { Message } from "../../../models/Message";
import { sendMessage } from "../services/messageService";
import { broadcastNewMessage } from "../socket/chatSocket";
import {
  SYSTEM_INSTRUCTION,
  SYSTEM_INSTRUCTION_FOLLOWUP,
} from "./prompts/systemPrompt.v2";
import {
  executeSearchProducts,
  formatSearchProductsFallback,
  type SearchProductsResult,
} from "./tools/searchProducts.tool";
import {
  executeLookupOrder,
  formatLookupOrderFallback,
  type ChatCallerContext,
  type LookupOrderResult,
} from "./tools/lookupOrder.tool";
import { executeFaqSearch } from "./tools/faqSearch.tool";
import { escalateToAdmin } from "./tools/escalate.tool";
import { BOT_NAME } from "./copy";

export type { ChatCallerContext };

/** Tool declarations cho Gemini Function Calling. */
const toolsDeclarations: FunctionDeclaration[] = [
  {
    name: "search_products",
    description:
      "Tìm kiếm các mẫu cây thông Noel hoặc phụ kiện trang trí trong catalog theo từ khóa, mức giá, kích thước hoặc loại sản phẩm.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Từ khóa tìm kiếm (ví dụ: 'cây thông 1m8', 'phong cách cổ điển', 'màu đỏ')",
        },
        type: {
          type: "string",
          enum: ["all", "tree", "accessory"],
          description:
            "Loại sản phẩm cần tìm: 'tree' (cây thông concept hoàn chỉnh), 'accessory' (phụ kiện), 'all' (tất cả)",
        },
        maxPrice: {
          type: "number",
          description: "Ngân sách tối đa của khách hàng (VNĐ)",
        },
        minPrice: {
          type: "number",
          description: "Ngân sách tối thiểu của khách hàng (VNĐ)",
        },
        size: {
          type: "string",
          description: "Kích thước cây: S, M, L, XL",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "lookup_order",
    description:
      "Tra cứu thông tin trạng thái đơn hàng của khách hàng theo mã đơn hàng hoặc số điện thoại người nhận.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        orderCode: {
          type: "string",
          description:
            "Mã đơn hàng khách hàng cung cấp (ví dụ: 'BYC-2026-9812', ID đơn hàng)",
        },
        phoneNumber: {
          type: "string",
          description: "Số điện thoại đặt hàng",
        },
      },
      required: ["orderCode"],
    },
  },
  {
    name: "faq_search",
    description:
      "Tra cứu các câu hỏi thường gặp đã được duyệt về chính sách giao hàng, phí vận chuyển, lắp đặt, bảo hành, hoá đơn, thanh toán. Dùng tool này trước khi tự trả lời về chính sách.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Từ khoá cần tra (ví dụ: 'phí giao hàng', 'bảo hành cây')",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "escalate_to_admin",
    description:
      "Chuyển tiếp cuộc hội thoại cho nhân viên tư vấn / Admin người thật tiếp quản. Gọi tool này khi khách yêu cầu gặp người, khiếu nại, đổi trả, mua sỉ, hoặc câu hỏi nằm ngoài hiểu biết của bot.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Lý do tóm tắt vì sao cần chuyển sang Admin tiếp quản",
        },
      },
      required: ["reason"],
    },
  },
];

export interface AiAgentResult {
  /** Nội dung trả lời cho khách. */
  text: string;
  /** Tool đã gọi (để analytics + fallback). */
  toolsUsed: string[];
  /** Sản phẩm gợi ý (metadata DTO). */
  suggestedProducts?: SearchProductsResult["suggestedProducts"];
  /** Thông tin đơn hàng (metadata DTO). */
  orderInfo?: {
    orderId: string;
    orderCode?: string;
    orderNumber?: string;
    status: string;
    totalAmount: number;
  };
  /** Đã escalate sang người thật hay chưa. */
  escalated: boolean;
  /** Lý do escalate. */
  escalationReason?: string;
  /** Lỗi (nếu AI không chạy được) — để router fallback sang rule. */
  failed: boolean;
}

/**
 * Chạy 1 lượt AI: gọi Gemini, thực thi tool, trả lời.
 *
 * Không tự ghi Message — việc đó thuộc về hybridRouter để kiểm soát
 * việc cập nhật Conversation.lastMessage và broadcast.
 */
export async function runAiAgent(
  conversationId: string,
  latestUserText: string,
  caller?: ChatCallerContext
): Promise<AiAgentResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const modelName = process.env.GEMINI_CHAT_MODEL?.trim() || "gemini-2.5-flash";

  const empty: AiAgentResult = {
    text: "",
    toolsUsed: [],
    escalated: false,
    failed: true,
  };

  if (!apiKey) {
    console.warn("[aiAgent] GEMINI_API_KEY chưa cấu hình.");
    return empty;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    // Lấy 10 tin gần nhất làm context.
    const historyDocs = await Message.find({ conversationId })
      .sort({ createdAt: -1 })
      .limit(10);
    const history = historyDocs.reverse();

    const rawContents: Array<{ role: "user" | "model"; parts: any[] }> = [];

    for (const msg of history) {
      const type = msg.sender?.type;
      if (type === "USER") {
        rawContents.push({ role: "user", parts: [{ text: msg.content }] });
      } else if (type === "BOT") {
        rawContents.push({ role: "model", parts: [{ text: msg.content }] });
      }
    }

    let startIdx = rawContents.findIndex((c) => c.role === "user");
    if (startIdx === -1) startIdx = rawContents.length;
    const contents = rawContents.slice(startIdx);

    if (contents.length === 0) {
      contents.push({ role: "user", parts: [{ text: latestUserText }] });
    } else if (contents[contents.length - 1].role !== "user") {
      contents.push({ role: "user", parts: [{ text: latestUserText }] });
    }

    const response = await ai.models.generateContent({
      model: modelName,
      contents: contents as any,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ functionDeclarations: toolsDeclarations }],
      },
    });

    const functionCalls = response.functionCalls;
    let botReplyText = response.text || "";
    const toolsUsed: string[] = [];
    let suggestedProducts: SearchProductsResult["suggestedProducts"] | undefined;
    let orderInfo: AiAgentResult["orderInfo"];
    let escalated = false;
    let escalationReason: string | undefined;

    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      const callName = String(call.name || "");
      console.log(`[aiAgent] Gemini gọi Tool: ${callName}`, call.args);
      toolsUsed.push(callName);

      let toolResult: any = null;

      if (call.name === "search_products") {
        toolResult = await executeSearchProducts(call.args as any);
        if (toolResult.suggestedProducts?.length > 0) {
          suggestedProducts = toolResult.suggestedProducts;
        }
      } else if (call.name === "lookup_order") {
        toolResult = await executeLookupOrder(call.args as any, caller);
        if (toolResult.found) {
          orderInfo = {
            orderId: toolResult.orderCode!,
            orderCode: toolResult.orderCode,
            orderNumber: toolResult.orderCode,
            status: toolResult.status!,
            totalAmount: toolResult.totalAmount || 0,
          };
        }
      } else if (call.name === "faq_search") {
        toolResult = await executeFaqSearch(call.args as any);
      } else if (call.name === "escalate_to_admin") {
        const reason = (call.args as any)?.reason || "Khách hàng yêu cầu gặp tư vấn viên";
        toolResult = await escalateToAdmin(conversationId, reason);
        escalationReason = reason;
        escalated = Boolean(toolResult.success);
      }

      try {
        const followUpContents = [
          ...contents,
          { role: "model" as const, parts: [{ functionCall: call }] },
          {
            role: "user" as const,
            parts: [{ functionResponse: { name: call.name, response: toolResult } }],
          },
        ];

        const followUpResponse = await ai.models.generateContent({
          model: modelName,
          contents: followUpContents as any,
          config: { systemInstruction: SYSTEM_INSTRUCTION_FOLLOWUP },
        });

        if (followUpResponse.text) {
          botReplyText = followUpResponse.text;
        }
      } catch (err) {
        console.warn("[aiAgent] Follow-up call error, dùng fallback:", err);
        if (!botReplyText) {
          botReplyText = formatToolFallbackText(call.name, toolResult);
        }
      }
    }

    if (!botReplyText.trim()) {
      botReplyText =
        "Em có thể giúp gì thêm cho anh/chị về các mẫu cây thông hay đơn hàng không ạ? 🎄";
    }

    return {
      text: botReplyText.trim(),
      toolsUsed,
      suggestedProducts,
      orderInfo,
      escalated,
      escalationReason,
      failed: false,
    };
  } catch (err: any) {
    console.error("[aiAgent] Lỗi xử lý Gemini:", err);
    return { ...empty, text: "" };
  }
}

/** Format fallback khi AI không trả lời được sau khi chạy tool. */
export function formatToolFallbackText(toolName?: string, result?: any): string {
  if (toolName === "search_products") {
    return formatSearchProductsFallback(result as SearchProductsResult);
  }
  if (toolName === "lookup_order") {
    return formatLookupOrderFallback(result as LookupOrderResult);
  }
  if (toolName === "escalate_to_admin") {
    return "Em đã gửi yêu cầu kết nối với chuyên viên tư vấn. Anh/chị đợi một chút, nhân viên sẽ vào hỗ trợ mình ngay ạ! 👩‍💼";
  }
  if (toolName === "faq_search") {
    const matches = result?.matches || [];
    if (!matches.length) {
      return "Dạ, em chưa có thông tin chính xác về vấn đề này ạ. Anh/chị có thể liên hệ tư vấn viên để được hỗ trợ chính xác hơn nhé!";
    }
    return matches[0].answer;
  }
  return "Dạ em đã ghi nhận thông tin, em có thể hỗ trợ gì thêm cho anh/chị không ạ?";
}

/**
 * Ghi tin BOT + cập nhật Conversation + broadcast.
 * Dùng chung cho cả rule engine và AI agent.
 */
export async function persistBotMessage(
  conversationId: string,
  content: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const botMsg = await sendMessage({
    conversationId,
    sender: { type: "BOT", name: BOT_NAME },
    content,
    metadata,
    trustedMetadata: true,
  });

  const conv = await Conversation.findById(conversationId);
  if (conv) {
    conv.lastMessage = content.length > 500 ? `${content.slice(0, 500)}…` : content;
    conv.lastMessageAt = new Date();
    conv.lastMessageSenderType = "BOT";
    await conv.save();
    await broadcastNewMessage(conv._id, botMsg, conv);
  }
}
