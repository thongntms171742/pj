/**
 * chat.socket.ts — Socket.IO namespace `/chat`.
 *
 * Trách nhiệm:
 *   - Xác thực JWT trong `handshake.auth.token` (bắt buộc, không có guest).
 *   - Quản lý room theo conversation / user / admin.
 *   - Nhận & phát tin nhắn realtime, typing, read receipt.
 *
 * Bảo mật:
 *   - Client CHỈ có thể join room `conversation:{id}` mà mình có quyền.
 *   - Tin nhắn `internal` chỉ phát tới room admin, không phát room conversation.
 *   - Rate limit theo user (số tin nhắn / giây).
 */

import { Server as SocketIOServer, Namespace, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { Conversation } from "../../../models/Conversation";
import { Message, type IMessage } from "../../../models/Message";
import { ErrorCode } from "../../../utils/errors";
import {
  CHAT_SOCKET_RATE_LIMIT,
  CHAT_SOCKET_RATE_LIMIT_WINDOW_MS,
} from "../../../config/chat.config";
import {
  ChatError,
  isAdmin,
  loadConversationForActor,
  type ChatActor,
} from "../services/chatPermission.service";
import * as messageService from "../services/message.service";
import * as conversationService from "../services/conversation.service";
import { consume } from "../services/chatRateLimit.service";
import { messageToDto, conversationToDto } from "../dto/chat.mapper";
import { getJwtSecret } from "../../../config/env";
import { registerChatNamespace, emitMessageNew, emitConversationUpdated } from "./chat.emitter";
import {
  ChatClientEvents,
  ChatRooms,
  ChatServerEvents,
  type ChatAck,
  type ChatSendMessagePayload,
} from "./chat.events";

interface SocketActor extends ChatActor {
  socketId: string;
}

interface JwtPayload {
  id: string;
  email: string;
  roles: string[];
}

/** socketId → actor (để disconnect dọn dẹp). */
const socketActors = new Map<string, SocketActor>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveActor(socket: Socket): SocketActor | null {
  const raw =
    (socket.handshake.auth?.token as string | undefined) ??
    (socket.handshake.query?.token as string | undefined) ??
    (socket.handshake.headers?.authorization as string | undefined)?.replace(
      /^Bearer /,
      ""
    );

  if (!raw) return null;

  try {
    // Đọc secret LAZY (runtime) — không capture ở module scope, vì `.env`
    // có thể chưa nạp xong khi module được require.
    const decoded = jwt.verify(raw, getJwtSecret()) as JwtPayload;
    if (!decoded?.id || !Types.ObjectId.isValid(decoded.id)) return null;
    return {
      userId: decoded.id,
      roles: decoded.roles ?? [],
      socketId: socket.id,
    };
  } catch {
    return null;
  }
}

function ackOk<T>(ack: ((r: ChatAck<T>) => void) | undefined, data: T): void {
  if (typeof ack === "function") ack({ ok: true, data });
}

function ackErr(
  ack: ((r: ChatAck<never>) => void) | undefined,
  err: unknown
): void {
  if (typeof ack !== "function") return;
  if (err instanceof ChatError) {
    ack({ ok: false, error: { code: err.code, message: err.message } });
    return;
  }
  ack({
    ok: false,
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: err instanceof Error ? err.message : "Lỗi không xác định",
    },
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * Khởi tạo chat socket trên namespace `/chat`.
 * Gọi 1 lần duy nhất từ `server.ts` sau khi tạo Socket.IO server.
 */
export function initChatSocket(io: SocketIOServer): void {
  const chatNamespace = io.of("/chat");

  // Đăng ký namespace vào emitter để service layer có thể phát event
  // (REST-triggered state changes cũng phải báo realtime).
  registerChatNamespace(chatNamespace);

  // ── Auth middleware ────────────────────────────────────────────────────────
  chatNamespace.use((socket, next) => {
    const actor = resolveActor(socket);
    if (!actor) {
      next(new Error("UNAUTHORIZED: token không hợp lệ hoặc thiếu"));
      return;
    }
    socket.data.actor = actor;
    next();
  });

  chatNamespace.on("connection", (socket: Socket) => {
    const actor = socket.data.actor as SocketActor;
    socketActors.set(socket.id, actor);

    // Join room cá nhân: mọi tab/thiết bị của user đều nhận event.
    socket.join(ChatRooms.user(actor.userId));

    // Admin join room admin để nhận tin nhắn nội bộ + handoff.
    if (isAdmin(actor)) {
      socket.join(ChatRooms.admins);
    }

    socket.emit(ChatServerEvents.CONNECTED, {
      userId: actor.userId,
      roles: actor.roles,
      serverTime: new Date().toISOString(),
    });

    // ── Subscribe / Unsubscribe ──────────────────────────────────────────────
    socket.on(
      ChatClientEvents.SUBSCRIBE,
      async (
        payload: { conversationId: string },
        ack?: (r: ChatAck) => void
      ) => {
        try {
          const conversation = await loadConversationForActor(
            payload.conversationId,
            actor
          );
          await socket.join(ChatRooms.conversation(String(conversation._id)));
          ackOk(ack, { conversationId: String(conversation._id) });
        } catch (err) {
          ackErr(ack, err);
        }
      }
    );

    socket.on(
      ChatClientEvents.UNSUBSCRIBE,
      async (
        payload: { conversationId: string },
        ack?: (r: ChatAck) => void
      ) => {
        try {
          await socket.leave(ChatRooms.conversation(payload.conversationId));
          ackOk(ack, { conversationId: payload.conversationId });
        } catch (err) {
          ackErr(ack, err);
        }
      }
    );

    // ── Gửi tin nhắn ─────────────────────────────────────────────────────────
    socket.on(
      ChatClientEvents.SEND_MESSAGE,
      async (payload: ChatSendMessagePayload, ack?: (r: ChatAck) => void) => {
        try {
          // Rate limit theo user.
          const limit = consume(
            `socket:msg:${actor.userId}`,
            CHAT_SOCKET_RATE_LIMIT,
            CHAT_SOCKET_RATE_LIMIT_WINDOW_MS
          );
          if (!limit.allowed) {
            throw new ChatError(
              ErrorCode.CHAT_RATE_LIMITED,
              "Bạn gửi tin quá nhanh. Vui lòng chậm lại.",
              429
            );
          }

          const { message, duplicate } = await messageService.sendMessage(
            actor,
            {
              conversationId: payload.conversationId,
              content: payload.content,
              messageType: payload.messageType,
              attachments: payload.attachments,
              clientMessageId: payload.clientMessageId,
              visibility: "public",
            }
          );

          // Service đã tự phát `message:new` + `conversation:updated` qua
          // emitter ⇒ không emit trùng ở đây.

          ackOk(ack, {
            message: messageToDto(message),
            duplicate,
          });
        } catch (err) {
          ackErr(ack, err);
        }
      }
    );

    // ── Typing ───────────────────────────────────────────────────────────────
    socket.on(
      ChatClientEvents.TYPING,
      async (
        payload: { conversationId: string; isTyping: boolean },
        ack?: (r: ChatAck) => void
      ) => {
        try {
          // Chỉ được báo typing trong conversation mình có quyền.
          await loadConversationForActor(payload.conversationId, actor);

          socket.to(ChatRooms.conversation(payload.conversationId)).emit(
            ChatServerEvents.TYPING,
            {
              conversationId: payload.conversationId,
              userId: actor.userId,
              isTyping: Boolean(payload.isTyping),
            }
          );

          ackOk(ack, { ok: true });
        } catch (err) {
          ackErr(ack, err);
        }
      }
    );

    // ── Mark read ───────────────────────────────────────────────────────────
    socket.on(
      ChatClientEvents.MARK_READ,
      async (
        payload: { conversationId: string },
        ack?: (r: ChatAck) => void
      ) => {
        try {
          const result = await messageService.markAsRead(
            payload.conversationId,
            actor
          );
          ackOk(ack, { markedCount: result.markedCount });
        } catch (err) {
          ackErr(ack, err);
        }
      }
    );

    // ── Ping ─────────────────────────────────────────────────────────────────
    socket.on(ChatClientEvents.PING, (ack?: (r: ChatAck) => void) => {
      ackOk(ack, { serverTime: new Date().toISOString() });
    });

    // ── Disconnect ───────────────────────────────────────────────────────────
    socket.on("disconnect", () => {
      socketActors.delete(socket.id);
    });
  });
}

// ── Export cho service khác phát event (VD: AI orchestrator) ──────────────────

/**
 * Phát tin nhắn mới tới 1 conversation (dùng bởi AI orchestrator khi AI trả lời).
 * Dùng emitter chung ⇒ không cần truyền `io` xung quanh.
 */
export function emitNewMessage(
  conversationId: string,
  message: IMessage
): void {
  emitMessageNew({
    conversationId,
    message: messageToDto(message),
  });
}

/**
 * Phát cập nhật conversation (dùng khi AI escalate, admin đóng, v.v.).
 */
export function emitConversationChanged(conversationId: string): void {
  void (async () => {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return;
    emitConversationUpdated({
      conversationId,
      conversation: conversationToDto(conversation),
    });
  })();
}

/** Số socket đang online (cho admin dashboard). */
export function onlineSocketCount(): number {
  return socketActors.size;
}
