import { GoogleGenAI, FunctionDeclaration } from "@google/genai";
import { Types } from "mongoose";
import { Conversation } from "../../models/Conversation";
import { Message, IMessageMetadata } from "../../models/Message";
import { Tree } from "../../models/Tree";
import { Order } from "../../models/Order";
import { escapeRegExp } from "../../utils/regex";
import { broadcastNewMessage, broadcastStatusChange } from "../../modules/chat/socket/chatSocket";

/** Ngữ cảnh người gọi — dùng để giới hạn tool lookup_order. */
export interface ChatCallerContext {
  /** Mongo user id của người gọi (nếu đã đăng nhập). */
  userId?: string;
  /** Guest session id (nếu là khách vãng lai). */
  sessionId?: string;
}

const SYSTEM_INSTRUCTION = `
Bạn là "Trợ lý Noel 🎄" - nhân viên tư vấn ảo của thương hiệu "Build Your Christmas".
Nhiệm vụ của bạn:
1. Tư vấn các sản phẩm cây thông Noel (concept hoàn chỉnh đã bao gồm phụ kiện + style).
2. Tra cứu trạng thái đơn hàng khi khách hàng cung cấp mã đơn hoặc số điện thoại.
3. Khi khách hàng có nhu cầu gặp người thật, thắc mắc đơn khiếu nại / bảo hành / mua sỉ số lượng lớn hoặc bày tỏ thái độ bức xúc, hãy gọi ngay tool "escalate_to_admin" để kết nối với tư vấn viên.
4. Phong cách giao tiếp: Ấm áp, lịch sự, thân thiện, mang không khí Giáng Sinh (dùng biểu tượng 🎄, ⭐, 🎁 nhẹ nhàng), câu từ ngắn gọn, rõ ràng.
5. Khi gợi ý sản phẩm, hãy tóm tắt tên, kích thước, mức giá rõ ràng để khách dễ lựa chọn.
`.trim();

// ── Tool Definitions for Gemini Function Calling ─────────────────────────────
const toolsDeclarations: FunctionDeclaration[] = [
  {
    name: "search_products",
    description: "Tìm kiếm các mẫu cây thông Noel hoặc phụ kiện trang trí trong catalog theo từ khóa, mức giá hoặc loại sản phẩm.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Từ khóa tìm kiếm (ví dụ: 'cây thông 1m8', 'phong cách cổ điển', 'màu đỏ')",
        },
        type: {
          type: "string",
          enum: ["all", "tree"],
          description: "Loại sản phẩm cần tìm: 'tree' (cây thông concept hoàn chỉnh), 'all' (tất cả)",
        },
        maxPrice: {
          type: "number",
          description: "Ngân sách tối đa của khách hàng (VNĐ)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "lookup_order",
    description: "Tra cứu thông tin trạng thái đơn hàng của khách hàng theo mã đơn hàng hoặc số điện thoại người nhận.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        orderCode: {
          type: "string",
          description: "Mã đơn hàng khách hàng cung cấp (ví dụ: 'BYC-...', ID đơn hàng)",
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
    name: "escalate_to_admin",
    description: "Chuyển tiếp cuộc hội thoại cho nhân viên tư vấn / Admin người thật tiếp quản. Gọi tool này khi khách yêu cầu gặp người, khiếu nại, đổi trả, hoặc câu hỏi nằm ngoài hiểu biết của bot.",
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

// ── Tool Execution Handlers ──────────────────────────────────────────────────

/**
 * Tool 1: Search products in Tree collection (concept hoàn chỉnh).
 */
async function executeSearchProducts(args: { query?: string; type?: string; maxPrice?: number }) {
  const { query = "", type = "all", maxPrice } = args;
  const regex = new RegExp(escapeRegExp(query.trim()), "i");
  const results: any = { trees: [] };

  if (type === "all" || type === "tree") {
    const treeFilter: any = { isActive: true };
    if (query.trim()) {
      treeFilter.$or = [{ name: regex }, { description: regex }, { size: regex }];
    }
    if (maxPrice && maxPrice > 0) {
      treeFilter.price = { $lte: maxPrice };
    }

    const trees = await Tree.find(treeFilter)
      .select("name size price heightCmMin heightCmMax stockQuantity bareImage")
      .limit(6);

    results.trees = trees.map((t) => ({
      id: t._id,
      name: t.name,
      size: t.size,
      price: t.price,
      heightRange: `${t.heightCmMin}-${t.heightCmMax}cm`,
      stock: t.stockQuantity,
      image: t.bareImage,
    }));
  }

  return results;
}

/**
 * Tool 2: Lookup order status by code or phone.
 */
async function executeLookupOrder(
  args: { orderCode?: string; phoneNumber?: string },
  caller?: ChatCallerContext
) {
  const { orderCode, phoneNumber } = args;
  if (!orderCode && !phoneNumber) {
    return { found: false, message: "Cần cung cấp mã đơn hoặc số điện thoại để tra cứu." };
  }

  const query: any = {};
  if (orderCode) {
    const code = orderCode.trim();
    query.$or = [{ orderCode: code }];
    if (Types.ObjectId.isValid(code)) {
      query.$or.push({ _id: new Types.ObjectId(code) });
    }
  } else if (phoneNumber) {
    query.shippingPhone = new RegExp(escapeRegExp(phoneNumber.trim()));
  }

  if (caller?.userId) {
    query.buyerId = new Types.ObjectId(caller.userId);
  }

  const order = await Order.findOne(query).sort({ createdAt: -1 });
  if (!order) {
    if (caller?.userId) {
      return {
        found: false,
        message:
          "Không tìm thấy đơn hàng nào thuộc tài khoản của bạn với thông tin đã cung cấp. Vui lòng kiểm tra lại mã đơn.",
      };
    }
    return { found: false, message: "Không tìm thấy đơn hàng phù hợp với thông tin đã cung cấp." };
  }

  const statusTranslations: Record<string, string> = {
    PENDING_PAYMENT: "Chờ thanh toán",
    PAID: "Đã thanh toán",
    CONFIRMED: "Đã xác nhận",
    PACKING: "Đang đóng gói cây",
    SHIPPING: "Đang bàn giao vận chuyển",
    DELIVERING: "Đang trên đường giao tới bạn",
    DELIVERED: "Đã giao hàng thành công",
    COMPLETED: "Hoàn tất đơn hàng",
    CANCEL_REQUESTED: "Đã gửi yêu cầu hủy đơn",
    CANCELLED: "Đã hủy",
    DISPUTED: "Đang trong quá trình khiếu nại",
    REFUNDED: "Đã hoàn tiền",
  };

  const isGuest = !caller?.userId;

  return {
    found: true,
    orderCode: order.orderCode,
    status: statusTranslations[order.status] || order.status,
    rawStatus: order.status,
    totalAmount: order.totalAmount,
    itemCount: order.items?.length || 0,
    trackingNumber: order.trackingNumber || "Chưa có",
    createdAt: (order as any).createdAt || new Date(),
    ...(isGuest
      ? {
          recipient: undefined,
          shippingAddress: undefined,
          maskedPhone: order.shippingPhone
            ? `${String(order.shippingPhone).slice(0, 3)}***${String(order.shippingPhone).slice(-2)}`
            : undefined,
        }
      : {
          recipient: order.shippingName,
          shippingAddress: order.shippingAddress,
          shippingPhone: order.shippingPhone,
        }),
  };
}

/**
 * Tool 3: Escalate to human admin.
 */
async function executeEscalateToAdmin(conversationId: string, reason: string) {
  const conv = await Conversation.findById(conversationId);
  if (!conv) return { success: false };

  conv.status = "WAITING_ADMIN";
  conv.summary = reason;
  await conv.save();

  // Create system notice message
  const sysMsg = await Message.create({
    conversationId: conv._id,
    sender: {
      type: "SYSTEM",
      name: "Hệ thống",
    },
    content: "Đã gửi yêu cầu kết nối với tư vấn viên. Vui lòng chờ trong giây lát...",
    metadata: { action: "ESCALATION_BY_AI", reason },
  });

  await broadcastNewMessage(conv._id, sysMsg, conv);
  broadcastStatusChange(conv._id, "WAITING_ADMIN");

  return {
    success: true,
    message: "Đã kích hoạt chuyển giao sang tư vấn viên thành công. Admin sẽ sớm tham gia hỗ trợ.",
  };
}

// ── Main AI Chatbot Handler ──────────────────────────────────────────────────

/**
 * Processes incoming user message with Gemini AI and optional Function Calling.
 */
export async function processAiChatMessage(
  conversationId: string,
  latestUserText: string,
  caller?: ChatCallerContext
): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const modelName = process.env.GEMINI_CHAT_MODEL?.trim() || "gemini-2.5-flash";

  const conv = await Conversation.findById(conversationId);
  if (!conv || conv.status !== "BOT_ACTIVE") {
    return;
  }

  // Fallback: If no API Key configured, use a rule-based response
  if (!apiKey) {
    console.warn("[Chatbot] GEMINI_API_KEY chưa cấu hình, sử dụng phản hồi dự phòng...");
    await handleFallbackBotResponse(conv, latestUserText);
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    // Retrieve last 10 messages for conversation context
    const historyDocs = await Message.find({ conversationId: conv._id })
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
    if (startIdx === -1) {
      startIdx = rawContents.length;
    }
    const contents = rawContents.slice(startIdx);

    if (contents.length === 0) {
      contents.push({ role: "user", parts: [{ text: latestUserText }] });
    } else if (contents[contents.length - 1].role !== "user") {
      contents.push({ role: "user", parts: [{ text: latestUserText }] });
    }

    // Call Gemini with tools
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
    let botMetadata: IMessageMetadata = {};

    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      console.log(`[Chatbot] Gemini gọi Tool: ${call.name} với args:`, call.args);

      let toolResult: any = null;

      if (call.name === "search_products") {
        toolResult = await executeSearchProducts(call.args as any);
        if (toolResult.trees?.length > 0) {
          botMetadata.suggestedProducts = (toolResult.trees || []).map((t: any) => ({
            id: String(t.id),
            type: "tree" as const,
            name: t.name,
            price: t.price,
            imageUrl: t.image,
          }));
        }
      } else if (call.name === "lookup_order") {
        toolResult = await executeLookupOrder(call.args as any, caller);
        if (toolResult.found) {
          botMetadata.orderInfo = {
            orderId: toolResult.orderCode,
            orderCode: toolResult.orderCode,
            orderNumber: toolResult.orderCode,
            status: toolResult.status,
            totalAmount: toolResult.totalAmount,
          };
        }
      } else if (call.name === "escalate_to_admin") {
        const reason = (call.args as any)?.reason || "Khách hàng yêu cầu gặp tư vấn viên";
        toolResult = await executeEscalateToAdmin(String(conv._id), reason);
        botMetadata.escalationReason = reason;
      }

      try {
        const followUpContents = [
          ...contents,
          {
            role: "model" as const,
            parts: [{ functionCall: call }],
          },
          {
            role: "user" as const,
            parts: [
              {
                functionResponse: {
                  name: call.name,
                  response: toolResult,
                },
              },
            ],
          },
        ];

        const followUpResponse = await ai.models.generateContent({
          model: modelName,
          contents: followUpContents as any,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
          },
        });

        if (followUpResponse.text) {
          botReplyText = followUpResponse.text;
        }
      } catch (err) {
        console.warn("[Chatbot] Follow-up call error, using formatted fallback:", err);
        if (!botReplyText) {
          botReplyText = formatToolFallbackText(call.name, toolResult);
        }
      }
    }

    if (!botReplyText.trim()) {
      botReplyText = "Em có thể giúp gì thêm cho anh/chị về các mẫu cây thông hay đơn hàng không ạ? 🎄";
    }

    const botMsg = await Message.create({
      conversationId: conv._id,
      sender: {
        type: "BOT",
        name: "Trợ lý AI",
      },
      content: botReplyText.trim(),
      metadata: botMetadata,
    });

    const freshConv = await Conversation.findById(conv._id);
    const currentStatus = freshConv?.status || conv.status;

    conv.lastMessage = botReplyText.trim();
    conv.lastMessageAt = new Date();
    conv.lastMessageSenderType = "BOT";
    conv.status = currentStatus;
    await conv.save();

    await broadcastNewMessage(conv._id, botMsg, conv);
  } catch (err: any) {
    console.error("[Chatbot] Lỗi xử lý Gemini AI Chat:", err);
    await handleFallbackBotResponse(conv, latestUserText);
  }
}

function formatToolFallbackText(toolName?: string, result?: any): string {
  if (toolName === "search_products") {
    const trees = result?.trees || [];
    if (trees.length === 0) {
      return "Hiện tại em chưa tìm thấy mẫu cây khớp hoàn toàn với yêu cầu của anh/chị. Anh/chị có thể cho em biết thêm ngân sách hoặc kích thước mong muốn không ạ? 🎄";
    }
    let msg = "Dưới đây là một số gợi ý phù hợp dành cho anh/chị:\n";
    for (const t of trees) {
      msg += `• 🎄 ${t.name} (Size ${t.size}) - ${t.price.toLocaleString()}đ\n`;
    }
    return msg;
  }

  if (toolName === "lookup_order") {
    if (!result?.found) {
      return "Dạ, em đã kiểm tra nhưng không tìm thấy đơn hàng theo thông tin trên. Anh/chị vui lòng kiểm tra lại mã đơn hoặc số điện thoại giúp em nhé!";
    }
    const recipientLine = result.recipient ? `\nNgười nhận: ${result.recipient}.` : "";
    return `Đơn hàng **${result.orderCode}** của anh/chị hiện có trạng thái: **${result.status}**.\nTổng tiền: ${result.totalAmount?.toLocaleString()}đ.${recipientLine}`;
  }

  if (toolName === "escalate_to_admin") {
    return "Em đã gửi yêu cầu kết nối với chuyên viên tư vấn. Anh/chị đợi một chút, nhân viên sẽ vào hỗ trợ mình ngay ạ! 👩‍💼";
  }

  return "Dạ em đã ghi nhận thông tin, em có thể hỗ trợ gì thêm cho anh/chị không ạ?";
}

async function handleFallbackBotResponse(conv: any, userText: string): Promise<void> {
  const lower = userText.toLowerCase().trim();
  let replyText = "";
  let quickReplies: string[] = ["Tư vấn cây thông Noel", "Tra cứu đơn hàng", "Gặp nhân viên hỗ trợ"];

  if (
    lower.includes("gặp admin") ||
    lower.includes("tư vấn viên") ||
    lower.includes("người thật") ||
    lower.includes("nhân viên")
  ) {
    await executeEscalateToAdmin(String(conv._id), "Khách hàng yêu cầu gặp tư vấn viên trực tiếp");
    replyText = "Dạ vâng, em đã chuyển cuộc trò chuyện sang cho chuyên viên tư vấn rồi ạ. Bạn đợi trong giây lát nhé! 👩‍💼";
    quickReplies = [];
  } else if (lower.includes("đơn hàng") || lower.includes("mã đơn") || lower.includes("tra cứu")) {
    replyText = "Dạ, anh/chị có thể gửi giúp em Mã đơn hàng (ví dụ: BYC-...) hoặc Số điện thoại đặt hàng để em tra cứu trạng thái đơn ngay ạ! 📦";
  } else if (lower.includes("cây thông") || lower.includes("giá") || lower.includes("size") || lower.includes("kích thước")) {
    replyText = "Build Your Christmas có các dòng cây thông từ 1m2 (Size S), 1m5 (Size M), 1m8 (Size L) đến 2m1 (Size XL) với đầy đủ phong cách Classic, Nordic, Luxury. Anh/chị dự định đặt cây cho không gian nào ạ? 🎄";
  } else {
    replyText = "Em là trợ lý ảo của Build Your Christmas 🎄! Em có thể giúp gì cho anh/chị hôm nay ạ?";
  }

  const botMsg = await Message.create({
    conversationId: conv._id,
    sender: {
      type: "BOT",
      name: "Trợ lý AI",
    },
    content: replyText,
    metadata: { quickReplies },
  });

  const freshConv = await Conversation.findById(conv._id);
  const currentStatus = freshConv?.status || conv.status;

  conv.lastMessage = replyText;
  conv.lastMessageAt = new Date();
  conv.lastMessageSenderType = "BOT";
  conv.status = currentStatus;
  await conv.save();

  await broadcastNewMessage(conv._id, botMsg, conv);
}
