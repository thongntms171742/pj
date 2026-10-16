import { GoogleGenAI, FunctionDeclaration } from "@google/genai";
import { Types } from "mongoose";
import { Conversation } from "../../models/Conversation";
import { Message, IMessageMetadata } from "../../models/Message";
import { Tree } from "../../models/Tree";
import { Accessory } from "../../models/Accessory";
import { Order } from "../../models/Order";
import { getSocketIO } from "../chat/socketService";

const SYSTEM_INSTRUCTION = `
Bạn là "Trợ lý Noel 🎄" - nhân viên tư vấn ảo của thương hiệu "Build Your Christmas".
Nhiệm vụ của bạn:
1. Tư vấn các sản phẩm cây thông Noel, phụ kiện trang trí (châu, đèn led, nơ, ngôi sao đỉnh), phong cách thiết kế (Classic, Nordic, Luxury, Gingerbread).
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
          description: "Từ khóa tìm kiếm (ví dụ: 'cây thông 1m8', 'đèn led', 'trái châu đỏ', 'nordic')",
        },
        type: {
          type: "string",
          enum: ["all", "tree", "accessory"],
          description: "Loại sản phẩm cần tìm: 'tree' (cây thông), 'accessory' (phụ kiện), 'all' (tất cả)",
        },
        maxPrice: {
          type: "number",
          description: "Ngân sách tối đa của khách hàng (VNĐ)",
        },
      },
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
 * Tool 1: Search products in Tree and Accessory collections.
 */
async function executeSearchProducts(args: { query?: string; type?: string; maxPrice?: number }) {
  const { query = "", type = "all", maxPrice } = args;
  const regex = new RegExp(query.trim(), "i");
  const results: any = { trees: [], accessories: [] };

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
      .limit(4);

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

  if (type === "all" || type === "accessory") {
    const accFilter: any = { isActive: true };
    if (query.trim()) {
      accFilter.$or = [{ name: regex }, { description: regex }, { group: regex }, { type: regex }];
    }
    if (maxPrice && maxPrice > 0) {
      accFilter.price = { $lte: maxPrice };
    }

    const accessories = await Accessory.find(accFilter)
      .select("name group type price stock image")
      .limit(6);

    results.accessories = accessories.map((a) => ({
      id: a._id,
      name: a.name,
      group: a.group,
      type: a.type,
      price: a.price,
      stock: a.stock,
      image: a.image,
    }));
  }

  return results;
}

/**
 * Tool 2: Lookup order status by code or phone.
 */
async function executeLookupOrder(args: { orderCode?: string; phoneNumber?: string }) {
  const { orderCode, phoneNumber } = args;
  if (!orderCode && !phoneNumber) {
    return { found: false, message: "Cần cung cấp mã đơn hoặc số điện thoại để tra cứu." };
  }

  const query: any = {};
  if (orderCode) {
    query.$or = [{ orderCode: orderCode.trim() }];
    if (Types.ObjectId.isValid(orderCode.trim())) {
      query.$or.push({ _id: new Types.ObjectId(orderCode.trim()) });
    }
  } else if (phoneNumber) {
    query.shippingPhone = new RegExp(phoneNumber.trim());
  }

  const order = await Order.findOne(query).sort({ createdAt: -1 });
  if (!order) {
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
    CANCELLED: "Đã hủy",
  };

  return {
    found: true,
    orderCode: order.orderCode,
    status: statusTranslations[order.status] || order.status,
    rawStatus: order.status,
    totalAmount: order.totalAmount,
    recipient: order.shippingName,
    shippingAddress: order.shippingAddress,
    itemCount: order.items?.length || 0,
    trackingNumber: order.trackingNumber || "Chưa có",
    createdAt: (order as any).createdAt || new Date(),
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
    senderType: "SYSTEM",
    senderName: "Hệ thống",
    content: "Đã gửi yêu cầu kết nối với tư vấn viên. Vui lòng chờ trong giây lát...",
    metadata: { action: "ESCALATION_BY_AI", reason },
  });

  const io = getSocketIO();
  if (io) {
    const room = `conversation_${conversationId}`;
    io.to(room).emit("new_message", { message: sysMsg, status: conv.status });
    io.to(room).emit("status_changed", { conversationId: conv._id, status: conv.status });

    io.to("admin_channel").emit("new_support_ticket", {
      conversationId: conv._id,
      customerInfo: conv.customerInfo,
      summary: reason,
      lastMessageAt: conv.lastMessageAt,
      unreadAdminCount: conv.unreadAdminCount,
    });
  }

  return {
    success: true,
    message: "Đã kích hoạt chuyển giao sang tư vấn viên thành công. Admin sẽ sớm tham gia hỗ trợ.",
  };
}

// ── Main AI Chatbot Handler ──────────────────────────────────────────────────

/**
 * Processes incoming user message with Gemini AI and optional Function Calling.
 * Called whenever a user sends a message in a BOT_ACTIVE conversation.
 */
export async function processAiChatMessage(
  conversationId: string,
  latestUserText: string
): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const modelName = process.env.GEMINI_CHAT_MODEL?.trim() || "gemini-2.5-flash";

  // Check if conversation is still in BOT_ACTIVE mode
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

    // Map history to Gemini content parts
    const contents: Array<{ role: "user" | "model"; parts: any[] }> = [];

    for (const msg of history) {
      if (msg.senderType === "USER") {
        contents.push({ role: "user", parts: [{ text: msg.content }] });
      } else if (msg.senderType === "BOT") {
        contents.push({ role: "model", parts: [{ text: msg.content }] });
      }
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

    // If Gemini decided to call a Tool
    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      console.log(`[Chatbot] Gemini gọi Tool: ${call.name} với args:`, call.args);

      let toolResult: any = null;

      if (call.name === "search_products") {
        toolResult = await executeSearchProducts(call.args as any);
        if (toolResult.trees?.length > 0 || toolResult.accessories?.length > 0) {
          botMetadata.suggestedProducts = [
            ...(toolResult.trees || []).map((t: any) => ({
              id: String(t.id),
              type: "tree" as const,
              name: t.name,
              price: t.price,
              imageUrl: t.image,
            })),
            ...(toolResult.accessories || []).map((a: any) => ({
              id: String(a.id),
              type: "accessory" as const,
              name: a.name,
              price: a.price,
              imageUrl: a.image,
            })),
          ];
        }
      } else if (call.name === "lookup_order") {
        toolResult = await executeLookupOrder(call.args as any);
        if (toolResult.found) {
          botMetadata.orderInfo = {
            orderId: toolResult.orderCode,
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

      // Turn 2: Feed tool result back to Gemini for natural final answer
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

    // If still no reply text, provide friendly fallback
    if (!botReplyText.trim()) {
      botReplyText = "Em có thể giúp gì thêm cho anh/chị về các mẫu cây thông hay đơn hàng không ạ? 🎄";
    }

    // Save Bot message into database
    const botMsg = await Message.create({
      conversationId: conv._id,
      senderType: "BOT",
      senderName: "Trợ lý AI",
      content: botReplyText.trim(),
      metadata: botMetadata,
    });

    conv.lastMessage = botReplyText.trim();
    conv.lastMessageAt = new Date();
    conv.unreadUserCount += 1;
    await conv.save();

    // Broadcast Bot reply via Socket.io
    const io = getSocketIO();
    if (io) {
      const room = `conversation_${conv._id}`;
      io.to(room).emit("new_message", {
        message: botMsg,
        conversation: {
          id: conv._id,
          status: conv.status,
          lastMessageAt: conv.lastMessageAt,
        },
      });

      io.to("admin_channel").emit("conversation_updated", {
        conversationId: conv._id,
        lastMessage: conv.lastMessage,
        lastMessageAt: conv.lastMessageAt,
        status: conv.status,
        unreadAdminCount: conv.unreadAdminCount,
        customerInfo: conv.customerInfo,
      });
    }
  } catch (err: any) {
    console.error("[Chatbot] Lỗi xử lý Gemini AI Chat:", err);
    await handleFallbackBotResponse(conv, latestUserText);
  }
}

/**
 * Formats tool results into friendly Vietnamese text if follow-up turn fails.
 */
function formatToolFallbackText(toolName?: string, result?: any): string {
  if (toolName === "search_products") {
    const trees = result?.trees || [];
    const accs = result?.accessories || [];
    if (trees.length === 0 && accs.length === 0) {
      return "Hiện tại em chưa tìm thấy mẫu cây hoặc phụ kiện khớp hoàn toàn với yêu cầu của anh/chị. Anh/chị có thể cho em biết thêm ngân sách hoặc kích thước mong muốn không ạ? 🎄";
    }
    let msg = "Dưới đây là một số gợi ý phù hợp dành cho anh/chị:\n";
    for (const t of trees) {
      msg += `• 🎄 ${t.name} (Size ${t.size}) - ${t.price.toLocaleString()}đ\n`;
    }
    for (const a of accs) {
      msg += `• ⭐ ${a.name} - ${a.price.toLocaleString()}đ\n`;
    }
    return msg;
  }

  if (toolName === "lookup_order") {
    if (!result?.found) {
      return "Dạ, em đã kiểm tra nhưng không tìm thấy đơn hàng theo thông tin trên. Anh/chị vui lòng kiểm tra lại mã đơn hoặc số điện thoại giúp em nhé!";
    }
    return `Đơn hàng **${result.orderCode}** của anh/chị hiện có trạng thái: **${result.status}**.\nTổng tiền: ${result.totalAmount?.toLocaleString()}đ.\nNgười nhận: ${result.recipient}.`;
  }

  if (toolName === "escalate_to_admin") {
    return "Em đã gửi yêu cầu kết nối với chuyên viên tư vấn. Anh/chị đợi một chút, nhân viên sẽ vào hỗ trợ mình ngay ạ! 👩‍💼";
  }

  return "Dạ em đã ghi nhận thông tin, em có thể hỗ trợ gì thêm cho anh/chị không ạ?";
}

/**
 * Intelligent Fallback when Gemini API Key is not set or network fails.
 */
async function handleFallbackBotResponse(conv: any, userText: string): Promise<void> {
  const lower = userText.toLowerCase().trim();
  let replyText = "";
  let quickReplies: string[] = ["Tư vấn cây thông Noel", "Tra cứu đơn hàng", "Gặp nhân viên hỗ trợ"];

  if (lower.includes("gặp admin") || lower.includes("tư vấn viên") || lower.includes("người thật") || lower.includes("nhân viên")) {
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
    senderType: "BOT",
    senderName: "Trợ lý AI",
    content: replyText,
    metadata: { quickReplies },
  });

  conv.lastMessage = replyText;
  conv.lastMessageAt = new Date();
  conv.unreadUserCount += 1;
  await conv.save();

  const io = getSocketIO();
  if (io) {
    const room = `conversation_${conv._id}`;
    io.to(room).emit("new_message", { message: botMsg });
  }
}
