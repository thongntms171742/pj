# Chat 1-1 Integration Guide — Frontend Web & Mobile

> **Base REST URL:** `/api/chat` (User) · `/api/chat/admin` (Admin)
> **Socket.IO namespace:** `/chat`
> **Auth:** `Authorization: Bearer <JWT>` — **bắt buộc** cho cả REST và Socket.
> **Source of truth:** `backend/src/modules/chat/`

---

## 1. Kiến trúc & Luồng hoạt động

```
UserApp ──(POST /api/chat/conversations)──► Conversation (supportMode = "waiting_admin")
                                                  │
                                      [Hàng đợi Admin: unassigned]
                                                  │
AdminWeb ─(POST /api/chat/admin/conversations/:id/assign)─► Conversation (supportMode = "human", assignedAdminId)
                                                  │
UserApp ◄─────────── Chat 1-1 (REST + Socket /chat) ───────────► AdminWeb
```

- Không còn chatbot AI, không còn `HandoffRequest`, Copilot hay Knowledge Base.
- Conversation mới luôn khởi tạo với `status: "open"` và `supportMode: "waiting_admin"`.
- Khi Admin bấm **Tiếp nhận** (`POST /api/chat/admin/conversations/:id/assign`), conversation chuyển sang `supportMode: "human"` và gán `assignedAdminId` + `assignedAdminName`.
- Khi đóng (`close`) và mở lại (`reopen`), conversation quay về `status: "open"`, `supportMode: "waiting_admin"`, `assignedAdminId: null` để Admin trong ca có thể nhận lại.

---

## 2. TypeScript Contract (cho Web & Mobile)

```ts
export type ChatConversationStatus = "open" | "pending" | "closed";
export type ChatSupportMode = "waiting_admin" | "human";
export type ChatSenderType = "user" | "admin" | "system";
export type ChatMessageType = "text" | "image" | "file" | "system";
export type ChatMessageVisibility = "public" | "internal";

export interface ChatConversationDto {
  id: string;
  userId: string;
  status: ChatConversationStatus;
  supportMode: ChatSupportMode;
  assignedAdminId: string | null;
  assignedAdminName: string | null;
  lastMessageId: string | null;
  lastMessageAt: string | null;
  unreadCount: { user: number; admin: number };
  version: number;
  closedAt: string | null;
  closedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatAdminConversationListItemDto {
  id: string;
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
  status: ChatConversationStatus;
  supportMode: ChatSupportMode;
  assignedAdminId: string | null;
  assignedAdminName: string | null;
  lastMessageAt: string | null;
  unreadCount: { user: number; admin: number };
  version: number;
  createdAt: string;
}

export interface ChatMessageAttachmentDto {
  url: string;
  publicId: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface ChatMessageDto {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderType: ChatSenderType;
  content: string;
  messageType: ChatMessageType;
  visibility: ChatMessageVisibility;
  attachments: ChatMessageAttachmentDto[];
  clientMessageId: string | null;
  userReadAt: string | null;
  adminReadAt: string | null;
  createdAt: string;
}
```

---

## 3. REST Endpoints — Phía User (`/api/chat`)

> Tất cả yêu cầu `Authorization: Bearer <token>`.

| Method | Path | Body / Query | Response |
|---|---|---|---|
| `GET` | `/conversations` | `?status=all\|open\|pending\|closed&page=&limit=` | `{ items: ChatConversationDto[], pagination }` |
| `POST` | `/conversations` | Query optional `?forceNew=true` | `201 { conversation: ChatConversationDto }` |
| `GET` | `/conversations/unread-count` | — | `{ unreadCount: number }` |
| `GET` | `/conversations/:id` | — | `{ conversation: ChatConversationDto }` |
| `POST` | `/conversations/:id/close` | — | `{ conversation: ChatConversationDto }` |
| `POST` | `/conversations/:id/reopen` | — | `{ conversation: ChatConversationDto }` |
| `GET` | `/conversations/:id/messages` | `?limit=20&before=<msgId>&after=<msgId>` | `{ items: ChatMessageDto[], pagination: { hasMore, nextCursor } }` |
| `POST` | `/conversations/:id/messages` | `{ content, messageType?, attachments?, clientMessageId? }` | `{ message: ChatMessageDto, acknowledged: true, duplicate: boolean }` |
| `POST` | `/conversations/:id/read` | — | `{ markedCount: number }` |

### Lưu ý quan trọng cho User App
- `POST /api/chat/conversations` mặc định là **idempotent**: nếu user đã có hội thoại `open`/`pending`, BE trả lại hội thoại đó thay vì tạo trùng.
- Luôn gửi `clientMessageId` (UUID tự sinh phía client) khi gửi tin nhắn để chống trùng khi retry mạng.
- UI nên hiển thị trạng thái theo `supportMode`:
  - `waiting_admin` → *"Đang chờ tư vấn viên tiếp nhận"*
  - `human` → *"Tư vấn viên đang hỗ trợ"* (kèm `assignedAdminName` nếu có).

---

## 4. REST Endpoints — Phía Admin (`/api/chat/admin`)

> Tất cả yêu cầu `Authorization: Bearer <token>` + role `admin`.

| Method | Path | Body / Query | Response |
|---|---|---|---|
| `GET` | `/conversations` | `?scope=all\|unassigned\|mine&status=active\|open\|pending\|closed\|all&supportMode=all\|waiting_admin\|human&page=&limit=` | `{ items: ChatAdminConversationListItemDto[], pagination }` |
| `GET` | `/conversations/:id` | — | `{ conversation: ChatConversationDto }` |
| `POST` | `/conversations/:id/assign` | `{ expectedVersion? }` | `{ conversation: ChatConversationDto }` |
| `POST` | `/conversations/:id/close` | — | `{ conversation: ChatConversationDto }` |
| `POST` | `/conversations/:id/reopen` | — | `{ conversation: ChatConversationDto }` |
| `GET` | `/conversations/:id/messages` | `?limit=20&before=&after=` (gồm cả `internal`) | `{ items: ChatMessageDto[], pagination: { hasMore, nextCursor } }` |
| `POST` | `/conversations/:id/messages` | `{ content, messageType?, attachments?, visibility?: "public"\|"internal", clientMessageId? }` | `{ message: ChatMessageDto, acknowledged: true, duplicate: boolean }` |
| `POST` | `/conversations/:id/read` | — | `{ markedCount: number }` |
| `GET` | `/unread-count` | — | `{ unreadCount: number }` |

### Filter Web Admin gợi ý
- **Tất cả (đang mở)**: `status=active` (mặc định nếu không truyền `status`)
- **Chờ tiếp nhận**: `supportMode=waiting_admin`
- **Đang hỗ trợ**: `supportMode=human`
- **Đã đóng**: `status=closed`

### Optimistic Locking (`expectedVersion`)
- Khi Admin bấm **Tiếp nhận** (`POST /conversations/:id/assign`), nên truyền `expectedVersion: conversation.version`.
- Nếu 2 Admin cùng claim một lúc, người sau nhận `409 CHAT_VERSION_CONFLICT` → FE hiển thị thông báo và fetch lại conversation.

---

## 5. Realtime — Socket.IO Namespace `/chat`

### Kết nối
```ts
import { io } from "socket.io-client";

const socket = io(`${API_ORIGIN}/chat`, {
  auth: { token: `Bearer ${accessToken}` },
  transports: ["websocket", "polling"],
});
```

### Client → Server Events (có ack `{ ok: true, data } | { ok: false, error: { code, message } }`)
| Event | Payload | Mô tả |
|---|---|---|
| `conversation:subscribe` | `{ conversationId }` | Tham gia nhận event của conversation |
| `conversation:unsubscribe` | `{ conversationId }` | Rời room conversation |
| `message:send` | `{ conversationId, content, messageType?, attachments?, clientMessageId? }` | Gửi tin public (khuyên dùng `clientMessageId`) |
| `message:typing` | `{ conversationId, isTyping: boolean }` | Báo trạng thái đang gõ |
| `conversation:read` | `{ conversationId }` | Đánh dấu đã đọc (`markedCount`) |
| `chat:ping` | — | Heartbeat kiểm tra kết nối |

### Server → Client Events
| Event | Payload | Room nhận |
|---|---|---|
| `chat:connected` | `{ userId, roles, serverTime }` | Socket vừa kết nối |
| `message:new` | `{ conversationId, message: ChatMessageDto, echo: boolean }` | `conversation:{id}` (tin `internal` chỉ tới `admins`) |
| `conversation:updated` | `{ conversationId, conversation: ChatConversationDto }` | `conversation:{id}` |
| `conversation:unread` | `{ conversationId, unreadCount: { user, admin } }` | `user:{id}` |
| `message:typing` | `{ conversationId, userId, isTyping }` | Các socket khác trong `conversation:{id}` |

---

## 6. Bảng Error Codes (Chat)

| Code | HTTP | Nguyên nhân | Cách FE xử lý |
|---|---|---|---|
| `CHAT_CONVERSATION_NOT_FOUND` | 404 | Không tìm thấy hội thoại | Điều hướng về danh sách |
| `CHAT_STATUS_INVALID` | 400 | Chuyển trạng thái không hợp lệ (VD: assign hội thoại đã đóng) | Refresh state |
| `CHAT_FORBIDDEN` | 403 | Không phải chủ hội thoại / không phải Admin | Chặn thao tác |
| `CHAT_INVALID_ID` | 400 | `conversationId` không phải ObjectId hợp lệ | Kiểm tra param |
| `CHAT_EMPTY_CONTENT` | 400 | Tin nhắn rỗng và không có đính kèm | Vô hiệu nút gửi |
| `CHAT_MESSAGE_TOO_LONG` | 400 | Vượt quá 5000 ký tự | Hiện bộ đếm ký tự |
| `CHAT_CONVERSATION_CLOSED` | 409 | Gửi tin vào hội thoại đã đóng | Hiện nút "Mở lại hội thoại" |
| `CHAT_DUPLICATE_MESSAGE` | 409 | Trùng idempotency | Dùng lại tin đã tồn tại |
| `CHAT_VERSION_CONFLICT` | 409 | Đã có người khác cập nhật trước (`version` lệch) | Fetch lại conversation |
| `CHAT_RATE_LIMITED` | 429 | Gửi vượt quá 10 tin/giây qua socket | Throttle / báo gửi chậm lại |
| `CHAT_REOPEN_WINDOW_EXPIRED` | 409 | Quá 24h kể từ khi đóng | Tạo hội thoại mới (`POST /conversations`) |
