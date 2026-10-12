/**
 * socket.ts — Socket.io server setup for real-time chat
 *
 * Events:
 *   client → server
 *     chat:join          { userId }           join the global chat room
 *     chat:send          { content }          send a message
 *     chat:markRead      { lastMessageId }   mark messages up to that id as read
 *     chat:leave         {}                  leave room (on logout/disconnect)
 *
 *   server → client
 *     chat:message       MessageDto           new message broadcast
 *     chat:unread        { unread }           unread count update
 *     chat:error         { message }          error notification
 */

import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { Types } from "mongoose";
import { Message } from "../models/Message";
import { Notification } from "../models/Notification";
import { messageToDto } from "../dto/chat";

let io: Server | null = null;

// Module-level map: userId → Set of socket ids (handles multi-tab)
const userSockets = new Map<string, Set<string>>();

// ── Allowed origins (must match app.ts CORS) ──────────────────────────────────
const ALLOWED_ORIGINS = [
  "https://rungtrongpho.vercel.app",
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/,
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:4173",
];

export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true; // same-origin / no-origin
  return ALLOWED_ORIGINS.some((o) =>
    typeof o === "string" ? o === origin : o.test(origin)
  );
}

export function getIO(): Server {
  if (!io) throw new Error("Socket.io not initialized — call initSocket first");
  return io;
}

export function initSocket(httpServer: HttpServer): Server {
  if (io) return io;

  io = new Server(httpServer, {
    cors: {
      origin: (origin, cb) => {
        if (isOriginAllowed(origin)) return cb(null, true);
        cb(new Error(`CORS: socket origin not allowed — ${origin}`), false);
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  const GLOBAL_ROOM = "global";

  io.on("connection", (socket: Socket) => {
    const isAdmin: boolean = socket.data.isAdmin ?? false;
    console.log(`[socket] connected: ${socket.id}`);

    // ── Join global chat room ────────────────────────────────────────────────
    socket.on("chat:join", async (payload: { userId: string }) => {
      const userId = (payload?.userId ?? "").toString().trim();
      if (!userId) {
        socket.emit("chat:error", { message: "userId is required" });
        return;
      }

      socket.data.userId = userId;
      socket.data.isAdmin = isAdmin;
      socket.join(GLOBAL_ROOM);

      const existing = userSockets.get(userId) ?? new Set();
      existing.add(socket.id);
      userSockets.set(userId, existing);

      console.log(`[socket] ${userId} joined global room (${existing.size} tab(s))`);

      // Send unread count for this user
      try {
        const unread = await Message.countDocuments({
          conversationId: GLOBAL_ROOM,
          isRead: false,
          senderId: { $ne: userId },
        });
        socket.emit("chat:unread", { unread });
      } catch (err) {
        console.error("[socket] unread count error:", err);
      }
    });

    // ── Send message ─────────────────────────────────────────────────────────
    socket.on("chat:send", async (payload: { content: string }) => {
      const userId: string = socket.data.userId;
      if (!userId) {
        socket.emit("chat:error", { message: "Bạn chưa đăng nhập" });
        return;
      }

      const content = (payload?.content ?? "").toString().trim();
      if (!content) {
        socket.emit("chat:error", { message: "Tin nhắn không được để trống" });
        return;
      }
      if (content.length > 2000) {
        socket.emit("chat:error", { message: "Tin nhắn tối đa 2000 ký tự" });
        return;
      }

      const senderName = socket.data.userName ?? `User ${userId.slice(-4)}`;
      const role: "user" | "admin" | "system" =
        socket.data.isAdmin ? "admin" : "user";

      try {
        const saved = await Message.create({
          conversationId: GLOBAL_ROOM,
          role,
          senderId: userId,
          senderName,
          content,
          isRead: false,
        });

        const dto = messageToDto(saved, userId);

        // Broadcast to ALL in the room (all tabs + all users)
        io!.to(GLOBAL_ROOM).emit("chat:message", dto);

        // Broadcast updated unread count to every connected user
        const connectedUserIds = Array.from(userSockets.keys());
        await Promise.all(
          connectedUserIds.map(async (uid) => {
            if (uid === userId) return; // sender sees isOwn=true already
            const unread = await Message.countDocuments({
              conversationId: GLOBAL_ROOM,
              isRead: false,
              senderId: { $ne: uid },
            });
            const sockets = userSockets.get(uid);
            if (!sockets) return;
            for (const sid of sockets) {
              io!.to(sid).emit("chat:unread", { unread });
            }
          })
        );

        // System notification for admins when a buyer sends a message
        if (role === "user") {
          Notification.create({
            userId: new Types.ObjectId(), // admin notification — handled by socket unread
            type: "chat",
            title: `Tin nhắn mới từ ${senderName}`,
            message: content.length > 80 ? content.slice(0, 80) + "…" : content,
          }).catch(() => {}); // best-effort, don't block
        }
      } catch (err) {
        console.error("[socket] send message error:", err);
        socket.emit("chat:error", { message: "Gửi tin nhắn thất bại, thử lại" });
      }
    });

    // ── Mark messages as read ───────────────────────────────────────────────
    socket.on("chat:markRead", async (payload: { lastMessageId?: string }) => {
      const userId: string = socket.data.userId;
      if (!userId) return;

      const filter: Record<string, unknown> = {
        conversationId: GLOBAL_ROOM,
        isRead: false,
        senderId: { $ne: userId },
      };

      if (payload?.lastMessageId) {
        filter._id = { $lte: new Types.ObjectId(payload.lastMessageId) };
      }

      await Message.updateMany(filter, {
        isRead: true,
        readAt: new Date(),
        readBy: userId,
      });

      const unread = await Message.countDocuments({
        conversationId: GLOBAL_ROOM,
        isRead: false,
        senderId: { $ne: userId },
      });
      socket.emit("chat:unread", { unread });
    });

    // ── Leave / disconnect ──────────────────────────────────────────────────
    socket.on("chat:leave", () => {
      const uid = socket.data.userId as string | undefined;
      socket.leave(GLOBAL_ROOM);
      removeSocket(uid, socket.id);
    });

    socket.on("disconnect", () => {
      const uid = socket.data.userId as string | undefined;
      removeSocket(uid, socket.id);
      console.log(`[socket] disconnected: ${socket.id}`);
    });
  });

  return io;
}

function removeSocket(uid: string | undefined, socketId: string) {
  if (!uid) return;
  const sockets = userSockets.get(uid);
  if (sockets) {
    sockets.delete(socketId);
    if (sockets.size === 0) userSockets.delete(uid);
  }
}

/**
 * Broadcast a message from REST API (e.g. admin sends via POST /api/chat/messages).
 * Called from chatController when an admin sends via REST.
 */
export async function broadcastMessageFromRest(
  senderId: string,
  senderName: string,
  content: string,
  role: "admin" | "system" = "admin"
): Promise<void> {
  if (!io) return;

  const saved = await Message.create({
    conversationId: "global",
    role,
    senderId,
    senderName,
    content,
    isRead: false,
  });

  const dto = messageToDto(saved, senderId);
  io.to("global").emit("chat:message", dto);

  // Update unread for all non-senders
  const connectedUserIds = Array.from(userSockets.keys());
  await Promise.all(
    connectedUserIds.map(async (uid) => {
      if (uid === senderId) return;
      const unread = await Message.countDocuments({
        conversationId: "global",
        isRead: false,
        senderId: { $ne: uid },
      });
      const sockets = userSockets.get(uid);
      if (!sockets) return;
      for (const sid of sockets) {
        io!.to(sid).emit("chat:unread", { unread });
      }
    })
  );
}
