# Chat Hybrid API — Architecture & Internal Contract (v4 / TDD v1.0)

> **Mục đích:** Tài liệu KỸ THUẬT cho Backend & team maintain. Tài liệu dành cho **Frontend/Mobile** nằm ở `docs_BE write/FE_CHAT_INTEGRATION_GUIDE.md`.
>
> **Hệ thống:** Build Your Christmas — Hybrid AI & Human Support System (TDD v1.0)
> **Trạng thái:** ✅ Hoàn tất P1 → P7. Test: 178 + 104 + 39 = **321 assertions xanh**, `tsc --noEmit` sạch.

---

## 1. Tổng quan kiến trúc

### 1.1 Nguyên tắc thiết kế

| # | Nguyên tắc | Hiện thực |
| :--- | :--- | :--- |
| 1 | **AI không bao giờ bịa thông tin** | Mọi dữ liệu thực tế (giá, tồn kho, đơn hàng, chính sách) đến từ **tool** có truy vấn DB thật. Prompt cấm tự bịa. |
| 2 | **Phân quyền ở service, không ở controller** | `chatPermission.service.ts` là nguồn sự thật duy nhất. |
| 3 | **Tin `internal` không bao giờ lọt tới user** | Lọc 2 tầng: query (`listMessages`) + broadcast (`chat.emitter`). |
| 4 | **Không circular dependency** | `chat.emitter.ts` là cầu nối; service gọi emitter, emitter không import service. |
| 5 | **Idempotency cho mọi tin nhắn** | Partial unique index `(conversationId, clientMessageId)`. |
| 6 | **Optimistic locking cho mọi mutation cạnh tranh** | `version` tăng mỗi lần update; stale ⇒ `409 CHAT_VERSION_CONFLICT`. |
| 7 | **Config tập trung, không hardcode** | `config/ai.config.ts`, `config/chat.config.ts`, `config/shipping.config.ts`. |

### 1.2 Cây thư mục

```
backend/src/
├── config/
│   ├── ai.config.ts          # Model ID, timeout, quota, feature flags
│   ├── chat.config.ts        # Pagination, độ dài tin, rate limit socket
│   ├── shipping.config.ts    # Phí ship, thời gian giao (nguồn cho AI tool)
│   └── env.ts                # Lazy env getters (an toàn ESM hoisting)
├── models/
│   ├── Conversation.ts       # Hội thoại (status + supportMode + version)
│   ├── Message.ts            # Tin nhắn (visibility + clientMessageId + aiMetadata)
│   ├── HandoffRequest.ts     # Hàng đợi chuyển nhân viên
│   └── KnowledgeDocument.ts  # Kho tri thức (chính sách cho AI)
└── modules/
    ├── chat/
    │   ├── controllers/  chat.controller.ts, adminChat.controller.ts
    │   ├── dto/          chat.dto.ts (contract), chat.mapper.ts (Mongoose→DTO)
    │   ├── routes/       chat.routes.ts, adminChat.routes.ts
    │   ├── services/     chatPermission, conversation, message, handoff, chatRateLimit
    │   └── socket/       chat.events, chat.socket, chat.emitter
    └── ai/
        ├── controllers/  aiCopilot.controller.ts, knowledge.controller.ts
        ├── prompts/      systemPrompt.ts
        ├── providers/    ai-provider.interface.ts, gemini.provider.ts
        ├── routes/       aiCopilot.routes.ts, knowledge.routes.ts
        ├── services/     intent, sentiment, knowledge, ai-orchestrator, ai-copilot
        └── tools/        index, product, order, shipping, support
```

---

## 2. Data Model

### 2.1 `Conversation`

| Field | Type | Ghi chú |
| :--- | :--- | :--- |
| `userId` | ObjectId | Chủ hội thoại. |
| `status` | `open` \| `pending` \| `closed` | Vòng đời. |
| `supportMode` | `ai` \| `waiting_admin` \| `human` \| `ai_assisted` | Ai đang phục vụ. |
| `assignedAdminId` | ObjectId \| null | Admin phụ trách. |
| `aiConfig` | object | `model`, `promptVersion`, `intent`, `intentConfidence`, `sentiment`, `enabled`, `failedAttempts`, `totalTokens`. |
| `unreadCount` | `{ user, admin }` | 2 chiều. |
| `version` | number | **Optimistic lock token.** |
| `lastMessageId` / `lastMessageAt` | — | Đồng bộ realtime. |

**Index:** `{ userId, status, lastMessageAt }`, `{ status, supportMode, lastMessageAt }`, `{ assignedAdminId, status, lastMessageAt }`.

### 2.2 `Message`

| Field | Type | Ghi chú |
| :--- | :--- | :--- |
| `conversationId` | ObjectId | |
| `senderId` | ObjectId \| null | `null` cho AI/system. |
| `senderType` | `user` \| `admin` \| `ai` \| `system` | |
| `content` | string | Max 5000 ký tự (config). |
| `visibility` | `public` \| `internal` | **`internal` ⇒ chỉ admin.** |
| `attachments` | array | Max 5 file, mỗi file ≤ 10MB. |
| `aiMetadata` | object \| null | `model`, `promptVersion`, `intent`, `intentConfidence`, `sentiment`, `tokensUsed`, `latencyMs`, `toolsUsed[]`, `needsHumanReview`. |
| `clientMessageId` | string \| null | **Idempotency key.** |
| `userReadAt` / `adminReadAt` | Date \| null | Read receipt 2 chiều. |

**Index:**
- `{ conversationId, createdAt }` — load lịch sử.
- `{ conversationId, clientMessageId }` **unique partial** (`clientMessageId` là string) — idempotency.
- `{ conversationId, visibility, createdAt }` — lọc tin nội bộ.
- `{ conversationId, senderType, createdAt }` — audit.

### 2.3 `HandoffRequest`

Vòng đời: `waiting → assigned → accepted → resolved` (+ `cancelled`).

- **Index unique partial** `{ conversationId }` với filter `status ∈ {waiting, assigned, accepted}` ⇒ 1 conversation chỉ có tối đa 1 handoff đang mở.
- `priority`: `low | normal | high | urgent` — sắp xếp hàng đợi.
- `version` — optimistic lock khi 2 admin cùng claim.

### 2.4 `KnowledgeDocument`

- `title`, `slug` (unique), `category`, `content` (markdown — **nguồn sự thật**), `summary`, `keywords[]`, `tags[]`.
- `status`: `draft | published | archived`; `priority`; `isActive`; `version`.
- Chỉ `published` + `isActive` ⇒ AI dùng được.

---

## 3. State Machine

### 3.1 `status`

```
open ⇄ pending
  ↓        ↓
closed ────┘   (mở lại trong 24h)
```

### 3.2 `supportMode`

```
        ┌─────────────────────────────────────┐
        ↓                                     │
       ai ──────→ waiting_admin ──────→ human ──→ ai_assisted
        ↑              │                  │            │
        └──────────────┴──────────────────┴────────────┘
```

**Luật:**
- `ai` → `waiting_admin`: AI escalate (auto hoặc user bấm nút).
- `waiting_admin` → `human`: admin nhận handoff.
- `human` → `ai`: admin kết thúc handoff / huỷ handoff.
- `human` → `ai_assisted`: admin bật Copilot.
- `ai` → `ai_assisted`: admin claim hội thoại đang AI phục vụ.

### 3.3 Handoff

```
waiting ──→ assigned ──→ accepted ──→ resolved
   │            │            │
   └────────────┴────────────┴──────→ cancelled
```

**Luật:** `resolved` / `cancelled` là terminal.

---

## 4. Luồng AI Orchestrator

### 4.1 Pipeline

```
sendMessage(user)
  │
  ├─ persist tin user (idempotent)
  ├─ emit message:new
  └─ void triggerAiReply()          ← fire-and-forget, KHÔNG chặn API
       │
       ├─ Guard: FEATURE_AI_CHAT && provider.isAvailable()
       ├─ Guard: conversation.status !== "closed"
       ├─ Guard: conversation.supportMode === "ai"
       ├─ Guard: conversation.aiConfig.enabled !== false
       ├─ Quota: AI_DAILY_USER_LIMIT / 24h
       │
       ├─ emit ai:status { status: "thinking" }
       │
       ├─ classifyIntent(text)    ─┐
       ├─ classifySentiment(text) ─┴─ song song (rule-first, AI fallback)
       │
       ├─ shouldEscalate(intent)? ──yes──→ escalateToAdmin() + return "escalated"
       │
       ├─ buildHistory(conversation, exclude=currentMessage)
       │
       ├─ runToolLoop():
       │     ├─ provider.generateContent(history + userMsg, tools)
       │     ├─ có functionCalls? → chạy tool → append kết quả → lặp lại
       │     └─ tối đa AI_MAX_TOOL_CALLS vòng
       │
       ├─ blocked / rỗng? ──→ escalateToAdmin() + return "escalated"
       │
       ├─ persist tin AI (senderType="ai", aiMetadata đầy đủ)
       ├─ emit message:new + ai:status { status: "answered" }
       └─ updateConversationAiConfig(model, intent, sentiment, tokens)
```

### 4.2 Tool Loop

| Bước | Mô tả |
| :--- | :--- |
| 1 | Model trả `functionCalls[]` (có thể nhiều). |
| 2 | Mỗi tool được `findTool(name)` — **tool không tồn tại ⇒ báo lại cho model, KHÔNG crash**. |
| 3 | Tool `execute(args, { userId, conversationId })` — tự kiểm tra phân quyền. |
| 4 | Kết quả serialize JSON, append vào messages với role `user`. |
| 5 | Tool có `escalate: true` ⇒ append chỉ dẫn "cần chuyển nhân viên". |
| 6 | Vòng sau dùng `SYSTEM_INSTRUCTION_FOLLOWUP` (ngắn hơn, tập trung tool result). |
| 7 | Hết `AI_MAX_TOOL_CALLS` ⇒ ép model trả text (không tools). |

### 3.4 Danh sách tool

| Tool | Nguồn dữ liệu | Bảo mật |
| :--- | :--- | :--- |
| `searchProducts` | `TreeProduct` → `TreeCode` → `Tree` (catalog 3 tầng) | Công khai (giá/tồn kho). |
| `lookupOrder` | `Order` | **Chỉ đơn của chính user**; đơn người khác ⇒ "không tìm thấy". Không trả PII (địa chỉ, SĐT). |
| `shippingInfo` | `config/shipping.config.ts` | Công khai, config-driven. |
| `policySearch` | `KnowledgeDocument` | Công khai (chính sách đã publish). Không tìm thấy ⇒ `escalate: true`. |

### 4.3 Xử lý lỗi provider

| Lỗi | Hành vi |
| :--- | :--- |
| Timeout / 5xx / 429 (retryable) | `failedAttempts++`. Nếu ≥ `HANDOFF_AUTO_ESCALATE_ATTEMPTS` ⇒ escalate, reset counter. |
| Auth failed / invalid input | Throw từ provider (không retry) ⇒ cùng nhánh trên. |
| Safety blocked | Escalate ngay (`AI_BLOCKED`). |
| Quota user hết | Escalate ngay (`AI_QUOTA_EXCEEDED`). |

> **Không bao giờ** lỗi AI làm fail API gửi tin nhắn — `triggerAiReply` bọc try/catch, chỉ log.

---

## 5. Permissions

### 5.1 Ma trận

| Hành động | User (chủ) | User (khác) | Admin |
| :--- | :---: | :---: | :---: |
| Đọc conversation | ✅ | ❌ `403` | ✅ |
| Đọc tin `public` | ✅ | ❌ | ✅ |
| Đọc tin `internal` | ❌ | ❌ | ✅ |
| Gửi tin `public` | ✅ | ❌ | ✅ |
| Gửi tin `internal` | ❌ `403` | ❌ | ✅ |
| Đóng conversation | ✅ | ❌ | ✅ |
| Mở lại (24h) | ✅ | ❌ | ✅ |
| Đổi `supportMode` tuỳ ý | ❌ | ❌ | ✅ |
| Tạo handoff | ✅ | ❌ | ✅ |
| Claim/assign/resolve handoff | ❌ | ❌ | ✅ |
| AI Copilot | ❌ `403` | ❌ | ✅ |
| Quản lý knowledge | ❌ `403` | ❌ | ✅ |

### 5.2 Nguyên tắc "không rò rỉ sự tồn tại"

User cố truy cập conversation của người khác ⇒ **403 `CHAT_FORBIDDEN`** (không phải 404) — nhưng `loadConversationForActor` trả 404 khi conversation **không tồn tại**. Quyết định này cân bằng giữa UX và bảo mật.

---

## 6. Realtime (Socket.IO)

### 6.1 Namespace & Auth

- Namespace: `/chat`.
- Handshake: `auth.token` (JWT) hoặc `query.token` hoặc header `Authorization: Bearer`.
- Không hợp lệ ⇒ `next(new Error("UNAUTHORIZED: ..."))` ⇒ connect_error.
- Tất cả đọc secret **lazy** qua `getJwtSecret()` (an toàn ESM hoisting).

### 6.2 Rooms

| Room | Ai ở trong | Nhận event |
| :--- | :--- | :--- |
| `conversation:<id>` | Thành viên conversation (đã subscribe) | `message:new` (public), `conversation:updated`, `conversation:unread`, `handoff:updated`, `ai:status`, `message:typing` |
| `user:<id>` | Mọi socket của 1 user | `conversation:unread` |
| `admins` | Mọi admin online | `message:new` (**chỉ tin internal**), `handoff:updated` |

### 6.3 Emitter Pattern

```typescript
// Service layer (không biết io):
import { emitMessageNew, emitAiStatus } from "../socket/chat.emitter";
emitMessageNew({ conversationId, message: messageToDto(message) });

// Socket layer (đăng ký 1 lần lúc init):
import { registerChatNamespace } from "./chat.emitter";
registerChatNamespace(chatNamespace);
```

**Quy tắc:** emitter **không throw** — lỗi phát event không được làm fail nghiệp vụ.

### 6.4 Rate limit socket

- `CHAT_SOCKET_RATE_LIMIT` (mặc định 10) tin / `CHAT_SOCKET_RATE_LIMIT_WINDOW_MS` (1s) / user.
- Cửa sổ **trượt** (sliding window), in-memory.
- Vượt ⇒ ack `{ ok: false, error: { code: "CHAT_RATE_LIMITED" } }`.

> Production nhiều instance ⇒ chuyển sang Redis (interface `consume()` giữ nguyên).

---

## 7. Idempotency & Optimistic Locking

### 7.1 Idempotency (tin nhắn)

```
Client sinh clientMessageId (UUID v4) → gửi (socket hoặc REST)
  ├─ Message.findOne({ conversationId, clientMessageId })
  │    └─ tồn tại → return { message: existing, duplicate: true }  (KHÔNG ghi mới)
  └─ không → Message.create(...)  + partial unique index chống race 2 request song song
```

### 7.2 Optimistic Locking (conversation & handoff)

```
Client đọc conversation → version = 5
Client gửi { expectedVersion: 5 }
  ├─ filter = { _id, version: 5 }  + $inc: { version: 1 }
  ├─ match → OK (version = 6)
  └─ no match → 409 CHAT_VERSION_CONFLICT  (ai đó đã update trước)
```

**Áp dụng cho:** `assignConversation`, `acceptHandoff`, `assignHandoff`, `resolveHandoff`, `transitionConversation`.

---

## 8. Kiểm thử

### 8.1 Bộ test

| File | Phạm vi | Assertions |
| :--- | :--- | :---: |
| `src/tests/chatFoundation.test.ts` | Contract (schema, DTO, event, state machine) + DB integration (permission, idempotency, handoff, unread, pagination, AI lock) | 178 |
| `src/tests/chatAi.test.ts` | Intent/sentiment, tool registry, knowledge scoring, orchestrator (tool loop, escalate, provider error, blocked), copilot, quota | 104 |
| `src/tests/chatSocket.test.ts` | Auth, rooms, subscribe, send, typing, read, rate limit, internal visibility | 39 |

### 8.2 Chạy test

```bash
npm run test:chat        # foundation
npm run test:chat:ai     # AI
npm run test:chat:socket # socket
npm run test:all         # toàn bộ
npx tsc --noEmit         # typecheck
```

### 8.3 Mock provider

`chatAi.test.ts` dùng `MockProvider` (không cần Gemini API key):
- Dispatch theo `systemInstruction`: intent classify / sentiment classify / sinh câu trả lời.
- `answerCalls` tách riêng `calls` để assert tool loop chính xác.
- Inject qua `processUserMessage(..., { provider: mock, skipQuota: true })`.

---

## 9. Vận hành

### 9.1 Feature flags

| Flag | Mặc định | Tắt ⇒ hệ quả |
| :--- | :--- | :--- |
| `FEATURE_AI_CHAT` | `true` | AI không trả lời; conversation mới → `waiting_admin`. |
| `FEATURE_AI_HANDOFF` | `true` | AI không tạo handoff (conversation kẹt ở `ai`). |
| `FEATURE_AI_COPILOT` | `false` | Endpoint Copilot ⇒ `503 CHAT_AI_UNAVAILABLE`. |
| `FEATURE_KNOWLEDGE_BASE` | `true` | `policySearch` luôn trả "không tìm thấy" ⇒ escalate. |

### 9.2 Tắt AI mà không deploy code

```bash
# Tắt AI trả lời (vẫn giữ chat hoạt động)
FEATURE_AI_CHAT=false
```

### 9.3 Seed kho tri thức

Tạo tài liệu qua API admin:

```bash
curl -X POST http://localhost:4000/api/chat/admin/knowledge \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Chính sách đổi trả",
    "category": "return",
    "content": "Khách hàng được đổi trả trong 7 ngày kể từ khi nhận hàng...",
    "summary": "Đổi trả trong 7 ngày",
    "keywords": ["doi tra", "hoan tien", "7 ngay"],
    "status": "published",
    "priority": 20
  }'
```

### 9.4 Monitor

| Metric | Nguồn |
| :--- | :--- |
| Token đã dùng | `conversation.aiConfig.totalTokens` |
| AI lỗi liên tiếp | `conversation.aiConfig.failedAttempts` |
| Tool đã dùng | `message.aiMetadata.toolsUsed[]` |
| Intent + confidence | `message.aiMetadata.intent` / `.intentConfidence` |
| Sentiment | `message.aiMetadata.sentiment` |
| Token tốn/lượt | `message.aiMetadata.tokensUsed` / `.latencyMs` |

---

## 10. Tương thích ngược & dọn dẹp

### 10.1 Đã xoá (v3 → v4)

| Đã xoá | Lý do |
| :--- | :--- |
| `models/ChatFaq.ts`, `models/ChatLog.ts` | Thay bằng `KnowledgeDocument` (chỉ giữ 1 nguồn sự thật). |
| `modules/chat/bot/*` (aiAgent, hybridRouter, intentClassifier, nlpNormalizer, scenarioEngine, copy, analyticsService, faqStore, prompts, tools) | Viết lại trong `modules/ai/`. |
| `services/ai/chatbotService.ts` | Thay bằng `modules/ai/providers/*` + orchestrator. |
| `services/chatAccess.ts`, `services/chatErrors.ts` | Gộp vào `chatPermission.service.ts`. |
| `controllers/chatController.ts`, `dto/chat.ts`, `routes/chat.ts` | Thay bằng `modules/chat/*`. |
| `scripts/reset-chat.ts`, `scripts/rebuild-last-messages.ts` | Không còn phù hợp với schema mới. |

### 10.2 Collection DB

| Collection | Trạng thái |
| :--- | :--- |
| `conversations` | Schema mới (cùng tên ⇒ dữ liệu cũ có thể không tương thích → nên drop & seed lại). |
| `messages` | Schema mới (cùng tên). |
| `handoffrequests` | **Mới.** |
| `knowledgedocuments` | **Mới.** |
| `chatfaqs`, `chatlogs` | **Đã bỏ** — có thể drop an toàn. |

> ⚠️ Khi chuyển từ v3 sang v4: **drop** `conversations`, `messages`, `chatfaqs`, `chatlogs` (schema đổi mạnh) và tạo lại từ đầu. Dữ liệu chat cũ không migrate được.

---

## 11. Câu hỏi thường gặp (bảo trì)

**Q: Thêm tool AI mới cần làm gì?**
A: Tạo file trong `modules/ai/tools/` implement `AiTool` (`declaration` + `execute`), đăng ký vào `AI_TOOLS` trong `tools/index.ts`. Thêm mô tả vào `SYSTEM_INSTRUCTION`. Tool **phải** tự kiểm tra phân quyền trong `execute`.

**Q: Đổi model Gemini?**
A: Set `GEMINI_CHAT_MODEL` trong env. Không hardcode model ID trong service.

**Q: AI trả lời sai / bịa?**
A: Kiểm tra `message.aiMetadata.toolsUsed[]` — nếu rỗng mà vẫn có số liệu ⇒ model bịa ⇒ cần thêm tool hoặc siết prompt.

**Q: Conversation kẹt ở `waiting_admin`?**
A: Admin chưa claim. Kiểm tra `handoffrequests` có bản ghi `status ∈ {waiting, assigned}` không. `FEATURE_AI_HANDOFF=false` cũng gây ra tình trạng này.

**Q: User không thấy tin của admin?**
A: Kiểm tra `visibility` — chỉ `"public"` mới tới user. Admin tạo tin internal vô tình ⇒ user không thấy (đúng thiết kế).

**Q: Socket không kết nối được?**
A: ① Token hết hạn → `auth.token` sai. ② URL sai — phải có đuôi `/chat`. ③ CORS origin không trong allowlist. ④ Proxy Render chặn websocket → bật `transports: ["websocket","polling"]` + `tryAllTransports: true`.

**Q: `409 CHAT_VERSION_CONFLICT` xử lý ở đâu?**
A: Đây là hành vi **đúng** (chống race). Client refetch rồi thử lại — xem `FE_CHAT_INTEGRATION_GUIDE.md` §8.3.

---

> **Tài liệu liên quan:**
> - Contract cho FE/Mobile: `docs_BE write/FE_CHAT_INTEGRATION_GUIDE.md`
> - Error code catalog: `docs_BE write/API_CONTRACT.md`
> - OpenAPI spec: `docs_BE write/openapi.yaml`
