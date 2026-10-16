import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { Conversation, ChatStatus } from "../../models/Conversation";
import { Message, MessageSenderType } from "../../models/Message";
import { User } from "../../models/User";
import { JwtPayload } from "../../middleware/auth";
import { processAiChatMessage } from "../ai/chatbotService";

const JWT_SECRET = process.env.JWT_SECRET || "thriftit_super_secret_key_change_me";

let io: SocketIOServer | null = null;

export interface SocketUser {
  userId?: string;
  name?: string;
  email?: string;
  isAdmin: boolean;
  sessionId?: string;
}

// Map socket id to user info
const socketUsers = new Map<string, SocketUser>();

/**
 * Initialize Socket.io on the HTTP server.
 */
export function initSocketServer(httpServer: HttpServer, existingIo?: SocketIOServer): SocketIOServer {
  io = existingIo || new SocketIOServer(httpServer, {
    cors: {
      origin: true,
      credentials: true,
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket: Socket) => {
    // 1. Initial Handshake / Auth
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace("Bearer ", "");
    const guestSessionId = socket.handshake.auth?.sessionId as string | undefined;

    let socketUser: SocketUser = {
      isAdmin: false,
      sessionId: guestSessionId,
    };

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
        socketUser.userId = decoded.id;
        socketUser.email = decoded.email;
        socketUser.isAdmin = Boolean(decoded.roles?.includes("admin"));
      } catch {
        // Invalid token; proceed as guest
      }
    }

    socketUsers.set(socket.id, socketUser);

    // 2. Admin Lobby Join
    socket.on("join_admin_lobby", () => {
      const user = socketUsers.get(socket.id);
      if (user?.isAdmin) {
        socket.join("admin_channel");
        socket.emit("admin_lobby_joined", { success: true });
      } else {
        socket.emit("error", { message: "Chỉ Admin mới có quyền truy cập kênh này" });
      }
    });

    // 3. Join a specific conversation room
    socket.on("join_conversation", async (data: { conversationId: string }) => {
      try {
        const { conversationId } = data;
        if (!conversationId) return;

        const conv = await Conversation.findById(conversationId);
        if (!conv) {
          socket.emit("error", { message: "Không tìm thấy phiên trò chuyện" });
          return;
        }

        const roomName = `conversation_${conversationId}`;
        socket.join(roomName);

        // If admin joined, reset unreadAdminCount
        const currentUser = socketUsers.get(socket.id);
        if (currentUser?.isAdmin) {
          conv.unreadAdminCount = 0;
          await conv.save();
        } else {
          conv.unreadUserCount = 0;
          await conv.save();
        }

        socket.emit("conversation_joined", { conversationId, status: conv.status });
      } catch (err) {
        console.error("[Socket] join_conversation error:", err);
      }
    });

    // 4. Leave a conversation room
    socket.on("leave_conversation", (data: { conversationId: string }) => {
      if (data?.conversationId) {
        socket.leave(`conversation_${data.conversationId}`);
      }
    });

    // 5. Send message within conversation
    socket.on("send_message", async (data: {
      conversationId: string;
      content: string;
      metadata?: any;
    }) => {
      try {
        const { conversationId, content, metadata } = data;
        if (!conversationId || !content?.trim()) return;

        const conv = await Conversation.findById(conversationId);
        if (!conv) {
          socket.emit("error", { message: "Không tìm thấy cuộc trò chuyện" });
          return;
        }

        const currentUser = socketUsers.get(socket.id);
        const isAdmin = Boolean(currentUser?.isAdmin);

        let senderType: MessageSenderType = isAdmin ? "ADMIN" : "USER";
        let senderName = isAdmin ? "Admin Support" : "Khách hàng";

        if (currentUser?.userId) {
          const userDoc = await User.findById(currentUser.userId).select("name");
          if (userDoc) {
            senderName = userDoc.name;
          }
        }

        // Create message in DB
        const message = await Message.create({
          conversationId: conv._id,
          senderType,
          senderId: currentUser?.userId ? currentUser.userId : undefined,
          senderName,
          content: content.trim(),
          metadata: metadata || {},
        });

        // Update conversation summary & counter
        conv.lastMessage = content.trim();
        conv.lastMessageAt = new Date();
        if (isAdmin) {
          conv.unreadUserCount += 1;
        } else {
          conv.unreadAdminCount += 1;
        }
        await conv.save();

        const roomName = `conversation_${conversationId}`;
        // Broadcast new message to anyone in conversation room
        io?.to(roomName).emit("new_message", {
          message,
          conversation: {
            id: conv._id,
            status: conv.status,
            lastMessageAt: conv.lastMessageAt,
          },
        });

        // Also broadcast update to admin lobby so their sidebar list updates realtime
        io?.to("admin_channel").emit("conversation_updated", {
          conversationId: conv._id,
          lastMessage: conv.lastMessage,
          lastMessageAt: conv.lastMessageAt,
          status: conv.status,
          unreadAdminCount: conv.unreadAdminCount,
          customerInfo: conv.customerInfo,
        });

        // If conversation is in BOT_ACTIVE mode and sender is USER, process AI response
        if (conv.status === "BOT_ACTIVE" && senderType === "USER") {
          processAiChatMessage(String(conv._id), content.trim()).catch((err) => {
            console.error("[Socket] processAiChatMessage error:", err);
          });
        }
      } catch (err) {
        console.error("[Socket] send_message error:", err);
        socket.emit("error", { message: "Không thể gửi tin nhắn" });
      }
    });

    // 6. User requests human escalation
    socket.on("request_human_support", async (data: { conversationId: string; reason?: string }) => {
      try {
        const { conversationId, reason } = data;
        const conv = await Conversation.findById(conversationId);
        if (!conv) return;

        conv.status = "WAITING_ADMIN";
        conv.summary = reason || "Khách hàng yêu cầu hỗ trợ từ tư vấn viên";
        await conv.save();

        // Create system notice message
        const sysMsg = await Message.create({
          conversationId: conv._id,
          senderType: "SYSTEM",
          senderName: "Hệ thống",
          content: "Đã gửi yêu cầu kết nối với tư vấn viên. Vui lòng chờ trong giây lát...",
          metadata: { action: "ESCALATION_REQUESTED", reason },
        });

        const roomName = `conversation_${conversationId}`;
        io?.to(roomName).emit("new_message", { message: sysMsg, status: conv.status });
        io?.to(roomName).emit("status_changed", { conversationId: conv._id, status: conv.status });

        // Alert all admins in admin_channel
        io?.to("admin_channel").emit("new_support_ticket", {
          conversationId: conv._id,
          customerInfo: conv.customerInfo,
          summary: conv.summary,
          lastMessageAt: conv.lastMessageAt,
          unreadAdminCount: conv.unreadAdminCount,
        });
      } catch (err) {
        console.error("[Socket] request_human_support error:", err);
      }
    });

    // 7. Admin accepts conversation
    socket.on("admin_accept_conversation", async (data: { conversationId: string }) => {
      try {
        const currentUser = socketUsers.get(socket.id);
        if (!currentUser?.isAdmin) {
          socket.emit("error", { message: "Không có quyền thực hiện hành động này" });
          return;
        }

        const { conversationId } = data;
        const conv = await Conversation.findById(conversationId);
        if (!conv) return;

        conv.status = "ADMIN_ACTIVE";
        if (currentUser.userId) {
          conv.assignedAdminId = currentUser.userId as any;
        }
        await conv.save();

        let adminName = "Tư vấn viên";
        if (currentUser.userId) {
          const userDoc = await User.findById(currentUser.userId).select("name");
          if (userDoc) adminName = userDoc.name;
        }

        // Create system join message
        const sysMsg = await Message.create({
          conversationId: conv._id,
          senderType: "SYSTEM",
          senderName: "Hệ thống",
          content: `${adminName} đã tham gia cuộc trò chuyện và sẽ hỗ trợ bạn.`,
          metadata: { action: "ADMIN_ACCEPTED", adminName },
        });

        const roomName = `conversation_${conversationId}`;
        io?.to(roomName).emit("new_message", { message: sysMsg, status: conv.status });
        io?.to(roomName).emit("status_changed", {
          conversationId: conv._id,
          status: conv.status,
          assignedAdminName: adminName,
        });

        // Notify admin lobby of assignment
        io?.to("admin_channel").emit("conversation_assigned", {
          conversationId: conv._id,
          assignedAdminId: currentUser.userId,
          status: conv.status,
        });
      } catch (err) {
        console.error("[Socket] admin_accept_conversation error:", err);
      }
    });

    // 8. Admin resolves / closes conversation
    socket.on("admin_resolve_conversation", async (data: { conversationId: string }) => {
      try {
        const currentUser = socketUsers.get(socket.id);
        if (!currentUser?.isAdmin) {
          socket.emit("error", { message: "Không có quyền thực hiện hành động này" });
          return;
        }

        const { conversationId } = data;
        const conv = await Conversation.findById(conversationId);
        if (!conv) return;

        conv.status = "RESOLVED";
        await conv.save();

        const sysMsg = await Message.create({
          conversationId: conv._id,
          senderType: "SYSTEM",
          senderName: "Hệ thống",
          content: "Cuộc trò chuyện đã được kết thúc bởi tư vấn viên. Cảm ơn bạn đã liên hệ!",
          metadata: { action: "CONVERSATION_RESOLVED" },
        });

        const roomName = `conversation_${conversationId}`;
        io?.to(roomName).emit("new_message", { message: sysMsg, status: conv.status });
        io?.to(roomName).emit("status_changed", {
          conversationId: conv._id,
          status: conv.status,
        });

        io?.to("admin_channel").emit("conversation_resolved", {
          conversationId: conv._id,
          status: conv.status,
        });
      } catch (err) {
        console.error("[Socket] admin_resolve_conversation error:", err);
      }
    });

    // 9. Typing indicators
    socket.on("typing", (data: { conversationId: string; name?: string }) => {
      if (!data?.conversationId) return;
      const currentUser = socketUsers.get(socket.id);
      socket.to(`conversation_${data.conversationId}`).emit("user_typing", {
        conversationId: data.conversationId,
        isAdmin: Boolean(currentUser?.isAdmin),
        name: data.name || (currentUser?.isAdmin ? "Tư vấn viên" : "Khách hàng"),
      });
    });

    socket.on("stop_typing", (data: { conversationId: string }) => {
      if (!data?.conversationId) return;
      socket.to(`conversation_${data.conversationId}`).emit("user_stop_typing", {
        conversationId: data.conversationId,
      });
    });

    // 10. Disconnect
    socket.on("disconnect", () => {
      socketUsers.delete(socket.id);
    });
  });

  return io;
}

/**
 * Access the initialized Socket.io Server instance from any controller or service.
 */
export function getSocketIO(): SocketIOServer | null {
  return io;
}
