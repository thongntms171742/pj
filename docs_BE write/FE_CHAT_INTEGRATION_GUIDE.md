# Frontend & Mobile Chat Integration Guide — Hybrid AI & Human Support (v4)

> **Mục tiêu:** Hướng dẫn đội ngũ Frontend (Web) và Mobile (React Native / Flutter) tích hợp hệ thống Chat **v4 — Hybrid AI & Human Support** (theo TDD v1.0).
> **Backend Namespace:** `/chat` (Socket.IO)
> **Base REST URL:** `/api/chat`
> **Trạng thái:** ✅ Backend đã hoàn tất — unit + integration + socket tests đều xanh.
>
> ⚠️ **BREAKING CHANGE từ v3 → v4:** Toàn bộ chat cũ đã bị **xoá & code lại từ đầu**.
> FE **BẮT BUỘC** phải đọc §1 (Migration) trước khi tích hợp.

---

## 0. TL;DR — Thay đổi cốt lõi

| Hệ thống | v3 (cũ) | v4 (mới) |
| :--- | :--- | :--- |
| **Auth** | Cho phép guest (sessionId) | **BẮT BUỘC đăng nhập.** Không có guest mode. |
| **Trạng thái hội thoại** | `BOT_ACTIVE` / `WAITING_ADMIN` / `ADMIN_ACTIVE` / `RESOLVED` | `open` / `pending` / `closed` |
| **Chế độ phục vụ** | `channel: "AI" \| "SUPPORT"` | `supportMode: "ai" \| "waiting_admin" \| "human" \| "ai_assisted"` |
| **Người gửi** | `USER` / `BOT` / `ADMIN` / `SYSTEM` | `user` / `admin` / `ai` / `system` (lowercase) |
| **Tin nhắn nội bộ** | Không có | **Có** — `visibility: "internal"`, user **không bao giờ** thấy. |
| **Escalate** | `POST /conversations/:id/escalate` | `POST /conversations/:id/handoff` (+ `DELETE` để huỷ) |
| **CSAT** | `POST /conversations/:id/satisfaction` | ❌ **Đã bỏ** (không có trong TDD v1.0). |
| **Socket events** | `chat:send`, `chat:message`, `chat:join`… | `message:send`, `message:new`, `conversation:subscribe`… |
| **Idempotency** | Không có | `clientMessageId` (retry an toàn, không tạo tin trùng) |
| **Optimistic lock** | Không có | `version` trên conversation — trả `409 CHAT_VERSION_CONFLICT` khi stale. |

---

## 1. Migration Checklist (BẮT BUỘC đọc trước)

### 1.1 Xoá code cũ

- [ ] Xoá toàn bộ gọi tới route cũ: `/api/chat/ai/*`, `/api/chat/conversations/:peerId/*`, `/api/chat/escalate`, `/api/chat/satisfaction`.
- [ ] Xoá logic `chat_session_id` / `x-chat-session-id` (guest đã bị bỏ).
- [ ] Xoá field `metadata` cũ (`quickReplies`, `suggestedProducts`, `orderInfo`, `route`, `confidence`, `escalationReason`).
  → Thay bằng `aiMetadata` (xem §3.3).
- [ ] Xoá socket event cũ: `chat:join`, `chat:send`, `chat:message`, `chat:typing`, `chat:read`, `chat:status`, `chat:unread`.
- [ ] Xoá DTO cũ: `ChatMessageDto` (`senderType` uppercase, `isOwn`, `sentAt`), `ChatConversationDto` (`channel`, `peer`, `unread`).
- [ ] Xoá component render `role === "buyer"`, `message.isRead`.

### 1.2 Kết nối Socket.IO mới

- [ ] URL: `io(`${API_BASE}/chat`, { auth: { token } })` — **bắt buộc có JWT**.
- [ ] `transports: ["websocket", "polling"]`, `tryAllTransports: true`.
- [ ] Khi vào 1 hội thoại: `socket.emit("conversation:subscribe", { conversationId }, ack)`.
- [ ] Khi rời hội thoại: `socket.emit("conversation:unsubscribe", { conversationId })`.

### 1.3 Luồng gửi tin (quan trọng)

- [ ] **Luôn** sinh `clientMessageId` (UUID v4) ở client trước khi gửi.
- [ ] Dùng **một** id đó cho cả lần gửi Socket lẫn fallback REST (nếu socket rớt).
- [ ] Khi nhận `message:new` với `echo === true` ⇒ tin đó là của chính mình → **không render lại** (đã optimistic-render).
- [ ] Deduplicate theo `message.id` khi merge danh sách.

---

## 2. Kiểm tra Tiến Độ Tích Hợp

### 2.1 Web Frontend Checklist

- [ ] **REST — Hội thoại:**
  - [ ] `POST /api/chat/conversations` (mở/lấy lại conversation active).
  - [ ] `GET /api/chat/conversations` (danh sách + pagination).
  - [ ] `GET /api/chat/conversations/unread-count` (badge).
  - [ ] `GET /api/chat/conversations/:id/messages?limit=30&before=<id>` (cursor pagination).
  - [ ] `POST /api/chat/conversations/:id/messages` (gửi tin, kèm `clientMessageId`).
  - [ ] `POST /api/chat/conversations/:id/read` (đánh dấu đã đọc).
  - [ ] `POST /api/chat/conversations/:id/close` / `POST /api/chat/conversations/:id/reopen`.
  - [ ] `POST /api/chat/conversations/:id/handoff` (nút "Gặp nhân viên").
  - [ ] `DELETE /api/chat/conversations/:id/handoff` (huỷ yêu cầu chờ).
- [ ] **Socket — Realtime:**
  - [ ] Listen `message:new` (tin mới — kể cả tin AI).
  - [ ] Listen `conversation:updated` (status / supportMode / version đổi).
  - [ ] Listen `conversation:unread` (badge đồng bộ mọi tab).
  - [ ] Listen `message:typing` (ai đang gõ / admin đang gõ).
  - [ ] Listen `handoff:updated` (yêu cầu chuyển viên thay đổi).
  - [ ] Listen `ai:status` (`thinking` / `answered` / `escalated` / `unavailable`).
- [ ] **UI:**
  - [ ] Badge "Đang chờ tư vấn viên" khi `supportMode === "waiting_admin"`.
  - [ ] Hiện tên tư vấn viên khi `supportMode === "human"` / `"ai_assisted"`.
  - [ ] Nút "Gặp nhân viên" disable khi đã có handoff đang mở.
  - [ ] Typing indicator bật khi `ai:status === "thinking"`.
  - [ ] Banner thông báo khi `ai:status === "escalated"`.
- [ ] **Admin Panel (nếu có):**
  - [ ] `GET /api/chat/admin/conversations?scope=unassigned|mine|all`.
  - [ ] `POST /api/chat/admin/conversations/:id/assign` (claim hội thoại).
  - [ ] `POST /api/chat/admin/conversations/:id/messages` (gửi tin, `visibility: "internal"` cho ghi chú nội bộ).
  - [ ] `GET /api/chat/admin/copilot/conversations/:id/summary` (tóm tắt hội thoại).
  - [ ] `POST /api/chat/admin/copilot/conversations/:id/suggest-reply` (gợi ý trả lời).
  - [ ] `POST /api/chat/admin/copilot/conversations/:id/note` (ghi chú nội bộ do AI tóm tắt).
  - [ ] `GET /api/chat/admin/copilot/policies?query=` (tra chính sách).
  - [ ] `GET/POST/PUT/DELETE /api/chat/admin/knowledge` (CRUD kho tri thức).

### 2.2 Mobile (React Native / Flutter) Checklist

- [ ] `socket.io-client` `^4.8.x`.
- [ ] Giữ kết nối khi app vào background → reconnect + emit lại `conversation:subscribe`.
- [ ] `FlatList` với `inverted` để render tin nhắn tối ưu.
- [ ] `onEndReached` (cuộn lên đầu) → `GET /messages?before=<oldestId>`.
- [ ] Dedup theo `message.id`.
- [ ] `KeyboardAvoidingView` cho ô nhập tin.
- [ ] Đồng bộ App Badge với event `conversation:unread`.

---

## 3. TypeScript DTO (Copy-Paste Ready)

```typescript
// types/chat.ts

export type ConversationStatus = "open" | "pending" | "closed";

export type SupportMode =
  | "ai"             // AI đang phục vụ
  | "waiting_admin"  // Đã chuyển, đang chờ nhân viên
  | "human"          // Nhân viên đang phục vụ
  | "ai_assisted";   // Nhân viên phục vụ + AI hỗ trợ

export type MessageSenderType = "user" | "admin" | "ai" | "system";
export type MessageVisibility = "public" | "internal";
export type MessageType = "text" | "image" | "file" | "system";

export interface ChatUnreadCount {
  user: number;
  admin: number;
}

export interface ConversationAiConfigDto {
  model: string;
  promptVersion: string;
  intent: string;
  intentConfidence: number;
  sentiment: "negative" | "neutral" | "positive" | "";
  enabled: boolean;
}

export interface ChatConversationDto {
  id: string;
  userId: string;
  status: ConversationStatus;
  supportMode: SupportMode;
  assignedAdminId: string | null;
  assignedAdminName: string | null;
  aiConfig: ConversationAiConfigDto;
  lastMessageId: string | null;
  lastMessageAt: string | null;
  unreadCount: ChatUnreadCount;
  /** Optimistic lock — gửi lại khi mutate. */
  version: number;
  closedAt: string | null;
  closedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatAttachmentDto {
  url: string;
  publicId: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface MessageAiMetadataDto {
  model: string;
  promptVersion: string;
  intent: string;
  intentConfidence: number;
  sentiment: string;
  tokensUsed: number;
  latencyMs: number;
  /** Tên tool AI đã dùng: "searchProducts" | "lookupOrder" | "shippingInfo" | "policySearch" */
  toolsUsed: string[];
  /** true nếu AI không chắc ⇒ nên để admin duyệt. */
  needsHumanReview: boolean;
}

export interface ChatMessageDto {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderType: MessageSenderType;
  content: string;
  messageType: MessageType;
  /** User CHỈ thấy "public". */
  visibility: MessageVisibility;
  attachments: ChatAttachmentDto[];
  aiMetadata: MessageAiMetadataDto | null;
  clientMessageId: string | null;
  userReadAt: string | null;
  adminReadAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatHandoffDto {
  id: string;
  conversationId: string;
  userId: string;
  reason: string;
  priority: "low" | "normal" | "high" | "urgent";
  status: "waiting" | "assigned" | "accepted" | "resolved" | "cancelled";
  summary: string;
  requestedAt: string;
  assignedAdminId: string | null;
  acceptedAt: string | null;
  resolvedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageListResponse {
  items: ChatMessageDto[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
  };
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}
```

---

## 4. REST API — Phía USER

> Base: `/api/chat` — **tất cả** yêu cầu header `Authorization: Bearer <token>`.

### 4.1 Conversations

| Method | Path | Body / Query | Response |
| :--- | :--- | :--- | :--- |
| `GET` | `/conversations` | `?page=1&limit=20&status=all\|open\|pending\|closed` | `{ items: ChatConversationDto[], pagination: PaginationMeta }` |
| `POST` | `/conversations` | `?forceNew=true` (tuỳ chọn) | `201 { conversation: ChatConversationDto }` |
| `GET` | `/conversations/unread-count` | — | `{ unreadCount: number }` |
| `GET` | `/conversations/:id` | — | `{ conversation: ChatConversationDto }` |
| `POST` | `/conversations/:id/close` | — | `{ conversation: ChatConversationDto }` |
| `POST` | `/conversations/:id/reopen` | — | `{ conversation: ChatConversationDto }` |

> **`POST /conversations` là idempotent**: nếu user đã có conversation `open`/`pending` thì trả lại chính conversation đó. Muốn conversation mới ⇒ `?forceNew=true`.

### 4.2 Messages

| Method | Path | Body / Query | Response |
| :--- | :--- | :--- | :--- |
| `GET` | `/conversations/:id/messages` | `?limit=20&before=<messageId>&after=<messageId>` | `{ items: ChatMessageDto[], pagination: { hasMore, nextCursor } }` |
| `POST` | `/conversations/:id/messages` | `{ content, messageType?, attachments?, clientMessageId? }` | `{ message: ChatMessageDto, acknowledged: true, duplicate: boolean }` |
| `POST` | `/conversations/:id/read` | — | `{ markedCount: number }` |

**Request body gửi tin:**

```typescript
interface SendMessageRequest {
  content: string;                          // bắt buộc (trừ khi có attachments)
  messageType?: "text" | "image" | "file" | "system";
  attachments?: Array<{
    url: string;
    publicId?: string;
    name?: string;
    mimeType?: string;
    size?: number;
  }>;
  /** Idempotency key — BẮT BUỘC để retry an toàn. */
  clientMessageId?: string;
}
```

**Giới hạn:**

- `content` tối đa **5000 ký tự** (`CHAT_MESSAGE_MAX_LENGTH`).
- Tối đa **5** file đính kèm, mỗi file ≤ **10MB**.
- Tin nhắn `internal` ⇒ **403 `CHAT_FORBIDDEN`** (chỉ admin tạo được).

**Idempotency:** nếu `clientMessageId` đã tồn tại trong conversation ⇒ trả **200** với tin nhắn cũ và `duplicate: true`. Không tạo bản ghi mới.

### 4.3 Handoff (chuyển nhân viên)

| Method | Path | Body | Response |
| :--- | :--- | :--- | :--- |
| `GET` | `/conversations/:id/handoff` | — | `{ handoff: ChatHandoffDto \| null }` |
| `POST` | `/conversations/:id/handoff` | `{ reason?, priority? }` | `201 { handoff, conversation, resolvedByAi: false }` |
| `DELETE` | `/conversations/:id/handoff` | — | `{ handoff: ChatHandoffDto }` |

- `reason` mặc định: `"Khách hàng yêu cầu tư vấn viên"`.
- `priority`: `"low" | "normal" | "high" | "urgent"`.
- Đã có handoff đang mở ⇒ **409 `CHAT_HANDOFF_ALREADY_EXISTS`** (details có `handoffId`).
- `DELETE` chỉ huỷ được handoff ở trạng thái `waiting`/`assigned` ⇒ conversation trở về `supportMode: "ai"`.

---

## 5. REST API — Phía ADMIN

> Base: `/api/chat/admin` — yêu cầu đăng nhập + role `admin`.

| Method | Path | Mô tả |
| :--- | :--- | :--- |
| `GET` | `/conversations?scope=unassigned\|mine\|all&status=&supportMode=&page=&limit=` | Danh sách hội thoại |
| `GET` | `/conversations/:id` | Chi tiết (kèm tên admin) |
| `POST` | `/conversations/:id/assign` | Claim hội thoại → `supportMode: "human"` |
| `POST` | `/conversations/:id/accept` | Nhận handoff (`assigned → accepted`) |
| `POST` | `/conversations/:id/close` | Đóng hội thoại |
| `POST` | `/conversations/:id/reopen` | Mở lại → `supportMode: "ai"` |
| `GET` | `/conversations/:id/messages` | Lịch sử (**bao gồm** `internal`) |
| `POST` | `/conversations/:id/messages` | Gửi tin (`visibility: "public" \| "internal"`) |
| `POST` | `/conversations/:id/read` | Đánh dấu đã đọc (phía admin) |
| `GET` | `/handoffs?status=&page=&limit=` | Hàng đợi handoff |
| `POST` | `/conversations/:id/handoff/assign` | Claim handoff |
| `POST` | `/conversations/:id/handoff/resolve` | Kết thúc handoff (mặc định trả về AI) |
| `GET` | `/unread-count` | Tổng unread trong hàng đợi |

**Optimistic locking:** các endpoint mutate nhận `body.expectedVersion`. Nếu version đã stale ⇒ **409 `CHAT_VERSION_CONFLICT`** ⇒ FE **phải refetch** rồi thử lại.

```typescript
await fetch(`/api/chat/admin/conversations/${id}/assign`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({ expectedVersion: conversation.version }),
});
```

### 5.1 AI Copilot

> Base: `/api/chat/admin/copilot`
> ⚠️ Cần bật `FEATURE_AI_COPILOT=true` trên BE. Nếu tắt ⇒ **503 `CHAT_AI_UNAVAILABLE`**.

| Method | Path | Body / Query | Response |
| :--- | :--- | :--- | :--- |
| `GET` | `/conversations/:id/summary` | — | `{ summary: { summary, customerIntent, currentStatus, suggestedNextSteps[], lastMessagePreview, urgent, tokensUsed, latencyMs } }` |
| `POST` | `/conversations/:id/suggest-reply` | `{ instruction? }` | `{ suggestion: { suggestion, summary, needMoreInfo[], toolsUsed[], tokensUsed, latencyMs } }` |
| `POST` | `/conversations/:id/note` | `{ note? }` | `201 { note: { conversationId, noteId, note, createdAt } }` |
| `GET` | `/conversations/:id/context` | — | `{ context: { handoff \| null, sentiment, intent, urgent } }` |
| `GET` | `/policies?query=&category=&limit=` | — | `{ results: CopilotPolicyHit[], count }` |

- `POST /note` **không có** `note` ⇒ AI tự tóm tắt hội thoại thành ghi chú nội bộ (`visibility: "internal"` ⇒ user **không** thấy).
- `POST /note` **có** `note` ⇒ lưu nguyên văn (không gọi AI, 0 token).
- `GET /context` **không** gọi AI ⇒ dùng để ưu tiên hàng đợi, rẻ & nhanh.

### 5.2 Kho tri thức (Knowledge Base)

> Base: `/api/chat/admin/knowledge`

| Method | Path | Mô tả |
| :--- | :--- | :--- |
| `GET` | `/?status=&category=&q=&page=&limit=` | Danh sách tài liệu |
| `GET` | `/:id` | Chi tiết |
| `POST` | `/` | Tạo tài liệu |
| `PUT` | `/:id` | Sửa tài liệu |
| `DELETE` | `/:id` | **Archive** (xoá mềm → `status: "archived"`) |

**Body khi tạo/sửa:**

```typescript
{
  title: string;             // bắt buộc
  content: string;           // bắt buộc — markdown, là nguồn sự thật cho AI
  summary?: string;          // 1-2 câu, dùng cho quick answer
  category?: "policy" | "faq" | "guide" | "product_care"
            | "shipping" | "payment" | "return" | "warranty";
  keywords?: string[];       // không dấu, để match nhanh
  tags?: string[];
  status?: "draft" | "published" | "archived";
  priority?: number;         // cao = thử trước khi nhiều tài liệu cùng khớp
  isActive?: boolean;
}
```

> Chỉ tài liệu `status: "published"` + `isActive: true` mới được AI dùng.
> `DELETE` là **xoá mềm** — tài liệu không bị mất khỏi DB.

---

## 6. Socket.IO — Namespace `/chat`

### 6.1 Khởi tạo

```typescript
import { io, Socket } from "socket.io-client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const CHAT_SOCKET_URL = `${API_BASE_URL.replace(/\/api\/?$/, "")}/chat`;

export function createChatSocket(token: string): Socket {
  const socket = io(CHAT_SOCKET_URL, {
    auth: { token },                  // BẮT BUỘC — không có guest
    transports: ["websocket", "polling"],
    tryAllTransports: true,
    reconnection: true,
    reconnectionAttempts: 15,
  });

  socket.on("chat:connected", (p: { userId: string; roles: string[]; serverTime: string }) => {
    console.log("[Chat] connected as", p.userId);
  });

  socket.on("connect_error", (err) => {
    // Thường là token hết hạn / sai
    console.warn("[Chat] connect_error:", err.message);
  });

  return socket;
}
```

### 6.2 Client → Server

| Event | Payload | Ack |
| :--- | :--- | :--- |
| `message:send` | `{ conversationId, content, messageType?, attachments?, clientMessageId? }` | `{ ok: true, data: { message, duplicate } }` \| `{ ok: false, error: { code, message } }` |
| `message:typing` | `{ conversationId, isTyping }` | `{ ok: true, data: { ok: true } }` |
| `conversation:subscribe` | `{ conversationId }` | `{ ok: true, data: { conversationId } }` |
| `conversation:unsubscribe` | `{ conversationId }` | — |
| `conversation:read` | `{ conversationId }` | `{ ok: true, data: { markedCount } }` |
| `chat:ping` | — | `{ ok: true, data: { serverTime } }` |

### 6.3 Server → Client

| Event | Payload | Ghi chú |
| :--- | :--- | :--- |
| `message:new` | `{ conversationId, message: ChatMessageDto, echo: boolean }` | `echo=true` ⇒ tin của chính mình. Tin `internal` **chỉ** tới room admin. |
| `conversation:updated` | `{ conversationId, conversation: ChatConversationDto }` | Khi status / supportMode / version đổi. |
| `conversation:unread` | `{ conversationId, unreadCount: { user, admin } }` | Đồng bộ badge mọi tab. |
| `message:typing` | `{ conversationId, userId, isTyping }` | Ai đó đang gõ. |
| `handoff:updated` | `{ conversationId, handoff: ChatHandoffDto, status: "created"\|"accepted"\|"resolved"\|"cancelled" }` | |
| `ai:status` | `{ conversationId, status: "thinking"\|"answered"\|"escalated"\|"unavailable", message? }` | `message` chỉ có khi `answered`. |
| `chat:connected` | `{ userId, roles, serverTime }` | |

### 6.4 Mẫu xử lý sự kiện

```typescript
export function setupChatHandlers(
  socket: Socket,
  conversationId: string,
  handlers: {
    onMessage: (m: ChatMessageDto, echo: boolean) => void;
    onConversationUpdated: (c: ChatConversationDto) => void;
    onUnread: (c: ChatUnreadCount) => void;
    onTyping: (userId: string, isTyping: boolean) => void;
    onHandoff: (h: ChatHandoffDto) => void;
    onAiStatus: (s: "thinking" | "answered" | "escalated" | "unavailable") => void;
  }
) {
  socket.on("message:new", ({ message, echo }) => {
    if (message.conversationId !== conversationId) return;
    handlers.onMessage(message, echo);
  });

  socket.on("conversation:updated", ({ conversation }) => {
    if (conversation.id !== conversationId) return;
    handlers.onConversationUpdated(conversation);
  });

  socket.on("conversation:unread", ({ unreadCount }) => handlers.onUnread(unreadCount));
  socket.on("message:typing", ({ userId, isTyping }) => handlers.onTyping(userId, isTyping));
  socket.on("handoff:updated", ({ handoff }) => handlers.onHandoff(handoff));
  socket.on("ai:status", ({ status }) => handlers.onAiStatus(status));

  return () => {
    socket.off("message:new");
    socket.off("conversation:updated");
    socket.off("conversation:unread");
    socket.off("message:typing");
    socket.off("handoff:updated");
    socket.off("ai:status");
  };
}
```

---

## 7. Luồng AI Hybrid — FE cần hiểu gì?

Khi user gửi tin ở `supportMode: "ai"`, BE tự xử lý (fire-and-forget, **không** chặn response API):

```
user gửi tin
   → message:new (echo=true)          [tin user]
   → ai:status { status: "thinking" }  [AI đang xử lý]
   → ai:status { status: "answered", message: ChatMessageDto }
   → message:new (echo=false)          [tin AI, senderType="ai"]
```

**Khi AI không xử lý được** (cần nhân viên):

```
   → ai:status { status: "escalated" }
   → conversation:updated { supportMode: "waiting_admin" }
   → handoff:updated { status: "created" }
   → message:new (senderType="system")  ["Mình đã chuyển yêu cầu của bạn…"]
```

**Khi AI lỗi kỹ thuật** (provider timeout / quota):

```
   → ai:status { status: "unavailable" }
```

> `unavailable` **KHÔNG** có nghĩa hội thoại đã escalate — user vẫn có thể gửi tin tiếp.

### 7.1 Metadata AI (để hiển thị badge / tooltip)

```typescript
if (message.senderType === "ai" && message.aiMetadata) {
  const { intent, intentConfidence, sentiment, toolsUsed, needsHumanReview } = message.aiMetadata;

  if (needsHumanReview) {
    showBadge("AI chưa chắc — nhân viên sẽ xác nhận");
  }
  if (sentiment === "negative") {
    showBadge("Khách đang không hài lòng");   // ưu tiên cao cho admin
  }
}
```

---

## 8. Xử Lý Lỗi

### 8.1 Format lỗi chuẩn

```json
{
  "error": {
    "code": "CHAT_VERSION_CONFLICT",
    "message": "Hội thoại vừa được cập nhật bởi người khác. Vui lòng tải lại.",
    "requestId": "req_abc123",
    "details": {}
  }
}
```

### 8.2 Bảng mã lỗi Chat

| Code | HTTP | Ý nghĩa | FE nên làm |
| :--- | :--- | :--- | :--- |
| `CHAT_CONVERSATION_NOT_FOUND` | 404 | Không tồn tại (hoặc không có quyền) | Quay lại danh sách |
| `CHAT_FORBIDDEN` | 403 | Không có quyền (VD: user tạo tin `internal`) | Hiện toast, không retry |
| `CHAT_INVALID_ID` | 400 | ID sai định dạng | Bug FE |
| `CHAT_EMPTY_CONTENT` | 400 | Tin nhắn rỗng | Chặn ở client |
| `CHAT_MESSAGE_TOO_LONG` | 400 | > 5000 ký tự | Chặn ở client |
| `CHAT_CONVERSATION_CLOSED` | 409 | Hội thoại đã đóng | Hiện nút "Mở lại" |
| `CHAT_VERSION_CONFLICT` | 409 | Optimistic lock stale | **Refetch** conversation rồi thử lại |
| `CHAT_RATE_LIMITED` | 429 | Gửi quá nhanh | Hiện cảnh báo, chặn 1-2s |
| `CHAT_AI_UNAVAILABLE` | 503 | AI/Copilot đang tắt hoặc provider lỗi | Ẩn UI AI, cho phép chat tiếp |
| `CHAT_AI_ESCALATED` | 503 | AI đã chuyển nhân viên | Hiện banner "đang chờ tư vấn viên" |
| `CHAT_AI_QUOTA_EXCEEDED` | 429 | Hết quota AI hôm nay | Ẩn UI AI |
| `CHAT_HANDOFF_NOT_FOUND` | 404 | Không có handoff | Refresh trạng thái |
| `CHAT_HANDOFF_ALREADY_EXISTS` | 409 | Đã có yêu cầu chờ | Disable nút "Gặp nhân viên" |
| `CHAT_HANDOFF_INVALID_TRANSITION` | 409 | Chuyển trạng thái handoff không hợp lệ | Refresh |
| `CHAT_REOPEN_WINDOW_EXPIRED` | 409 | Quá 24h ⇒ không mở lại được | Tạo conversation mới |

### 8.3 Xử lý `409 CHAT_VERSION_CONFLICT`

```typescript
async function assignConversation(conversation: ChatConversationDto) {
  const res = await fetch(`/api/chat/admin/conversations/${conversation.id}/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ expectedVersion: conversation.version }),
  });

  if (res.status === 409) {
    const fresh = await fetch(`/api/chat/admin/conversations/${conversation.id}`).then((r) => r.json());
    // Thử lại 1 lần với version mới
    return assignConversation(fresh.conversation);
  }
  return res.json();
}
```

---

## 9. Edge Cases

### 9.1 Mất mạng & reconnect

```typescript
socket.on("reconnect", () => {
  // BẮT BUỘC subscribe lại — server không nhớ client đã ở room nào
  if (currentConversationId) {
    socket.emit("conversation:subscribe", { conversationId: currentConversationId });
  }
  syncLatestMessages(currentConversationId);   // bù tin bị lỡ
});
```

### 9.2 Token hết hạn

```typescript
socket.on("connect_error", async (err) => {
  if (err.message.includes("UNAUTHORIZED")) {
    const newToken = await refreshToken();
    socket.auth.token = newToken;
    socket.disconnect().connect();
  }
});
```

### 9.3 Nhiều tab

- Server phát `conversation:unread` tới **room `user:<id>`** ⇒ mọi tab đều nhận ⇒ badge đồng bộ tự động.
- Dùng `BroadcastChannel` nếu cần đồng bộ optimistic state giữa các tab.

### 9.4 Gửi trùng (double-click / retry)

- **Luôn** truyền `clientMessageId` (UUID v4 sinh 1 lần, lưu vào state).
- Response có `duplicate: true` nghĩa là tin đã tồn tại ⇒ **không** render thêm.
- Index unique partial `(conversationId, clientMessageId)` ở BE bảo đảm không tạo tin trùng kể cả khi 2 request chạy song song.

### 9.5 Đóng / mở lại hội thoại

- User tự đóng: `POST /conversations/:id/close`.
- Mở lại: `POST /conversations/:id/reopen` — chỉ trong **24h** (`CHAT_REOPEN_WINDOW_MS`), và tự đưa `supportMode` về `"ai"`.

---

## 10. Kiểm thử nhanh (Smoke Test)

```bash
# 1. Health
curl http://localhost:4000/api/health

# 2. Tạo conversation (cần token)
curl -X POST http://localhost:4000/api/chat/conversations \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json"

# 3. Gửi tin (có clientMessageId để idempotent)
curl -X POST http://localhost:4000/api/chat/conversations/$CONV_ID/messages \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"content":"Cây thông size L giá bao nhiêu?","clientMessageId":"uuid-1"}'

# 4. Gửi lại cùng clientMessageId ⇒ duplicate=true, không tạo tin mới
```

**Kết quả mong đợi khi AI được bật (`GEMINI_API_KEY` hợp lệ):**
- Tin AI xuất hiện trong `GET /conversations/:id/messages` với `senderType: "ai"` và `aiMetadata.intent === "product_inquiry"`.

---

## 11. Câu hỏi thường gặp (FAQ)

**Q: Vì sao không còn CSAT?**
A: TDD v1.0 không yêu cầu. Có thể thêm sau ở `POST /api/chat/conversations/:id/satisfaction`.

**Q: Tin `internal` có hiện cho user không?**
A: **Không.** BE lọc ở 2 tầng: `listMessages` (user chỉ thấy `public`) và `chat.emitter` (tin internal chỉ broadcast tới room `admins`).

**Q: Tin nhắn gửi 2 lần có tạo 2 tin không?**
A: Không — nếu truyền `clientMessageId` giống nhau. Response lần 2 có `duplicate: true`.

**Q: AI có trả lời được câu hỏi ngoài phạm vi không?**
A: Không — prompt chặn AI bịa. AI được lệnh gọi tool để tra thật; nếu tool không có kết quả ⇒ AI nói "chưa tìm thấy" hoặc chuyển nhân viên.

**Q: Admin xem được tin `internal` qua REST không?**
A: Có — `GET /api/chat/admin/conversations/:id/messages` trả cả `internal`.

**Q: `409 CHAT_VERSION_CONFLICT` xử lý thế nào?**
A: Refetch conversation để lấy `version` mới rồi thử lại (xem §8.3).

---

> **Tài liệu liên quan:**
> - Kiến trúc chi tiết BE: `backend/docs/CHAT_HYBRID_API.md`
> - Error code catalog: `docs_BE write/API_CONTRACT.md`
> - OpenAPI: `docs_BE write/openapi.yaml`
