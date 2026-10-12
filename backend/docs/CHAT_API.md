# Chat API — FE Integration Guide

> **Version:** 1.0 · **Last updated:** 2026-10-13 · **Backend status:** ✅ Deployed

This doc is the single source of truth for FE devs integrating the chat
feature. The BE has been finalized; please follow the contracts below exactly.

---

## 1. Environment variables

| Var | Value (dev) | Value (prod) |
|-----|-------------|--------------|
| `VITE_API_URL` | `http://localhost:4000` | `https://christmas-8ca4.onrender.com` |

> **One URL is enough.** Socket.io connects to the same host as REST.
> Do NOT introduce a separate `VITE_SOCKET_URL`.

The JWT is read from `localStorage["token"]` (same key as the rest of the
app). The `api` instance from `@/lib/api` already attaches it.

---

## 2. Auth on socket

The socket REQUIRES a valid JWT. Pass it via `auth.token` on `io()`:

```ts
import { io } from "socket.io-client";

const token = localStorage.getItem("token");
const socket = io(import.meta.env.VITE_API_URL, {
  auth: { token },
  transports: ["websocket", "polling"],
  reconnection: true,
});
```

If the token is missing or invalid, the server **rejects the connection**
with `UNAUTHORIZED: token missing` / `UNAUTHORIZED: invalid token`. The
client will not receive any events.

> **The client no longer needs to emit `chat:join`.** On successful
> connection the server auto-joins the global room and immediately emits
> `chat:unread { unread }`. (Emitting `chat:join` again is a no-op and
> still safe to send for back-compat.)

---

## 3. TypeScript types

Re-export or copy these from `types/chat.ts`:

```ts
export type ChatRole = "buyer" | "admin" | "system";

export interface Message {
  _id: string;
  conversationId: string;       // always "global" for now
  role: ChatRole;               // "buyer" for users, "admin" for staff
  senderId: string;
  senderName: string;
  content: string;              // max 2000 chars
  isRead: boolean;
  readAt: string | null;        // ISO 8601
  sentAt: string;               // ISO 8601
  isOwn: boolean;               // computed by BE: true if current user sent it
}

export interface ChatHistoryResponse {
  messages: Message[];
  total: number;                // total in conversation
  hasMore: boolean;             // true if more older messages exist
}
```

> **Role mapping:** The DB stores `"user" | "admin" | "system"`. The BE
> maps `"user" → "buyer"` in the DTO. **FE should never see `"user"`.**
> If it does, that is a bug in the BE.

---

## 4. REST endpoints

Base path: `${VITE_API_URL}/api/chat`. All endpoints require `Authorization: Bearer <token>`.

### 4.1 `GET /messages` — paginated history

| Query | Type | Default | Notes |
|-------|------|---------|-------|
| `limit` | number | 50 | max 100 |
| `before` | string | — | ObjectId of the oldest message you have; returns messages STRICTLY OLDER than this |
| `page` | number | 1 | alternative cursor (use `before` for infinite scroll) |

**Response 200:**
```json
{
  "messages": [Message, Message, ...],  // ordered oldest → newest
  "total": 123,
  "hasMore": true
}
```

> The BE **also marks unread messages from others as read** when you
> fetch history. No need to call `/markRead` separately after open.

### 4.2 `POST /messages` — send (REST fallback)

**Body:** `{ "content": "string" }`

**Response 201:**
```json
{ "message": Message }
```

> **Prefer `socket.emit("chat:send", { content })`** for real-time.
> This REST endpoint is a fallback for when the socket is disconnected
> and the user is still trying to send. UI should automatically fall
> back to REST if `socket.connected === false` and retry with socket
> when reconnected.

### 4.3 `GET /unread` — current unread count

**Response 200:** `{ "unread": number }`

> Mostly redundant with the `chat:unread` socket event, but useful for
> fetching the initial count on app mount before the socket connects.

### 4.4 `POST /markRead` — mark messages as read

> ⚠️ **Endpoint is `/markRead`, NOT `/read` or `/messages/read`.**

**Body:** `{ "lastMessageId": "string (ObjectId)" }` (optional)

If `lastMessageId` is omitted, marks ALL unread messages from others
in the global room as read.

**Response 200:** `{ "success": true }`

---

## 5. Socket events

### 5.1 Client → Server

| Event | Payload | Notes |
|-------|---------|-------|
| `chat:send` | `{ content: string }` | Server validates (non-empty, ≤ 2000 chars) |
| `chat:markRead` | `{ lastMessageId?: string }` | Mirror of REST `/markRead` |
| `chat:leave` | `{}` | Optional — disconnect also handles cleanup |

> ❌ **No need to emit `chat:join`.** Auto-joined on connect.

### 5.2 Server → Client

| Event | Payload | When |
|-------|---------|------|
| `chat:message` | `Message` | New message broadcast (also fired for your own messages — use `isOwn` to filter) |
| `chat:unread` | `{ unread: number }` | On connect, after every `chat:send`/`chat:markRead` |
| `chat:error` | `{ message: string }` | Validation error (empty content, too long, etc.) |

### 5.3 Connection lifecycle

```
client                          server
  │ ── connect (auth: token) ─→ │
  │ ←─ connected ─────────────  │   (auto-join global room)
  │ ←─ chat:unread { n } ─────  │   (initial count)
  │                              │
  │ ── chat:send { content } ─→ │
  │ ←─ chat:message ──────────  │   (your own message, isOwn=true)
  │ ←─ chat:unread { n+1 } ───  │   (broadcast to OTHER users)
  │                              │
  │ ←─ chat:message ──────────  │   (incoming from other user, isOwn=false)
  │ ←─ chat:unread { n+1 } ───  │
```

---

## 6. UI behaviors to implement

| Behavior | How |
|----------|-----|
| Unread badge on FAB | Bind to `chat:unread.unread` |
| Toast on new message when panel closed | Listen `chat:message`, if `!isOwn && !panelOpen` → `toast.info(...)` |
| Auto-scroll to bottom on new own message | In `MessageList` useEffect on messages length |
| Load older messages on scroll-top | Call `GET /messages?before={oldestId}&limit=30` |
| Reconnect with backoff | socket.io `reconnection: true` (default) — display a small "Mất kết nối" banner if `!connected` |
| Send via socket, fall back to REST | `if (socket.connected) socket.emit("chat:send", { content }); else POST /messages` |
| Mark read on open panel | On panel open, emit `chat:markRead` with last `Message._id` |

---

## 7. Admin vs Buyer

- The role of the SENDER is in `Message.role` (`"buyer" | "admin" | "system"`).
- The widget for **buyers** should only render if `user.role !== "ADMIN"`.
- The **admin page** (`/admin/chat`) should only render if `user.role === "ADMIN"`.
- The server auto-detects admin from `JWT.roles[]` and tags admin messages
  with `role: "admin"`. **Buyers cannot impersonate admin** — the JWT is
  signed and verified on the server.

---

## 8. What changed from the original plan

| Original plan | Actual BE | Why |
|---------------|-----------|-----|
| `POST /api/chat/messages/read` | `POST /api/chat/markRead` | Clearer intent — same semantics |
| `Message.role === "user"` | `Message.role === "buyer"` | UX-friendly name on the wire |
| Client emits `chat:join` first | Auto-join on connect | One less round-trip, no race conditions |
| No socket auth | JWT verified on handshake | Without this, anyone could claim to be admin |

---

## 9. Quick smoke test (after FE wired up)

1. Login as buyer A in tab 1, buyer B in tab 2 (or buyer + admin).
2. Open tab 1's chat panel → see initial `chat:unread` (likely 0).
3. In tab 2, send "hello" via socket.
4. Tab 1 should receive:
   - `chat:message` with `isOwn: false`, `role: "buyer"`, `senderName: "..."`
   - `chat:unread` `{ unread: 1 }`
5. Tab 1 opens panel → calls `GET /messages` → BE marks them read → tab 1 receives `chat:unread` `{ unread: 0 }`.
6. Tab 2's outgoing message in tab 1 shows **NOT** marked isOwn.

If any of these fail, check browser console + server logs.
