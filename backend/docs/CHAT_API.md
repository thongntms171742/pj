# Chat API Specification — Unified Model (v3)

> **Version:** 3.0 · **Backend Status:** ✅ Deployed · **Architecture:** 1 Model Duy Nhất (Single Source of Truth)
>
> **Tóm tắt thay đổi cốt lõi từ v2:**
> 1. **Bãi bỏ hoàn toàn convention định danh chuỗi `c_<a>__<b>` và collection messages trôi nổi.** Mọi hội thoại (Chatbot AI và Hỗ trợ Tư vấn viên) đều lưu dưới dạng 1 document chuẩn trong collection `conversations`.
> 2. **Hợp nhất Socket.IO về namespace duy nhất `/chat`:** Bỏ hoàn toàn 2 hệ socket rời rạc, chuẩn hóa hệ event C → S và S → C.
> 3. **Cơ chế Read-state theo participant:** Đọc tin nhắn dựa trên mốc `participants[].lastReadAt` so với `Message.createdAt`. Xoá bỏ cờ `isRead: false` phẳng gây tràn badge unread.
> 4. **Tách biệt sender rõ ràng:** Phân loại `senderType: "USER" | "BOT" | "ADMIN" | "SYSTEM"`, khắc phục lỗi admin bị gán role "buyer".

---

## 1. Bảng tra cứu chuyển đổi nhanh (Mapping v2 → v3)

### 1.1 REST Endpoints

| Mục đích | v2 Legacy | v3 Unified (Mới) | Auth |
| :--- | :--- | :--- | :--- |
| **Mở/Tạo hội thoại** | `POST /api/chat/conversations`<br>`POST /api/chat/ai/conversations` | `POST /api/chat/conversations`<br>`Body: { channel: "AI" \| "SUPPORT", sessionId? }` | Optional |
| **Danh sách hội thoại của tôi** | `GET /api/chat/conversations` (1-1 peer)<br>`GET /api/chat/ai/conversations` | `GET /api/chat/conversations` | Require |
| **Lấy tin nhắn hội thoại** | `GET /api/chat/conversations/:peerId/messages`<br>`GET /api/chat/ai/conversations/:id/messages` | `GET /api/chat/conversations/:id/messages?limit=&before=` | Optional |
| **Gửi tin nhắn** | `POST /api/chat/conversations/:peerId/messages`<br>`POST /api/chat/ai/conversations/:id/messages` | `POST /api/chat/conversations/:id/messages`<br>`Body: { content, metadata? }` | Optional |
| **Đánh dấu đã đọc** | `POST /api/chat/conversations/:peerId/markRead` | `POST /api/chat/conversations/:id/read` | Optional |
| **Yêu cầu gặp Admin (Escalate)** | `POST /api/chat/conversations/:id/escalate`<br>`POST /api/chat/ai/conversations/:id/escalate` | `POST /api/chat/conversations/:id/escalate`<br>`Body: { reason? }` | Optional |
| **Tổng số tin chưa đọc** | `GET /api/chat/unread` | `GET /api/chat/unread` | Require |
| **Admin: Danh sách hội thoại** | `GET /api/chat/admin/conversations`<br>`GET /api/chat/ai/admin/conversations` | `GET /api/chat/admin/conversations?channel=&status=&page=&limit=` | Admin |
| **Admin: Đổi trạng thái** | `PUT /api/chat/admin/conversations/:id/status` | `PUT /api/chat/admin/conversations/:id/status`<br>`Body: { status }` | Admin |
| **Admin: Tiếp nhận ca trực** | *(chưa có endpoint riêng)* | `POST /api/chat/admin/conversations/:id/assign` | Admin |

### 1.2 Socket Events (Namespace `/chat`)

| Event C → S | v2 AI | v2 1-1 | v3 Unified (Namespace `/chat`) | Payload |
| :--- | :--- | :--- | :--- | :--- |
| **Vào phòng chat** | `join_conversation` | `chat:join` | `chat:join` | `{ conversationId }` |
| **Gửi tin nhắn** | `send_message` | `chat:send` | `chat:send` | `{ conversationId, content, metadata? }` |
| **Đánh dấu đã đọc** | *(không có)* | `chat:markRead` | `chat:read` | `{ conversationId, lastMessageId? }` |
| **Đang nhập văn bản** | `typing` / `stop_typing`| `chat:typing` | `chat:typing` | `{ conversationId }` |
| **Rời phòng chat** | `leave_conversation` | `chat:leave` | `chat:leave` | `{ conversationId }` |

| Event S → C | v2 AI | v2 1-1 | v3 Unified (Namespace `/chat`) | Payload |
| :--- | :--- | :--- | :--- | :--- |
| **Tin nhắn mới** | `new_message` | `chat:message` | `chat:message` | `ChatMessageDto` |
| **Cập nhật hội thoại** | `conversation_updated`| *(không có)* | `chat:conversation` | `ChatConversationDto` |
| **Số tin chưa đọc** | *(không có)* | `chat:unread` | `chat:unread` | `{ total: number, byConversation: Record<string, number> }` |
| **Đổi trạng thái** | `status_changed` | *(không có)* | `chat:status` | `{ conversationId, status, assignedAdmin? }` |
| **Báo đang nhập** | `user_typing` | `chat:typing` | `chat:typing` | `{ conversationId, userId, userName }` |
| **Lỗi thao tác** | `error` | `chat:error` | `chat:error` | `{ code: string, message: string }` |

### 1.3 Trường dữ liệu DTO

| DTO | Trường cũ (v2) | Trường mới (v3) | Ghi chú thay đổi |
| :--- | :--- | :--- | :--- |
| **Message** | `_id` | `id` | Chuẩn hoá string hex không có gạch dưới |
| **Message** | `role: "buyer" \| "admin"` | `senderType: "USER" \| "BOT" \| "ADMIN" \| "SYSTEM"` | Phân loại chính xác người phát ngôn |
| **Message** | `isRead: boolean` | *(bỏ trên Message)* | Tính tự động từ `Conversation.participants[].lastReadAt` |
| **Conversation**| `conversationId` | `id` | ObjectId hex duy nhất của Conversation document |
| **Conversation**| *(không có)* | `channel: "AI" \| "SUPPORT"` | Phân biệt trợ lý AI và nhân viên hỗ trợ |

---

## 2. TypeScript Data Transfer Objects (DTO)

```typescript
export type ChatChannel = "AI" | "SUPPORT";
export type ChatStatus = "BOT_ACTIVE" | "WAITING_ADMIN" | "ADMIN_ACTIVE" | "RESOLVED";
export type MessageSenderType = "USER" | "BOT" | "ADMIN" | "SYSTEM";

export interface ChatMessageDto {
  id: string;
  conversationId: string;
  senderType: MessageSenderType;
  senderId: string | null;
  senderName: string;
  content: string;
  metadata: {
    quickReplies?: string[];
    suggestedProducts?: Array<{
      id: string;
      type: "tree" | "accessory";
      name: string;
      price: number;
      imageUrl?: string;
    }>;
    orderInfo?: {
      orderId: string;
      orderCode?: string;
      status: string;
      totalAmount: number;
    };
    [key: string]: unknown;
  };
  sentAt: string; // ISO 8601
  isOwn: boolean; // True nếu tin nhắn do chính người đang xem gửi
}

export interface ChatConversationDto {
  id: string;
  channel: ChatChannel;
  status: ChatStatus;
  peer: {
    id: string;
    name: string;
    avatarUrl?: string;
    role: string;
  };
  lastMessage: {
    content: string;
    sentAt: string;
    senderType: string;
  } | null;
  unread: number;
  updatedAt: string; // ISO 8601
  assignedAdmin?: {
    id: string;
    name: string;
  } | null;
}
```

---

## 3. Đặc tả REST API Chi tiết

### 3.1 Mở hoặc tạo phiên chat
- **Endpoint:** `POST /api/chat/conversations`
- **Auth:** Optional (Khách vãng lai gửi `sessionId` qua body hoặc header `x-chat-session-id`, user đăng nhập gửi token `Authorization: Bearer <token>`).
- **Body:**
  ```json
  {
    "channel": "AI", // "AI" (mặc định) hoặc "SUPPORT"
    "sessionId": "guest_179343...",
    "customerInfo": {
      "name": "Nguyễn Văn A",
      "phone": "0901234567",
      "email": "vana@example.com"
    }
  }
  ```
- **Response 200 OK:**
  ```json
  {
    "conversation": {
      "id": "6724a...",
      "channel": "AI",
      "status": "BOT_ACTIVE",
      "peer": { "id": "ai_bot", "name": "Trợ lý AI", "role": "bot" },
      "lastMessage": { "content": "Xin chào! 🎄...", "sentAt": "2026-10-31T07:00:00.000Z", "senderType": "BOT" },
      "unread": 0,
      "updatedAt": "2026-10-31T07:00:00.000Z"
    },
    "messages": [
      {
        "id": "6724b...",
        "conversationId": "6724a...",
        "senderType": "BOT",
        "senderId": null,
        "senderName": "Trợ lý AI",
        "content": "Xin chào! 🎄 Em là trợ lý ảo của Build Your Christmas...",
        "metadata": {
          "quickReplies": ["Tư vấn cây thông Noel", "Tra cứu đơn hàng", "Gặp nhân viên hỗ trợ"]
        },
        "sentAt": "2026-10-31T07:00:00.000Z",
        "isOwn": false
      }
    ]
  }
  ```

### 3.2 Lấy danh sách hội thoại của người dùng
- **Endpoint:** `GET /api/chat/conversations`
- **Auth:** Require (`Authorization: Bearer <token>`)
- **Query Params:** `?page=1&limit=20`
- **Response 200 OK:**
  ```json
  {
    "conversations": [ /* danh sách ChatConversationDto */ ],
    "pagination": { "page": 1, "limit": 20, "total": 2, "totalPages": 1 }
  }
  ```

### 3.3 Xem lịch sử tin nhắn (Pagination Cursor)
- **Endpoint:** `GET /api/chat/conversations/:id/messages`
- **Auth:** Optional (Phải là chủ sở hữu hoặc admin)
- **Query Params:**
  - `limit`: Số tin muốn lấy (mặc định 50, tối đa 100).
  - `before`: ID của tin nhắn **cũ nhất** hiện tại trên giao diện. Server sẽ trả về các tin có `createdAt` cũ hơn tin này.
- **Response 200 OK:**
  ```json
  {
    "messages": [ /* mảng ChatMessageDto sắp xếp từ CŨ ĐẾN MỚI */ ],
    "hasMore": false,
    "total": 12,
    "conversationId": "6724a..."
  }
  ```

### 3.4 Gửi tin nhắn qua REST (Fallback khi socket gián đoạn)
- **Endpoint:** `POST /api/chat/conversations/:id/messages`
- **Auth:** Optional
- **Body:**
  ```json
  {
    "content": "Cây 1m8 giá bao nhiêu em?",
    "metadata": {} // Tùy chọn, tối đa 2000 ký tự JSON
  }
  ```
- **Response 201 Created:** `{ "message": ChatMessageDto }`

### 3.5 Đánh dấu đã đọc
- **Endpoint:** `POST /api/chat/conversations/:id/read`
- **Auth:** Optional
- **Response 200 OK:** `{ "success": true, "conversationId": "6724a..." }`

### 3.6 Chuyển tiếp sang nhân viên hỗ trợ (Escalate)
- **Endpoint:** `POST /api/chat/conversations/:id/escalate`
- **Auth:** Optional
- **Body:** `{ "reason": "Cần giải quyết khiếu nại giao hàng" }`
- **Response 200 OK:** `{ "success": true, "conversation": ChatConversationDto }`

### 3.7 Lấy tổng số tin chưa đọc
- **Endpoint:** `GET /api/chat/unread`
- **Auth:** Require
- **Response 200 OK:** `{ "unread": 3 }`

---

## 4. Kết nối Realtime Socket.IO (Namespace `/chat`)

### 4.1 Cấu hình kết nối Client

```typescript
import { io, Socket } from "socket.io-client";

const SOCKET_SERVER_URL = "https://your-backend.onrender.com/chat"; // BẮT BUỘC có namespace /chat

export const chatSocket: Socket = io(SOCKET_SERVER_URL, {
  auth: {
    token: localStorage.getItem("token") || undefined,
    sessionId: localStorage.getItem("chat_session_id") || undefined,
  },
  // BẮT BUỘC trên môi trường Render / Cloud proxy để tránh lỗi websocket handshake
  transports: ["websocket", "polling"],
  tryAllTransports: true,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
});
```

### 4.2 Các luồng sự kiện chính

1. **Khi mở khung chat:**
   ```typescript
   chatSocket.emit("chat:join", { conversationId: activeConvId });
   ```
2. **Khi gửi tin nhắn:**
   ```typescript
   chatSocket.emit("chat:send", {
     conversationId: activeConvId,
     content: "Tôi muốn đặt thêm phụ kiện",
   });
   ```
3. **Lắng nghe tin nhắn mới:**
   ```typescript
   chatSocket.on("chat:message", (msg: ChatMessageDto) => {
     if (msg.conversationId === activeConvId) {
       appendMessageToChatBox(msg);
       // Đánh dấu đã đọc ngay nếu đang mở
       chatSocket.emit("chat:read", { conversationId: activeConvId });
     }
   });
   ```
4. **Lắng nghe cập nhật unread badge:**
   ```typescript
   chatSocket.on("chat:unread", ({ total, byConversation }) => {
     updateHeaderBadge(total);
     updateSidebarBadges(byConversation);
   });
   ```
5. **Lắng nghe chuyển đổi trạng thái hỗ trợ:**
   ```typescript
   chatSocket.on("chat:status", ({ conversationId, status, assignedAdmin }) => {
     updateStatusIndicator(conversationId, status, assignedAdmin);
   });
   ```

---

## 5. Quy tắc Read-State & Unread Badges

1. **Không còn cờ `isRead: false` ở cấp Message:**
   - Mỗi người tham gia có mốc `lastReadAt` riêng trong `Conversation.participants`.
   - Một tin nhắn được coi là "chưa đọc" đối với User $U$ nếu:
     $\text{Message.createdAt} > U.\text{lastReadAt}$ VÀ tin nhắn đó **không phải** do chính $U$ gửi.
2. **Tự động đồng bộ khi tương tác:**
   - Khi gửi tin nhắn thành công, server tự động cập nhật `lastReadAt` của người gửi bằng thời điểm gửi.
   - Khi gọi `POST /:id/read` hoặc emit `chat:read`, `lastReadAt` được nâng lên thời điểm hiện tại.
3. **Badge của Admin:**
   - Chỉ đếm các tin nhắn do khách gửi (`senderType === "USER"`), không tính thông báo của BOT hoặc tin hệ thống.
