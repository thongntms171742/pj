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
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { Message } from "../models/Message";
import { Notification } from "../models/Notification";
import { messageToDto } from "../dto/chat";

const JWT_SECRET = process.env.JWT_SECRET || "thriftit_super_secret_key_change_me";

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

  // ── Auth middleware: verify JWT on every socket connection ─────────────
  // Client must pass token in `auth.token` (recommended) or `Authorization`
  // header. Token is the same JWT issued by /api/auth/login.
  io.use((socket, next) => {
    try {
      const fromAuth = (socket.handshake.auth as { token?: string } | undefined)?.token;
      const fromHeader = socket.handshake.headers.authorization?.startsWith("Bearer ")
        ? socket.handshake.headers.authorization.slice(7)
        : undefined;
      const token = (fromAuth ?? fromHeader ?? "").toString().trim();
      if (!token) {
        return next(new Error("UNAUTHORIZED: token missing"));
      }
      const decoded = jwt.verify(token, JWT_SECRET) as {
        id: string;
        email?: string;
        roles?: string[];
      };
      socket.data.userId = decoded.id;
      socket.data.userName = (decoded as { name?: string }).name ?? decoded.email?.split("@")[0] ?? "User";
      socket.data.isAdmin = Array.isArray(decoded.roles) && decoded.roles.includes("admin");
      next();
    } catch {
      next(new Error("UNAUTHORIZED: invalid token"));
    }
  });

  const GLOBAL_ROOM = "global";

  io.on("connection", (socket: Socket) => {
    // Auth middleware guarantees these are set — but be defensive.
    const userId: string = socket.data.userId ?? "";
    const isAdmin: boolean = Boolean(socket.data.isAdmin);
    const userName: string = socket.data.userName ?? "User";
    if (!userId) {
      socket.emit("chat:error", { message: "Xác thực thất bại" });
      socket.disconnect(true);
      return;
    }
    console.log(`[socket] connected: ${socket.id} (user=${userId} admin=${isAdmin})`);

    // Auto-join on connection so the client doesn't have to emit chat:join
    socket.join(GLOBAL_ROOM);
    const existing = userSockets.get(userId) ?? new Set<string>();
    existing.add(socket.id);
    userSockets.set(userId, existing);
    console.log(`[socket] ${userId} auto-joined global room (${existing.size} tab(s))`);

    // Send initial unread count for this user
    Message.countDocuments({
      conversationId: GLOBAL_ROOM,
      isRead: false,
      senderId: { $ne: userId },
    })
      .then((unread) => socket.emit("chat:unread", { unread }))
      .catch((err) => console.error("[socket] initial unread error:", err));

    // Optional re-join (kept for back-compat with FE that still emit chat:join)
    socket.on("chat:join", async (_payload: { userId: string }) => {
      // No-op: connection handler already auto-joined. Just refresh unread.
      const unread = await Message.countDocuments({
        conversationId: GLOBAL_ROOM,
        isRead: false,
        senderId: { $ne: userId },
      });
      socket.emit("chat:unread", { unread });
    });

    // ── Send message ─────────────────────────────────────────────────────────
    socket.on("chat:send", async (payload: { content: string }) => {
      const content = (payload?.content ?? "").toString().trim();
      if (!content) {
        socket.emit("chat:error", { message: "Tin nhắn không được để trống" });
        return;
      }
      if (content.length > 2000) {
        socket.emit("chat:error", { message: "Tin nhắn tối đa 2000 ký tự" });
        return;
      }

      const role: "user" | "admin" | "system" = isAdmin ? "admin" : "user";

      try {
        const saved = await Message.create({
          conversationId: GLOBAL_ROOM,
          role,
          senderId: userId,
          senderName: userName,
          content,
          isRead: false,
        });

        const dto = messageToDto(saved, userId);

        // Broadcast to ALL in the room (all tabs + all users)
        io!.to(GLOBAL_ROOM).emit("chat:message", dto);

        // Broadcast updated unread count to every other connected user
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
            title: `Tin nhắn mới từ ${userName}`,
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
      socket.leave(GLOBAL_ROOM);
      removeSocket(userId, socket.id);
    });

    socket.on("disconnect", () => {
      removeSocket(userId, socket.id);
      console.log(`[socket] disconnected: ${socket.id} (user=${userId})`);
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
