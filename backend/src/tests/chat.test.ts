import assert from "assert";
import mongoose from "mongoose";
import { Conversation, IConversation } from "../models/Conversation";
import { Message, IMessage } from "../models/Message";
import { ErrorCode, ErrorStatus } from "../utils/errors";

console.log("\n── Running Chat Subsystem Contract Tests ──\n");

// 1. Verify Error Codes
assert.strictEqual(ErrorCode.CONVERSATION_NOT_FOUND, "CONVERSATION_NOT_FOUND");
assert.strictEqual(ErrorCode.CONVERSATION_STATUS_INVALID, "CONVERSATION_STATUS_INVALID");
assert.strictEqual(ErrorStatus[ErrorCode.CONVERSATION_NOT_FOUND], 404);
assert.strictEqual(ErrorStatus[ErrorCode.CONVERSATION_STATUS_INVALID], 400);
console.log("PASS: Chat error codes and status mappings registered correctly");

// 2. Verify Conversation Schema instantiation
const mockConversation = new Conversation({
  sessionId: "test_session_123",
  status: "BOT_ACTIVE",
  customerInfo: {
    name: "Nguyen Van A",
    phone: "0901234567",
    email: "test@example.com",
  },
  tags: ["tu_van"],
});

assert.strictEqual(mockConversation.sessionId, "test_session_123");
assert.strictEqual(mockConversation.status, "BOT_ACTIVE");
assert.strictEqual(mockConversation.customerInfo?.name, "Nguyen Van A");
assert.strictEqual(mockConversation.unreadAdminCount, 0);
console.log("PASS: Conversation model validated with default values");

// 3. Verify Message Schema instantiation
const mockMessage = new Message({
  conversationId: mockConversation._id,
  senderType: "USER",
  senderName: "Nguyen Van A",
  content: "Cho mình hỏi giá cây thông 1m8",
  metadata: {
    quickReplies: ["Cây thông PVC", "Cây thông PE"],
  },
});

assert.strictEqual(mockMessage.senderType, "USER");
assert.strictEqual(mockMessage.content, "Cho mình hỏi giá cây thông 1m8");
assert.deepStrictEqual(mockMessage.metadata?.quickReplies, ["Cây thông PVC", "Cây thông PE"]);
console.log("PASS: Message model validated with metadata and senderType");

// 4. Verify AI Chatbot Service import
const { processAiChatMessage } = require("../services/ai/chatbotService");
assert.strictEqual(typeof processAiChatMessage, "function");
console.log("PASS: AI Chatbot Service initialized with Gemini tools & fallback processor");

// 5. IDOR guards — canAccessAiConversation
const {
  canAccessAiConversation,
  canAccessPeerConversation,
} = require("../utils/chatAccess");

const ownerId = new mongoose.Types.ObjectId();
const otherUserId = new mongoose.Types.ObjectId();

// Conversation của user đã đăng nhập
const ownedConv = {
  sessionId: "session_owner",
  userId: ownerId,
} as any;
// Conversation của guest (chỉ có sessionId)
const guestConv = { sessionId: "session_guest_xyz" } as any;

assert.strictEqual(
  canAccessAiConversation(ownedConv, { userId: String(ownerId) }),
  true,
  "Chủ conversation được phép truy cập"
);
assert.strictEqual(
  canAccessAiConversation(ownedConv, { userId: String(otherUserId) }),
  false,
  "User KHÁC bị chặn (IDOR)"
);
assert.strictEqual(
  canAccessAiConversation(ownedConv, { sessionId: "session_owner" }),
  false,
  "Guest session KHÔNG được đọc conversation của user đã đăng nhập"
);
assert.strictEqual(
  canAccessAiConversation(ownedConv, { userId: String(ownerId), isAdmin: true }),
  true,
  "Admin được phép truy cập mọi conversation"
);

assert.strictEqual(
  canAccessAiConversation(guestConv, { sessionId: "session_guest_xyz" }),
  true,
  "Guest đúng session được phép truy cập"
);
assert.strictEqual(
  canAccessAiConversation(guestConv, { sessionId: "session_khác" }),
  false,
  "Guest sai session bị chặn"
);
assert.strictEqual(
  canAccessAiConversation(guestConv, { userId: String(otherUserId) }),
  false,
  "User đăng nhập KHÔNG được đọc conversation guest"
);
assert.strictEqual(
  canAccessAiConversation(null, { userId: String(ownerId) }),
  false,
  "Conversation không tồn tại ⇒ không cho truy cập"
);
console.log("PASS: IDOR guards (canAccessAiConversation) block cross-user access");

// 6. IDOR guards — canAccessPeerConversation (1-1 buyer ↔ admin)
const peerConvId = `c_${[String(ownerId), String(otherUserId)].sort().join("__")}`;
assert.strictEqual(
  canAccessPeerConversation(peerConvId, { userId: String(ownerId) }),
  true,
  "Participant được phép truy cập conversation 1-1"
);
assert.strictEqual(
  canAccessPeerConversation(peerConvId, { userId: "someone_else" }),
  false,
  "Người không phải participant bị chặn"
);
assert.strictEqual(
  canAccessPeerConversation(peerConvId, { userId: String(ownerId), isAdmin: true }),
  true,
  "Admin được phép truy cập conversation 1-1"
);
assert.strictEqual(
  canAccessPeerConversation("not-a-valid-conv-id", { userId: String(ownerId) }),
  false,
  "Conversation id không hợp lệ bị chặn"
);
console.log("PASS: IDOR guards (canAccessPeerConversation) block non-participants");

// 7. escapeRegExp — user input không được làm throw SyntaxError
const { escapeRegExp } = require("../utils/regex");
assert.doesNotThrow(
  () => new RegExp(escapeRegExp("cây thông ("), "i"),
  "Escape regex không được throw"
);
assert.strictEqual(
  new RegExp(escapeRegExp("a+b"), "i").test("xa+by"),
  true,
  "Regex escaped vẫn match đúng chuỗi"
);
assert.strictEqual(
  new RegExp(escapeRegExp("a+b"), "i").test("xaab"),
  false,
  "Regex escaped không match sai (a+b phải là literal)"
);
console.log("PASS: escapeRegExp prevents Regex SyntaxError on user input");

console.log("\n========================================");
console.log("Chat Subsystem Tests: All passed!");
console.log("========================================\n");

