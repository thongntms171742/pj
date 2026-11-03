import assert from "assert";
import mongoose, { Types } from "mongoose";
import dotenv from "dotenv";
import { ErrorCode } from "../utils/errors";
// Import barrel để đăng ký TOÀN BỘ model (User, Order, Tree...) — populate cần
// model "User" đã được register, nếu không sẽ ném MissingSchemaError.
import "../models";
import { Conversation } from "../models/Conversation";
import { Message } from "../models/Message";
import { HandoffRequest } from "../models/HandoffRequest";
import { KnowledgeDocument } from "../models/KnowledgeDocument";
import { Order } from "../models/Order";
import {
  AiProviderError,
  type AiGenerateConfig,
  type AiGenerateResult,
  type AiMessage,
  type AiProvider,
} from "../modules/ai/providers/ai-provider.interface";
import {
  ChatIntent,
  classifyByRules,
  classifyIntent,
  shouldEscalate,
  normalizeText,
} from "../modules/ai/services/intent.service";
import {
  ChatSentiment,
  classifySentiment,
  classifySentimentByRules,
  isNegativeSentiment,
} from "../modules/ai/services/sentiment.service";
import {
  AI_TOOLS,
  AI_TOOL_MAP,
  findTool,
  getToolDeclarations,
} from "../modules/ai/tools";
import { shippingInfoTool } from "../modules/ai/tools/shipping.tools";
import { lookupOrderTool } from "../modules/ai/tools/order.tools";
import { policySearchTool, categoryForIntent } from "../modules/ai/tools/support.tools";
import {
  canon,
  invalidateKnowledgeCache,
  matchKnowledge,
  retrieveKnowledge,
  scoreKnowledge,
} from "../modules/ai/services/knowledge.service";
import { parseJsonBlock, splitCopilotText } from "../modules/ai/services/ai-copilot.service";
import {
  buildHistory,
  checkAiQuota,
  updateConversationAiConfig,
} from "../modules/ai/services/ai-orchestrator.service";
import { SYSTEM_INSTRUCTION, SYSTEM_INSTRUCTION_COPILOT } from "../modules/ai/prompts/systemPrompt";

dotenv.config();

let passed = 0;
let failed = 0;

function check(desc: string, condition: boolean) {
  if (condition) {
    console.log(`✅ PASS: ${desc}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${desc}`);
    failed++;
  }
}

function section(title: string) {
  console.log(`\n── ${title} ──`);
}

// ════════════════════════════════════════════════════════════════════════════
// MOCK PROVIDER — không gọi Gemini thật
// ════════════════════════════════════════════════════════════════════════════

/**
 * Provider giả: trả về các response theo thứ tự đã định nghĩa.
 * Ghi lại các lần gọi để assert tool loop.
 *
 * LƯU Ý: provider này được dùng cho CẢ 3 phase (intent classify, sentiment
 * classify, sinh câu trả lời). Các phase classify được dispatch theo
 * `systemInstruction` để trả JSON cố định — nhờ vậy hàng đợi `responses`
 * chỉ dùng cho phase sinh câu trả lời.
 */
class MockProvider implements AiProvider {
  readonly name = "mock";
  readonly defaultModel = "mock-model";

  /** Các response sẽ trả về theo thứ tự (chỉ dùng cho phase sinh câu trả lời). */
  responses: Array<Partial<AiGenerateResult>> = [];
  /** Log TẤT CẢ các lần gọi. */
  calls: Array<{ messages: AiMessage[]; config?: AiGenerateConfig }> = [];
  /** Chỉ các lần gọi sinh câu trả lời (không phải classify). */
  answerCalls: Array<{ messages: AiMessage[]; config?: AiGenerateConfig }> = [];
  /** Có sẵn sàng không. */
  available = true;
  /** Lỗi sẽ ném ra (nếu set). */
  throwError: Error | null = null;

  async generateContent(
    _model: string,
    messages: AiMessage[],
    config?: AiGenerateConfig
  ): Promise<AiGenerateResult> {
    this.calls.push({ messages, config });

    if (this.throwError) throw this.throwError;

    const system = config?.systemInstruction ?? "";

    // ── Phase classify: trả JSON cố định ──────────────────────────────────
    if (system.includes("Phân loại cảm xúc")) {
      return this.build(
        '{"sentiment":"neutral","confidence":0.6}'
      );
    }
    if (system.includes("Phân loại ý định")) {
      return this.build(
        '{"intent":"unknown","confidence":0.3}'
      );
    }

    // ── Phase sinh câu trả lời ──────────────────────────────────────────────
    this.answerCalls.push({ messages, config });

    const next = this.responses.shift() ?? {};
    return this.build(next);
  }

  private build(next: Partial<AiGenerateResult> | string): AiGenerateResult {
    const opts: Partial<AiGenerateResult> =
      typeof next === "string" ? { text: next } : next;
    return {
      text: opts.text ?? "",
      functionCalls: opts.functionCalls ?? [],
      model: this.defaultModel,
      usage: opts.usage ?? { promptTokens: 10, outputTokens: 5, totalTokens: 15 },
      latencyMs: opts.latencyMs ?? 1,
      blocked: opts.blocked ?? false,
      blockReason: opts.blockReason,
    };
  }

  isAvailable(): boolean {
    return this.available;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// PHẦN 1: CONTRACT KHÔNG CẦN DATABASE
// ════════════════════════════════════════════════════════════════════════════

async function runContractTests() {
  console.log("\n── Running Chat AI Contract Tests ──\n");

  // ── 1. Intent classification (rule) ────────────────────────────────────────
  section("Intent Classification (Rule-based)");

  check(
    "normalizeText removes Vietnamese diacritics",
    normalizeText("Cây Thông Noel") === "cay thong noel"
  );

  const greeting = classifyByRules("Chào bạn, bạn khoẻ không?");
  check("Greeting detected", greeting?.intent === ChatIntent.GREETING);

  // Câu hỏi có cả chào lẫn hỏi sản phẩm ⇒ intent cụ thể hơn thắng.
  const mixed = classifyByRules("Chào bạn, mình muốn hỏi về sản phẩm");
  check(
    "Mixed greeting+product → product_inquiry wins",
    mixed?.intent === ChatIntent.PRODUCT_INQUIRY
  );

  const orderIntent = classifyByRules("Trạng thái đơn hàng của tôi thế nào?");
  check("Order status detected", orderIntent?.intent === ChatIntent.ORDER_STATUS);

  const refundIntent = classifyByRules("Tôi muốn đổi trả sản phẩm");
  check("Return/refund detected", refundIntent?.intent === ChatIntent.RETURN_REFUND);

  const escalateIntent = classifyByRules("Cho mình gọi nhân viên tư vấn");
  check("Escalate detected", escalateIntent?.intent === ChatIntent.ESCALATE);

  const productIntent = classifyByRules("Cây thông này bao nhiêu tiền?");
  check("Product inquiry detected", productIntent?.intent === ChatIntent.PRODUCT_INQUIRY);

  check(
    "Unmatched text → classifyByRules returns null",
    classifyByRules("xyzzy qwerty 12345") === null
  );

  check(
    "shouldEscalate(ESCALATE) = true",
    shouldEscalate({ intent: ChatIntent.ESCALATE, confidence: 0.9, source: "rule" })
  );
  check(
    "shouldEscalate(low-confidence RETURN_REFUND) = false",
    shouldEscalate({
      intent: ChatIntent.RETURN_REFUND,
      confidence: 0.5,
      source: "rule",
    }) === false
  );
  check(
    "shouldEscalate(high-confidence RETURN_REFUND) = true",
    shouldEscalate({
      intent: ChatIntent.RETURN_REFUND,
      confidence: 0.9,
      source: "rule",
    }) === true
  );

  // ── 2. Sentiment classification ────────────────────────────────────────────
  section("Sentiment Classification");

  const negative = classifySentimentByRules(
    "Tôi rất bực, dịch vụ tệ, phản hồi quá lâu!!"
  );
  check(
    "Negative sentiment detected",
    negative?.sentiment === ChatSentiment.NEGATIVE
  );
  check(
    "isNegativeSentiment(negative) = true",
    negative ? isNegativeSentiment(negative) : false
  );

  const positive = classifySentimentByRules("Cảm ơn bạn, dịch vụ rất tốt");
  check(
    "Positive sentiment detected",
    positive?.sentiment === ChatSentiment.POSITIVE
  );

  const neutral = await classifySentiment("Mình muốn hỏi về size L");
  check(
    "Neutral fallback for plain question",
    neutral.sentiment === ChatSentiment.NEUTRAL
  );

  // ── 3. Tool registry ───────────────────────────────────────────────────────
  section("Tool Registry");

  check("AI_TOOLS has 4 tools", AI_TOOLS.length === 4);
  check("Tool map has 4 entries", AI_TOOL_MAP.size === 4);

  const toolNames = AI_TOOLS.map((t) => t.declaration.name).sort();
  check(
    "Tool names are correct",
    JSON.stringify(toolNames) ===
      JSON.stringify([
        "lookupOrder",
        "policySearch",
        "searchProducts",
        "shippingInfo",
      ])
  );

  check("findTool(searchProducts) exists", findTool("searchProducts") !== null);
  check("findTool(nonExistent) returns null", findTool("nonExistentTool") === null);

  const declarations = getToolDeclarations();
  check("getToolDeclarations returns 4", declarations.length === 4);
  check(
    "Every declaration has name + description + parameters",
    declarations.every(
      (d) =>
        typeof d.name === "string" &&
        d.name.length > 0 &&
        typeof d.description === "string" &&
        d.description.length > 0 &&
        d.parameters?.type === "object"
    )
  );
  check(
    "Every declaration has at least one parameter",
    declarations.every((d) => Object.keys(d.parameters.properties).length > 0)
  );

  // ── 4. Shipping tool (config-driven) ───────────────────────────────────────
  section("Shipping Tool");

  const shippingResult = await shippingInfoTool.execute(
    { topic: "fee" },
    { userId: "u1", conversationId: "c1" }
  );
  check(
    "shippingInfo(fee) returns shippingFee",
    typeof shippingResult.data.shippingFee === "number"
  );
  check(
    "shippingInfo(fee) has formatted fee",
    typeof shippingResult.data.shippingFeeFormatted === "string"
  );

  const shippingTime = await shippingInfoTool.execute(
    { topic: "time" },
    { userId: "u1", conversationId: "c1" }
  );
  check(
    "shippingInfo(time) returns productionDays",
    typeof shippingTime.data.productionDays === "number"
  );

  const shippingAll = await shippingInfoTool.execute(
    {},
    { userId: "u1", conversationId: "c1" }
  );
  check(
    "shippingInfo(all) returns supportedProvinces array",
    Array.isArray(shippingAll.data.supportedProvinces)
  );

  // ── 5. Order tool — validation without DB ─────────────────────────────────
  section("Order Tool (validation)");

  const orderNoArgs = await lookupOrderTool.execute(
    {},
    { userId: "u1", conversationId: "c1" }
  );
  check("lookupOrder without args → found=false", orderNoArgs.data.found === false);
  check(
    "lookupOrder without args asks for order code",
    typeof orderNoArgs.data.reason === "string"
  );

  // ── 6. Policy tool — validation without DB ────────────────────────────────
  section("Policy Tool (validation)");

  const policyNoQuery = await policySearchTool.execute(
    {},
    { userId: "u1", conversationId: "c1" }
  );
  check("policySearch without query → found=false", policyNoQuery.data.found === false);

  check(
    "categoryForIntent(return_refund) = return",
    categoryForIntent("return_refund") === "return"
  );
  check(
    "categoryForIntent(shipping_issue) = shipping",
    categoryForIntent("shipping_issue") === "shipping"
  );
  check(
    "categoryForIntent(unknown) = undefined",
    categoryForIntent("unknown") === undefined
  );

  // ── 7. Knowledge scoring (pure function) ──────────────────────────────────
  section("Knowledge Scoring");

  const entry = {
    id: "k1",
    title: "Chính sách đổi trả",
    slug: "chinh-sach-doi-tra",
    category: "return" as const,
    summary: "Đổi trả trong 7 ngày",
    content: "Sản phẩm được đổi trả trong 7 ngày...",
    keywords: ["doi tra", "hoan tien", "7 ngay"],
    tags: ["return"],
    priority: 10,
    version: 1,
  };

  const scored = scoreKnowledge(entry, canon("Tôi muốn đổi trả sản phẩm"));
  check("Keyword match gives raw score > 0", scored.raw > 0);
  check(
    "Priority boosts effective score",
    scored.effective > scored.raw
  );

  const noMatch = scoreKnowledge(entry, canon("abc xyz 123"));
  check("No keyword match gives raw score = 0", noMatch.raw === 0);

  // ── 8. Copilot helpers ─────────────────────────────────────────────────────
  section("Copilot Helpers");

  const parsed = parseJsonBlock<{ summary: string }>(
    '```json\n{"summary":"Khách hỏi về đơn"}\n```'
  );
  check("parseJsonBlock extracts JSON from code fence", parsed?.summary === "Khách hỏi về đơn");
  check("parseJsonBlock on plain text returns null", parseJsonBlock("no json here") === null);

  const split = splitCopilotText("Tóm tắt: cần tra đơn\n---\nGợi ý: Mình đã kiểm tra...");
  check("splitCopilotText extracts summary", split.summary.includes("Tóm tắt"));
  check("splitCopilotText extracts suggestion", split.suggestion.includes("Gợi ý"));

  // ── 9. System prompts ─────────────────────────────────────────────────────
  section("System Prompts");

  check(
    "SYSTEM_INSTRUCTION mentions tool names",
    SYSTEM_INSTRUCTION.includes("searchProducts") &&
      SYSTEM_INSTRUCTION.includes("lookupOrder") &&
      SYSTEM_INSTRUCTION.includes("shippingInfo") &&
      SYSTEM_INSTRUCTION.includes("policySearch")
  );
  check(
    "SYSTEM_INSTRUCTION forbids hallucination",
    SYSTEM_INSTRUCTION.includes("KHÔNG bao giờ tự bịa")
  );
  check(
    "SYSTEM_INSTRUCTION_COPILOT requires summary + suggestion",
    SYSTEM_INSTRUCTION_COPILOT.includes("Tóm tắt") &&
      SYSTEM_INSTRUCTION_COPILOT.includes("Gợi ý trả lời")
  );

  // ── 10. Provider error classification ─────────────────────────────────────
  section("Provider Errors");

  const quotaErr = new AiProviderError("AI_QUOTA_EXCEEDED", "hết quota", {
    httpStatus: 429,
    retryable: true,
  });
  check("AiProviderError carries code", quotaErr.code === "AI_QUOTA_EXCEEDED");
  check("AiProviderError carries httpStatus", quotaErr.httpStatus === 429);
  check("AiProviderError carries retryable", quotaErr.retryable === true);
}

// ════════════════════════════════════════════════════════════════════════════
// PHẦN 2: DATABASE INTEGRATION
// ════════════════════════════════════════════════════════════════════════════

async function runDatabaseTests() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.log("\n⚠️  No MONGO_URI set — skipping DB integration tests.");
    return;
  }

  console.log("\n── Running Chat AI DB Integration Tests ──\n");

  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }

    const userId = new Types.ObjectId();
    const otherUserId = new Types.ObjectId();
    const adminId = new Types.ObjectId();

    const userActor = { userId: String(userId), roles: ["buyer"] };
    const otherActor = { userId: String(otherUserId), roles: ["buyer"] };
    const adminActor = { userId: String(adminId), roles: ["buyer", "admin"] };

    // ── Knowledge base ───────────────────────────────────────────────────────
    section("Knowledge Base");

    invalidateKnowledgeCache();

    const kbSlug = `chinh-sach-doi-tra-${Date.now()}`;
    const draftSlug = `ban-nhap-${Date.now()}`;

    const kbDoc = await KnowledgeDocument.create({
      title: "Chính sách đổi trả sản phẩm",
      slug: kbSlug,
      category: "return",
      content:
        "Khách hàng được đổi trả trong 7 ngày kể từ khi nhận hàng. Sản phẩm phải còn nguyên bao bì. Phí vận chuyển do khách hàng chịu.",
      summary: "Đổi trả trong 7 ngày, sản phẩm còn nguyên bao bì.",
      keywords: ["doi tra", "hoan tien", "7 ngay", "tra lai hang"],
      tags: ["return", "policy"],
      status: "published",
      priority: 20,
      isActive: true,
      version: 1,
    });
    check("Knowledge document created", !!kbDoc._id);

    invalidateKnowledgeCache();

    const kbMatches = await matchKnowledge("Tôi muốn đổi trả sản phẩm");
    check("matchKnowledge finds the return policy", kbMatches.length > 0);
    check(
      "matchKnowledge returns the right document",
      kbMatches[0]?.entry.id === String(kbDoc._id)
    );
    check(
      "matchKnowledge reports matched keywords",
      (kbMatches[0]?.matched.length ?? 0) > 0
    );

    const kbNoMatch = await matchKnowledge("zzz qqq xxx 999");
    check("matchKnowledge returns empty for unrelated query", kbNoMatch.length === 0);

    const kbByCategory = await matchKnowledge("đổi trả", { category: "warranty" });
    check(
      "matchKnowledge filters by category",
      kbByCategory.length === 0
    );

    const kbRetrieved = await retrieveKnowledge("đổi trả trong bao lâu");
    check("retrieveKnowledge returns results", kbRetrieved.length > 0);

    // Draft doc KHÔNG được trả về.
    await KnowledgeDocument.create({
      title: "Bản nháp chính sách",
      slug: draftSlug,
      category: "faq",
      content: "Nội dung nháp",
      keywords: ["nha"],
      status: "draft",
      isActive: true,
      version: 1,
    });
    invalidateKnowledgeCache();
    const draftMatches = await matchKnowledge("nha");
    check(
      "Draft documents are NOT returned by matchKnowledge",
      !draftMatches.some((m) => m.entry.title === "Bản nháp chính sách")
    );

    // ── Policy tool with DB ───────────────────────────────────────────────────
    section("Policy Tool (DB)");

    const policyHit = await policySearchTool.execute(
      { query: "đổi trả" },
      { userId: String(userId), conversationId: "c1" }
    );
    check("policySearch finds the document", policyHit.data.found === true);
    check(
      "policySearch returns results array",
      Array.isArray(policyHit.data.results) &&
        (policyHit.data.results as unknown[]).length > 0
    );

    const policyMiss = await policySearchTool.execute(
      { query: "xyzzy abcdef 123456" },
      { userId: String(userId), conversationId: "c1" }
    );
    check("policySearch miss → found=false", policyMiss.data.found === false);
    check(
      "policySearch miss → suggestEscalation=true",
      policyMiss.data.suggestEscalation === true
    );
    check("policySearch miss → escalate=true", policyMiss.escalate === true);

    // ── Order tool with DB ────────────────────────────────────────────────────
    section("Order Tool (DB)");

    await Order.create({
      orderCode: "TESTAI001",
      buyerId: userId,
      items: [
        {
          variant: {
            _id: "v1",
            productId: "p1",
            codeId: "c1",
            size: "M",
            name: "Cây thông Noel",
            unitPrice: 500000,
            price: 500000,
            sku: "SKU-TEST-1",
            bareImage: "",
          },
          deliveryOption: "READY_TO_DISPLAY",
          unitTotal: 500000,
          quantity: 2,
          lineTotal: 1000000,
          productionDays: 2,
        },
      ],
      subtotal: 1000000,
      shippingFee: 30000,
      decorationFee: 0,
      discountAmount: 0,
      totalAmount: 1030000,
      status: "SHIPPING",
      paymentMethod: "cod",
      paymentId: "",
      shippingName: "Test User",
      shippingPhone: "0900000000",
      shippingAddress: "123 Test Street",
      trackingNumber: "TRK123",
      shippingProvider: "GHN",
      idempotencyKey: `test-ai-${Date.now()}`,
    });

    const ownOrder = await lookupOrderTool.execute(
      { orderCode: "TESTAI001" },
      { userId: String(userId), conversationId: "c1" }
    );
    check("lookupOrder finds own order", ownOrder.data.found === true);
    const ownOrders = ownOrder.data.orders as Array<Record<string, unknown>>;
    check("lookupOrder returns order code", ownOrders[0]?.orderCode === "TESTAI001");
    check(
      "lookupOrder returns human-readable status",
      ownOrders[0]?.statusLabel === "đang giao hàng"
    );
    check(
      "lookupOrder does NOT leak shipping phone/address",
      !JSON.stringify(ownOrders).includes("0900000000") &&
        !JSON.stringify(ownOrders).includes("123 Test Street")
    );

    const otherOrder = await lookupOrderTool.execute(
      { orderCode: "TESTAI001" },
      { userId: String(otherUserId), conversationId: "c2" }
    );
    check(
      "lookupOrder of another user's order → found=false",
      otherOrder.data.found === false
    );
    check(
      "lookupOrder of another user's order leaks NOTHING",
      !JSON.stringify(otherOrder.data).includes("TESTAI001")
    );

    // ── History building ─────────────────────────────────────────────────────
    section("AI History Building");

    const conv = await Conversation.create({
      userId,
      status: "open",
      supportMode: "ai",
      aiConfig: { enabled: true },
      unreadCount: { user: 0, admin: 0 },
      version: 1,
    });

    await Message.create({
      conversationId: conv._id,
      senderId: userId,
      senderType: "user",
      content: "Xin chào, mình hỏi về đơn hàng",
      messageType: "text",
      visibility: "public",
      attachments: [],
      clientMessageId: null,
    });
    await Message.create({
      conversationId: conv._id,
      senderId: null,
      senderType: "ai",
      content: "Chào bạn, mình kiểm tra ngay",
      messageType: "text",
      visibility: "public",
      attachments: [],
      clientMessageId: null,
    });
    await Message.create({
      conversationId: conv._id,
      senderId: adminId,
      senderType: "admin",
      content: "Ghi chú nội bộ: khách VIP",
      messageType: "text",
      visibility: "internal",
      attachments: [],
      clientMessageId: null,
    });

    const history = await buildHistory(conv._id);
    check("buildHistory returns messages", history.length > 0);
    check(
      "buildHistory EXCLUDES internal messages",
      !history.some((m) => m.parts.some((p) => p.text.includes("khách VIP")))
    );
    check(
      "buildHistory maps user → role=user",
      history[0]?.role === "user"
    );
    check(
      "buildHistory maps ai → role=model",
      history[1]?.role === "model"
    );

    // ── aiConfig update ──────────────────────────────────────────────────────
    section("Conversation aiConfig Update");

    await updateConversationAiConfig(conv, {
      model: "mock-model",
      intent: "order_status",
      intentConfidence: 0.92,
      sentiment: "neutral",
    });
    const convAfter = await Conversation.findById(conv._id);
    check("aiConfig.model updated", convAfter?.aiConfig?.model === "mock-model");
    check("aiConfig.intent updated", convAfter?.aiConfig?.intent === "order_status");
    check(
      "aiConfig.intentConfidence updated",
      convAfter?.aiConfig?.intentConfidence === 0.92
    );
    check(
      "aiConfig.sentiment updated",
      convAfter?.aiConfig?.sentiment === "neutral"
    );

    await updateConversationAiConfig(conv, { totalTokensAdded: 100 });
    await updateConversationAiConfig(conv, { totalTokensAdded: 50 });
    const convAfterTokens = await Conversation.findById(conv._id);
    check(
      "aiConfig.totalTokens accumulates (100 + 50 = 150)",
      convAfterTokens?.aiConfig?.totalTokens === 150
    );

    // ── AI quota ─────────────────────────────────────────────────────────────
    section("AI Quota");

    const quotaUserId = `quota-${Date.now()}`;
    const q1 = checkAiQuota(quotaUserId);
    check("First AI quota call is allowed", q1.allowed === true);
    check("Quota remaining decreases", q1.remaining >= 0);

    // ── Mock provider tool loop ──────────────────────────────────────────────
    section("Orchestrator with Mock Provider");

    const mock = new MockProvider();
    mock.responses = [
      {
        text: "",
        functionCalls: [
          { name: "shippingInfo", args: { topic: "fee" } },
        ],
      },
      {
        text: "Phí giao hàng hiện tại là 20.000đ bạn nhé.",
      },
    ];

    const orchestrator = await import(
      "../modules/ai/services/ai-orchestrator.service"
    );

    const userMsg = await Message.create({
      conversationId: conv._id,
      senderId: userId,
      senderType: "user",
      content: "Phí giao hàng bao nhiêu?",
      messageType: "text",
      visibility: "public",
      attachments: [],
      clientMessageId: null,
    });

    const processResult = await orchestrator.processUserMessage(
      String(conv._id),
      userMsg,
      { provider: mock, skipQuota: true }
    );

    check("Orchestrator outcome = answered", processResult.outcome === "answered");
    check("Orchestrator persisted AI message", processResult.message !== null);
    check(
      "AI message senderType = ai",
      processResult.message?.senderType === "ai"
    );
    check(
      "AI message content = provider text",
      (processResult.message?.content ?? "").includes("20.000đ")
    );
    check(
      "AI message aiMetadata records tool usage",
      (processResult.message?.aiMetadata?.toolsUsed ?? []).includes("shippingInfo")
    );
    check(
      "AI message aiMetadata records intent",
      (processResult.message?.aiMetadata?.intent ?? "") !== ""
    );
    check(
      "Orchestrator used 2 answer provider calls (tool loop)",
      mock.answerCalls.length === 2
    );
    check(
      "Second answer call received tool result",
      mock.answerCalls[1]?.messages.some((m) =>
        m.parts.some((p) => p.text.includes('Kết quả tool "shippingInfo"'))
      )
    );

    const aiMsgCount = await Message.countDocuments({
      conversationId: conv._id,
      senderType: "ai",
      content: "Phí giao hàng hiện tại là 20.000đ bạn nhé.",
    });
    check("Exactly 1 AI message persisted by orchestrator", aiMsgCount === 1);

    // ── Orchestrator skips when mode != ai ──────────────────────────────────
    section("Orchestrator Guard");

    const humanConv = await Conversation.create({
      userId,
      status: "open",
      supportMode: "human",
      aiConfig: { enabled: true },
      unreadCount: { user: 0, admin: 0 },
      version: 1,
    });
    const humanMsg = await Message.create({
      conversationId: humanConv._id,
      senderId: userId,
      senderType: "user",
      content: "Test",
      messageType: "text",
      visibility: "public",
      attachments: [],
      clientMessageId: null,
    });

    const mock2 = new MockProvider();
    const skipped = await orchestrator.processUserMessage(
      String(humanConv._id),
      humanMsg,
      { provider: mock2, skipQuota: true }
    );
    check("Orchestrator skips when supportMode = human", skipped.outcome === "skipped");
    check("Orchestrator makes NO answer call when skipped", mock2.answerCalls.length === 0);

    // ── Orchestrator escalates on ESCALATE intent ────────────────────────────
    section("Orchestrator Auto-Escalate");

    const escConv = await Conversation.create({
      userId,
      status: "open",
      supportMode: "ai",
      aiConfig: { enabled: true },
      unreadCount: { user: 0, admin: 0 },
      version: 1,
    });
    const escMsg = await Message.create({
      conversationId: escConv._id,
      senderId: userId,
      senderType: "user",
      content: "Cho mình gọi nhân viên tư vấn ngay",
      messageType: "text",
      visibility: "public",
      attachments: [],
      clientMessageId: null,
    });

    const mock3 = new MockProvider();
    const escalated = await orchestrator.processUserMessage(
      String(escConv._id),
      escMsg,
      { provider: mock3, skipQuota: true }
    );
    check("Escalate intent → outcome = escalated", escalated.outcome === "escalated");
    check(
      "Escalate intent → NO provider call for answer",
      mock3.answerCalls.length === 0
    );

    const handoff = await HandoffRequest.findOne({ conversationId: escConv._id });
    check("Escalate creates handoff request", handoff !== null);
    check("Handoff status = waiting", handoff?.status === "waiting");

    const escConvAfter = await Conversation.findById(escConv._id);
    check(
      "Conversation switched to waiting_admin",
      escConvAfter?.supportMode === "waiting_admin"
    );

    // ── Orchestrator handles provider error ──────────────────────────────────
    section("Orchestrator Provider Error");

    const errConv = await Conversation.create({
      userId,
      status: "open",
      supportMode: "ai",
      aiConfig: { enabled: true },
      unreadCount: { user: 0, admin: 0 },
      version: 1,
    });
    const errMsg = await Message.create({
      conversationId: errConv._id,
      senderId: userId,
      senderType: "user",
      content: "Test lỗi provider",
      messageType: "text",
      visibility: "public",
      attachments: [],
      clientMessageId: null,
    });

    const mock4 = new MockProvider();
    mock4.throwError = new AiProviderError("AI_GENERATION_TIMEOUT", "timeout", {
      httpStatus: 504,
      retryable: true,
    });
    const failed = await orchestrator.processUserMessage(
      String(errConv._id),
      errMsg,
      { provider: mock4, skipQuota: true }
    );
    check("Provider error → outcome = failed", failed.outcome === "failed");
    check(
      "Provider error → escalateReason = AI_GENERATION_TIMEOUT",
      failed.escalateReason === "AI_GENERATION_TIMEOUT"
    );

    const errConvAfter = await Conversation.findById(errConv._id);
    check(
      "failedAttempts incremented after provider error",
      (errConvAfter?.aiConfig?.failedAttempts ?? 0) === 1
    );

    // ── Orchestrator handles blocked response ────────────────────────────────
    section("Orchestrator Blocked Response");

    const blockedConv = await Conversation.create({
      userId,
      status: "open",
      supportMode: "ai",
      aiConfig: { enabled: true },
      unreadCount: { user: 0, admin: 0 },
      version: 1,
    });
    const blockedMsg = await Message.create({
      conversationId: blockedConv._id,
      senderId: userId,
      senderType: "user",
      content: "Test bị block",
      messageType: "text",
      visibility: "public",
      attachments: [],
      clientMessageId: null,
    });

    const mock5 = new MockProvider();
    mock5.responses = [{ text: "", blocked: true, blockReason: "SAFETY" }];
    const blocked = await orchestrator.processUserMessage(
      String(blockedConv._id),
      blockedMsg,
      { provider: mock5, skipQuota: true }
    );
    check("Blocked response → outcome = escalated", blocked.outcome === "escalated");
    check(
      "Blocked response → escalateReason = AI_BLOCKED",
      blocked.escalateReason === "AI_BLOCKED"
    );

    // ── Copilot (admin only) ────────────────────────────────────────────────
    section("AI Copilot");

    const copilot = await import("../modules/ai/services/ai-copilot.service");

    let userForbidden = false;
    try {
      await copilot.generateConversationSummary(String(conv._id), userActor);
    } catch (err) {
      userForbidden =
        err instanceof Error &&
        err.name === "ChatError" &&
        (err as { code?: string }).code === ErrorCode.CHAT_FORBIDDEN;
    }
    check("Copilot summary rejects non-admin", userForbidden);

    let policyForbidden = false;
    try {
      await copilot.searchPolicyForAdmin(userActor, { query: "đổi trả" });
    } catch (err) {
      policyForbidden =
        err instanceof Error &&
        err.name === "ChatError" &&
        (err as { code?: string }).code === ErrorCode.CHAT_FORBIDDEN;
    }
    check("Copilot policy search rejects non-admin", policyForbidden);

    // Admin search policy (không cần AI).
    const adminPolicy = await copilot.searchPolicyForAdmin(adminActor, {
      query: "đổi trả",
    });
    check("Admin policy search returns results", adminPolicy.length > 0);
    check(
      "Admin policy search returns title + content",
      typeof adminPolicy[0]?.title === "string" &&
        typeof adminPolicy[0]?.content === "string"
    );

    // Handoff context (không tốn token).
    const context = await copilot.getHandoffContext(String(escConv._id), adminActor);
    check("Handoff context returns handoff", context.handoff !== null);
    check("Handoff context returns urgent flag", typeof context.urgent === "boolean");

    // ── Cleanup ──────────────────────────────────────────────────────────────
    section("Cleanup");

    await Message.deleteMany({
      conversationId: { $in: [conv._id, humanConv._id, escConv._id, errConv._id, blockedConv._id] },
    });
    await HandoffRequest.deleteMany({
      conversationId: { $in: [conv._id, humanConv._id, escConv._id, errConv._id, blockedConv._id] },
    });
    await Conversation.deleteMany({
      _id: { $in: [conv._id, humanConv._id, escConv._id, errConv._id, blockedConv._id] },
    });
    await KnowledgeDocument.deleteMany({
      slug: { $in: [kbSlug, draftSlug] },
    });
    await Order.deleteMany({ orderCode: "TESTAI001" });

    const leftConv = await Conversation.countDocuments({ userId });
    check("Test conversations cleaned up", leftConv === 0);
  } catch (err) {
    console.error("\nDB test error:", err);
    failed++;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// RUNNER
// ════════════════════════════════════════════════════════════════════════════

async function main() {
  await runContractTests();
  await runDatabaseTests();

  console.log("\n========================================");
  console.log(`Chat AI Tests: ${passed} passed, ${failed} failed.`);
  console.log("========================================\n");

  if (failed > 0) process.exit(1);
}

main().then(() => {
  if (mongoose.connection.readyState !== 0) {
    mongoose.disconnect();
  }
});
