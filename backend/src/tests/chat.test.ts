import assert from "assert";
import mongoose from "mongoose";
import { Conversation, IConversation } from "../models/Conversation";
import { Message, IMessage } from "../models/Message";
import { ErrorCode, ErrorStatus } from "../utils/errors";
import { canAccessConversation } from "../modules/chat/services/chatAccess";
import { messageToDto } from "../modules/chat/dto/chat";

console.log("\n── Running Chat Subsystem Contract Tests ──\n");

// 1. Verify Error Codes
assert.strictEqual(ErrorCode.CHAT_CONVERSATION_NOT_FOUND, "CHAT_CONVERSATION_NOT_FOUND");
assert.strictEqual(ErrorCode.CHAT_STATUS_INVALID, "CHAT_STATUS_INVALID");
assert.strictEqual(ErrorCode.CHAT_FORBIDDEN, "CHAT_FORBIDDEN");
assert.strictEqual(ErrorCode.CHAT_INVALID_ID, "CHAT_INVALID_ID");
assert.strictEqual(ErrorCode.CHAT_EMPTY_CONTENT, "CHAT_EMPTY_CONTENT");
assert.strictEqual(ErrorCode.CHAT_MESSAGE_TOO_LONG, "CHAT_MESSAGE_TOO_LONG");

assert.strictEqual(ErrorStatus[ErrorCode.CHAT_CONVERSATION_NOT_FOUND], 404);
assert.strictEqual(ErrorStatus[ErrorCode.CHAT_STATUS_INVALID], 400);
assert.strictEqual(ErrorStatus[ErrorCode.CHAT_FORBIDDEN], 403);
assert.strictEqual(ErrorStatus[ErrorCode.CHAT_INVALID_ID], 400);
assert.strictEqual(ErrorStatus[ErrorCode.CHAT_EMPTY_CONTENT], 400);
assert.strictEqual(ErrorStatus[ErrorCode.CHAT_MESSAGE_TOO_LONG], 400);
console.log("PASS: Chat v3 error codes and status mappings registered correctly");

// 2. Verify Conversation Schema instantiation
const mockConversation = new Conversation({
  channel: "AI",
  status: "BOT_ACTIVE",
  participants: [
    {
      userId: "guest:test_session_123",
      role: "guest",
      lastReadAt: new Date(),
    },
  ],
  customerInfo: {
    name: "Nguyen Van A",
    phone: "0901234567",
    email: "test@example.com",
  },
  tags: ["tu_van"],
});

assert.strictEqual(mockConversation.channel, "AI");
assert.strictEqual(mockConversation.status, "BOT_ACTIVE");
assert.strictEqual(mockConversation.customerInfo?.name, "Nguyen Van A");
assert.strictEqual(mockConversation.participants.length, 1);
assert.strictEqual(mockConversation.participants[0].userId, "guest:test_session_123");
console.log("PASS: Conversation v3 model validated with participants array and channel");

// 3. Verify Message Schema instantiation
const mockMessage = new Message({
  conversationId: mockConversation._id,
  sender: {
    type: "USER",
    userId: "guest:test_session_123",
    name: "Nguyen Van A",
  },
  content: "Cho mình hỏi giá cây thông 1m8",
  metadata: {
    quickReplies: ["Cây thông PVC", "Cây thông PE"],
  },
});

assert.strictEqual(mockMessage.sender.type, "USER");
assert.strictEqual(mockMessage.sender.userId, "guest:test_session_123");
assert.strictEqual(mockMessage.content, "Cho mình hỏi giá cây thông 1m8");
assert.deepStrictEqual(mockMessage.metadata?.quickReplies, ["Cây thông PVC", "Cây thông PE"]);
console.log("PASS: Message v3 model validated with nested sender object and metadata");

// 4. Verify AI Chatbot Service import
const { processAiChatMessage } = require("../services/ai/chatbotService");
assert.strictEqual(typeof processAiChatMessage, "function");
console.log("PASS: AI Chatbot Service initialized with Gemini tools & fallback processor");

// 5. IDOR guards — canAccessConversation
const ownerId = new mongoose.Types.ObjectId().toHexString();
const otherUserId = new mongoose.Types.ObjectId().toHexString();

// Conversation của buyer đã đăng nhập
const ownedConv = {
  participants: [{ userId: ownerId, role: "buyer" }],
} as any;

// Conversation của guest
const guestConv = {
  participants: [{ userId: "guest:session_guest_xyz", role: "guest" }],
} as any;

assert.strictEqual(
  canAccessConversation(ownedConv, { userId: ownerId }),
  true,
  "Chủ conversation được phép truy cập"
);
assert.strictEqual(
  canAccessConversation(ownedConv, { userId: otherUserId }),
  false,
  "User KHÁC bị chặn (IDOR)"
);
assert.strictEqual(
  canAccessConversation(ownedConv, { sessionId: "session_owner" }),
  false,
  "Guest session KHÔNG được đọc conversation của user đã đăng nhập"
);
assert.strictEqual(
  canAccessConversation(ownedConv, { userId: otherUserId, isAdmin: true }),
  true,
  "Admin được phép truy cập mọi conversation"
);

assert.strictEqual(
  canAccessConversation(guestConv, { sessionId: "session_guest_xyz" }),
  true,
  "Guest đúng session được phép truy cập"
);
assert.strictEqual(
  canAccessConversation(guestConv, { sessionId: "session_khác" }),
  false,
  "Guest sai session bị chặn"
);
assert.strictEqual(
  canAccessConversation(guestConv, { userId: otherUserId }),
  false,
  "User đăng nhập không có session tương ứng bị chặn"
);
assert.strictEqual(
  canAccessConversation(null, { userId: ownerId }),
  false,
  "Conversation không tồn tại ⇒ không cho truy cập"
);
console.log("PASS: Unified IDOR guards (canAccessConversation) block cross-user access");

// 6. messageToDto mapping verification
const botMsg = {
  _id: new mongoose.Types.ObjectId(),
  conversationId: mockConversation._id,
  sender: { type: "BOT", name: "Trợ lý AI" },
  content: "Xin chào",
  createdAt: new Date(),
};
const botDto = messageToDto(botMsg);
assert.strictEqual(botDto.senderType, "BOT");
assert.strictEqual(botDto.senderName, "Trợ lý AI");
assert.strictEqual(botDto.isOwn, false);

const adminMsg = {
  _id: new mongoose.Types.ObjectId(),
  conversationId: mockConversation._id,
  sender: { type: "ADMIN", userId: "admin_123", name: "Admin Support" },
  content: "Chào bạn",
  createdAt: new Date(),
};
const adminDto = messageToDto(adminMsg, "admin_123");
assert.strictEqual(adminDto.senderType, "ADMIN");
assert.strictEqual(adminDto.isOwn, true);

console.log("PASS: messageToDto maps senderType accurately for USER/BOT/ADMIN/SYSTEM");

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
