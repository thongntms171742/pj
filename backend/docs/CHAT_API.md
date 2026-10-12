# Chat API — FE Integration Guide (1-1 Model)

> **Version:** 2.0 · **Last updated:** 2026-10-13 · **Backend status:** ✅ Deployed
>
> **Breaking change from v1:** chat is now **1-1 (buyer ↔ admin)**.
> Each buyer has exactly one conversation with the admin team. Admin
> sees one conversation per buyer. The old "global room" endpoint
> `GET /api/chat/messages` is GONE.

This doc is the single source of truth for FE devs integrating chat.

---

## 1. Environment variables

| Var | Value (dev) | Value (prod) |
|-----|-------------|--------------|
| `VITE_API_URL` | `http://localhost:4000` | `https://<render-app>.onrender.com` |

> **One URL is enough.** Socket.io connects to the same host as REST.

The JWT is read from `localStorage["token"]`. The `api` instance from
`@/lib/api` already attaches it as `Authorization: Bearer <token>`.

---

## 2. TypeScript types

```ts
export type ChatRole = "buyer" | "admin" | "system";

export interface Message {
  _id: string;
  conversationId: string;       // e.g. "c_<userA>__<userB>" (sorted)
  role: ChatRole;               // "buyer" for users, "admin" for staff
  senderId: string;
  senderName: string;
  content: string;              // max 2000 chars
  isRead: boolean;
  readAt: string | null;
  sentAt: string;
  isOwn: boolean;               // computed by BE
}

export interface Conversation {
  conversationId: string;
  peerId: string;               // the OTHER participant
  peerName: string;
  peerAvatar?: string;
  lastMessage: {
    content: string;
    sentAt: string;
    senderId: string;
    role: ChatRole;
  } | null;
  unread: number;               // unread from peer
  updatedAt: string;
}
```

> The DB stores `role: "user" | "admin" | "system"`. The BE DTO maps
> `"user" → "buyer"`. FE should never see `"user"`.

---

## 3. The "admin" pseudo-id

Buyers don't have an ObjectId for "the admin team". The BE uses the
literal string **`"admin"`** as the peerId for all buyer ↔ admin chats.

| User type | `peerId` for the other side |
|-----------|------------------------------|
| Buyer | always `"admin"` |
| Admin | the buyer's real `_id` (24-char ObjectId) |

This means:

```ts
// In your buyer-side chat store
const ADMIN_PEER_ID = "admin";
const peerId = user.role === "admin" ? otherUserId : ADMIN_PEER_ID;
```

---

## 4. REST endpoints

Base: `${VITE_API_URL}/api/chat`. All require `Authorization: Bearer <token>`.

### 4.1 `GET /conversations` — list my conversations

| User | Returns |
|------|---------|
| Buyer | 0 or 1 conversation (with admin) — empty if they never messaged |
| Admin | One entry per buyer who has chatted, newest first |

**Response 200:**
```json
{
  "conversations": [Conversation, ...]
}
```

### 4.2 `GET /conversations/:peerId/messages` — history with peer

| Query | Type | Default | Notes |
|-------|------|---------|-------|
| `limit` | number | 50 | max 100 |
| `before` | string | — | ObjectId of the oldest you have; returns STRICTLY OLDER messages |
| `page` | number | 1 | alternative cursor |

> `:peerId` is `"admin"` for buyers, buyer's `_id` for admin.

**Response 200:**
```json
{
  "messages": [Message, ...],     // oldest → newest
  "total": 123,
  "hasMore": true,
  "conversationId": "c_...",
  "peerId": "admin"
}
```

> The BE also marks unread messages from the peer as read when you
> fetch history.

### 4.3 `POST /conversations/:peerId/messages` — send (REST fallback)

**Body:** `{ "content": "string" }`

**Response 201:**
```json
{
  "message": Message,
  "conversationId": "c_..."
}
```

> Prefer socket. This REST endpoint is a fallback when `socket.connected === false`.

### 4.4 `GET /conversations/:peerId/unread` — unread in this conv

**Response 200:** `{ "unread": number, "conversationId": "c_..." }`

### 4.5 `POST /conversations/:peerId/markRead` — mark as read

**Body:** `{ "lastMessageId": "string (ObjectId)" }` (optional)

**Response 200:** `{ "success": true, "conversationId": "c_..." }`

### 4.6 `GET /unread` — TOTAL unread across all my convs

**Response 200:** `{ "unread": number }`

> Use this for the global badge on the chat FAB. Per-conversation
> unread comes from the conversation list.

### 4.7 Security errors (all chat endpoints)

| HTTP | `error.code` | When |
|------|--------------|------|
| 400 | `INVALID_INPUT` | bad `peerId` for admin, etc. |
| 403 | `FORBIDDEN` | buyer tried to chat with another buyer |
| 404 | `NOT_FOUND` | no such endpoint (e.g. you called the old `/messages`) |

---

## 5. Socket events

### 5.1 Connect

```ts
import { io } from "socket.io-client";

const socket = io(import.meta.env.VITE_API_URL, {
  auth: { token: localStorage.getItem("token") ?? "" },
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10_000,
  timeout: 30_000,
});
```

On connect, the server **auto-joins** the socket to all conversations
the user is a participant in (queried from `Message.participants`).
No `chat:join` needed.

> If the user is a brand-new buyer with no messages, the auto-join is
> a no-op. They emit `chat:join` with the admin conversationId
> after they send their first message.

### 5.2 Client → Server

| Event | Payload | Notes |
|-------|---------|-------|
| `chat:join` | `{ conversationId }` | Idempotent; safe to call after first message |
| `chat:send` | `{ conversationId, content }` | Validates sender is a participant |
| `chat:markRead` | `{ conversationId, lastMessageId? }` | |
| `chat:typing` | `{ conversationId }` | Not persisted, just a UI hint |
| `chat:leave` | `{ conversationId }` | Optional — disconnect also handles |

> If you send a `conversationId` you're not in, the server replies with
> `chat:error { code: "FORBIDDEN_NOT_PARTICIPANT" }`.

### 5.3 Server → Client

| Event | Payload | When |
|-------|---------|------|
| `chat:message` | `Message` | New message in any joined conversation (also your own — use `isOwn`) |
| `chat:joined` | `{ conversationId }` | After successful `chat:join` |
| `chat:unread` | `{ unread }` | On connect, after each `chat:send`/`chat:markRead` (total across all convs) |
| `chat:typing` | `{ conversationId, userId, userName }` | Peer is typing |
| `chat:error` | `{ code, message }` | Validation / permission / internal error |

### 5.4 Lifecycle (1-1)

```
client (buyer)                      server
  │ ── connect (auth: token) ─────→ │
  │ ←─ connected ────────────────── │  (auto-join any existing conv)
  │ ←─ chat:unread { n } ────────── │  (initial total)
  │                                  │
  │ ── chat:send ──────────────────→ │
  │   { conversationId, content }   │
  │ ←─ chat:message ─────────────── │  (you, isOwn=true)
  │ ←─ chat:unread { n } ────────── │  (still 0 for you)
  │                                  │
  │ ←─ chat:message ─────────────── │  (from admin/peer, isOwn=false)
  │ ←─ chat:unread { n+1 } ──────── │
  │                                  │
  │ ── chat:markRead ──────────────→ │
  │ ←─ chat:unread { 0 } ────────── │
```

---

## 6. UI behaviors to implement

| Behavior | How |
|----------|-----|
| Unread badge on FAB | Bind to `chat:unread.unread` (total) |
| Inbox list (admin) | Call `GET /conversations`, render with `unread` per row |
| Open a conversation | `GET /conversations/:peerId/messages?limit=30` |
| Load older on scroll-top | `GET /conversations/:peerId/messages?before={oldestId}&limit=30` |
| Send | `socket.emit("chat:send", { conversationId, content })`, fallback to REST |
| Toast on incoming | `socket.on("chat:message")` → if `!isOwn && !panelOpen` → toast |
| Mark read on panel open | `socket.emit("chat:markRead", { conversationId, lastMessageId })` |
| Typing indicator | Throttled `socket.emit("chat:typing", { conversationId })` every 3s while typing |

---

## 7. Admin-only flows

- `GET /conversations` returns one entry per **buyer** (not per admin).
- For each, `peerId` is the buyer's `_id` — pass it to subsequent calls.
- Admin chat page URL: `/admin/chat?peerId=...` (or whatever your router uses).
- The server auto-detects admin from `JWT.roles[]` — buyers can't impersonate.

---

## 8. Render deployment notes

Render free tier sits behind a proxy that:

- **Closes idle WS after ~55s** — mitigated with `pingInterval: 20s,
  pingTimeout: 25s, upgradeTimeout: 30s`.
- **Sleeps after 15 min no traffic** — first connection takes 30-50s.
  Client MUST use `reconnection: true` + `reconnectionAttempts: Infinity`
  and show a "Đang kết nối..." banner.

### If you see "WebSocket is closed before the connection is established"

Force polling-only as a workaround:

```ts
const socket = io(url, { auth: { token }, transports: ["polling"] });
```

Test polling manually in browser:
`https://<your-app>.onrender.com/socket.io/?EIO=4&transport=polling`
→ expect `{"sid":"...","upgrades":["websocket"],"pingInterval":20000,...}`.

---

## 9. What changed from v1 (global room)

| v1 (global) | v2 (1-1) |
|-------------|----------|
| `GET /api/chat/messages` | `GET /api/chat/conversations/:peerId/messages` |
| `POST /api/chat/messages` | `POST /api/chat/conversations/:peerId/messages` |
| `POST /api/chat/markRead` | `POST /api/chat/conversations/:peerId/markRead` |
| `conversationId = "global"` | `conversationId = "c_<userA>__<userB>"` (sorted) |
| One room, everyone hears everything | Per-conversation room, only 2 participants |
| `chat:join` required | Auto-joined on connect |
| No conversation list | `GET /api/chat/conversations` |

---

## 10. Quick smoke test

1. Login as buyer A in tab 1, admin in tab 2.
2. Buyer A calls `GET /conversations` → `[]` (never messaged).
3. Buyer A sends a message via socket (or POST to
   `/conversations/admin/messages`).
4. Admin's `GET /conversations` now shows 1 entry (buyer A) with `unread: 1`.
5. Admin opens it → `GET /conversations/<buyerA id>/messages` → admin's
   `unread` becomes 0, admin's `chat:unread` event fires.
6. Admin replies via socket → buyer A receives `chat:message` (isOwn=false).
7. Buyer A opens panel → marks read → `chat:unread { unread: 0 }`.

If any step fails, check the browser console + Render logs.
