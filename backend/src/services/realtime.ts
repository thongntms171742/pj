import { Server as SocketIOServer } from "socket.io";

let io: SocketIOServer | null = null;

export function setRealtimeIO(serverIo: SocketIOServer): void {
  io = serverIo;
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
  if (!io || !userId) return;
  const userRoom = `user:${userId}`;
  io.of("/chat").to(userRoom).emit("order:paid", payload);
  io.of("/chat").to(userRoom).emit("payment:success", payload);
  io.to(userRoom).emit("order:paid", payload);
  io.to(userRoom).emit("payment:success", payload);
}
