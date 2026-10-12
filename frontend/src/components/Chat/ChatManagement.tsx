/**
 * ChatManagement.tsx — Admin inbox page (1-1 model)
 *
 * Place this in your admin router, e.g.:
 *   <Route path="/admin/chat" element={<ChatManagement />} />
 *
 * Features:
 *   - Two-pane layout: conversation list (left) + active conversation (right)
 *   - Inbox sorted by most recent activity, unread first
 *   - Click a conversation → load its history
 *   - Send message via socket (auto-fallback to REST)
 *   - Auto-receive new messages via socket
 *   - Mark as read on view
 *   - 1-1 isolation: each peer is a real buyer's _id
 *
 * Requirements:
 *   - VITE_API_URL set in .env
 *   - JWT in localStorage["token"] with roles: ["admin"]
 *   - npm install socket.io-client
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";

// ── Types (mirror of backend DTOs) ──────────────────────────────────────────

type ChatRole = "buyer" | "admin" | "system";

interface MessageDto {
  _id: string;
  conversationId: string;
  role: ChatRole;
  senderId: string;
  senderName: string;
  content: string;
  isRead: boolean;
  readAt: string | null;
  sentAt: string;
  isOwn: boolean;
}

interface ConversationDto {
  conversationId: string;
  peerId: string;            // buyer's _id for admin view
  peerName: string;
  peerAvatar?: string;
  lastMessage: {
    content: string;
    sentAt: string;
    senderId: string;
    role: ChatRole;
  } | null;
  unread: number;
  updatedAt: string;
}

interface ChatMessage extends MessageDto {
  id: string;
  timestamp: string;
}

interface ActiveConv {
  peerId: string;
  peerName: string;
  conversationId: string;
  messages: ChatMessage[];
  loading: boolean;
}

// ── Constants ───────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? API_BASE;
const TOKEN_KEY = "token";

// ── Helpers ─────────────────────────────────────────────────────────────────

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatRelative(isoString: string): string {
  try {
    const d = new Date(isoString).getTime();
    const now = Date.now();
    const diff = (now - d) / 1000; // seconds
    if (diff < 60) return "Vừa xong";
    if (diff < 3600) return `${Math.floor(diff / 60)} phút`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} giờ`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} ngày`;
    return new Date(isoString).toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
    });
  } catch {
    return "";
  }
}

function toChatMessage(m: MessageDto): ChatMessage {
  return { ...m, id: m._id, timestamp: m.sentAt };
}

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  if (!token) throw new Error("NO_TOKEN");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

function peerInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ConversationRow({
  conv,
  active,
  onClick,
}: {
  conv: ConversationDto;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...rowStyles.row,
        background: active ? "#e8f5e9" : "#fff",
        borderLeft: active ? "3px solid #2d6a4f" : "3px solid transparent",
      }}
    >
      <div style={rowStyles.avatar}>
        {conv.peerAvatar ? (
          <img
            src={conv.peerAvatar}
            alt={conv.peerName}
            style={rowStyles.avatarImg}
          />
        ) : (
          peerInitials(conv.peerName)
        )}
      </div>
      <div style={rowStyles.body}>
        <div style={rowStyles.topLine}>
          <span style={rowStyles.name}>{conv.peerName}</span>
          <span style={rowStyles.time}>
            {conv.lastMessage ? formatRelative(conv.lastMessage.sentAt) : ""}
          </span>
        </div>
        <div style={rowStyles.bottomLine}>
          <span style={rowStyles.preview}>
            {conv.lastMessage
              ? `${conv.lastMessage.role === "admin" ? "Bạn: " : ""}${
                  conv.lastMessage.content
                }`
              : "Chưa có tin nhắn"}
          </span>
          {conv.unread > 0 && (
            <span style={rowStyles.unreadBadge}>
              {conv.unread > 9 ? "9+" : conv.unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isOwn = message.isOwn;
  const isSystem = message.role === "system";
  if (isSystem) {
    return <div style={bubbleStyles.system}>{message.content}</div>;
  }
  return (
    <div
      style={{
        ...bubbleStyles.row,
        flexDirection: isOwn ? "row-reverse" : "row",
      }}
    >
      <div
        style={{
          ...bubbleStyles.avatar,
          background: isOwn
            ? "linear-gradient(135deg, #2d6a4f, #1b4332)"
            : "linear-gradient(135deg, #c9a96e, #8b5e34)",
        }}
      >
        {message.senderName.charAt(0).toUpperCase()}
      </div>
      <div
        style={{
          maxWidth: "65%",
          display: "flex",
          flexDirection: "column",
          alignItems: isOwn ? "flex-end" : "flex-start",
        }}
      >
        {!isOwn && <span style={bubbleStyles.senderName}>{message.senderName}</span>}
        <div
          style={{
            ...bubbleStyles.bubble,
            background: isOwn
              ? "linear-gradient(135deg, #2d6a4f, #1b4332)"
              : "#fff",
            color: isOwn ? "#fff" : "#222",
            borderRadius: isOwn ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
          }}
        >
          {message.content}
        </div>
        <span style={bubbleStyles.timestamp}>
          {formatTime(message.sentAt)}
          {isOwn && message.isRead && " · ✓✓"}
        </span>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function ChatManagement() {
  const [conversations, setConversations] = useState<ConversationDto[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [active, setActive] = useState<ActiveConv | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeRef = useRef<ActiveConv | null>(null);
  activeRef.current = active;

  // ── Scroll helper ────────────────────────────────────────────────────────
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // ── Load conversation list ───────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    try {
      const res = await authedFetch("/api/chat/conversations");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { conversations: ConversationDto[] } = await res.json();
      setConversations(data.conversations ?? []);
    } catch (err) {
      console.error("[ChatManagement] loadConversations error:", err);
      setError("Không tải được danh sách hội thoại");
    } finally {
      setConversationsLoading(false);
    }
  }, []);

  // ── Load messages for a peer ─────────────────────────────────────────────
  const openConversation = useCallback(
    async (conv: ConversationDto) => {
      setActive({
        peerId: conv.peerId,
        peerName: conv.peerName,
        conversationId: conv.conversationId,
        messages: [],
        loading: true,
      });
      try {
        const res = await authedFetch(
          `/api/chat/conversations/${encodeURIComponent(conv.peerId)}/messages?limit=50`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { messages: MessageDto[] } = await res.json();
        setActive({
          peerId: conv.peerId,
          peerName: conv.peerName,
          conversationId: conv.conversationId,
          messages: (data.messages ?? []).map(toChatMessage),
          loading: false,
        });
        // Mark as read
        await authedFetch(
          `/api/chat/conversations/${encodeURIComponent(conv.peerId)}/markRead`,
          { method: "POST", body: JSON.stringify({}) }
        );
        // Refresh list to clear unread badge
        loadConversations();
        // Join the room in case server didn't auto-join (newly created conv)
        if (socketRef.current?.connected) {
          socketRef.current.emit("chat:join", {
            conversationId: conv.conversationId,
          });
        }
        // Scroll after render
        setTimeout(scrollToBottom, 50);
      } catch (err) {
        console.error("[ChatManagement] openConversation error:", err);
        setError("Không tải được tin nhắn");
        setActive((prev) => (prev ? { ...prev, loading: false } : null));
      }
    },
    [loadConversations, scrollToBottom]
  );

  // ── Initial load + socket setup ──────────────────────────────────────────
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setError("Chưa đăng nhập");
      return;
    }

    loadConversations();

    const socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
      timeout: 30_000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      setError(null);
      // Server auto-joined all convs I'm in. Explicit join for active conv
      // in case it's new.
      const a = activeRef.current;
      if (a) socket.emit("chat:join", { conversationId: a.conversationId });
    });

    socket.on("disconnect", () => setConnected(false));

    socket.on("connect_error", () => {
      setConnected(false);
      setError("Mất kết nối socket — đang thử lại...");
    });

    socket.on("chat:message", (msg: MessageDto) => {
      const chatMsg = toChatMessage(msg);
      // If it's for the active conversation, append to it
      setActive((prev) => {
        if (prev && msg.conversationId === prev.conversationId) {
          const exists = prev.messages.some((m) => m._id === chatMsg._id);
          if (exists) return prev;
          return {
            ...prev,
            messages: [...prev.messages, chatMsg].sort(
              (a, b) =>
                new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
            ),
          };
        }
        return prev;
      });
      // If the message is for another conversation (e.g. another buyer
      // messaged me), refresh the list to update the inbox.
      if (
        !activeRef.current ||
        msg.conversationId !== activeRef.current.conversationId
      ) {
        loadConversations();
      }
      // Auto-mark as read if it's the active conv
      if (
        activeRef.current &&
        msg.conversationId === activeRef.current.conversationId
      ) {
        authedFetch(
          `/api/chat/conversations/${encodeURIComponent(
            activeRef.current.peerId
          )}/markRead`,
          { method: "POST", body: JSON.stringify({}) }
        ).catch(() => {});
      }
    });

    socket.on("chat:unread", () => {
      // Server pushes total unread; we use the per-conv badges from
      // the list, so just refresh.
      loadConversations();
    });

    socket.on("chat:error", ({ message }: { message: string }) => {
      setError(message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [loadConversations]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (active) scrollToBottom();
  }, [active?.messages, active, scrollToBottom]);

  // Auto-clear error
  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(null), 3000);
      return () => clearTimeout(t);
    }
  }, [error]);

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    if (!active || !input.trim() || sending) return;
    setSending(true);
    try {
      if (socketRef.current?.connected) {
        socketRef.current.emit("chat:send", {
          conversationId: active.conversationId,
          content: input.trim(),
        });
      } else {
        // REST fallback
        const res = await authedFetch(
          `/api/chat/conversations/${encodeURIComponent(active.peerId)}/messages`,
          { method: "POST", body: JSON.stringify({ content: input.trim() }) }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { message: MessageDto } = await res.json();
        if (data.message) {
          setActive((prev) =>
            prev
              ? {
                  ...prev,
                  messages: [...prev.messages, toChatMessage(data.message)].sort(
                    (a, b) =>
                      new Date(a.sentAt).getTime() -
                      new Date(b.sentAt).getTime()
                  ),
                }
              : prev
          );
        }
      }
      setInput("");
      setTimeout(() => inputRef.current?.focus(), 0);
    } catch (err) {
      console.error("[ChatManagement] send error:", err);
      setError("Gửi tin nhắn thất bại");
    } finally {
      setSending(false);
    }
  }, [active, input, sending]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Sort: unread first, then by updatedAt desc ──────────────────────────
  const sortedConversations = [...conversations].sort((a, b) => {
    if (a.unread > 0 && b.unread === 0) return -1;
    if (a.unread === 0 && b.unread > 0) return 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={pageStyles.page}>
      {/* Header */}
      <div style={pageStyles.header}>
        <h1 style={pageStyles.title}>Quản lý chat</h1>
        <div style={pageStyles.statusBox}>
          <div
            style={{
              ...pageStyles.statusDot,
              background: connected ? "#4caf50" : "#999",
            }}
          />
          <span style={pageStyles.statusText}>
            {connected ? "Đang kết nối" : "Mất kết nối"}
          </span>
        </div>
      </div>

      {error && <div style={pageStyles.errorBanner}>{error}</div>}

      <div style={pageStyles.body}>
        {/* Left: conversation list */}
        <div style={pageStyles.list}>
          {conversationsLoading ? (
            <div style={pageStyles.placeholder}>
              <div style={pageStyles.spinner} />
              <p>Đang tải...</p>
            </div>
          ) : sortedConversations.length === 0 ? (
            <div style={pageStyles.placeholder}>
              <div style={{ fontSize: 40, opacity: 0.4 }}>📭</div>
              <p>Chưa có hội thoại nào</p>
              <p style={{ fontSize: 12, color: "#999" }}>
                Tin nhắn từ khách hàng sẽ xuất hiện ở đây
              </p>
            </div>
          ) : (
            sortedConversations.map((c) => (
              <ConversationRow
                key={c.conversationId}
                conv={c}
                active={active?.peerId === c.peerId}
                onClick={() => openConversation(c)}
              />
            ))
          )}
        </div>

        {/* Right: active conversation */}
        <div style={pageStyles.detail}>
          {!active ? (
            <div style={pageStyles.placeholder}>
              <div style={{ fontSize: 48, opacity: 0.3 }}>💬</div>
              <p>Chọn một hội thoại để bắt đầu</p>
            </div>
          ) : (
            <>
              {/* Detail header */}
              <div style={pageStyles.detailHeader}>
                <div style={pageStyles.detailAvatar}>
                  {peerInitials(active.peerName)}
                </div>
                <div>
                  <div style={pageStyles.detailName}>{active.peerName}</div>
                  <div style={pageStyles.detailId}>ID: {active.peerId}</div>
                </div>
              </div>

              {/* Messages */}
              <div style={pageStyles.messagesArea}>
                {active.loading ? (
                  <div style={pageStyles.placeholder}>
                    <div style={pageStyles.spinner} />
                  </div>
                ) : active.messages.length === 0 ? (
                  <div style={pageStyles.placeholder}>
                    <p style={{ color: "#999" }}>Chưa có tin nhắn nào</p>
                  </div>
                ) : (
                  active.messages.map((m) => (
                    <MessageBubble key={m._id} message={m} />
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <form
                style={pageStyles.inputArea}
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage();
                }}
              >
                <textarea
                  ref={inputRef}
                  style={pageStyles.textarea}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Nhập tin nhắn... (Enter để gửi)"
                  rows={1}
                  maxLength={2000}
                  disabled={sending}
                />
                <button
                  type="submit"
                  style={{
                    ...pageStyles.sendBtn,
                    opacity: !input.trim() || sending ? 0.4 : 1,
                  }}
                  disabled={!input.trim() || sending}
                  aria-label="Gửi"
                >
                  {sending ? "..." : "➤"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const pageStyles: Record<string, React.CSSProperties> = {
  page: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    background: "#f7f8fa",
    fontFamily: "'Segoe UI', system-ui, sans-serif",
  },
  header: {
    padding: "16px 24px",
    background: "#fff",
    borderBottom: "1px solid #e0e0e0",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
    color: "#1b4332",
  },
  statusBox: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
  },
  statusText: {
    fontSize: 12,
    color: "#666",
  },
  errorBanner: {
    padding: "10px 24px",
    background: "#ffebee",
    color: "#c62828",
    fontSize: 13,
    flexShrink: 0,
  },
  body: {
    flex: 1,
    display: "flex",
    overflow: "hidden",
  },
  list: {
    width: 360,
    background: "#fff",
    borderRight: "1px solid #e0e0e0",
    overflowY: "auto",
    flexShrink: 0,
  },
  detail: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    background: "#fafafa",
  },
  detailHeader: {
    padding: "16px 20px",
    background: "#fff",
    borderBottom: "1px solid #e0e0e0",
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexShrink: 0,
  },
  detailAvatar: {
    width: 44,
    height: 44,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #2d6a4f, #1b4332)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
    fontWeight: 700,
    flexShrink: 0,
  },
  detailName: {
    fontSize: 16,
    fontWeight: 600,
    color: "#222",
  },
  detailId: {
    fontSize: 11,
    color: "#999",
    marginTop: 2,
    fontFamily: "monospace",
  },
  messagesArea: {
    flex: 1,
    overflowY: "auto",
    padding: "16px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  placeholder: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    color: "#999",
    fontSize: 14,
  },
  spinner: {
    width: 32,
    height: 32,
    border: "3px solid #e0e0e0",
    borderTopColor: "#2d6a4f",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  inputArea: {
    padding: "12px 20px",
    background: "#fff",
    borderTop: "1px solid #e0e0e0",
    display: "flex",
    gap: 8,
    alignItems: "flex-end",
    flexShrink: 0,
  },
  textarea: {
    flex: 1,
    padding: "10px 14px",
    borderRadius: 20,
    border: "1px solid #ddd",
    fontSize: 14,
    resize: "none",
    outline: "none",
    fontFamily: "inherit",
    maxHeight: 120,
    overflowY: "auto",
    lineHeight: 1.4,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: "50%",
    border: "none",
    background: "linear-gradient(135deg, #2d6a4f, #1b4332)",
    color: "#fff",
    fontSize: 18,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
};

const rowStyles: Record<string, React.CSSProperties> = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 16px",
    border: "none",
    borderBottom: "1px solid #f0f0f0",
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
    transition: "background 0.15s",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #2d6a4f, #1b4332)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
    fontWeight: 700,
    flexShrink: 0,
    overflow: "hidden",
  },
  avatarImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  body: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  topLine: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: {
    fontSize: 14,
    fontWeight: 600,
    color: "#222",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  time: {
    fontSize: 11,
    color: "#999",
    flexShrink: 0,
    marginLeft: 8,
  },
  bottomLine: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  preview: {
    fontSize: 13,
    color: "#666",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flex: 1,
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    background: "#e53935",
    color: "#fff",
    fontSize: 11,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 6px",
    flexShrink: 0,
  },
};

const bubbleStyles: Record<string, React.CSSProperties> = {
  row: {
    display: "flex",
    alignItems: "flex-end",
    gap: 6,
    marginBottom: 2,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 700,
    color: "#fff",
    flexShrink: 0,
  },
  senderName: {
    fontSize: 11,
    color: "#888",
    marginBottom: 2,
    marginLeft: 4,
  },
  bubble: {
    padding: "8px 12px",
    fontSize: 14,
    lineHeight: 1.45,
    maxWidth: "100%",
    wordBreak: "break-word",
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  },
  timestamp: {
    fontSize: 10,
    color: "#aaa",
    marginTop: 2,
    paddingLeft: 4,
    paddingRight: 4,
  },
  system: {
    textAlign: "center",
    fontSize: 11,
    color: "#999",
    fontStyle: "italic",
    padding: "4px 16px",
    margin: "4px 0",
  },
};
