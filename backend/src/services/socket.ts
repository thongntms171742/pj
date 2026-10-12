/**
 * socket.ts — Socket.io server for 1-1 chat (buyer ↔ admin)
 *
 * Events:
 *   client → server
 *     chat:join           { conversationId }   join a specific 1-1 room
 *     chat:send           { conversationId, content }   send in a 1-1 room
 *     chat:markRead       { conversationId, lastMessageId? }
 *     chat:leave          { conversationId }   leave a specific room
 *     chat:typing         { conversationId }   notify peer (not persisted)
 *
 *   server → client
 *     chat:message        MessageDto           new message in a conversation
 *     chat:unread         { unread }           total unread across all my convs
 *     chat:typing         { conversationId, userId, userName }
 *     chat:error          { message, code? }   error notification
 *
 * Auth: JWT verified on `io.use` middleware. `socket.data.userId` is set
 * before any handler runs. If a client sends a `conversationId` they're
 * not a participant in, the server REJECTS the action (returns
 * `chat:error` with code `FORBIDDEN_NOT_PARTICIPANT`).
 *
 * On connect, the server auto-joins the user to ALL conversation rooms
 * they're a participant in (queried from `Message.participants`). This
 * means FE doesn't need to emit `chat:join` for every conversation it
 * already knows about — messages just appear.
 */

import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { Message } from "../models/Message";
import { Notification } from "../models/Notification";
import { messageToDto } from "../dto/chat";
import {
  parseConversationId,
  isParticipant,
  getOtherParticipant,
  ADMIN_TEAM_ID,
} from "./conversation";

const JWT_SECRET = process.env.JWT_SECRET || "thriftit_super_secret_key_change_me";

let io: Server | null = null;

// userId → Set of socket ids (handles multi-tab)
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

/**
 * Find all conversationIds the user is currently a participant in.
 * Used to auto-join on connect.
 */
async function getMyConversations(userId: string): Promise<string[]> {
  const docs = await Message.aggregate([
    { $match: { participants: userId } },
    { $group: { _id: "$conversationId" } },
  ]);
  return docs.map((d: { _id: string }) => d._id);
}

/**
 * Compute total unread for a user across all their conversations.
 * - Admins: any message from a buyer where userId is a participant.
 * - Buyers: messages in their conv with admin.
 */
async function countUnreadForUser(userId: string, isAdmin: boolean): Promise<number> {
  const filter: Record<string, unknown> = {
    isRead: false,
    senderId: { $ne: userId },
  };
  if (isAdmin) {
    filter.participants = userId;
  } else {
    // Buyer: only the conversation with admin team.
    // Build the deterministic id by sorting.
    const sorted = [userId, ADMIN_TEAM_ID].sort();
    filter.conversationId = `c_${sorted[0]}__${sorted[1]}`;
  }
  return Message.countDocuments(filter);
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
    pingInterval: 20_000,
    pingTimeout: 25_000,
    upgradeTimeout: 30_000,
    maxHttpBufferSize: 1e6,
    allowEIO3: true,
  });

  // ── Auth middleware ──────────────────────────────────────────────────────
  io.use((socket, next) => {
    try {
      const fromAuth = (socket.handshake.auth as { token?: string } | undefined)?.token;
      const fromHeader = socket.handshake.headers.authorization?.startsWith("Bearer ")
        ? socket.handshake.headers.authorization.slice(7)
        : undefined;
      const token = (fromAuth ?? fromHeader ?? "").toString().trim();
      if (!token) return next(new Error("UNAUTHORIZED: token missing"));
      const decoded = jwt.verify(token, JWT_SECRET) as {
        id: string;
        email?: string;
        name?: string;
        roles?: string[];
      };
      socket.data.userId = decoded.id;
      socket.data.userName =
        (decoded as { name?: string }).name ??
        decoded.email?.split("@")[0] ??
        "User";
      socket.data.isAdmin =
        Array.isArray(decoded.roles) && decoded.roles.includes("admin");
      next();
    } catch {
      next(new Error("UNAUTHORIZED: invalid token"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const userId: string = socket.data.userId ?? "";
    const isAdmin: boolean = Boolean(socket.data.isAdmin);
    const userName: string = socket.data.userName ?? "User";
    if (!userId) {
      socket.emit("chat:error", { code: "UNAUTHORIZED", message: "Xác thực thất bại" });
      socket.disconnect(true);
      return;
    }
    console.log(`[socket] connected: ${socket.id} (user=${userId} admin=${isAdmin})`);

    // Track the socket for the user
    const existing = userSockets.get(userId) ?? new Set<string>();
    existing.add(socket.id);
    userSockets.set(userId, existing);

    // Auto-join all conversations I'm in
    getMyConversations(userId)
      .then((convIds) => {
        for (const cid of convIds) socket.join(cid);
        console.log(
          `[socket] ${userId} auto-joined ${convIds.length} conversation(s)`
        );
        return countUnreadForUser(userId, isAdmin);
      })
      .then((unread) => socket.emit("chat:unread", { unread }))
      .catch((err) => console.error("[socket] auto-join error:", err));

    // ── Join a specific conversation (idempotent; safe to call multiple times)
    socket.on(
      "chat:join",
      async (payload: { conversationId?: string }) => {
        const cid = (payload?.conversationId ?? "").toString();
        if (!cid) {
          socket.emit("chat:error", { code: "MISSING_FIELD", message: "conversationId là bắt buộc" });
          return;
        }
        if (!isParticipant(cid, userId)) {
          socket.emit("chat:error", {
            code: "FORBIDDEN_NOT_PARTICIPANT",
            message: "Bạn không phải thành viên của cuộc trò chuyện này",
          });
          return;
        }
        socket.join(cid);
        socket.emit("chat:joined", { conversationId: cid });
      }
    );

    // ── Send message ───────────────────────────────────────────────────────
    socket.on(
      "chat:send",
      async (payload: { conversationId?: string; content?: string }) => {
        const cid = (payload?.conversationId ?? "").toString();
        const content = (payload?.content ?? "").toString().trim();

        if (!cid) {
          socket.emit("chat:error", { code: "MISSING_FIELD", message: "conversationId là bắt buộc" });
          return;
        }
        if (!isParticipant(cid, userId)) {
          socket.emit("chat:error", {
            code: "FORBIDDEN_NOT_PARTICIPANT",
            message: "Bạn không phải thành viên của cuộc trò chuyện này",
          });
          return;
        }
        if (!content) {
          socket.emit("chat:error", { code: "INVALID_INPUT", message: "Tin nhắn không được để trống" });
          return;
        }
        if (content.length > 2000) {
          socket.emit("chat:error", { code: "INVALID_INPUT", message: "Tin nhắn tối đa 2000 ký tự" });
          return;
        }

        const parts = parseConversationId(cid);
        if (!parts) {
          socket.emit("chat:error", { code: "INVALID_CONVERSATION_ID", message: "conversationId không hợp lệ" });
          return;
        }

        const role: "user" | "admin" | "system" = isAdmin ? "admin" : "user";
        try {
          const saved = await Message.create({
            conversationId: cid,
            participants: [parts.a, parts.b],
            role,
            senderId: userId,
            senderName: userName,
            content,
            isRead: false,
          });

          const dto = messageToDto(saved, userId);

          // Broadcast ONLY to the conversation room (no leak to other buyers)
          io!.to(cid).emit("chat:message", dto);

          // Update unread count for the OTHER participant (if connected)
          const peerId = getOtherParticipant(cid, userId);
          if (peerId) {
            const peerSockets = userSockets.get(peerId);
            if (peerSockets) {
              const unread = await countUnreadForUser(peerId, peerId === "admin");
              for (const sid of peerSockets) {
                io!.to(sid).emit("chat:unread", { unread });
              }
            }
          }

          // Also notify the sender's other tabs that this conversation is fresh
          // (unread for sender is 0 — they sent it)
          const mySockets = userSockets.get(userId);
          if (mySockets) {
            const myUnread = await countUnreadForUser(userId, isAdmin);
            for (const sid of mySockets) {
              if (sid !== socket.id) {
                io!.to(sid).emit("chat:unread", { unread: myUnread });
              }
            }
          }

          // Persist a notification row for admin (so it appears in their
          // admin notification list, not just chat unread badge)
          if (role === "user" && peerId === "admin") {
            // best-effort: log a notification, don't block
            Notification.create({
              userId: new Types.ObjectId(),
              type: "chat",
              title: `Tin nhắn mới từ ${userName}`,
              message: content.length > 80 ? content.slice(0, 80) + "…" : content,
            }).catch(() => {});
          }
        } catch (err) {
          console.error("[socket] send error:", err);
          socket.emit("chat:error", { code: "INTERNAL_ERROR", message: "Gửi tin nhắn thất bại" });
        }
      }
    );

    // ── Mark messages as read in a specific conversation ───────────────────
    socket.on(
      "chat:markRead",
      async (payload: { conversationId?: string; lastMessageId?: string }) => {
        const cid = (payload?.conversationId ?? "").toString();
        if (!cid) {
          socket.emit("chat:error", { code: "MISSING_FIELD", message: "conversationId là bắt buộc" });
          return;
        }
        if (!isParticipant(cid, userId)) {
          socket.emit("chat:error", {
            code: "FORBIDDEN_NOT_PARTICIPANT",
            message: "Bạn không phải thành viên của cuộc trò chuyện này",
          });
          return;
        }
        const filter: Record<string, unknown> = {
          conversationId: cid,
          isRead: false,
          senderId: { $ne: userId },
        };
        if (payload?.lastMessageId) {
          try {
            filter._id = { $lte: new Types.ObjectId(payload.lastMessageId) };
          } catch {
            // ignore
          }
        }
        await Message.updateMany(filter, {
          isRead: true,
          readAt: new Date(),
          readBy: userId,
        });
        const unread = await countUnreadForUser(userId, isAdmin);
        socket.emit("chat:unread", { unread });
      }
    );

    // ── Typing indicator (not persisted) ───────────────────────────────────
    socket.on(
      "chat:typing",
      (payload: { conversationId?: string }) => {
        const cid = (payload?.conversationId ?? "").toString();
        if (!cid || !isParticipant(cid, userId)) return;
        socket.to(cid).emit("chat:typing", {
          conversationId: cid,
          userId,
          userName,
        });
      }
    );

    // ── Leave / disconnect ─────────────────────────────────────────────────
    socket.on("chat:leave", (payload: { conversationId?: string }) => {
      const cid = (payload?.conversationId ?? "").toString();
      if (cid) socket.leave(cid);
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
 * Broadcast a message from REST API (admin endpoint). Used by chatController
 * when admin posts a message via REST instead of socket.
 *
 * @param senderId    admin user id
 * @param senderName  display name
 * @param content     message text
 * @param role        "admin" or "system"
 * @param conversationId  target conversation (resolved by caller)
 * @param participants    sorted [a, b]
 * @param peerUserId     the OTHER participant (used to push unread update)
 */
export async function broadcastMessageFromRest(
  senderId: string,
  senderName: string,
  content: string,
  role: "admin" | "system" = "admin",
  conversationId?: string,
  participants?: { a: string; b: string },
  peerUserId?: string
): Promise<void> {
  if (!io) return;
  if (!conversationId || !participants) {
    throw new Error("broadcastMessageFromRest: conversationId & participants required");
  }

  const saved = await Message.create({
    conversationId,
    participants: [participants.a, participants.b],
    role,
    senderId,
    senderName,
    content,
    isRead: false,
  });

  const dto = messageToDto(saved, senderId);
  io.to(conversationId).emit("chat:message", dto);

  // Update unread for the peer
  if (peerUserId) {
    const peerSockets = userSockets.get(peerUserId);
    if (peerSockets && peerSockets.size > 0) {
      const isPeerAdmin = peerUserId === "admin";
      const unread = await countUnreadForUser(peerUserId, isPeerAdmin);
      for (const sid of peerSockets) {
        io.to(sid).emit("chat:unread", { unread });
      }
    }
  }
}
