import { Server as SocketIOServer } from "socket.io";

let io: SocketIOServer | null = null;

// userId -> Set of socket ids for realtime notifications (orders, payments)
const userSockets = new Map<string, Set<string>>();

export function setRealtimeIO(serverIo: SocketIOServer): void {
  io = serverIo;
}

export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error("Socket.io chưa được khởi tạo. Hãy gọi initSocket / setRealtimeIO trước.");
  }
  return io;
}

export function registerUserSocket(userId: string, socketId: string): void {
  if (!userId) return;
  const existing = userSockets.get(userId) ?? new Set<string>();
  existing.add(socketId);
  userSockets.set(userId, existing);
}

export function unregisterUserSocket(userId: string, socketId: string): void {
  if (!userId) return;
  const sockets = userSockets.get(userId);
  if (sockets) {
    sockets.delete(socketId);
    if (sockets.size === 0) {
      userSockets.delete(userId);
    }
  }
}

/**
 * Phát sự kiện realtime tới các tab trình duyệt của khách hàng khi đơn hàng được thanh toán thành công (qua SePay hoặc cổng khác).
 */
export function emitOrderPaymentUpdate(
  userId: string,
  payload: {
    orderCode: string;
    orderId: string;
    status: string;
    totalAmount: number;
    transactionId?: string;
  }
): void {
  if (!io) return;
  const userRoom = userSockets.get(userId);
  if (userRoom && userRoom.size > 0) {
    for (const sid of userRoom) {
      io.to(sid).emit("order:paid", payload);
      io.to(sid).emit("payment:success", payload);
    }
  }
}
