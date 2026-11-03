import assert from "assert";
import mongoose, { Types } from "mongoose";
import dotenv from "dotenv";
import { ErrorCode, ErrorStatus } from "../utils/errors";
// Import barrel để đăng ký TOÀN BỘ model (User, Order, ...) — populate cần
// model "User" đã được register, nếu không sẽ ném MissingSchemaError.
import "../models";
import { Conversation } from "../models/Conversation";
import { Message } from "../models/Message";
import { HandoffRequest } from "../models/HandoffRequest";
import {
  canTransitionStatus,
  canTransitionMode,
} from "../modules/chat/services/conversation.service";
import {
  ChatError,
  isAdmin,
  canAccessConversation,
  canViewInternalMessages,
  isConversationOwner,
} from "../modules/chat/services/chatPermission.service";
import { validateMessageInput } from "../modules/chat/services/message.service";
import {
  canTransitionHandoff,
} from "../modules/chat/services/handoff.service";
import { consume, resetAll } from "../modules/chat/services/chatRateLimit.service";
import { messageToDto, conversationToDto } from "../modules/chat/dto/chat.mapper";
import { ChatRooms, ChatServerEvents } from "../modules/chat/socket/chat.events";

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
// PHẦN 1: CONTRACT KHÔNG CẦN DATABASE
// ════════════════════════════════════════════════════════════════════════════

function runContractTests() {
  console.log("\n── Running Chat Foundation Contract Tests ──\n");

  // ── 1. Error codes ─────────────────────────────────────────────────────────
  section("Error Codes");

  const newCodes = [
    "CHAT_CONVERSATION_NOT_FOUND",
    "CHAT_STATUS_INVALID",
    "CHAT_FORBIDDEN",
    "CHAT_INVALID_ID",
    "CHAT_EMPTY_CONTENT",
    "CHAT_MESSAGE_TOO_LONG",
    "CHAT_CONVERSATION_CLOSED",
    "CHAT_DUPLICATE_MESSAGE",
    "CHAT_VERSION_CONFLICT",
    "CHAT_RATE_LIMITED",
    "CHAT_AI_UNAVAILABLE",
    "CHAT_AI_ESCALATED",
    "CHAT_AI_QUOTA_EXCEEDED",
    "CHAT_HANDOFF_NOT_FOUND",
    "CHAT_HANDOFF_ALREADY_EXISTS",
    "CHAT_HANDOFF_INVALID_TRANSITION",
    "CHAT_REOPEN_WINDOW_EXPIRED",
  ] as const;

  for (const code of newCodes) {
    check(`ErrorCode.${code} registered`, (ErrorCode as any)[code] === code);
    check(
      `ErrorStatus[${code}] is defined`,
      typeof ErrorStatus[code as keyof typeof ErrorStatus] === "number"
    );
  }

  check(
    "CHAT_VERSION_CONFLICT → 409",
    ErrorStatus.CHAT_VERSION_CONFLICT === 409
  );
  check("CHAT_RATE_LIMITED → 429", ErrorStatus.CHAT_RATE_LIMITED === 429);
  check(
    "CHAT_CONVERSATION_NOT_FOUND → 404",
    ErrorStatus.CHAT_CONVERSATION_NOT_FOUND === 404
  );
  check("CHAT_FORBIDDEN → 403", ErrorStatus.CHAT_FORBIDDEN === 403);

  // ── 2. Schema validation (không cần DB) ──────────────────────────────────
  section("Model Schema");

  const conv = new Conversation({
    userId: new Types.ObjectId(),
    status: "open",
    supportMode: "ai",
    aiConfig: { enabled: true, intent: "product_inquiry", intentConfidence: 0.9 },
    unreadCount: { user: 0, admin: 0 },
    version: 1,
  });
  check("Conversation default status = open", conv.status === "open");
  check("Conversation default supportMode = ai", conv.supportMode === "ai");
  check("Conversation default version = 1", conv.version === 1);
  check("Conversation default unreadCount.user = 0", conv.unreadCount?.user === 0);
  check("Conversation default unreadCount.admin = 0", conv.unreadCount?.admin === 0);

  // Validate enum
  const badConv = new Conversation({
    userId: new Types.ObjectId(),
    status: "bogus" as any,
    supportMode: "also_bogus" as any,
  });
  const convErr = badConv.validateSync();
  check("Conversation rejects invalid status enum", !!convErr?.errors?.status);
  check(
    "Conversation rejects invalid supportMode enum",
    !!convErr?.errors?.supportMode
  );

  const msg = new Message({
    conversationId: new Types.ObjectId(),
    senderType: "user",
    content: "Xin chào",
    messageType: "text",
    visibility: "public",
  });
  check("Message default visibility = public", msg.visibility === "public");
  check("Message default messageType = text", msg.messageType === "text");
  check("Message default attachments = []", (msg.attachments ?? []).length === 0);

  const badMsg = new Message({
    conversationId: new Types.ObjectId(),
    senderType: "not_a_sender" as any,
    content: "x",
    visibility: "nope" as any,
  });
  const msgErr = badMsg.validateSync();
  check("Message rejects invalid senderType enum", !!msgErr?.errors?.senderType);
  check("Message rejects invalid visibility enum", !!msgErr?.errors?.visibility);

  const handoff = new HandoffRequest({
    conversationId: new Types.ObjectId(),
    userId: new Types.ObjectId(),
    reason: "Cần nhân viên tư vấn",
    priority: "high",
    status: "waiting",
  });
  check("Handoff default status = waiting", handoff.status === "waiting");
  check("Handoff default version = 1", handoff.version === 1);

  const badHandoff = new HandoffRequest({
    conversationId: new Types.ObjectId(),
    userId: new Types.ObjectId(),
    reason: "x",
    priority: "extremely_urgent" as any,
    status: "maybe" as any,
  });
  const handoffErr = badHandoff.validateSync();
  check("Handoff rejects invalid priority enum", !!handoffErr?.errors?.priority);
  check("Handoff rejects invalid status enum", !!handoffErr?.errors?.status);

  // ── 3. Permission logic ───────────────────────────────────────────────────
  section("Permission Rules");

  const ownerId = new Types.ObjectId();
  const otherId = new Types.ObjectId();
  const convOwner = { userId: ownerId };

  const userActor = { userId: String(ownerId), roles: ["buyer"] };
  const otherUser = { userId: String(otherId), roles: ["buyer"] };
  const adminActor = { userId: String(new Types.ObjectId()), roles: ["buyer", "admin"] };

  check("Owner can access own conversation", canAccessConversation(convOwner, userActor));
  check(
    "Other user CANNOT access conversation",
    !canAccessConversation(convOwner, otherUser)
  );
  check("Admin can access any conversation", canAccessConversation(convOwner, adminActor));

  check("isAdmin(admin) = true", isAdmin(adminActor));
  check("isAdmin(user) = false", !isAdmin(userActor));

  check("Owner is owner", isConversationOwner(convOwner, userActor));
  check("Admin is NOT owner (must not bypass)", !isConversationOwner(convOwner, adminActor));

  check("Admin can view internal messages", canViewInternalMessages(adminActor));
  check(
    "User CANNOT view internal messages even as owner",
    !canViewInternalMessages(userActor)
  );

  // ── 4. State machine ──────────────────────────────────────────────────────
  section("State Machine");

  check("open → pending is valid", canTransitionStatus("open", "pending"));
  check("open → closed is valid", canTransitionStatus("open", "closed"));
  check("pending → open is valid", canTransitionStatus("pending", "open"));
  check("closed → open is valid (reopen)", canTransitionStatus("closed", "open"));
  check("open → open is invalid", !canTransitionStatus("open", "open"));
  check("closed → pending is invalid", !canTransitionStatus("closed", "pending"));

  check("ai → waiting_admin is valid", canTransitionMode("ai", "waiting_admin"));
  check("ai → human is valid", canTransitionMode("ai", "human"));
  check("ai → ai_assisted is valid", canTransitionMode("ai", "ai_assisted"));
  check("waiting_admin → human is valid", canTransitionMode("waiting_admin", "human"));
  check("waiting_admin → ai is valid", canTransitionMode("waiting_admin", "ai"));
  check("human → ai_assisted is valid", canTransitionMode("human", "ai_assisted"));
  check("human → ai is valid", canTransitionMode("human", "ai"));
  check("ai → closed-mode nonsense invalid", !canTransitionMode("ai", "bogus" as any));

  check("handoff waiting → assigned valid", canTransitionHandoff("waiting", "assigned"));
  check("handoff assigned → accepted valid", canTransitionHandoff("assigned", "accepted"));
  check("handoff accepted → resolved valid", canTransitionHandoff("accepted", "resolved"));
  check("handoff resolved → anything invalid", !canTransitionHandoff("resolved", "waiting"));
  check("handoff cancelled → anything invalid", !canTransitionHandoff("cancelled", "waiting"));

  // ── 5. Message validation ─────────────────────────────────────────────────
  section("Message Validation");

  const valid = validateMessageInput({ content: "  Xin chào  " });
  check("Valid content is trimmed", valid.content === "Xin chào");

  let threw = false;
  try {
    validateMessageInput({ content: "   " });
  } catch (err) {
    threw = err instanceof ChatError && err.code === ErrorCode.CHAT_EMPTY_CONTENT;
  }
  check("Empty content throws CHAT_EMPTY_CONTENT", threw);

  threw = false;
  try {
    validateMessageInput({ content: "x".repeat(5001) });
  } catch (err) {
    threw = err instanceof ChatError && err.code === ErrorCode.CHAT_MESSAGE_TOO_LONG;
  }
  check("Too-long content throws CHAT_MESSAGE_TOO_LONG", threw);

  threw = false;
  try {
    validateMessageInput({
      content: "ok",
      attachments: Array.from({ length: 6 }, () => ({ url: "http://x/a.png" })),
    });
  } catch (err) {
    threw = err instanceof ChatError && err.code === ErrorCode.INVALID_INPUT;
  }
  check("Too many attachments throws INVALID_INPUT", threw);

  threw = false;
  try {
    validateMessageInput({ content: "ok", attachments: [{ url: "" }] });
  } catch (err) {
    threw = err instanceof ChatError && err.code === ErrorCode.INVALID_INPUT;
  }
  check("Attachment without URL throws INVALID_INPUT", threw);

  const withAttachment = validateMessageInput({
    content: "",
    attachments: [{ url: "http://x/a.png" }],
  });
  check(
    "Attachment-only message is allowed (empty content OK)",
    withAttachment.attachments.length === 1
  );

  // ── 6. Rate limiter ───────────────────────────────────────────────────────
  section("Rate Limiter");

  resetAll();
  const r1 = consume("test:key", 3, 1000);
  const r2 = consume("test:key", 3, 1000);
  const r3 = consume("test:key", 3, 1000);
  const r4 = consume("test:key", 3, 1000);
  check("1st call allowed", r1.allowed);
  check("2nd call allowed", r2.allowed);
  check("3rd call allowed", r3.allowed);
  check("4th call blocked (limit=3)", !r4.allowed);
  check("Blocked call reports retryAfterMs > 0", r4.retryAfterMs > 0);
  check("Different key has own bucket", consume("other:key", 3, 1000).allowed);
  resetAll();

  // ── 7. DTO mapping ────────────────────────────────────────────────────────
  section("DTO Mapper");

  const mapConv = new Conversation({
    userId: ownerId,
    status: "open",
    supportMode: "ai",
    aiConfig: { enabled: true, intent: "greeting", intentConfidence: 0.8 },
    unreadCount: { user: 2, admin: 3 },
    version: 5,
  });
  const convDto = conversationToDto(mapConv);
  check("DTO id is string", typeof convDto.id === "string");
  check("DTO userId is string", typeof convDto.userId === "string");
  check("DTO version preserved", convDto.version === 5);
  check("DTO unreadCount preserved", convDto.unreadCount.user === 2);
  check("DTO aiConfig.intent preserved", convDto.aiConfig.intent === "greeting");
  check("DTO aiConfig.intentConfidence preserved", convDto.aiConfig.intentConfidence === 0.8);
  check("DTO createdAt is ISO string", typeof convDto.createdAt === "string");

  const mapMsg = new Message({
    conversationId: ownerId,
    senderType: "ai",
    content: "Chào bạn",
    visibility: "public",
    aiMetadata: { model: "gemini-2.5-flash", tokensUsed: 100 },
  });
  const msgDto = messageToDto(mapMsg);
  check("Message DTO senderType preserved", msgDto.senderType === "ai");
  check("Message DTO aiMetadata.model preserved", msgDto.aiMetadata?.model === "gemini-2.5-flash");
  check("Message DTO attachments is array", Array.isArray(msgDto.attachments));

  // ── 8. Socket event contract ──────────────────────────────────────────────
  section("Socket Events");

  check("Room conversation naming", ChatRooms.conversation("abc") === "conversation:abc");
  check("Room user naming", ChatRooms.user("abc") === "user:abc");
  check("Admin room exists", ChatRooms.admins === "admins");
  check("MESSAGE_NEW event name", ChatServerEvents.MESSAGE_NEW === "message:new");
  check("CONVERSATION_UPDATED event name", ChatServerEvents.CONVERSATION_UPDATED === "conversation:updated");
  check("TYPING event name", ChatServerEvents.TYPING === "message:typing");
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

  console.log("\n── Running Chat Foundation DB Integration Tests ──\n");

  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }

    const convService = await import("../modules/chat/services/conversation.service");
    const msgService = await import("../modules/chat/services/message.service");
    const handoffService = await import("../modules/chat/services/handoff.service");

    const userId = new Types.ObjectId();
    const otherUserId = new Types.ObjectId();
    const adminId = new Types.ObjectId();

    const userActor = { userId: String(userId), roles: ["buyer"] };
    const otherActor = { userId: String(otherUserId), roles: ["buyer"] };
    const adminActor = { userId: String(adminId), roles: ["buyer", "admin"] };

    // ── createConversation ───────────────────────────────────────────────────
    section("createConversation");

    const conv = await convService.createConversation(userActor);
    check("Conversation created", !!conv._id);
    check("Conversation belongs to user", String(conv.userId) === String(userId));
    check("Conversation starts open", conv.status === "open");
    check("Conversation version = 1", conv.version === 1);

    const convAgain = await convService.createConversation(userActor);
    check(
      "createConversation is idempotent (returns same conversation)",
      String(convAgain._id) === String(conv._id)
    );

    const convNew = await convService.createConversation(userActor, { forceNew: true });
    check(
      "forceNew creates a different conversation",
      String(convNew._id) !== String(conv._id)
    );

    // ── Permission enforcement ───────────────────────────────────────────────
    section("Permission Enforcement (DB)");

    let forbidden = false;
    try {
      await convService.getConversation(String(conv._id), otherActor);
    } catch (err) {
      forbidden = err instanceof ChatError && err.code === ErrorCode.CHAT_FORBIDDEN;
    }
    check("Other user gets CHAT_FORBIDDEN", forbidden);

    let notFound = false;
    try {
      await convService.getConversation(String(new Types.ObjectId()), otherActor);
    } catch (err) {
      notFound =
        err instanceof ChatError &&
        err.code === ErrorCode.CHAT_CONVERSATION_NOT_FOUND;
    }
    check("Unknown conversation gets CHAT_CONVERSATION_NOT_FOUND", notFound);

    let invalidId = false;
    try {
      await convService.getConversation("not-an-object-id", userActor);
    } catch (err) {
      invalidId = err instanceof ChatError && err.code === ErrorCode.CHAT_INVALID_ID;
    }
    check("Malformed ID gets CHAT_INVALID_ID", invalidId);

    const adminView = await convService.getConversation(String(conv._id), adminActor);
    check("Admin can read any conversation", !!adminView._id);

    // ── sendMessage + idempotency ───────────────────────────────────────────
    section("sendMessage & Idempotency");

    const send1 = await msgService.sendMessage(userActor, {
      conversationId: String(conv._id),
      content: "Xin chào, tôi cần hỗ trợ",
      clientMessageId: "client-msg-001",
    });
    check("Message created", !!send1.message._id);
    check("First send is not duplicate", send1.duplicate === false);
    check("Message senderType = user", send1.message.senderType === "user");

    const send2 = await msgService.sendMessage(userActor, {
      conversationId: String(conv._id),
      content: "Xin chào, tôi cần hỗ trợ",
      clientMessageId: "client-msg-001",
    });
    check("Retry with same clientMessageId → duplicate = true", send2.duplicate === true);
    check(
      "Retry does NOT create a second message",
      String(send1.message._id) === String(send2.message._id)
    );

    const totalMessages = await Message.countDocuments({ conversationId: conv._id });
    check("Only 1 message stored for that clientMessageId", totalMessages === 1);

    // Unread tăng cho admin khi user gửi
    const afterUserMsg = await Conversation.findById(conv._id);
    check("Admin unread incremented after user message", (afterUserMsg?.unreadCount?.admin ?? 0) === 1);
    check("User unread NOT incremented by own message", (afterUserMsg?.unreadCount?.user ?? 0) === 0);

    // ── markAsRead ───────────────────────────────────────────────────────────
    section("Read Receipt");

    const marked = await msgService.markAsRead(String(conv._id), adminActor);
    check("markAsRead marks the user message", marked.markedCount >= 1);

    const afterRead = await Conversation.findById(conv._id);
    check("Admin unread reset to 0", (afterRead?.unreadCount?.admin ?? -1) === 0);

    const readMsg = await Message.findOne({ conversationId: conv._id });
    check("adminReadAt is set", readMsg?.adminReadAt !== null && readMsg?.adminReadAt !== undefined);
    check("userReadAt NOT set by admin", readMsg?.userReadAt === null || readMsg?.userReadAt === undefined);

    // ── visibility filter ────────────────────────────────────────────────────
    section("Internal Visibility");

    await msgService.sendMessage(adminActor, {
      conversationId: String(conv._id),
      content: "Ghi chú nội bộ cho admin",
      visibility: "internal",
    });

    const userView = await msgService.listMessages(String(conv._id), userActor, { limit: 50 });
    check(
      "User does NOT see internal message",
      userView.items.every((m) => m.visibility === "public")
    );
    check(
      "User does not see internal content",
      !userView.items.some((m) => m.content.includes("Ghi chú nội bộ"))
    );

    const adminViewMsgs = await msgService.listMessages(String(conv._id), adminActor, { limit: 50 });
    check(
      "Admin DOES see internal message",
      adminViewMsgs.items.some((m) => m.content.includes("Ghi chú nội bộ"))
    );

    let userCannotInternal = false;
    try {
      await msgService.sendMessage(userActor, {
        conversationId: String(conv._id),
        content: "cố gắng tạo internal",
        visibility: "internal",
      });
    } catch (err) {
      userCannotInternal =
        err instanceof ChatError && err.code === ErrorCode.CHAT_FORBIDDEN;
    }
    check("User CANNOT create internal message", userCannotInternal);

    // ── Closed conversation rejects messages ─────────────────────────────────
    section("Closed Conversation");

    const closed = await convService.closeConversation(String(conv._id), userActor);
    check("Conversation closed", closed.status === "closed");
    check("closedAt is set", !!closed.closedAt);

    let closedReject = false;
    try {
      await msgService.sendMessage(userActor, {
        conversationId: String(conv._id),
        content: "gửi sau khi đóng",
      });
    } catch (err) {
      closedReject =
        err instanceof ChatError && err.code === ErrorCode.CHAT_CONVERSATION_CLOSED;
    }
    check("Cannot send message to closed conversation", closedReject);

    const reopened = await convService.reopenConversation(String(conv._id), userActor);
    check("Conversation reopened", reopened.status === "open");
    check("Reopen returns to AI mode", reopened.supportMode === "ai");

    // ── Optimistic locking ───────────────────────────────────────────────────
    section("Optimistic Locking (version)");

    const current = await Conversation.findById(conv._id);
    const versionBefore = current!.version;

    let conflict = false;
    try {
      await convService.transitionConversation(String(conv._id), adminActor, {
        supportMode: "human",
        expectedVersion: versionBefore - 1, // sai version
      });
    } catch (err) {
      conflict = err instanceof ChatError && err.code === ErrorCode.CHAT_VERSION_CONFLICT;
    }
    check("Stale version → CHAT_VERSION_CONFLICT", conflict);

    const okTransition = await convService.transitionConversation(
      String(conv._id),
      adminActor,
      { supportMode: "human", expectedVersion: versionBefore }
    );
    check("Correct version succeeds", okTransition.supportMode === "human");
    check("Version incremented after transition", okTransition.version === versionBefore + 1);

    // ── Admin assign ─────────────────────────────────────────────────────────
    section("Admin Assign");

    const assigned = await convService.transitionConversation(String(conv._id), adminActor, {
      supportMode: "human",
      assignedAdminId: adminId,
    });
    check("Admin assigned", String(assigned.assignedAdminId) === String(adminId));

    let userCannotAssign = false;
    try {
      await convService.transitionConversation(String(conv._id), userActor, {
        assignedAdminId: otherUserId,
      });
    } catch (err) {
      userCannotAssign = err instanceof ChatError && err.code === ErrorCode.CHAT_FORBIDDEN;
    }
    check("User CANNOT assign admin", userCannotAssign);

    // ── Admin list scopes ────────────────────────────────────────────────────
    section("Admin List Scopes");

    const all = await convService.listAdminConversations(adminActor, { limit: 50 });
    check("Admin list returns conversations", all.total >= 1);

    const mine = await convService.listAdminConversations(adminActor, {
      scope: "mine",
      limit: 50,
    });
    check(
      "scope=mine only returns conversations assigned to me",
      mine.items.every((c) => {
        const assigned = convService.rawAssignedAdminId(c);
        return assigned !== null && String(assigned) === String(adminId);
      })
    );

    const unassigned = await convService.listAdminConversations(adminActor, {
      scope: "unassigned",
      limit: 50,
    });
    check(
      "scope=unassigned only returns conversations without admin",
      unassigned.items.every((c) => convService.rawAssignedAdminId(c) === null)
    );

    let nonAdminBlocked = false;
    try {
      await convService.listAdminConversations(userActor, {});
    } catch (err) {
      nonAdminBlocked = err instanceof ChatError && err.code === ErrorCode.CHAT_FORBIDDEN;
    }
    check("Non-admin CANNOT list admin conversations", nonAdminBlocked);

    // ── User list isolation ──────────────────────────────────────────────────
    section("User List Isolation");

    const userList = await convService.listUserConversations(userActor, { limit: 50 });
    check(
      "User list only contains own conversations",
      userList.items.every((c) => String(c.userId) === String(userId))
    );

    const otherList = await convService.listUserConversations(otherActor, { limit: 50 });
    check(
      "Other user sees none of user's conversations",
      otherList.items.every((c) => String(c.userId) === String(otherUserId))
    );

    // ── Handoff flow ─────────────────────────────────────────────────────────
    section("Handoff Flow");

    const handoff = await handoffService.createHandoff(userActor, {
      conversationId: String(conv._id),
      reason: "Cần tư vấn viên",
      priority: "high",
    });
    check("Handoff created", handoff.status === "waiting");
    check("Handoff priority = high", handoff.priority === "high");

    // Conversation này đang ở mode "human" (đã admin nhận ở bước trước)
    // ⇒ giữ nguyên mode, không đẩy về waiting_admin.
    const convAfterHandoff = await Conversation.findById(conv._id);
    check(
      "Handoff on human-mode conversation keeps supportMode=human",
      convAfterHandoff?.supportMode === "human"
    );

    // ── Escalate từ mode AI ⇒ chuyển sang waiting_admin ─────────────────────
    const aiConv = await convService.createConversation(userActor, { forceNew: true });
    await convService.updateConversationState(aiConv._id, { supportMode: "ai" });
    const aiHandoff = await handoffService.createHandoff(userActor, {
      conversationId: String(aiConv._id),
      reason: "AI không trả lời được",
      priority: "urgent",
    });
    check("Escalate from AI mode creates handoff", aiHandoff.status === "waiting");
    const aiConvAfter = await Conversation.findById(aiConv._id);
    check(
      "Conversation switched to waiting_admin when escalating from AI",
      aiConvAfter?.supportMode === "waiting_admin"
    );
    check(
      "Escalate priority = urgent",
      aiHandoff.priority === "urgent"
    );

    let duplicateHandoff = false;
    try {
      await handoffService.createHandoff(userActor, {
        conversationId: String(conv._id),
        reason: "Cần tư vấn viên",
      });
    } catch (err) {
      duplicateHandoff =
        err instanceof ChatError && err.code === ErrorCode.CHAT_HANDOFF_ALREADY_EXISTS;
    }
    check("Duplicate handoff → CHAT_HANDOFF_ALREADY_EXISTS", duplicateHandoff);

    const assignedHandoff = await handoffService.assignHandoff(String(conv._id), adminActor, {});
    check("Handoff assigned to admin", assignedHandoff.status === "assigned");
    check(
      "Handoff assignedAdminId set",
      String(assignedHandoff.assignedAdminId) === String(adminId)
    );

    const acceptedHandoff = await handoffService.acceptHandoff(String(conv._id), adminActor, {});
    check("Handoff accepted", acceptedHandoff.status === "accepted");
    check("acceptedAt is set", !!acceptedHandoff.acceptedAt);

    const convAfterAccept = await Conversation.findById(conv._id);
    check("Conversation mode = human after accept", convAfterAccept?.supportMode === "human");

    const resolvedHandoff = await handoffService.resolveHandoff(String(conv._id), adminActor, {});
    check("Handoff resolved", resolvedHandoff.status === "resolved");
    check("resolvedAt is set", !!resolvedHandoff.resolvedAt);

    const convAfterResolve = await Conversation.findById(conv._id);
    check("Conversation returns to AI after resolve", convAfterResolve?.supportMode === "ai");

    // ── Unread counts ────────────────────────────────────────────────────────
    section("Unread Counters");

    const adminMsg = await msgService.sendMessage(adminActor, {
      conversationId: String(conv._id),
      content: "Chào bạn, tôi hỗ trợ nhé",
    });
    check("Admin message created", !!adminMsg.message._id);

    const afterAdminMsg = await Conversation.findById(conv._id);
    check(
      "User unread incremented after admin message",
      (afterAdminMsg?.unreadCount?.user ?? 0) >= 1
    );

    const totalUserUnread = await convService.totalUnreadForUser(String(userId));
    check("totalUnreadForUser > 0", totalUserUnread >= 1);

    // ── Pagination / cursor ──────────────────────────────────────────────────
    section("Cursor Pagination");

    for (let i = 0; i < 5; i++) {
      await msgService.sendMessage(userActor, {
        conversationId: String(conv._id),
        content: `tin nhắn ${i}`,
      });
    }

    const page1 = await msgService.listMessages(String(conv._id), userActor, { limit: 3 });
    check("Page 1 returns 3 messages", page1.items.length === 3);
    check("Page 1 hasMore = true", page1.hasMore === true);
    check("Page 1 has nextCursor", !!page1.nextCursor);

    const page2 = await msgService.listMessages(String(conv._id), userActor, {
      limit: 3,
      before: page1.nextCursor!,
    });
    check("Page 2 returns 3 messages", page2.items.length === 3);
    const page1Ids = new Set(page1.items.map((m) => String(m._id)));
    check(
      "Page 2 does not repeat page 1 messages",
      page2.items.every((m) => !page1Ids.has(String(m._id)))
    );

    // ── AI lock ──────────────────────────────────────────────────────────────
    section("AI Lock");

    const lockTarget = await Conversation.findById(conv._id);
    const lockVersion = lockTarget!.version;

    const lock1 = await convService.acquireAiLock(conv._id, lockVersion);
    check("First AI lock succeeds", !!lock1);

    const lock2 = await convService.acquireAiLock(conv._id, lockVersion);
    check("Second AI lock with same version FAILS", lock2 === null);

    // ── Cleanup ──────────────────────────────────────────────────────────────
    section("Cleanup");
    await Message.deleteMany({ conversationId: { $in: [conv._id, convNew._id, aiConv._id] } });
    await HandoffRequest.deleteMany({ conversationId: { $in: [conv._id, aiConv._id] } });
    await Conversation.deleteMany({ userId: { $in: [userId, otherUserId] } });
    const left = await Conversation.countDocuments({ userId: userId });
    check("Test conversations cleaned up", left === 0);
  } catch (err) {
    console.error("\nDB test error:", err);
    failed++;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// RUNNER
// ════════════════════════════════════════════════════════════════════════════

async function main() {
  runContractTests();
  await runDatabaseTests();

  console.log("\n========================================");
  console.log(`Chat Foundation Tests: ${passed} passed, ${failed} failed.`);
  console.log("========================================\n");

  if (failed > 0) process.exit(1);
}

main().then(() => {
  if (mongoose.connection.readyState !== 0) {
    mongoose.disconnect();
  }
});
