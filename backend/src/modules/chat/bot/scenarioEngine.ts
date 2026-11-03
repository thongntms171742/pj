/**
 * scenarioEngine.ts — máy trạng thái kịch bản (Rule-first).
 *
 * Ứng dụng bước 3 của bài hướng dẫn ("Thiết kế kịch bản hội thoại"):
 * mỗi node = 1 tình huống, có điều kiện vào, xử lý, và câu trả lời cụ thể.
 *
 * Node hiện có:
 *   - greeting          : chào hỏi
 *   - consult_tree      : tư vấn cây thông (thu thập size + ngân sách)
 *   - order_lookup      : tra cứu đơn hàng
 *   - faq_highfreq      : câu hỏi thường gặp (đọc từ ChatFaq)
 *   - complaint_handoff : khiếu nại / yêu cầu người thật
 *   - closing_csat      : đánh giá hài lòng trước khi kết thúc
 */

import { Conversation, type ChatScenarioNode, type IChatSlots } from "../../../models/Conversation";
import { executeLookupOrder, type ChatCallerContext } from "./tools/lookupOrder.tool";
import { executeSearchProducts } from "./tools/searchProducts.tool";
import { matchFaq, findFaqByIntent } from "./faqStore";
import { formatVnd } from "./copy";

export interface ScenarioReply {
  /** Nội dung trả lời. */
  text: string;
  /** Metadata gắn vào Message (quickReplies, suggestedProducts, orderInfo…). */
  metadata: Record<string, unknown>;
  /** Node tiếp theo. */
  nextNode: ChatScenarioNode;
  /** Slot đã cập nhật. */
  slots: IChatSlots;
  /** Node đã xử lý (để analytics). */
  node: ChatScenarioNode;
  /** Đã xử lý xong (không cần AI). */
  handled: boolean;
}

export interface ScenarioInput {
  conversationId: string;
  userText: string;
  slots: IChatSlots;
  currentNode: ChatScenarioNode;
  attempts: number;
  caller?: ChatCallerContext;
}

/** Trạng thái scenario mặc định cho conversation mới. */
export function defaultScenarioState(): {
  currentNode: ChatScenarioNode;
  slots: IChatSlots;
  attempts: number;
  visited: string[];
} {
  return { currentNode: "greeting", slots: {}, attempts: 0, visited: [] };
}

/**
 * Xử lý 1 lượt theo máy kịch bản.
 *
 * Trả về `handled: false` nếu node hiện tại không xử lý được ⇒ router giao cho AI.
 */
export async function runScenario(input: ScenarioInput): Promise<ScenarioReply> {
  const slots: IChatSlots = { ...input.slots };

  switch (input.currentNode) {
    case "greeting":
      return handleGreeting(input, slots);
    case "consult_tree":
      return handleConsultTree(input, slots);
    case "order_lookup":
      return handleOrderLookup(input, slots);
    case "faq_highfreq":
      return handleFaqHighFreq(input, slots);
    case "complaint_handoff":
      return handleComplaintHandoff(input, slots);
    case "closing_csat":
      return handleClosingCsat(input, slots);
    default:
      return {
        text: "",
        metadata: {},
        nextNode: input.currentNode,
        slots,
        node: input.currentNode,
        handled: false,
      };
  }
}

// ── greeting ────────────────────────────────────────────────────────────────
async function handleGreeting(
  input: ScenarioInput,
  slots: IChatSlots
): Promise<ScenarioReply> {
  const { GREETING_REPLY, DEFAULT_QUICK_REPLIES } = await import("./copy");
  return {
    text: GREETING_REPLY,
    metadata: { quickReplies: [...DEFAULT_QUICK_REPLIES] },
    nextNode: "consult_tree",
    slots,
    node: "greeting",
    handled: true,
  };
}

// ── consult_tree ────────────────────────────────────────────────────────────
async function handleConsultTree(
  input: ScenarioInput,
  slots: IChatSlots
): Promise<ScenarioReply> {
  const { CONSULT_PROMPT, CONSULT_FOLLOWUP_REPLIES, DEFAULT_QUICK_REPLIES } = await import("./copy");

  // Chưa đủ thông tin → hỏi thêm.
  const hasSize = Boolean(slots.size);
  const hasBudget = Boolean(slots.maxPrice || slots.minPrice);
  const hasSpace = Boolean(slots.space);

  if (!hasSize && !hasBudget && !hasSpace) {
    return {
      text: CONSULT_PROMPT,
      metadata: { quickReplies: [...DEFAULT_QUICK_REPLIES] },
      nextNode: "consult_tree",
      slots,
      node: "consult_tree",
      handled: true,
    };
  }

  // Đủ thông tin → tìm sản phẩm thật.
  const search = await executeSearchProducts({
    query: slots.style || "",
    type: "tree",
    maxPrice: slots.maxPrice,
    minPrice: slots.minPrice,
    size: slots.size,
  });

  if (!search.trees.length) {
    return {
      text:
        "Dạ em đã tìm rồi ạ, hiện tại chưa có mẫu nào khớp hoàn toàn với yêu cầu của anh/chị. Anh/chị cho em biết thêm phong cách hoặc ngân sách linh hoạt hơn được không ạ? 🎄",
      metadata: { quickReplies: [...DEFAULT_QUICK_REPLIES] },
      nextNode: "consult_tree",
      slots,
      node: "consult_tree",
      handled: true,
    };
  }

  let text = "Dạ em tìm được một vài mẫu phù hợp với yêu cầu của anh/chị ạ:\n";
  for (const t of search.trees) {
    text += `• 🎄 ${t.name} — Size ${t.size}, chiều cao ${t.heightRange}, giá ${formatVnd(t.price)}\n`;
  }
  text += "\nAnh/chị thích mẫu nào ạ? Em có thể tư vấn thêm về phụ kiện đi kèm nữa!";

  return {
    text,
    metadata: {
      quickReplies: [...CONSULT_FOLLOWUP_REPLIES],
      suggestedProducts: search.suggestedProducts,
    },
    nextNode: "consult_tree",
    slots,
    node: "consult_tree",
    handled: true,
  };
}

// ── order_lookup ───────────────────────────────────────────────────────────
async function handleOrderLookup(
  input: ScenarioInput,
  slots: IChatSlots
): Promise<ScenarioReply> {
  const { ORDER_LOOKUP_PROMPT, ORDER_LOOKUP_REPLIES, DEFAULT_QUICK_REPLIES } = await import("./copy");
  const { formatLookupOrderFallback } = await import("./tools/lookupOrder.tool");

  const orderCode = slots.orderCode;
  const phone = slots.phone;

  if (!orderCode && !phone) {
    return {
      text: ORDER_LOOKUP_PROMPT,
      metadata: { quickReplies: [...ORDER_LOOKUP_REPLIES] },
      nextNode: "order_lookup",
      slots,
      node: "order_lookup",
      handled: true,
    };
  }

  const result = await executeLookupOrder({ orderCode, phoneNumber: phone }, input.caller);

  if (!result.found) {
    return {
      text: result.message || "Dạ, em chưa tìm thấy đơn hàng phù hợp ạ.",
      metadata: { quickReplies: [...DEFAULT_QUICK_REPLIES] },
      nextNode: "order_lookup",
      slots,
      node: "order_lookup",
      handled: true,
    };
  }

  const text = formatLookupOrderFallback(result);
  return {
    text,
    metadata: {
      quickReplies: [...DEFAULT_QUICK_REPLIES],
      orderInfo: {
        orderId: result.orderCode!,
        orderCode: result.orderCode,
        orderNumber: result.orderCode,
        status: result.status!,
        totalAmount: result.totalAmount || 0,
      },
    },
    nextNode: "order_lookup",
    slots,
    node: "order_lookup",
    handled: true,
  };
}

// ── faq_highfreq ───────────────────────────────────────────────────────────
async function handleFaqHighFreq(
  input: ScenarioInput,
  slots: IChatSlots
): Promise<ScenarioReply> {
  const { DEFAULT_QUICK_REPLIES } = await import("./copy");

  const match = await matchFaq(input.userText);
  if (match.entry) {
    return {
      text: match.entry.answer,
      metadata: {
        quickReplies: match.entry.quickReplies.length
          ? [...match.entry.quickReplies]
          : [...DEFAULT_QUICK_REPLIES],
      },
      nextNode: "faq_highfreq",
      slots,
      node: "faq_highfreq",
      handled: true,
    };
  }

  // Không khớp FAQ nào ⇒ để AI xử lý (có tool faq_search).
  return {
    text: "",
    metadata: {},
    nextNode: "faq_highfreq",
    slots,
    node: "faq_highfreq",
    handled: false,
  };
}

// ── complaint_handoff ───────────────────────────────────────────────────────
async function handleComplaintHandoff(
  input: ScenarioInput,
  slots: IChatSlots
): Promise<ScenarioReply> {
  const { ESCALATION_REPLY } = await import("./copy");
  return {
    text: ESCALATION_REPLY,
    metadata: {},
    nextNode: "complaint_handoff",
    slots,
    node: "complaint_handoff",
    handled: true,
  };
}

// ── closing_csat ───────────────────────────────────────────────────────────
async function handleClosingCsat(
  input: ScenarioInput,
  slots: IChatSlots
): Promise<ScenarioReply> {
  const { CSAT_PROMPT, DEFAULT_QUICK_REPLIES } = await import("./copy");

  // Khách đã đánh giá (số 1..5) → xác nhận.
  const rating = extractRating(input.userText);
  if (rating) {
    return {
      text: `Cảm ơn anh/chị đã đánh giá ${rating}/5 ạ! 🎄 Hẹn gặp lại anh/chị trong mùa Giáng Sinh tiếp theo nhé!`,
      metadata: { quickReplies: [] },
      nextNode: "closing_csat",
      slots: { ...slots, satisfaction: rating },
      node: "closing_csat",
      handled: true,
    };
  }

  return {
    text: CSAT_PROMPT,
    metadata: { quickReplies: ["5 - Rất hài lòng", "4 - Hài lòng", "3 - Bình thường", "2 - Chưa hài lòng", "1 - Rất không hài lòng"] },
    nextNode: "closing_csat",
    slots,
    node: "closing_csat",
    handled: true,
  };
}

/**
 * Trích điểm đánh giá 1..5 từ câu trả lời của khách.
 */
export function extractRating(text: string): number | undefined {
  const t = (text || "").trim();
  if (/^[1-5]$/.test(t)) return parseInt(t, 10);

  // Thứ tự quan trọng: biến thể PHỦ ĐỊNH phải được kiểm tra TRƯỚC biến thể
  // dương, vì "chưa hài lòng" cũng chứa "hài lòng".
  const map: Array<[RegExp, number]> = [
    [/rất không hài lòng|rat khong hai long|không hài lòng|1\s*sao|1\s*\/\s*5/i, 1],
    [/chưa hài lòng|chua hai long|2\s*sao|2\s*\/\s*5/i, 2],
    [/bình thường|binh thuong|3\s*sao|3\s*\/\s*5/i, 3],
    [/rất hài lòng|rat hai long|5\s*sao|5\s*\/\s*5/i, 5],
    [/hài lòng|hai long|4\s*sao|4\s*\/\s*5/i, 4],
  ];

  for (const [re, rating] of map) {
    if (re.test(t)) return rating;
  }
  return undefined;
}

/**
 * Lưu trạng thái scenario vào Conversation.
 */
export async function saveScenarioState(
  conversationId: string,
  state: {
    currentNode: ChatScenarioNode;
    slots: IChatSlots;
    attempts: number;
    visited: string[];
  }
): Promise<void> {
  await Conversation.updateOne(
    { _id: conversationId },
    {
      $set: {
        "scenarioState.currentNode": state.currentNode,
        "scenarioState.slots": state.slots,
        "scenarioState.attempts": state.attempts,
        "scenarioState.visited": state.visited.slice(-20),
      },
    }
  );
}

/**
 * Đọc trạng thái scenario hiện tại của conversation (fallback về mặc định).
 */
export async function loadScenarioState(conversationId: string): Promise<{
  currentNode: ChatScenarioNode;
  slots: IChatSlots;
  attempts: number;
  visited: string[];
}> {
  const conv = await Conversation.findById(conversationId).select("scenarioState").lean();
  const st = (conv as any)?.scenarioState;
  if (!st) return defaultScenarioState();
  return {
    currentNode: st.currentNode || "greeting",
    slots: st.slots || {},
    attempts: st.attempts || 0,
    visited: st.visited || [],
  };
}
