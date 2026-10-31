import assert from "assert";
import mongoose, { Types } from "mongoose";
import { Conversation, IConversation } from "../models/Conversation";
import { Message, IMessage } from "../models/Message";
import {
  canAccessConversation,
  actorKey,
  guestKey,
  ChatActor,
} from "../modules/chat/services/chatAccess";
import {
  messageToDto,
  conversationToDto,
  ChatMessageDto,
  ChatConversationDto,
} from "../modules/chat/dto/chat";
import {
  buildCursorFilter,
  buildUnreadFilter,
  validateContent,
  sanitizeMetadata,
  MESSAGE_MAX_LENGTH,
  MessageCursor,
} from "../modules/chat/services/messageService";

console.log("\n── Running Unified Chat v3 Tests (chatUnified.test.ts) ──\n");

// ── Test 1: messageToDto mapping & senderType protection ─────────────────────
console.log("── Test 1: messageToDto mapping for all sender types ──");

const baseConvId = new Types.ObjectId();
const testCases = [
  { sender: { type: "USER", userId: "user_123", name: "Buyer A" }, expectedType: "USER", currentActor: "user_123", expectedOwn: true },
  { sender: { type: "BOT", name: "Trợ lý AI" }, expectedType: "BOT", currentActor: "user_123", expectedOwn: false },
  { sender: { type: "ADMIN", userId: "admin_999", name: "Support Agent" }, expectedType: "ADMIN", currentActor: "admin_999", expectedOwn: true },
  { sender: { type: "ADMIN", userId: "admin_999", name: "Support Agent" }, expectedType: "ADMIN", currentActor: "user_123", expectedOwn: false },
  { sender: { type: "SYSTEM", name: "Hệ thống" }, expectedType: "SYSTEM", currentActor: "user_123", expectedOwn: false },
];

for (const tc of testCases) {
  const msgDoc = {
    _id: new Types.ObjectId(),
    conversationId: baseConvId,
    sender: tc.sender,
    content: "Nội dung kiểm tra",
    metadata: { key: "value" },
    createdAt: new Date(),
  };

  const dto = messageToDto(msgDoc, tc.currentActor);
  assert.strictEqual(dto.senderType, tc.expectedType, `senderType should match ${tc.expectedType}`);
  assert.strictEqual(dto.isOwn, tc.expectedOwn, `isOwn should be ${tc.expectedOwn}`);
  assert.strictEqual(dto.senderName, tc.sender.name);
  assert.strictEqual(dto.conversationId, String(baseConvId));
}
console.log("PASS: messageToDto handles USER, BOT, ADMIN, SYSTEM and computes isOwn correctly");

// ── Test 2: Access Guards (IDOR Protection) ──────────────────────────────────
console.log("\n── Test 2: Access guard matrix ──");

const buyerId = new Types.ObjectId().toHexString();
const otherBuyerId = new Types.ObjectId().toHexString();
const adminId = new Types.ObjectId().toHexString();
const sessionId = "sess_abc123";
const wrongSessionId = "sess_xyz789";

const supportConv = {
  channel: "SUPPORT",
  participants: [
    { userId: buyerId, role: "buyer" },
    { userId: adminId, role: "admin" },
  ],
} as any;

const guestConv = {
  channel: "AI",
  participants: [
    { userId: `guest:${sessionId}`, role: "guest" },
  ],
} as any;

// SUPPORT Conv access
assert.strictEqual(canAccessConversation(supportConv, { userId: buyerId }), true, "Buyer can access their SUPPORT conv");
assert.strictEqual(canAccessConversation(supportConv, { userId: otherBuyerId }), false, "Other buyer CANNOT access SUPPORT conv");
assert.strictEqual(canAccessConversation(supportConv, { userId: otherBuyerId, isAdmin: true }), true, "Admin can access any SUPPORT conv");
assert.strictEqual(canAccessConversation(supportConv, { sessionId }), false, "Guest session CANNOT access SUPPORT conv");

// Guest AI Conv access
assert.strictEqual(canAccessConversation(guestConv, { sessionId }), true, "Guest with correct sessionId can access AI conv");
assert.strictEqual(canAccessConversation(guestConv, { sessionId: wrongSessionId }), false, "Guest with wrong sessionId CANNOT access AI conv");
assert.strictEqual(canAccessConversation(guestConv, { userId: buyerId }), false, "Random buyer without session CANNOT access guest conv");
assert.strictEqual(canAccessConversation(guestConv, { userId: buyerId, sessionId }), true, "Buyer carrying session CAN access guest conv");
assert.strictEqual(canAccessConversation(guestConv, { userId: otherBuyerId, isAdmin: true }), true, "Admin can access guest conv");

console.log("PASS: Access guards enforce complete isolation between users, guests, and admins");

// ── Test 3: Cursor Pagination Filter (createdAt, _id) ────────────────────────
console.log("\n── Test 3: Cursor pagination filter for tie-breaking ──");

const convId = new Types.ObjectId();
const refCreatedAt = new Date("2026-10-31T10:00:00.000Z");
const refMsgId = new Types.ObjectId();

const cursor: MessageCursor = {
  createdAt: refCreatedAt,
  _id: refMsgId,
};

const filterWithoutCursor = buildCursorFilter(convId, null);
assert.deepStrictEqual(filterWithoutCursor, { conversationId: convId }, "Filter without cursor only queries conversationId");

const filterWithCursor: any = buildCursorFilter(convId, cursor);
assert.strictEqual(filterWithCursor.conversationId, convId);
assert(Array.isArray(filterWithCursor.$or), "Filter with cursor must have $or branch");
assert.strictEqual(filterWithCursor.$or.length, 2);

// Nhánh 1: createdAt < refCreatedAt
assert.deepStrictEqual(filterWithCursor.$or[0], { createdAt: { $lt: refCreatedAt } });
// Nhánh 2: createdAt == refCreatedAt AND _id < refMsgId (tie-break)
assert.deepStrictEqual(filterWithCursor.$or[1], { createdAt: refCreatedAt, _id: { $lt: refMsgId } });

console.log("PASS: Cursor pagination filter guarantees no missing or duplicate messages on same millisecond");

// ── Test 4: Read-state filter calculation ────────────────────────────────────
console.log("\n── Test 4: Unread state filter based on lastReadAt ──");

const convSample = {
  _id: convId,
  participants: [
    { userId: buyerId, role: "buyer", lastReadAt: new Date("2026-10-31T09:00:00.000Z") },
    { userId: adminId, role: "admin", lastReadAt: new Date("2026-10-31T09:30:00.000Z") },
  ],
};

// Buyer reading: messages not sent by buyer and created after buyer's lastReadAt
const buyerUnreadFilter: any = buildUnreadFilter(convSample as any, {
  keys: [buyerId],
  isAdmin: false,
});
assert.strictEqual(buyerUnreadFilter.conversationId, convId);
assert.deepStrictEqual(buyerUnreadFilter["sender.userId"], { $nin: [buyerId] });
assert.deepStrictEqual(buyerUnreadFilter.createdAt, { $gt: new Date("2026-10-31T09:00:00.000Z") });
assert.strictEqual(buyerUnreadFilter["sender.type"], undefined, "Buyer counts both bot and admin messages");

// Admin reading: messages not sent by admin and only USER messages
const adminUnreadFilter: any = buildUnreadFilter(convSample as any, {
  keys: [adminId],
  isAdmin: true,
});
assert.strictEqual(adminUnreadFilter["sender.type"], "USER", "Admin unread only counts USER messages");
assert.deepStrictEqual(adminUnreadFilter.createdAt, { $gt: new Date("2026-10-31T09:30:00.000Z") });

console.log("PASS: Unread filters correctly apply lastReadAt and exclude own messages");

// ── Test 5: Input Validation & Metadata Sanitization ─────────────────────────
console.log("\n── Test 5: Message content validation & metadata sanitization ──");

assert.throws(() => validateContent(""), (err: any) => err?.code === "CHAT_EMPTY_CONTENT", "Empty content should throw CHAT_EMPTY_CONTENT");
assert.throws(() => validateContent("   "), (err: any) => err?.code === "CHAT_EMPTY_CONTENT", "Whitespace content should throw CHAT_EMPTY_CONTENT");
assert.strictEqual(validateContent("  Xin chào bạn  "), "Xin chào bạn", "Content is trimmed");

const tooLongStr = "a".repeat(MESSAGE_MAX_LENGTH + 1);
assert.throws(() => validateContent(tooLongStr), (err: any) => err?.code === "CHAT_MESSAGE_TOO_LONG", "Over 2000 chars should throw CHAT_MESSAGE_TOO_LONG");

// User metadata sanitization: strips reserved keys
const maliciousUserMeta = {
  orderInfo: { orderId: "hacked", status: "COMPLETED", totalAmount: 0 },
  quickReplies: ["Free stuff"],
  clientLocalTime: "12:00",
};

const sanitized = sanitizeMetadata(maliciousUserMeta, "USER");
assert.strictEqual(sanitized.orderInfo, undefined, "orderInfo must be stripped for USER");
assert.strictEqual(sanitized.quickReplies, undefined, "quickReplies must be stripped for USER");
assert.strictEqual(sanitized.clientLocalTime, "12:00", "Safe custom metadata retained for USER");

// Admin metadata sanitization: keeps all keys
const adminMeta = sanitizeMetadata(maliciousUserMeta, "ADMIN");
assert.notStrictEqual(adminMeta.orderInfo, undefined, "Admin can attach orderInfo");

console.log("PASS: Content and metadata sanitizers protect against forgery and length abuse");

console.log("\n========================================");
console.log("Unified Chat Tests: All passed!");
console.log("========================================\n");
