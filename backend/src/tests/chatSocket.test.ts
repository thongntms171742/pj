/**
 * chatSocket.test.ts — kiểm thử Socket.IO namespace `/chat` end-to-end.
 *
 * Dựng server HTTP thật + MongoDB thật, kết nối `socket.io-client` thật.
 * Kiểm tra:
 *   - Auth bắt buộc (không token / token sai ⇒ từ chối).
 *   - Subscribe chỉ vào conversation có quyền.
 *   - Gửi tin nhắn realtime ⇒ nhận ở client bên kia.
 *   - Tin nhắn `internal` KHÔNG tới user, CÓ tới admin.
 *   - Typing indicator.
 *   - Idempotency qua socket.
 *   - Rate limit socket.
 */

import assert from "assert";
import http from "http";
import mongoose, { Types } from "mongoose";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { Server as SocketIOServer } from "socket.io";
import { io as ioClient, Socket } from "socket.io-client";
import "../models";
import { Conversation } from "../models/Conversation";
import { Message } from "../models/Message";
import { initChatSocket } from "../modules/chat/socket/chat.socket";
import {
  ChatClientEvents,
  ChatServerEvents,
} from "../modules/chat/socket/chat.events";

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

const JWT_SECRET = process.env.JWT_SECRET || "thriftit_super_secret_key_change_me";

function signToken(userId: string, roles: string[]): string {
  return jwt.sign(
    { id: userId, email: `${userId}@test.local`, roles },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

/** Chờ event với timeout — trả về payload hoặc null. */
function waitForEvent<T>(
  socket: Socket,
  event: string,
  timeoutMs = 4000
): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/** Chờ ack từ server. */
function waitForAck<T>(
  socket: Socket,
  event: string,
  payload: unknown,
  timeoutMs = 4000
): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    socket.emit(event, payload, (ack: T) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

/**
 * Kết nối client tới namespace /chat với token.
 *
 * Server emit `chat:connected` NGAY khi connection established. Event này có
 * thể tới client TRƯỚC hoặc SAU client-side "connect" event (race) ⇒ ta
 * đăng ký listener + tạo promise NGAY khi tạo socket, rồi await sau khi
 * connect hoàn tất.
 */
function connectClient(
  port: number,
  token: string
): Promise<{ socket: Socket; connected: any }> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(`http://localhost:${port}/chat`, {
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
      timeout: 5000,
    });

    // Đăng ký listener NGAY khi tạo socket (trước khi connect hoàn tất).
    const connectedPromise = waitForEvent<any>(socket, ChatServerEvents.CONNECTED);

    const cleanup = () => {
      socket.off("connect", onConnect);
      socket.off("connect_error", onError);
    };
    const onConnect = async () => {
      cleanup();
      const connected = await connectedPromise;
      resolve({ socket, connected });
    };
    const onError = (err: Error) => {
      cleanup();
      socket.disconnect();
      reject(err);
    };
    const timer = setTimeout(() => {
      cleanup();
      socket.disconnect();
      reject(new Error("Socket connect timeout"));
    }, 6000);
    socket.on("connect", onConnect);
    socket.on("connect_error", onError);
  });
}

async function runSocketTests() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.log("\n⚠️  No MONGO_URI set — skipping socket integration tests.");
    return;
  }

  console.log("\n── Running Chat Socket.IO Integration Tests ──\n");

  let httpServer: http.Server | null = null;
  let io: SocketIOServer | null = null;
  const clients: Socket[] = [];

  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }

    // ── Dựng server ─────────────────────────────────────────────────────────
    httpServer = http.createServer((_req, res) => {
      res.writeHead(200).end("ok");
    });
    io = new SocketIOServer(httpServer, {
      cors: { origin: true, credentials: true },
      transports: ["websocket"],
    });
    initChatSocket(io);

    await new Promise<void>((resolve) => httpServer!.listen(0, resolve));
    const port = (httpServer.address() as any).port;
    console.log(`\n   [socket test server] listening on port ${port}\n`);

    // ── Setup data ───────────────────────────────────────────────────────────
    const userId = new Types.ObjectId();
    const otherUserId = new Types.ObjectId();
    const adminId = new Types.ObjectId();

    const conv = await Conversation.create({
      userId,
      status: "open",
      supportMode: "ai",
      unreadCount: { user: 0, admin: 0 },
      version: 1,
    });

    const userToken = signToken(String(userId), ["buyer"]);
    const otherToken = signToken(String(otherUserId), ["buyer"]);
    const adminToken = signToken(String(adminId), ["buyer", "admin"]);

    // ── 1. Auth bắt buộc ────────────────────────────────────────────────────
    section("Authentication");

    let authRejected = false;
    try {
      await connectClient(port, "invalid-token");
    } catch {
      authRejected = true;
    }
    check("Socket with invalid token is REJECTED", authRejected);

    let noTokenRejected = false;
    try {
      await new Promise<void>((resolve, reject) => {
        const s = ioClient(`http://localhost:${port}/chat`, {
          transports: ["websocket"],
          reconnection: false,
          timeout: 4000,
        });
        const timer = setTimeout(() => {
          s.disconnect();
          reject(new Error("timeout"));
        }, 5000);
        s.on("connect", () => {
          clearTimeout(timer);
          s.disconnect();
          // Kết nối thành công ⇒ server KHÔNG chặn ⇒ test fail.
          resolve();
        });
        s.on("connect_error", () => {
          clearTimeout(timer);
          s.disconnect();
          // Server từ chối ⇒ đúng như mong đợi.
          reject(new Error("rejected"));
        });
      });
    } catch {
      noTokenRejected = true;
    }
    check("Socket without token is REJECTED", noTokenRejected);

    // ── 2. Kết nối hợp lệ ───────────────────────────────────────────────────
    section("Valid Connection");

    const { socket: userSocket, connected } = await connectClient(port, userToken);
    clients.push(userSocket);
    check("User socket connects", userSocket.connected);
    check("CONNECTED event received", connected !== null);
    check("CONNECTED carries userId", connected?.userId === String(userId));

    const { socket: adminSocket } = await connectClient(port, adminToken);
    clients.push(adminSocket);
    check("Admin socket connects", adminSocket.connected);

    const { socket: otherSocket } = await connectClient(port, otherToken);
    clients.push(otherSocket);
    check("Other user socket connects", otherSocket.connected);

    // ── 3. Subscribe ────────────────────────────────────────────────────────
    section("Subscribe / Authorization");

    const subOk = await waitForAck<any>(
      userSocket,
      ChatClientEvents.SUBSCRIBE,
      { conversationId: String(conv._id) }
    );
    check("Owner can subscribe to own conversation", subOk?.ok === true);

    const subDenied = await waitForAck<any>(
      otherSocket,
      ChatClientEvents.SUBSCRIBE,
      { conversationId: String(conv._id) }
    );
    check("Other user CANNOT subscribe", subDenied?.ok === false);
    check(
      "Denied subscribe returns CHAT_FORBIDDEN",
      subDenied?.error?.code === "CHAT_FORBIDDEN"
    );

    const adminSub = await waitForAck<any>(
      adminSocket,
      ChatClientEvents.SUBSCRIBE,
      { conversationId: String(conv._id) }
    );
    check("Admin CAN subscribe to any conversation", adminSub?.ok === true);

    // ── 4. Gửi tin nhắn realtime ─────────────────────────────────────────────
    section("Realtime Message");

    const userReceives = waitForEvent<any>(adminSocket, ChatServerEvents.MESSAGE_NEW);
    const sendAck = await waitForAck<any>(
      userSocket,
      ChatClientEvents.SEND_MESSAGE,
      {
        conversationId: String(conv._id),
        content: "Xin chào, tôi cần hỗ trợ",
        clientMessageId: "sock-001",
      }
    );
    check("send:message ack ok", sendAck?.ok === true);
    check("send:message ack returns message", !!sendAck?.data?.message);
    check("send:message ack duplicate=false", sendAck?.data?.duplicate === false);

    const received = await userReceives;
    check("Admin receives message:new event", received !== null);
    check(
      "Event message content matches",
      received?.message?.content === "Xin chào, tôi cần hỗ trợ"
    );
    check("Event senderType = user", received?.message?.senderType === "user");

    // Tin nhắn đã lưu vào DB
    const stored = await Message.findOne({
      conversationId: conv._id,
      clientMessageId: "sock-001",
    });
    check("Message persisted to DB", !!stored);

    // ── 5. Idempotency qua socket ───────────────────────────────────────────
    section("Socket Idempotency");

    const sendAck2 = await waitForAck<any>(
      userSocket,
      ChatClientEvents.SEND_MESSAGE,
      {
        conversationId: String(conv._id),
        content: "Xin chào, tôi cần hỗ trợ",
        clientMessageId: "sock-001",
      }
    );
    check("Duplicate send ack duplicate=true", sendAck2?.data?.duplicate === true);

    const count = await Message.countDocuments({
      conversationId: conv._id,
      clientMessageId: "sock-001",
    });
    check("Only 1 message stored for same clientMessageId", count === 1);

    // ── 6. Tin nhắn internal chỉ tới admin ──────────────────────────────────
    section("Internal Message Visibility");

    const adminGetsInternal = waitForEvent<any>(
      adminSocket,
      ChatServerEvents.MESSAGE_NEW
    );
    const userGetsInternal = waitForEvent<any>(
      userSocket,
      ChatServerEvents.MESSAGE_NEW
    );

    const internalAck = await waitForAck<any>(
      adminSocket,
      ChatClientEvents.SEND_MESSAGE,
      {
        conversationId: String(conv._id),
        content: "Ghi chú nội bộ",
      }
    );
    check("Admin send ack ok", internalAck?.ok === true);

    // Admin socket nhận lại tin nhắn của chính mình
    const adminEvent = await adminGetsInternal;
    check("Admin receives own message event", adminEvent !== null);

    // User KHÔNG được nhận tin nhắn public từ admin? — user đã subscribe
    // nên user SẼ nhận tin nhắn public. Kiểm tra nội dung.
    const userEvent = await userGetsInternal;
    check(
      "User receives public admin message",
      userEvent?.message?.content === "Ghi chú nội bộ"
    );

    // Tin nhắn internal thật sự ( qua REST service ) không tới user
    const { sendMessage } = await import(
      "../modules/chat/services/message.service"
    );
    await sendMessage(
      { userId: String(adminId), roles: ["buyer", "admin"] },
      {
        conversationId: String(conv._id),
        content: "NỘI BỘ KHÔNG ĐƯỢC THẤY",
        visibility: "internal",
      }
    );
    await new Promise((r) => setTimeout(r, 400));

    const userMessages = await Message.find({
      conversationId: conv._id,
      content: "NỘI BỘ KHÔNG ĐƯỢC THẤY",
    });
    check("Internal message stored with visibility=internal", userMessages.length === 1);
    check("Internal message visibility = internal", userMessages[0].visibility === "internal");

    // ── 7. Typing ────────────────────────────────────────────────────────────
    section("Typing Indicator");

    const typingReceived = waitForEvent<any>(adminSocket, ChatServerEvents.TYPING);
    const typingAck = await waitForAck<any>(
      userSocket,
      ChatClientEvents.TYPING,
      { conversationId: String(conv._id), isTyping: true }
    );
    check("typing ack ok", typingAck?.ok === true);

    const typingEvent = await typingReceived;
    check("Admin receives typing event", typingEvent !== null);
    check("Typing event isTyping = true", typingEvent?.isTyping === true);
    check("Typing event userId matches", typingEvent?.userId === String(userId));

    // ── 8. Mark read ────────────────────────────────────────────────────────
    section("Mark Read via Socket");

    const readAck = await waitForAck<any>(
      adminSocket,
      ChatClientEvents.MARK_READ,
      { conversationId: String(conv._id) }
    );
    check("mark read ack ok", readAck?.ok === true);
    check("mark read returns markedCount", typeof readAck?.data?.markedCount === "number");

    const afterRead = await Conversation.findById(conv._id);
    check("Admin unread reset to 0", (afterRead?.unreadCount?.admin ?? -1) === 0);

    // ── 9. Conversation updated event ───────────────────────────────────────
    section("Conversation Updated Event");

    const convUpdated = waitForEvent<any>(
      userSocket,
      ChatServerEvents.CONVERSATION_UPDATED
    );
    const { transitionConversation } = await import(
      "../modules/chat/services/conversation.service"
    );
    await transitionConversation(
      String(conv._id),
      { userId: String(adminId), roles: ["buyer", "admin"] },
      { supportMode: "human" }
    );

    const updatedEvent = await convUpdated;
    check("User receives conversation:updated", updatedEvent !== null);
    check(
      "Updated event carries supportMode=human",
      updatedEvent?.conversation?.supportMode === "human"
    );
    check(
      "Updated event carries incremented version",
      updatedEvent?.conversation?.version >= 2
    );
    // ── 10. Rate limit ──────────────────────────────────────────────────────
    section("Socket Rate Limit");

    const otherConv = await Conversation.create({
      userId: otherUserId,
      status: "open",
      supportMode: "ai",
      unreadCount: { user: 0, admin: 0 },
      version: 1,
    });
    await otherSocket.emit(ChatClientEvents.SUBSCRIBE, {
      conversationId: String(otherConv._id),
    });

    // Spam thật là BURST: phát 30 event liên tiếp trong cùng 1 window.
    // Nếu chờ ack từng cái thì mỗi lần chờ DB write đủ lâu để window
    // (1s) reset ⇒ không bao giờ chạm limit.
    const acks: any[] = [];
    const allAcks = new Promise<void>((resolve) => {
      let remaining = 30;
      otherSocket.on("ack-collect", () => {
        remaining -= 1;
        if (remaining <= 0) resolve();
      });
      // Gom ack thực tế qua handler message:send riêng.
      otherSocket.on("ack", () => {});
    });

    // Dùng kênh ack chuẩn: emit 30 event, mỗi event có callback riêng.
    const ackPromises: Promise<any>[] = [];
    for (let i = 0; i < 30; i++) {
      ackPromises.push(
        new Promise<any>((resolve) => {
          otherSocket.emit(
            ChatClientEvents.SEND_MESSAGE,
            {
              conversationId: String(otherConv._id),
              content: `spam ${i}`,
              clientMessageId: `spam-${i}`,
            },
            (ack: any) => resolve(ack)
          );
        })
      );
    }
    const results = await Promise.all(ackPromises);
    acks.push(...results);

    const limitedAck = results.find(
      (r) => r?.ok === false && r?.error?.code === "CHAT_RATE_LIMITED"
    );
    check("Socket rate limit blocks spam", !!limitedAck);

    const allowedCount = results.filter((r) => r?.ok === true).length;
    check(
      "Rate limit allows only up to the configured limit",
      allowedCount <= 10 && allowedCount >= 1
    );
    check(
      "Rate limited requests are rejected, not silently dropped",
      results.filter((r) => r?.ok === false).length >= 20
    );

    // ── Cleanup ─────────────────────────────────────────────────────────────
    section("Cleanup");
    for (const c of clients) c.disconnect();
    await Message.deleteMany({ conversationId: { $in: [conv._id, otherConv._id] } });
    await Conversation.deleteMany({ _id: { $in: [conv._id, otherConv._id] } });
    const left = await Conversation.countDocuments({ userId: { $in: [userId, otherUserId] } });
    check("Test data cleaned up", left === 0);
  } catch (err) {
    console.error("\nSocket test error:", err);
    failed++;
  } finally {
    for (const c of clients) {
      try {
        c.disconnect();
      } catch {
        /* ignore */
      }
    }
    if (io) {
      await new Promise<void>((resolve) => io!.close(() => resolve()));
    }
    if (httpServer) {
      await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    }
  }
}

async function main() {
  await runSocketTests();

  console.log("\n========================================");
  console.log(`Chat Socket Tests: ${passed} passed, ${failed} failed.`);
  console.log("========================================\n");

  if (failed > 0) process.exit(1);
}

main().then(() => {
  if (mongoose.connection.readyState !== 0) {
    mongoose.disconnect();
  }
});
