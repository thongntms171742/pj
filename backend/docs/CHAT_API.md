# Chat 1-1 REST & Socket API Specification

> **Architecture:** Chat 1-1 trực tiếp `User ↔ Admin` (đã loại bỏ hoàn toàn AI Chatbot, Handoff, Copilot và Knowledge Base).
> **Hướng dẫn tích hợp cho FE/Mobile:** [`docs_BE write/FE_CHAT_INTEGRATION_GUIDE.md`](../../docs_BE%20write/FE_CHAT_INTEGRATION_GUIDE.md)

---

## 1. Tổng quan

| | |
|---|---|
| **Base URL** | `/api/chat` (user) · `/api/chat/admin` (admin) |
| **Auth** | `Authorization: Bearer <token>` — bắt buộc cho cả REST & Socket |
| **Socket namespace** | `/chat` |
| **Status enum** | `open \| pending \| closed` |
| **Support mode enum** | `waiting_admin \| human` |
| **Sender type enum** | `user \| admin \| system` |

### Quy tắc cốt lõi
1. **Phân quyền ở Service** (`chatPermission.service.ts`), không đặt ở Controller.
2. **Tin nhắn `internal` không bao giờ lọt tới User**: lọc 2 tầng ở query `listMessages` và Socket broadcast `chat.emitter`.
3. **Idempotency**: index unique partial `(conversationId, clientMessageId)` chống trùng tin nhắn khi retry.
4. **Optimistic Locking**: field `version` tăng mỗi lần mutation; lệch version trả `409 CHAT_VERSION_CONFLICT`.
5. **Lifecycle 1-1**:
   - User mở chat (`POST /api/chat/conversations`) → `supportMode: "waiting_admin"`, `assignedAdminId: null`.
   - Admin tiếp nhận (`POST /api/chat/admin/conversations/:id/assign`) → `supportMode: "human"`, `assignedAdminId: <adminId>`.
   - Reopen (`closed → open`) → quay về `supportMode: "waiting_admin"`, `assignedAdminId: null`.

---

## 2. User Endpoints (`/api/chat`)

- `GET /api/chat/conversations` (`?status=all|open|pending|closed&page=&limit=`)
- `POST /api/chat/conversations` (`?forceNew=true`)
- `GET /api/chat/conversations/unread-count`
- `GET /api/chat/conversations/:id`
- `POST /api/chat/conversations/:id/close`
- `POST /api/chat/conversations/:id/reopen`
- `GET /api/chat/conversations/:id/messages` (`?limit=&before=&after=`)
- `POST /api/chat/conversations/:id/messages` (`{ content, messageType?, attachments?, clientMessageId? }`)
- `POST /api/chat/conversations/:id/read`

## 3. Admin Endpoints (`/api/chat/admin`)

- `GET /api/chat/admin/conversations` (`?scope=all|unassigned|mine&status=active|open|pending|closed|all&supportMode=all|waiting_admin|human&page=&limit=`)
- `GET /api/chat/admin/conversations/:id`
- `POST /api/chat/admin/conversations/:id/assign` (`{ expectedVersion? }`)
- `POST /api/chat/admin/conversations/:id/close`
- `POST /api/chat/admin/conversations/:id/reopen`
- `GET /api/chat/admin/conversations/:id/messages` (`?limit=&before=&after=`)
- `POST /api/chat/admin/conversations/:id/messages` (`{ content, messageType?, attachments?, visibility?: "public"|"internal", clientMessageId? }`)
- `POST /api/chat/admin/conversations/:id/read`
- `GET /api/chat/admin/unread-count`

## 4. Socket Namespace `/chat`

- **Client → Server**: `conversation:subscribe`, `conversation:unsubscribe`, `message:send`, `message:typing`, `conversation:read`, `chat:ping`
- **Server → Client**: `chat:connected`, `message:new`, `conversation:updated`, `conversation:unread`, `message:typing`, `chat:error`

## 5. Migration Script

Chạy 1 lần trên dữ liệu cũ trước hoặc sau khi deploy:
```bash
npm --prefix backend run migrate:chat-1on1 -- --dry-run
npm --prefix backend run migrate:chat-1on1
```
Script thực hiện:
- `Conversation` có `supportMode` là `ai` / `ai_assisted` → `supportMode: "waiting_admin"`, `aiConfig.enabled: false` (`human` giữ nguyên kèm `assignedAdminId`).
- `Message` có `senderType: "ai"` → `"system"`, `$unset` field `aiMetadata`.
- Drop collection `handoffrequests` nếu tồn tại.
