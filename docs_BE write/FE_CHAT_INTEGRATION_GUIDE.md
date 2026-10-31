# Frontend & Mobile Chat Integration Guide — Unified Model (v3)

> **Mục tiêu:** Hướng dẫn đội ngũ Frontend (Web) và Mobile (React Native / Flutter) tích hợp hoặc nâng cấp lên hệ thống Chat v3 hợp nhất (Single Model Architecture).
> **Backend Namespace:** `/chat`
> **Base REST URL:** `/api/chat`
> **Trạng thái:** ✅ Backend đã hoàn tất & kiểm thử tự động 100%.

---

## 1. Bảng Kiểm Tra Tiến Độ Tích Hợp (Integration Checklist)

### 1.1 Web Frontend Checklist
- [ ] **Gỡ bỏ code cũ (Legacy Cleanup):**
  - [ ] Xoá tất cả logic gọi đến route cũ `/api/chat/ai/*` và `/api/chat/conversations/:peerId/*`.
  - [ ] Gỡ bỏ việc tự sinh chuỗi định danh hội thoại `c_<a>__<b>`.
  - [ ] Gỡ kết nối socket tới default namespace `/` cho chat (chỉ dùng `/chat`).
  - [ ] Bỏ logic kiểm tra cờ `message.isRead` phẳng và `message.role === "buyer"`.
- [ ] **Khởi tạo kết nối Socket.IO (Namespace `/chat`):**
  - [ ] Cấu hình Socket.IO client trỏ đến `https://<domain>/chat`.
  - [ ] Truyền `auth: { token, sessionId }` khi khởi tạo socket.
  - [ ] Cấu hình `transports: ["websocket", "polling"]` và `tryAllTransports: true` để tránh lỗi proxy trên Render.
- [ ] **Quản lý danh tính khách & User (Identity Management):**
  - [ ] Lưu trữ và tái sử dụng `chat_session_id` (UUID v4) trong `localStorage` cho khách chưa đăng nhập.
  - [ ] Tự động truyền Bearer token khi user đã đăng nhập.
  - [ ] Tự động chuyển giao hội thoại khách sang tài khoản khi user đăng nhập.
- [ ] **Giao diện & Tương tác (UI/UX):**
  - [ ] Cập nhật DTO `ChatMessageDto` và `ChatConversationDto` (dùng `id` thay vì `_id`, `senderType` thay vì `role`).
  - [ ] Render tin nhắn theo `senderType` ("USER", "BOT", "ADMIN", "SYSTEM") và cờ `isOwn`.
  - [ ] Render component `quickReplies` dạng nút bấm (chips/pills) tự động gửi tin khi click.
  - [ ] Render component `suggestedProducts` (thẻ sản phẩm kèm ảnh, giá, nút xem/mua).
  - [ ] Render component `orderInfo` (thẻ thông tin đơn hàng).
  - [ ] Tích hợp tính năng cuộn ngược lên tải thêm tin nhắn cũ (Cursor Pagination với param `before`).
  - [ ] Emit `chat:read` khi user mở khung chat hoặc nhận tin mới khi cửa sổ đang active.
  - [ ] Hiển thị badge số tin chưa đọc từ event `chat:unread` hoặc API `GET /api/chat/unread`.
  - [ ] Tính năng "Gặp nhân viên hỗ trợ" (Escalate): gọi `POST /api/chat/conversations/:id/escalate`.

### 1.2 Mobile (React Native / Flutter) Checklist
- [ ] **Cài đặt thư viện & kết nối:**
  - [ ] Sử dụng `socket.io-client` (khuyến nghị phiên bản `^4.7.x` hoặc `^4.8.x`).
  - [ ] Lưu `chat_session_id` vào `AsyncStorage` / `SecureStore`.
  - [ ] Đảm bảo giữ kết nối khi ứng dụng vào background hoặc kết nối lại khi quay lại foreground (App State handling).
- [ ] **Trải nghiệm tin nhắn:**
  - [ ] Sử dụng `FlatList` với thuộc tính `inverted` để render tin nhắn tối ưu hiệu năng.
  - [ ] Bắt sự kiện `onEndReached` khi cuộn lên đầu danh sách để gọi API lấy tin cũ hơn (`before=<oldestId>`).
  - [ ] Tránh giật lag bằng cách deduplicate tin nhắn theo trường `id`.
  - [ ] Xử lý bàn phím ảo với `KeyboardAvoidingView` tránh che khuất ô nhập tin.
- [ ] **Thông báo & Badge:**
  - [ ] Đồng bộ số lượng tin chưa đọc với App Badge icon khi nhận event `chat:unread`.
  - [ ] Gửi `chat:read` khi màn hình Chat Screen được `focus`.

---

## 2. Khai báo TypeScript DTO (Copy-Paste Ready)

```typescript
// types/chat.ts

export type ChatChannel = "AI" | "SUPPORT";
export type ChatStatus = "BOT_ACTIVE" | "WAITING_ADMIN" | "ADMIN_ACTIVE" | "RESOLVED";
export type MessageSenderType = "USER" | "BOT" | "ADMIN" | "SYSTEM";

export interface SuggestedProduct {
  id: string;
  type: "tree" | "accessory";
  name: string;
  price: number;
  imageUrl?: string;
}

export interface OrderInfoMetadata {
  orderId: string;
  orderCode?: string;
  status: string;
  totalAmount: number;
}

export interface ChatMessageMetadata {
  quickReplies?: string[];
  suggestedProducts?: SuggestedProduct[];
  orderInfo?: OrderInfoMetadata;
  [key: string]: unknown;
}

export interface ChatMessageDto {
  id: string;
  conversationId: string;
  senderType: MessageSenderType;
  senderId: string | null;
  senderName: string;
  content: string;
  metadata: ChatMessageMetadata;
  sentAt: string; // ISO 8601
  isOwn: boolean; // true nếu tin nhắn do chính client hiện tại gửi
}

export interface ChatConversationPeer {
  id: string;
  name: string;
  avatarUrl?: string;
  role: string;
}

export interface ChatConversationDto {
  id: string;
  channel: ChatChannel;
  status: ChatStatus;
  peer: ChatConversationPeer;
  lastMessage: {
    content: string;
    sentAt: string;
    senderType: MessageSenderType;
  } | null;
  unread: number;
  updatedAt: string; // ISO 8601
  assignedAdmin?: {
    id: string;
    name: string;
  } | null;
}

export interface GetMessagesResponse {
  messages: ChatMessageDto[];
  hasMore: boolean;
  total: number;
  conversationId: string;
}

export interface UnreadUpdatePayload {
  total: number;
  byConversation: Record<string, number>;
}

export interface StatusChangedPayload {
  conversationId: string;
  status: ChatStatus;
  assignedAdmin?: {
    id: string;
    name: string;
  } | null;
}

export interface TypingPayload {
  conversationId: string;
  userId: string;
  userName: string;
}
```

---

## 3. Bảng Ánh Xạ Dữ Liệu: Cũ (v2) → Mới (v3)

| Khái niệm | v2 Legacy | v3 Unified (Mới) | Lý do thay đổi & Hành động cho FE |
| :--- | :--- | :--- | :--- |
| **Định danh hội thoại** | Chuỗi tự ghép `c_<a>__<b>` | ObjectId hex string chuẩn (`conv.id`) | FE không bao giờ tự ghép chuỗi. Chỉ dùng `id` trả về từ API. |
| **Định danh tin nhắn** | `_id` | `id` | FE đổi mọi `msg._id` thành `msg.id` (làm key trong React list). |
| **Phân loại người gửi** | `role: "buyer" \| "admin"` | `senderType: "USER" \| "BOT" \| "ADMIN" \| "SYSTEM"` | Xoá bỏ lỗi admin bị nhận nhầm là buyer. FE style giao diện theo `senderType`. |
| **Xác định tin của mình** | So sánh `senderId === currentUser.id` | Sử dụng trường boolean `isOwn` | FE chỉ cần kiểm tra `if (msg.isOwn)` để căn phải (Right-align) bong bóng chat. |
| **Trạng thái đọc tin** | `message.isRead: boolean` | `conversation.unread: number` & `lastReadAt` | Không dùng `msg.isRead` để hiện icon 2 tick (vì tin bot/admin không lưu flat boolean). Chỉ dùng số `unread` trên danh sách hoặc badge. |
| **Namespace Socket** | `/` (root) | `/chat` | Khi gọi `io(SERVER_URL + "/chat")` phải có đuôi `/chat`. |
| **Event Socket gửi tin** | `send_message` hoặc `chat:send` | `chat:send` | Chuẩn hoá 1 event duy nhất cho cả AI và Admin. |
| **Event Socket nhận tin** | `new_message` hoặc `chat:message` | `chat:message` | Chuẩn hoá 1 event duy nhất. |

---

## 4. Khởi Tạo Kết Nối Socket.IO Client

```typescript
// services/chatSocket.ts
import { io, Socket } from "socket.io-client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://your-api.onrender.com";
const CHAT_SOCKET_URL = `${API_BASE_URL.replace(/\/api\/?$/, "")}/chat`;

export function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  let sid = localStorage.getItem("chat_session_id");
  if (!sid) {
    sid = "guest_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now();
    localStorage.setItem("chat_session_id", sid);
  }
  return sid;
}

export function createChatSocket(token?: string | null): Socket {
  const sessionId = getOrCreateSessionId();

  const socket = io(CHAT_SOCKET_URL, {
    auth: {
      token: token || undefined,
      sessionId: sessionId || undefined,
    },
    // Quan trọng cho Render.com & proxy để tránh lỗi WebSocket handshake 400
    transports: ["websocket", "polling"],
    tryAllTransports: true,
    reconnection: true,
    reconnectionAttempts: 15,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socket.on("connect", () => {
    console.log("[ChatSocket] Connected successfully with socket ID:", socket.id);
  });

  socket.on("connect_error", (error) => {
    console.warn("[ChatSocket] Connection error:", error.message);
  });

  socket.on("chat:error", (err: { code: string; message: string }) => {
    console.error(`[ChatSocket] Server Error [${err.code}]:`, err.message);
  });

  return socket;
}
```

---

## 5. Các Đoạn Code Mẫu Chuẩn Cho Từng Thao Tác (Code Snippets)

### 5.1 Khởi tạo hội thoại & Tham gia phòng chat (`chat:join`)

```typescript
import { createChatSocket, getOrCreateSessionId } from "./chatSocket";
import { ChatConversationDto, ChatMessageDto } from "../types/chat";

// 1. Gọi REST mở hoặc tạo hội thoại
async function initConversation(channel: "AI" | "SUPPORT" = "AI", token?: string) {
  const sessionId = getOrCreateSessionId();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch("/api/chat/conversations", {
    method: "POST",
    headers,
    body: JSON.stringify({
      channel,
      sessionId,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to initialize conversation");

  const conversation: ChatConversationDto = data.conversation;
  const initialMessages: ChatMessageDto[] = data.messages;

  return { conversation, initialMessages };
}

// 2. Tham gia phòng realtime trên Socket
function joinChatRoom(socket: Socket, conversationId: string) {
  socket.emit("chat:join", { conversationId });
}
```

---

### 5.2 Gửi tin nhắn qua Socket và Fallback sang REST

```typescript
// Gửi qua Realtime Socket
export function sendSocketMessage(
  socket: Socket,
  conversationId: string,
  content: string,
  metadata?: Record<string, unknown>
) {
  if (!socket.connected) {
    throw new Error("SOCKET_DISCONNECTED");
  }

  socket.emit("chat:send", {
    conversationId,
    content: content.trim(),
    metadata,
  });
}

// Gửi qua REST (dùng khi Socket tạm mất kết nối)
export async function sendRestMessage(
  conversationId: string,
  content: string,
  token?: string,
  metadata?: Record<string, unknown>
): Promise<ChatMessageDto> {
  const sessionId = getOrCreateSessionId();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (sessionId) headers["x-chat-session-id"] = sessionId;

  const res = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({ content: content.trim(), metadata }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to send message via REST");
  return data.message;
}
```

---

### 5.3 Nhận tin nhắn mới & Tự động đánh dấu đã đọc (`chat:read`)

```typescript
export function setupMessageListener(
  socket: Socket,
  currentConvId: string,
  isChatWindowFocused: boolean,
  onNewMessage: (msg: ChatMessageDto) => void
) {
  const handleIncomingMessage = (msg: ChatMessageDto) => {
    // Chỉ xử lý tin thuộc hội thoại đang mở
    if (msg.conversationId === currentConvId) {
      onNewMessage(msg);

      // Nếu người dùng đang mở cửa sổ chat và xem màn hình, gửi ngay chat:read
      if (isChatWindowFocused) {
        socket.emit("chat:read", {
          conversationId: currentConvId,
          lastMessageId: msg.id,
        });
      }
    }
  };

  socket.on("chat:message", handleIncomingMessage);
  return () => {
    socket.off("chat:message", handleIncomingMessage);
  };
}
```

---

### 5.4 Cuộn lên trên để tải thêm tin cũ (Cursor Pagination với `before`)

> **Quy tắc Cursor:** Không dùng `page=2, 3` vì khi có tin mới tới, thứ tự phân trang dạng số sẽ bị trượt và sinh ra tin trùng lặp. FE luôn truyền `before=<id_của_tin_nhắn_cũ_nhất_trên_màn_hình>`.

```typescript
export async function loadOlderMessages(
  conversationId: string,
  oldestMessageId: string,
  token?: string
): Promise<{ olderMessages: ChatMessageDto[]; hasMore: boolean }> {
  const sessionId = getOrCreateSessionId();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (sessionId) headers["x-chat-session-id"] = sessionId;

  const url = `/api/chat/conversations/${conversationId}/messages?limit=30&before=${oldestMessageId}`;
  const res = await fetch(url, { headers });
  const data = await res.json();

  if (!res.ok) throw new Error(data.message || "Failed to load older messages");

  // data.messages trả về được sắp xếp theo thời gian tăng dần (cũ đến mới)
  return {
    olderMessages: data.messages,
    hasMore: data.hasMore,
  };
}
```

---

### 5.5 Chuyển tiếp sang nhân viên hỗ trợ (Escalate / Human Handoff)

Khi khách hàng nhấn nút "Gặp nhân viên hỗ trợ" hoặc chat câu hỏi phức tạp mà BOT không giải quyết được:

```typescript
export async function requestAdminHandoff(
  conversationId: string,
  reason?: string,
  token?: string
): Promise<ChatConversationDto> {
  const sessionId = getOrCreateSessionId();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (sessionId) headers["x-chat-session-id"] = sessionId;

  const res = await fetch(`/api/chat/conversations/${conversationId}/escalate`, {
    method: "POST",
    headers,
    body: JSON.stringify({ reason }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Cannot escalate to admin");
  return data.conversation;
}
```

---

## 6. Hướng Dẫn Render Metadata Đặc Thù

Hệ thống Chat v3 hỗ trợ trả kèm `metadata` trong `ChatMessageDto` để render các widget tương tác phong phú.

### 6.1 Gợi ý câu hỏi nhanh (`quickReplies`)
- **Dữ liệu:** Mảng các chuỗi ký tự, ví dụ: `["Tư vấn cây thông Noel", "Tra cứu đơn hàng", "Gặp tư vấn viên"]`.
- **Hành vi:**
  - Render dạng hàng nút bấm nhỏ (chip/pill button) ngay bên dưới bong bóng chat của BOT.
  - Khi user nhấn vào một nút:
    - Lấy nội dung nút làm văn bản gửi đi (`chat:send`).
    - Ẩn hoặc disable danh sách nút vừa bấm để tránh user spam bấm nhiều lần.

### 6.2 Gợi ý sản phẩm (`suggestedProducts`)
- **Dữ liệu:**
  ```json
  [
    {
      "id": "6723f...",
      "type": "tree",
      "name": "Cây Thông Noble Fir Cao Cấp 1m8",
      "price": 1850000,
      "imageUrl": "https://res.cloudinary.com/.../tree1.jpg"
    }
  ]
  ```
- **Hành vi:**
  - Render card sản phẩm ngang hoặc carousel.
  - Hiển thị ảnh đại diện, tên sản phẩm và giá tiền định dạng `1.850.000 ₫`.
  - Có nút hành động: "Xem chi tiết" (navigate đến trang `/trees/:id` hoặc `/accessories/:id`) hoặc "Thêm vào giỏ".

### 6.3 Thẻ tra cứu đơn hàng (`orderInfo`)
- **Dữ liệu:**
  ```json
  {
    "orderId": "6724a...",
    "orderCode": "BYC-2026-9812",
    "status": "PROCESSING",
    "totalAmount": 2450000
  }
  ```
- **Hành vi:**
  - Render thẻ tóm tắt đơn hàng với huy hiệu trạng thái (Badge: Chờ xác nhận, Đang xử lý, Đang giao, Đã hoàn tất).
  - Có nút bấm "Theo dõi đơn hàng" điều hướng tới trang `/orders/:id`.

---

## 7. Xử Lý Các Trường Hợp Biên (Edge Cases & Resilience)

### 7.1 Mất kết nối & Kết nối lại (Reconnection & Auto-Rejoin)
Khi người dùng mất mạng (đổi WiFi, qua hầm) hoặc tab trình duyệt bị hệ điều hành đóng băng:
```typescript
socket.on("reconnect", () => {
  console.log("[ChatSocket] Reconnected!");
  // BẮT BUỘC: Khi reconnect thành công, phải emit lại chat:join cho phòng đang mở
  if (currentActiveConversationId) {
    socket.emit("chat:join", { conversationId: currentActiveConversationId });
  }
  // Đồng bộ lại tin nhắn mới nhất đề phòng tin nhắn bị bỏ lỡ trong lúc mất mạng
  syncLatestMessages(currentActiveConversationId);
});
```

### 7.2 Hết hạn Token JWT (Token Expiration)
Khi Bearer token hết hạn, socket hoặc REST request sẽ trả về mã lỗi `UNAUTHORIZED` hoặc event `chat:error` (`CHAT_FORBIDDEN`):
1. Client gọi API Refresh Token để lấy token mới.
2. Cập nhật `socket.auth.token = newToken`.
3. Gọi `socket.disconnect().connect()` để kết nối lại bằng quyền mới mà không cần reload trang.

### 7.3 Đồng bộ giữa nhiều Tab trình duyệt (Multi-tab Sync)
Khi người dùng mở 2 tab cùng lúc:
- Sử dụng `BroadcastChannel("byc_chat_channel")` hoặc lắng nghe `window.addEventListener("storage", ...)`:
- Khi tab A gửi tin nhắn hoặc đánh dấu đọc tin, tab A broadcast sự kiện sang tab B để cập nhật giao diện mà không cần chờ socket echo ngược lại.

### 7.4 Khách vãng lai đăng nhập (Guest Claiming Account)
- Khi khách hàng chưa đăng nhập: Client lưu `chat_session_id` trong `localStorage`.
- Khi khách hàng hoàn tất đăng nhập hoặc tạo tài khoản:
  - Khi mở khung chat, gọi `POST /api/chat/conversations` kèm **cả hai**:
    1. Header `Authorization: Bearer <token>` của tài khoản mới.
    2. Body `{ channel: "AI", sessionId: localStorage.getItem("chat_session_id") }`.
  - Backend sẽ tự động phát hiện và liên kết hội thoại của `sessionId` đó vào tài khoản người dùng (`userId`). Toàn bộ lịch sử trao đổi trước đó sẽ không bị mất.
