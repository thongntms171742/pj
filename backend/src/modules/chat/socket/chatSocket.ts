import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket, Namespace } from "socket.io";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { Conversation, IConversation } from "../../../models/Conversation";
import { Message } from "../../../models/Message";
import { User } from "../../../models/User";
import { ChatActor, actorKey, guestKey, isGuestKey } from "../services/chatAccess";
import { sendMessage, listMessages, countUnread } from "../services/messageService";
import { setParticipantLastRead } from "../services/conversationService";
import { messageToDto, conversationToDto, ChatMessageDto } from "../dto/chat";
import { registerUserSocket, unregisterUserSocket } from "../../../services/realtime";

const JWT_SECRET = process.env.JWT_SECRET || "thriftit_super_secret_key_change_me";

let chatNamespace: Namespace | null = null;

// Map socket.id -> ChatActor
const socketActors = new Map<string, ChatActor>();

export function getChatNamespace(): Namespace | null {
  return chatNamespace;
}

/**
 * Broadcast một message mới tới conversation room và update unread / conversation status.
 */
export async function broadcastNewMessage(
  conversationId: string | Types.ObjectId,
  messageRecord: any,
  convDoc?: any
): Promise<void> {
  if (!chatNamespace) return;

  const convIdStr = String(conversationId);
  const conv =
    convDoc ||
    (await Conversation.findById(conversationId).populate("assignedAdminId", "name email avatarUrl"));
  if (!conv) return;

  const room = `conv_${convIdStr}`;

  // Emit chat:message tới room
  // Note: isOwn phụ thuộc vào từng client xem, nhưng trong room chúng ta emit generic (hoặc client tự check senderId)
  const genericDto = messageToDto(messageRecord);
  chatNamespace.to(room).emit("chat:message", genericDto);

  // Emit conversation update tới room & admins
  const convDto = conversationToDto(conv, 0);
  chatNamespace.to(room).emit("chat:conversation", convDto);
  chatNamespace.to("admins").emit("chat:conversation", convDto);

  // Cập nhật unread cho các participants
  if (Array.isArray(conv.participants)) {
    for (const p of conv.participants) {
      if (!p.userId || p.userId === messageRecord.sender?.userId) continue;

      const unreadForUser = await countUnread(conv._id, p.userId, {
        isAdmin: p.role === "admin",
      });

      // Gửi unread tới room riêng của participant: `user_<userId>`
      chatNamespace.to(`user_${p.userId}`).emit("chat:unread", {
        total: unreadForUser,
        byConversation: { [convIdStr]: unreadForUser },
      });
    }
  }
}

/**
 * Broadcast status change tới room và admin lobby
 */
export function broadcastStatusChange(
  conversationId: string | Types.ObjectId,
  status: string,
  assignedAdmin?: { id: string; name: string } | null
): void {
  if (!chatNamespace) return;
  const convIdStr = String(conversationId);
  const room = `conv_${convIdStr}`;
  const payload = { conversationId: convIdStr, status, assignedAdmin };

  chatNamespace.to(room).emit("chat:status", payload);
  chatNamespace.to("admins").emit("chat:status", payload);
}

/**
 * Khởi tạo Chat Socket namespace "/chat" trên Socket.io server.
 */
export function initChatSocket(io: SocketIOServer): Namespace {
  chatNamespace = io.of("/chat");

  // Middleware Auth
  chatNamespace.use(async (socket: Socket, next) => {
    try {
      const fromAuth = (socket.handshake.auth as { token?: string; sessionId?: string }) || {};
      const fromHeaders = socket.handshake.headers || {};
      const token =
        fromAuth.token ||
        (typeof fromHeaders.authorization === "string" && fromHeaders.authorization.startsWith("Bearer ")
          ? fromHeaders.authorization.slice(7)
          : undefined);

      const guestSessionId =
        fromAuth.sessionId ||
        (fromHeaders["x-chat-session-id"] as string) ||
        (fromHeaders["x-session-id"] as string);

      if (token) {
        try {
          const decoded = jwt.verify(token, JWT_SECRET) as {
            id: string;
            email?: string;
            name?: string;
            roles?: string[];
          };

          const user = await User.findById(decoded.id).select("name email roles accountStatus").lean();
          if (user && user.accountStatus !== "suspended") {
            const isAdmin = Array.isArray(user.roles) && user.roles.includes("admin");
            socketActors.set(socket.id, {
              userId: String(user._id),
              isAdmin,
              name: user.name || user.email?.split("@")[0] || "User",
              sessionId: guestSessionId,
            });
            return next();
          }
        } catch {
          // Token không hợp lệ -> fallback qua guest nếu có sessionId
        }
      }

      // Guest Actor
      if (guestSessionId) {
        socketActors.set(socket.id, {
          sessionId: String(guestSessionId).trim(),
          isAdmin: false,
          name: "Khách hàng",
        });
        return next();
      }

      // Không có token & không có sessionId -> vẫn cho connect tạm với anonymous guest id
      const anonSession = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      socketActors.set(socket.id, {
        sessionId: anonSession,
        isAdmin: false,
        name: "Khách hàng",
      });
      next();
    } catch (err: any) {
      next(err);
    }
  });

  chatNamespace.on("connection", async (socket: Socket) => {
    const actor = socketActors.get(socket.id) || { sessionId: "unknown", isAdmin: false };
    const myKey = actorKey(actor);

    // Join room user riêng để nhận unread / notification cá nhân: `user_<key>`
    if (myKey) {
      socket.join(`user_${myKey}`);
      if (actor.userId) {
        registerUserSocket(actor.userId, socket.id);
      }
    }

    // Nếu là admin -> join room 'admins'
    if (actor.isAdmin) {
      socket.join("admins");
    }

    // Auto-join tất cả conversation mà actor là participant
    try {
      const query: any = {};
      if (actor.isAdmin) {
        // Admin join các conversation đang WAITING_ADMIN hoặc ADMIN_ACTIVE mà mình phụ trách
        query.$or = [{ "participants.userId": actor.userId }, { status: "WAITING_ADMIN" }];
      } else if (myKey) {
        query["participants.userId"] = myKey;
      }

      const convs = await Conversation.find(query).select("_id").lean();
      for (const c of convs) {
        socket.join(`conv_${c._id}`);
      }
    } catch (err) {
      console.error("[chatSocket] Auto-join error:", err);
    }

    // ── C → S: chat:join ───────────────────────────────────────────────────
    socket.on("chat:join", async (payload: { conversationId?: string }) => {
      try {
        const { conversationId } = payload || {};
        if (!conversationId || !Types.ObjectId.isValid(conversationId)) {
          socket.emit("chat:error", { code: "CHAT_INVALID_ID", message: "conversationId không hợp lệ" });
          return;
        }

        const conv = await Conversation.findById(conversationId);
        if (!conv) {
          socket.emit("chat:error", { code: "CHAT_CONVERSATION_NOT_FOUND", message: "Không tìm thấy cuộc trò chuyện" });
          return;
        }

        // Quyền: admin hoặc participant
        const isParticipant = conv.participants.some((p) => p.userId === myKey);
        if (!actor.isAdmin && !isParticipant) {
          socket.emit("chat:error", {
            code: "CHAT_FORBIDDEN",
            message: "Bạn không có quyền tham gia cuộc trò chuyện này",
          });
          return;
        }

        socket.join(`conv_${conversationId}`);

        // Tự động mark read khi join room
        if (myKey && isParticipant) {
          await setParticipantLastRead(conv._id, myKey, new Date());
          const unread = await countUnread(conv._id, myKey, { isAdmin: actor.isAdmin });
          socket.emit("chat:unread", { total: unread, byConversation: { [String(conv._id)]: unread } });
        }
      } catch (err: any) {
        console.error("[chatSocket] chat:join error:", err);
        socket.emit("chat:error", { code: "INTERNAL_ERROR", message: "Lỗi tham gia phòng chat" });
      }
    });

    // ── C → S: chat:send ───────────────────────────────────────────────────
    socket.on(
      "chat:send",
      async (payload: { conversationId?: string; content?: string; metadata?: Record<string, unknown> }) => {
        try {
          const { conversationId, content, metadata } = payload || {};
          if (!conversationId || !Types.ObjectId.isValid(conversationId)) {
            socket.emit("chat:error", { code: "CHAT_INVALID_ID", message: "conversationId không hợp lệ" });
            return;
          }

          if (!content || !content.trim()) {
            socket.emit("chat:error", { code: "CHAT_EMPTY_CONTENT", message: "Nội dung tin nhắn không được rỗng" });
            return;
          }

          const conv = await Conversation.findById(conversationId);
          if (!conv) {
            socket.emit("chat:error", {
              code: "CHAT_CONVERSATION_NOT_FOUND",
              message: "Không tìm thấy cuộc trò chuyện",
            });
            return;
          }

          const isParticipant = conv.participants.some((p) => p.userId === myKey);
          if (!actor.isAdmin && !isParticipant) {
            socket.emit("chat:error", {
              code: "CHAT_FORBIDDEN",
              message: "Bạn không có quyền gửi tin vào cuộc trò chuyện này",
            });
            return;
          }

          const senderType = actor.isAdmin ? "ADMIN" : "USER";
          const senderName = actor.name || (actor.isAdmin ? "Admin Support" : "Khách hàng");

          const savedMessage = await sendMessage({
            conversationId: conv._id,
            sender: {
              type: senderType,
              userId: myKey,
              name: senderName,
            },
            content: content.trim(),
            metadata,
          });

          // Broadcast qua socket
          await broadcastNewMessage(conv._id, savedMessage, conv);

          // Nếu là channel AI và trạng thái BOT_ACTIVE và người gửi là USER -> trigger Bot reply async
          if (conv.channel === "AI" && conv.status === "BOT_ACTIVE" && senderType === "USER") {
            const { processAiChatMessage } = await import("../../../services/ai/chatbotService");
            processAiChatMessage(String(conv._id), content.trim(), {
              userId: actor.userId,
              sessionId: actor.sessionId,
            }).catch((botErr: any) => {
              console.error("[chatSocket] Bot reply error:", botErr);
            });
          }
        } catch (err: any) {
          console.error("[chatSocket] chat:send error:", err);
          socket.emit("chat:error", {
            code: err.code || "INTERNAL_ERROR",
            message: err.message || "Gửi tin nhắn thất bại",
          });
        }
      }
    );

    // ── C → S: chat:read ───────────────────────────────────────────────────
    socket.on("chat:read", async (payload: { conversationId?: string; lastMessageId?: string }) => {
      try {
        const { conversationId } = payload || {};
        if (!conversationId || !Types.ObjectId.isValid(conversationId)) return;

        if (myKey) {
          await setParticipantLastRead(conversationId, myKey, new Date());
          const unread = await countUnread(conversationId, myKey, { isAdmin: actor.isAdmin });
          socket.emit("chat:unread", { total: unread, byConversation: { [conversationId]: unread } });
        }
      } catch (err) {
        console.error("[chatSocket] chat:read error:", err);
      }
    });

    // ── C → S: chat:typing ─────────────────────────────────────────────────
    socket.on("chat:typing", (payload: { conversationId?: string }) => {
      const { conversationId } = payload || {};
      if (!conversationId) return;

      socket.to(`conv_${conversationId}`).emit("chat:typing", {
        conversationId,
        userId: myKey,
        userName: actor.name || "Khách hàng",
      });
    });

    // ── C → S: chat:leave ──────────────────────────────────────────────────
    socket.on("chat:leave", (payload: { conversationId?: string }) => {
      const { conversationId } = payload || {};
      if (conversationId) {
        socket.leave(`conv_${conversationId}`);
      }
    });

    // ── Disconnect ─────────────────────────────────────────────────────────
    socket.on("disconnect", () => {
      if (actor.userId) {
        unregisterUserSocket(actor.userId, socket.id);
      }
      socketActors.delete(socket.id);
    });
  });

  return chatNamespace;
}
