/**
 * ChatWidget.tsx — Build Your Christmas floating chat widget
 *
 * Usage:
 *   import ChatWidget from "./components/Chat/ChatWidget";
 *   <ChatWidget />
 *
 * Requirements:
 *   npm install socket.io-client
 *   The widget reads the JWT from localStorage["token"].
 *   Add ChatWidget to your root layout once (e.g. layout.tsx or App.tsx).
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type { MessageDto } from "../../../backend/src/dto/chat";

// ── Types (mirror of backend DTOs) ────────────────────────────────────────────

interface ChatMessage extends MessageDto {
  id: string;
  timestamp: string;
}

interface ChatState {
  messages: ChatMessage[];
  unread: number;
  connected: boolean;
  error: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:4000";
const TOKEN_KEY = "token";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function formatDateLabel(isoString: string): string {
  try {
    const d = new Date(isoString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return "Hôm nay";
    if (d.toDateString() === yesterday.toDateString()) return "Hôm qua";
    return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "";
  }
}

// ── Date divider component ────────────────────────────────────────────────────

function DateDivider({ label }: { label: string }) {
  return (
    <div style={styles.dateDivider}>
      <span style={styles.dateDividerText}>{label}</span>
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: ChatMessage;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isOwn = message.isOwn;
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div style={styles.systemMessage}>
        {message.content}
      </div>
    );
  }

  return (
    <div style={{ ...styles.messageRow, flexDirection: isOwn ? "row-reverse" : "row" }}>
      {/* Avatar */}
      <div style={{
        ...styles.avatar,
        background: isOwn
          ? "linear-gradient(135deg, #c9a96e, #8b5e34)"
          : "linear-gradient(135deg, #2d6a4f, #1b4332)",
      }}>
        {message.senderName.charAt(0).toUpperCase()}
      </div>

      <div style={{ maxWidth: "70%", display: "flex", flexDirection: "column", alignItems: isOwn ? "flex-end" : "flex-start" }}>
        {/* Sender name (only show for others) */}
        {!isOwn && (
          <span style={styles.senderName}>{message.senderName}</span>
        )}

        {/* Bubble */}
        <div style={{
          ...styles.bubble,
          background: isOwn ? "linear-gradient(135deg, #c9a96e, #8b5e34)" : "#fff",
          color: isOwn ? "#fff" : "#222",
          borderRadius: isOwn
            ? "16px 4px 16px 16px"
            : "4px 16px 16px 16px",
          boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
          border: isOwn ? "none" : "1px solid #eee",
        }}>
          {message.content}
        </div>

        {/* Time */}
        <span style={styles.timestamp}>
          {formatTime(message.sentAt)}
          {isOwn && message.isRead && " · ✓✓"}
        </span>
      </div>
    </div>
  );
}

// ── Main Widget ────────────────────────────────────────────────────────────────

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ChatState>({
    messages: [],
    unread: 0,
    connected: false,
    error: null,
  });
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const userIdRef = useRef<string | null>(null);

  // ── Scroll to bottom ────────────────────────────────────────────────────────
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // ── Load initial history ────────────────────────────────────────────────────
  const loadHistory = useCallback(async (before?: string) => {
    const token = getToken();
    if (!token) return;

    const params = new URLSearchParams({ limit: "50" });
    if (before) params.set("before", before);

    try {
      const res = await fetch(`${API_BASE}/api/chat/messages?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, ...(data.messages ?? [])].sort(
          (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
        ),
      }));
    } catch {}
  }, []);

  // ── Mark all as read ────────────────────────────────────────────────────────
  const markRead = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      await fetch(`${API_BASE}/api/chat/markRead`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      setState((prev) => ({ ...prev, unread: 0 }));
    } catch {}
  }, []);

  // ── Send message ────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (content: string) => {
    const token = getToken();
    if (!token || !content.trim() || sending) return;

    setSending(true);
    try {
      // Prefer socket if connected
      if (socketRef.current?.connected) {
        socketRef.current.emit("chat:send", { content: content.trim() });
      } else {
        // REST fallback
        const res = await fetch(`${API_BASE}/api/chat/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content: content.trim() }),
        });
        if (!res.ok) throw new Error("Send failed");
      }
    } catch (err) {
      setState((prev) => ({ ...prev, error: "Gửi tin nhắn thất bại" }));
    } finally {
      setSending(false);
    }
  }, [sending]);

  // ── Socket setup ────────────────────────────────────────────────────────────
  useEffect(() => {
    const token = getToken();
    if (!token) return;

    // Decode userId from token (payload is base64)
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      userIdRef.current = payload.id;
    } catch {
      userIdRef.current = null;
    }

    const socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setState((prev) => ({ ...prev, connected: true, error: null }));
      socket.emit("chat:join", { userId: userIdRef.current });
    });

    socket.on("disconnect", () => {
      setState((prev) => ({ ...prev, connected: false }));
    });

    socket.on("connect_error", () => {
      setState((prev) => ({ ...prev, connected: false, error: "Mất kết nối chat" }));
    });

    socket.on("chat:message", (msg: MessageDto) => {
      setState((prev) => {
        const exists = prev.messages.some((m) => m._id === msg._id);
        if (exists) return prev;
        return {
          ...prev,
          messages: [...prev.messages, msg].sort(
            (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
          ),
          unread: msg.isOwn ? prev.unread : prev.unread + 1,
        };
      });
      if (open) markRead();
    });

    socket.on("chat:unread", ({ unread }: { unread: number }) => {
      setState((prev) => ({ ...prev, unread }));
    });

    socket.on("chat:error", ({ message }: { message: string }) => {
      setState((prev) => ({ ...prev, error: message }));
    });

    // Load history once on connect
    socket.on("connect", () => {
      loadHistory();
    });

    return () => {
      socket.emit("chat:leave");
      socket.disconnect();
      socketRef.current = null;
    };
  }, []); // intentionally empty — setup once

  // Scroll to bottom when messages change
  useEffect(() => {
    if (open) scrollToBottom();
  }, [state.messages, open, scrollToBottom]);

  // Mark read when popup opens
  useEffect(() => {
    if (open) markRead();
  }, [open, markRead]);

  // Auto-clear error after 3s
  useEffect(() => {
    if (state.error) {
      const t = setTimeout(() => setState((p) => ({ ...p, error: null })), 3000);
      return () => clearTimeout(t);
    }
  }, [state.error]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage(input);
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // ── Group messages by date ─────────────────────────────────────────────────

  const groupedMessages: React.ReactNode[] = [];
  let lastDate = "";
  state.messages.forEach((msg) => {
    const dateLabel = formatDateLabel(msg.sentAt);
    if (dateLabel !== lastDate) {
      lastDate = dateLabel;
      groupedMessages.push(<DateDivider key={`date-${msg._id}`} label={dateLabel} />);
    }
    groupedMessages.push(<MessageBubble key={msg._id} message={msg} />);
  });

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={styles.wrapper}>
      {/* ── Chat popup ─────────────────────────────────────────────────── */}
      {open && (
        <div style={styles.popup}>
          {/* Header */}
          <div style={styles.header}>
            <div style={styles.headerInfo}>
              <span style={styles.headerTitle}>💬 Chat với BYC</span>
              <div style={styles.headerStatus}>
                <div style={{
                  ...styles.statusDot,
                  background: state.connected ? "#4caf50" : "#999",
                }} />
                <span style={styles.statusText}>
                  {state.connected ? "Đang kết nối" : "Kết nối lại..."}
                </span>
              </div>
            </div>
            <button style={styles.closeBtn} onClick={() => setOpen(false)} aria-label="Đóng">
              ✕
            </button>
          </div>

          {/* Error banner */}
          {state.error && (
            <div style={styles.errorBanner}>{state.error}</div>
          )}

          {/* Messages */}
          <div style={styles.messagesArea}>
            {groupedMessages.length === 0 && (
              <div style={styles.emptyState}>
                <div style={styles.emptyIcon}>💬</div>
                <p style={styles.emptyTitle}>Chưa có tin nhắn nào</p>
                <p style={styles.emptySubtitle}>Gửi tin nhắn cho đội ngũ BYC</p>
              </div>
            )}
            {groupedMessages}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form style={styles.inputArea} onSubmit={handleSubmit}>
            <textarea
              ref={inputRef}
              style={styles.textarea}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Nhập tin nhắn... (Enter để gửi)"
              rows={1}
              maxLength={2000}
              disabled={!state.connected || sending}
            />
            <button
              type="submit"
              style={{
                ...styles.sendBtn,
                opacity: (!input.trim() || sending || !state.connected) ? 0.4 : 1,
              }}
              disabled={!input.trim() || sending || !state.connected}
              aria-label="Gửi"
            >
              {sending ? "..." : "➤"}
            </button>
          </form>
        </div>
      )}

      {/* ── Floating button ────────────────────────────────────────────── */}
      <button
        style={styles.fab}
        onClick={() => setOpen((o) => !o)}
        aria-label="Mở chat"
        className="chat-fab"
      >
        {state.unread > 0 && !open && (
          <span style={styles.badge}>
            {state.unread > 9 ? "9+" : state.unread}
          </span>
        )}
        <span style={{ fontSize: 22, lineHeight: 1 }}>
          {open ? "✕" : "💬"}
        </span>
      </button>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: "fixed",
    bottom: 24,
    right: 24,
    zIndex: 9999,
    fontFamily: "'Segoe UI', system-ui, sans-serif",
  },

  popup: {
    position: "absolute",
    bottom: 72,
    right: 0,
    width: 360,
    height: 520,
    background: "#fff",
    borderRadius: 16,
    boxShadow: "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    animation: "chatSlideUp 0.2s ease",
  },

  header: {
    padding: "14px 16px",
    background: "linear-gradient(135deg, #2d6a4f, #1b4332)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexShrink: 0,
  },

  headerInfo: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },

  headerTitle: {
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: "0.01em",
  },

  headerStatus: {
    display: "flex",
    alignItems: "center",
    gap: 5,
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    transition: "background 0.3s",
  },

  statusText: {
    fontSize: 11,
    opacity: 0.85,
  },

  closeBtn: {
    background: "rgba(255,255,255,0.15)",
    border: "none",
    color: "#fff",
    width: 30,
    height: 30,
    borderRadius: "50%",
    cursor: "pointer",
    fontSize: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 0.2s",
    flexShrink: 0,
  },

  errorBanner: {
    padding: "8px 16px",
    background: "#ffebee",
    color: "#c62828",
    fontSize: 12,
    textAlign: "center" as const,
    flexShrink: 0,
  },

  messagesArea: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "12px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    scrollBehavior: "smooth",
  },

  emptyState: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 32,
    textAlign: "center" as const,
  },

  emptyIcon: {
    fontSize: 40,
    opacity: 0.5,
  },

  emptyTitle: {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
    color: "#555",
  },

  emptySubtitle: {
    margin: 0,
    fontSize: 12,
    color: "#999",
  },

  dateDivider: {
    display: "flex",
    alignItems: "center",
    padding: "8px 0",
    gap: 8,
  },

  dateDividerText: {
    fontSize: 11,
    color: "#999",
    background: "#f5f5f5",
    padding: "2px 10px",
    borderRadius: 12,
    whiteSpace: "nowrap" as const,
  },

  messageRow: {
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
    wordBreak: "break-word" as const,
  },

  timestamp: {
    fontSize: 10,
    color: "#aaa",
    marginTop: 2,
    paddingLeft: 4,
    paddingRight: 4,
  },

  systemMessage: {
    textAlign: "center" as const,
    fontSize: 11,
    color: "#999",
    fontStyle: "italic",
    padding: "4px 16px",
    margin: "4px 0",
  },

  inputArea: {
    padding: "10px 12px",
    borderTop: "1px solid #eee",
    display: "flex",
    gap: 8,
    alignItems: "flex-end",
    flexShrink: 0,
    background: "#fafafa",
  },

  textarea: {
    flex: 1,
    padding: "8px 12px",
    borderRadius: 20,
    border: "1px solid #ddd",
    fontSize: 14,
    resize: "none" as const,
    outline: "none",
    fontFamily: "inherit",
    maxHeight: 100,
    overflowY: "auto" as const,
    background: "#fff",
    lineHeight: 1.4,
  },

  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: "50%",
    border: "none",
    background: "linear-gradient(135deg, #c9a96e, #8b5e34)",
    color: "#fff",
    fontSize: 18,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    transition: "opacity 0.2s, transform 0.1s",
  },

  fab: {
    position: "relative",
    width: 56,
    height: 56,
    borderRadius: "50%",
    border: "none",
    background: "linear-gradient(135deg, #2d6a4f, #1b4332)",
    color: "#fff",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 16px rgba(45,106,79,0.4)",
    transition: "transform 0.2s, box-shadow 0.2s",
  },

  badge: {
    position: "absolute" as const,
    top: -2,
    right: -2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    background: "#e53935",
    color: "#fff",
    fontSize: 11,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 5px",
    border: "2px solid #fff",
  },
};
