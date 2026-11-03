# Chat REST API Specification (v4)

> **Version:** 4.0 · **Architecture:** Hybrid AI & Human Support (TDD v1.0)
> **Trạng thái:** ✅ Backend hoàn tất — 321 assertions xanh, `tsc --noEmit` sạch.
>
> 📖 **Tài liệu đầy đủ:**
> - Kiến trúc & bảo trì: `backend/docs/CHAT_HYBRID_API.md`
> - Hướng dẫn tích hợp FE/Mobile: `docs_BE write/FE_CHAT_INTEGRATION_GUIDE.md`

---

## 1. Tổng quan

| | |
| :--- | :--- |
| **Base URL** | `/api/chat` (user) · `/api/chat/admin` (admin) |
| **Auth** | `Authorization: Bearer <token>` — **BẮT BUỘC**, không có guest |
| **Socket namespace** | `/chat` |
| **Content type** | `application/json` |

### 1.1 Response format

**Success:**

```json
{ "items": [...], "pagination": { "page": 1, "limit": 20, "total": 42, "totalPages": 3, "hasNext": true, "hasPrev": false } }
```

**Error:**

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

### 1.2 Quy tắc quan trọng

| Quy tắc | Chi tiết |
| :--- | :--- |
| **Idempotency** | Gửi tin kèm `clientMessageId` (UUID). Gửi lại cùng id ⇒ `200` + `duplicate: true`, **không** tạo tin mới. |
| **Optimistic lock** | Endpoint mutate nhận `expectedVersion`. Stale ⇒ `409 CHAT_VERSION_CONFLICT` ⇒ **phải refetch**. |
| **Pagination tin nhắn** | Cursor-based: `?before=<id>` (tin cũ hơn) hoặc `?after=<id>` (tin mới hơn). **Không** dùng `page`. |
| **Tin nội bộ** | `visibility: "internal"` — user **không bao giờ** thấy (kể cả qua socket). |
| **Đóng hội thoại** | Conversation `closed` ⇒ không nhận tin mới (`409 CHAT_CONVERSATION_CLOSED`). Mở lại trong 24h. |

---

## 2. Endpoints — Phía USER

### 2.1 Conversations

#### `POST /api/chat/conversations`

Tạo hoặc lấy lại conversation active. **Idempotent**: đã có conversation `open`/`pending` ⇒ trả lại chính nó.

- **Query:** `?forceNew=true` (tuỳ chọn — tạo conversation mới thay vì dùng lại).
- **Response `201`:**

```json
{
  "conversation": {
    "id": "6724a1b2c3d4e5f6a7b8c9d0",
    "userId": "65f...",
    "status": "open",
    "supportMode": "ai",
    "assignedAdminId": null,
    "assignedAdminName": null,
    "aiConfig": {
      "model": "", "promptVersion": "", "intent": "",
      "intentConfidence": 0, "sentiment": "", "enabled": true
    },
    "lastMessageId": null,
    "lastMessageAt": null,
    "unreadCount": { "user": 0, "admin": 0 },
    "version": 1,
    "closedAt": null,
    "closedBy": null,
    "createdAt": "2026-11-04T02:00:00.000Z",
    "updatedAt": "2026-11-04T02:00:00.000Z"
  }
}
```

> `supportMode` khởi tạo là `"ai"` nếu AI khả dụng, ngược lại `"waiting_admin"`.

#### `GET /api/chat/conversations`

- **Query:** `?page=1&limit=20&status=all|open|pending|closed`
- **Response `200`:** `{ "items": [ChatConversationDto], "pagination": PaginationMeta }`

#### `GET /api/chat/conversations/unread-count`

- **Response `200`:** `{ "unreadCount": 3 }`

#### `GET /api/chat/conversations/:id`

- **Response `200`:** `{ "conversation": ChatConversationDto }`
- **Lỗi:** `404 CHAT_CONVERSATION_NOT_FOUND` · `403 CHAT_FORBIDDEN`

#### `POST /api/chat/conversations/:id/close`

- **Response `200`:** `{ "conversation": ChatConversationDto }` (status → `closed`)

#### `POST /api/chat/conversations/:id/reopen`

- Chỉ trong **24h** kể từ lúc đóng.
- **Response `200`:** `{ "conversation": ChatConversationDto }` (status → `open`, supportMode → `ai`)
- **Lỗi:** `409 CHAT_REOPEN_WINDOW_EXPIRED`

---

### 2.2 Messages

#### `GET /api/chat/conversations/:id/messages`

- **Query:** `?limit=20&before=<messageId>&after=<messageId>`
- `before` = lấy tin **cũ hơn** (load lịch sử ngược).
- `after` = lấy tin **mới hơn** (poll tin mới).
- **Response `200`:**

```json
{
  "items": [
    {
      "id": "6724b...",
      "conversationId": "6724a...",
      "senderId": "65f...",
      "senderType": "user",
      "content": "Cây thông size L giá bao nhiêu ạ?",
      "messageType": "text",
      "visibility": "public",
      "attachments": [],
      "aiMetadata": null,
      "clientMessageId": "9f2c...",
      "userReadAt": null,
      "adminReadAt": null,
      "createdAt": "2026-11-04T02:01:00.000Z",
      "updatedAt": "2026-11-04T02:01:00.000Z"
    }
  ],
  "pagination": { "hasMore": true, "nextCursor": "6724b..." }
}
```

> **User chỉ thấy `visibility: "public"`.** Tin `internal` bị lọc hoàn toàn.
> `items` sắp xếp **cũ → mới**. `nextCursor` = id của tin cũ nhất trong trang (dùng cho `before` lần sau).

#### `POST /api/chat/conversations/:id/messages`

**Body:**

```json
{
  "content": "Cây thông size L giá bao nhiêu ạ?",
  "messageType": "text",
  "attachments": [
    { "url": "https://...", "publicId": "abc", "name": "a.jpg", "mimeType": "image/jpeg", "size": 102400 }
  ],
  "clientMessageId": "9f2c1e40-..."
}
```

- `content` tối đa **5000 ký tự**; tối đa **5** file, mỗi file ≤ **10MB**.
- `visibility` không nhận từ user ⇒ luôn `"public"`.
- **Response `200`:**

```json
{
  "message": { /* MessageDto */ },
  "acknowledged": true,
  "duplicate": false
}
```

> `duplicate: true` ⇒ tin đã tồn tại (idempotency hit) — client **không** render thêm.
> **Lưu ý:** Response trả về ngay, **không** chờ AI. Tin AI sẽ tới sau qua socket `message:new`.

#### `POST /api/chat/conversations/:id/read`

- **Response `200`:** `{ "markedCount": 12 }`

---

### 2.3 Handoff

#### `POST /api/chat/conversations/:id/handoff`

**Body:** `{ "reason": "Khách hàng yêu cầu tư vấn viên", "priority": "normal" }`

- `priority`: `low | normal | high | urgent` (mặc định `normal`).
- **Response `201`:**

```json
{
  "handoff": {
    "id": "6724c...",
    "conversationId": "6724a...",
    "userId": "65f...",
    "reason": "Khách hàng yêu cầu tư vấn viên",
    "priority": "normal",
    "status": "waiting",
    "summary": "",
    "requestedAt": "2026-11-04T02:02:00.000Z",
    "assignedAdminId": null,
    "acceptedAt": null,
    "resolvedAt": null,
    "version": 1,
    "createdAt": "2026-11-04T02:02:00.000Z",
    "updatedAt": "2026-11-04T02:02:00.000Z"
  },
  "conversation": { /* ConversationDto — supportMode → "waiting_admin" */ },
  "resolvedByAi": false
}
```

- **Lỗi:** `409 CHAT_HANDOFF_ALREADY_EXISTS` (details.handoffId)

#### `GET /api/chat/conversations/:id/handoff`

- **Response `200`:** `{ "handoff": ChatHandoffDto | null }`

#### `DELETE /api/chat/conversations/:id/handoff`

- Huỷ handoff (`waiting`/`assigned` → `cancelled`), conversation trở về `supportMode: "ai"`.
- **Response `200`:** `{ "handoff": ChatHandoffDto }`

---

## 3. Endpoints — Phía ADMIN

Base: `/api/chat/admin` — yêu cầu đăng nhập + role `admin`.

### 3.1 Conversations

| Method | Path | Query / Body | Ghi chú |
| :--- | :--- | :--- | :--- |
| `GET` | `/conversations` | `?scope=unassigned\|mine\|all&status=&supportMode=&page=&limit=` | `scope=unassigned` ⇒ hàng đợi chờ |
| `GET` | `/conversations/:id` | — | Kèm `assignedAdminName` |
| `POST` | `/conversations/:id/assign` | `{ expectedVersion? }` | Claim ⇒ `supportMode: "human"`, gán `assignedAdminId` |
| `POST` | `/conversations/:id/accept` | `{ expectedVersion? }` | Nhận handoff (`assigned → accepted`) |
| `POST` | `/conversations/:id/close` | — | Đóng hội thoại |
| `POST` | `/conversations/:id/reopen` | — | Mở lại ⇒ `supportMode: "ai"` |
| `GET` | `/unread-count` | — | Tổng unread trong hàng đợi |

### 3.2 Messages

| Method | Path | Body | Ghi chú |
| :--- | :--- | :--- | :--- |
| `GET` | `/conversations/:id/messages` | `?limit=&before=&after=` | **Bao gồm** tin `internal` |
| `POST` | `/conversations/:id/messages` | `{ content, messageType?, attachments?, clientMessageId?, visibility? }` | `visibility: "internal"` ⇒ ghi chú nội bộ |
| `POST` | `/conversations/:id/read` | — | Reset `unreadCount.admin` |

### 3.3 Handoff queue

| Method | Path | Body | Ghi chú |
| :--- | :--- | :--- | :--- |
| `GET` | `/handoffs` | `?status=all\|waiting\|assigned\|accepted\|resolved\|cancelled&page=&limit=` | Sắp theo `priority` desc, `requestedAt` asc |
| `POST` | `/conversations/:id/handoff/assign` | `{ expectedVersion? }` | Claim (`waiting → assigned`) |
| `POST` | `/conversations/:id/handoff/resolve` | `{ expectedVersion?, returnToAi? }` | `returnToAi` mặc định `true` |

### 3.4 AI Copilot

Base: `/api/chat/admin/copilot` — cần `FEATURE_AI_COPILOT=true`.

| Method | Path | Body / Query | Response |
| :--- | :--- | :--- | :--- |
| `GET` | `/conversations/:id/summary` | — | `{ summary: { summary, customerIntent, currentStatus, suggestedNextSteps[], lastMessagePreview, urgent, tokensUsed, latencyMs } }` |
| `POST` | `/conversations/:id/suggest-reply` | `{ instruction? }` | `{ suggestion: { suggestion, summary, needMoreInfo[], toolsUsed[], tokensUsed, latencyMs } }` |
| `POST` | `/conversations/:id/note` | `{ note? }` | `201 { note: { conversationId, noteId, note, createdAt } }` |
| `GET` | `/conversations/:id/context` | — | `{ context: { handoff\|null, sentiment, intent, urgent } }` — **không** gọi AI |
| `GET` | `/policies` | `?query=&category=&limit=` | `{ results: [{ id, title, category, summary, content, relevance }], count }` |

- `POST /note` không có `note` ⇒ AI tự tóm tắt thành ghi chú nội bộ.
- `POST /note` có `note` ⇒ lưu nguyên văn, **không** gọi AI (0 token).
- **Lỗi:** `403 CHAT_FORBIDDEN` (không phải admin) · `503 CHAT_AI_UNAVAILABLE` (flag tắt / provider lỗi)

### 3.5 Knowledge Base

Base: `/api/chat/admin/knowledge`.

| Method | Path | Body / Query |
| :--- | :--- | :--- |
| `GET` | `/` | `?status=&category=&q=&page=&limit=` |
| `GET` | `/:id` | — |
| `POST` | `/` | `{ title*, content*, summary?, category?, keywords?, tags?, status?, priority?, isActive? }` |
| `PUT` | `/:id` | Cùng shape (partial update) |
| `DELETE` | `/:id` | **Archive** (xoá mềm) |

- `category`: `policy | faq | guide | product_care | shipping | payment | return | warranty`
- `status`: `draft | published | archived`
- Chỉ `published` + `isActive: true` ⇒ AI dùng được.
- `slug` tự sinh từ `title` (bỏ dấu, phân biệt hoa thường), tự thêm hậu tố nếu trùng.

---

## 4. Socket.IO — Namespace `/chat`

### 4.1 Client → Server

| Event | Payload | Ack |
| :--- | :--- | :--- |
| `message:send` | `{ conversationId, content, messageType?, attachments?, clientMessageId? }` | `{ ok: true, data: { message, duplicate } }` |
| `message:typing` | `{ conversationId, isTyping }` | `{ ok: true, data: { ok: true } }` |
| `conversation:subscribe` | `{ conversationId }` | `{ ok: true, data: { conversationId } }` |
| `conversation:unsubscribe` | `{ conversationId }` | — |
| `conversation:read` | `{ conversationId }` | `{ ok: true, data: { markedCount } }` |
| `chat:ping` | — | `{ ok: true, data: { serverTime } }` |

### 4.2 Server → Client

| Event | Payload |
| :--- | :--- |
| `message:new` | `{ conversationId, message: MessageDto, echo: boolean }` |
| `conversation:updated` | `{ conversationId, conversation: ConversationDto }` |
| `conversation:unread` | `{ conversationId, unreadCount: { user, admin } }` |
| `message:typing` | `{ conversationId, userId, isTyping }` |
| `handoff:updated` | `{ conversationId, handoff: HandoffDto, status: "created"\|"accepted"\|"resolved"\|"cancelled" }` |
| `ai:status` | `{ conversationId, status: "thinking"\|"answered"\|"escalated"\|"unavailable", message? }` |
| `chat:connected` | `{ userId, roles, serverTime }` |

**Quy tắc quan trọng:**
- `message:new` với `echo: true` ⇒ tin do chính client gửi ⇒ **bỏ qua render**.
- Tin `internal` chỉ tới room `admins` ⇒ user **không** nhận.
- `ai:status === "thinking"` ⇒ bật typing indicator; `"answered"` ⇒ tắt.

### 4.3 Rooms

| Room | Thành viên |
| :--- | :--- |
| `conversation:<id>` | Client đã `conversation:subscribe` |
| `user:<id>` | Mọi socket của 1 user (badge đồng bộ đa tab) |
| `admins` | Mọi admin online |

### 4.4 Rate limit

- **10 tin / 1 giây / user** (cửa sổ trượt).
- Vượt ⇒ ack `{ ok: false, error: { code: "CHAT_RATE_LIMITED" } }`.

---

## 5. Error Codes

| Code | HTTP | Nguyên nhân |
| :--- | :--- | :--- |
| `CHAT_CONVERSATION_NOT_FOUND` | 404 | Không tồn tại |
| `CHAT_FORBIDDEN` | 403 | Không có quyền |
| `CHAT_INVALID_ID` | 400 | ID sai định dạng |
| `CHAT_EMPTY_CONTENT` | 400 | Tin rỗng, không có attachment |
| `CHAT_MESSAGE_TOO_LONG` | 400 | > 5000 ký tự |
| `CHAT_CONVERSATION_CLOSED` | 409 | Hội thoại đã đóng |
| `CHAT_DUPLICATE_MESSAGE` | 409 | Idempotency hit (hiện trả 200 + `duplicate: true`) |
| `CHAT_VERSION_CONFLICT` | 409 | Optimistic lock stale |
| `CHAT_RATE_LIMITED` | 429 | Gửi quá nhanh |
| `CHAT_AI_UNAVAILABLE` | 503 | AI/Copilot tắt hoặc provider lỗi |
| `CHAT_AI_ESCALATED` | 503 | AI đã chuyển nhân viên |
| `CHAT_AI_QUOTA_EXCEEDED` | 429 | Hết quota AI hôm nay |
| `CHAT_HANDOFF_NOT_FOUND` | 404 | Không có handoff |
| `CHAT_HANDOFF_ALREADY_EXISTS` | 409 | Đã có yêu cầu chờ |
| `CHAT_HANDOFF_INVALID_TRANSITION` | 409 | Transition không hợp lệ |
| `CHAT_REOPEN_WINDOW_EXPIRED` | 409 | Quá 24h |

---

## 6. Curl examples

```bash
# Mở conversation
curl -X POST http://localhost:4000/api/chat/conversations \
  -H "Authorization: Bearer $TOKEN"

# Gửi tin (idempotent)
curl -X POST http://localhost:4000/api/chat/conversations/$CONV_ID/messages \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"content":"Cây thông size L giá bao nhiêu?","clientMessageId":"uuid-1"}'

# Gửi lại cùng clientMessageId ⇒ duplicate=true

# Load tin cũ hơn
curl "http://localhost:4000/api/chat/conversations/$CONV_ID/messages?limit=30&before=$OLDEST_ID" \
  -H "Authorization: Bearer $TOKEN"

# Chuyển nhân viên
curl -X POST http://localhost:4000/api/chat/conversations/$CONV_ID/handoff \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"reason":"Cần tư vấn viên","priority":"high"}'

# Admin: ghi chú nội bộ
curl -X POST http://localhost:4000/api/chat/admin/conversations/$CONV_ID/messages \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"content":"KH VIP, cần gọi lại","visibility":"internal"}'
```
