import React, { useState, useRef, useEffect } from "react";
import { Search, Send, Image as ImageIcon } from "lucide-react";
import { T, ESPRESSO, COFFEE, LINEN, CARD, MUTED, SOFT, serif, ff, fmt } from "../../lib/theme";
import { CONTACTS, CHAT_MSGS } from "../../data/mock";

// ── Chat Screen ────────────────────────────────────────────────────────────────
export function ChatScreen() {
  const [active, setActive] = useState(1);
  const [msgs, setMsgs] = useState(CHAT_MSGS);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const contact = CONTACTS.find((c) => c.id === active)!;
  const conversation = msgs[active] || [];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Track previous message count so we only scroll on a NEW message,
  // not on initial mount or when switching contacts.
  const prevCountRef = useRef(conversation.length);
  useEffect(() => {
    if (conversation.length > prevCountRef.current) {
      // Only scroll when a new message arrives.
      messagesEndRef.current?.scrollIntoView({ block: "end" });
    }
    prevCountRef.current = conversation.length;
  }, [conversation.length]);

  const sendMsg = () => {
    if (!input.trim()) return;
    setMsgs((p) => ({ ...p, [active]: [...(p[active] || []), { id: Date.now(), from: "me" as const, text: input.trim(), time: "Vừa xong" }] }));
    setInput("");
    // Simulate seller reply after 1.5s
    setIsTyping(true);
    setTimeout(() => {
      setMsgs((p) => {
        const replies = [
          "Cảm ơn bạn đã nhắn! Shop sẽ phản hồi sớm nhất nhé! 🌿",
          "Đã nhận được tin nhắn của bạn! Đang kiểm tra...",
          "Shop đã xem, sẽ tư vấn ngay cho bạn! 💛",
          "Cảm ơn bạn! Có gì Shop sẽ hỗ trợ ngay! ✨",
        ];
        return {
          ...p,
          [active]: [...(p[active] || []), { id: Date.now() + 1, from: "seller" as const, text: replies[Math.floor(Math.random() * replies.length)], time: "Vừa xong" }]
        };
      });
      setIsTyping(false);
    }, 1500);
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: LINEN }}>
      <div className="max-w-[1440px] mx-auto px-8 py-6">
        <h1 className="text-2xl font-bold mb-4" style={{ ...serif, color: ESPRESSO }}>Tin nhắn</h1>
        <div className="mb-3 px-4 py-2 rounded-xl text-xs flex items-center gap-2"
          style={{ backgroundColor: `${T}15`, border: `1px dashed ${T}55`, color: ESPRESSO, ...ff }}>
          <span>💬</span>
          <span>Đây là bản demo UI chat. Tính năng nhắn tin thời gian thực sẽ được kết nối backend ở phase sau.</span>
        </div>
        <div className="rounded-2xl overflow-hidden shadow-sm flex" style={{ height: "calc(100vh - 240px)", border: `1px solid ${MUTED}` }}>
          {/* Contact list */}
          <div className="w-80 flex-shrink-0 flex flex-col" style={{ borderRight: `1px solid ${MUTED}`, backgroundColor: CARD }}>
            <div className="p-4" style={{ borderBottom: `1px solid ${MUTED}` }}>
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ backgroundColor: SOFT, border: `1px solid ${MUTED}` }}>
                <Search size={14} style={{ color: COFFEE }} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm kiếm..." className="flex-1 bg-transparent text-sm outline-none" style={{ color: ESPRESSO, ...ff }} />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {CONTACTS.filter((c) => c.name.includes(search)).map((c, i) => (
                <div key={c.id}>
                  {i > 0 && <div className="mx-4 h-px" style={{ backgroundColor: MUTED + "55" }} />}
                  <button
                    onClick={() => setActive(c.id)}
                    className="w-full flex items-start gap-3 px-4 py-3.5 text-left transition-all hover:opacity-90"
                    style={{ backgroundColor: active === c.id ? SOFT : "transparent" }}
                  >
                    <div className="relative flex-shrink-0">
                      <img src={c.avatar} alt={c.name} className="w-11 h-11 rounded-full object-cover" />
                      <span className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full border-2" style={{ backgroundColor: "#27AE60", borderColor: CARD }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold truncate" style={{ color: ESPRESSO, ...ff }}>@{c.name}</p>
                        <p className="text-[10px] flex-shrink-0 ml-2" style={{ color: COFFEE, ...ff }}>{c.time}</p>
                      </div>
                      <p className="text-xs truncate mt-0.5" style={{ color: COFFEE, ...ff }}>{c.lastMsg}</p>
                    </div>
                    {c.unread > 0 && (
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ml-1"
                        style={{ backgroundColor: T, color: LINEN, ...ff }}>{c.unread}</span>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Chat window */}
          <div className="flex-1 flex flex-col" style={{ backgroundColor: LINEN }}>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-5 py-3.5 flex-shrink-0" style={{ borderBottom: `1px solid ${MUTED}`, backgroundColor: CARD }}>
              <img src={contact.avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
              <div className="flex-1">
                <p className="text-sm font-bold" style={{ color: ESPRESSO, ...ff }}>@{contact.name}</p>
                <p className="text-xs" style={{ color: "#27AE60", ...ff }}>● Đang hoạt động</p>
              </div>
              {/* Product overlay */}
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl" style={{ backgroundColor: SOFT, border: `1px solid ${MUTED}` }}>
                <img src={contact.product.image} alt="" className="w-10 h-10 rounded-lg object-cover" />
                <div>
                  <p className="text-xs font-semibold max-w-[140px] truncate" style={{ color: ESPRESSO, ...ff }}>{contact.product.name}</p>
                  <p className="text-xs font-bold" style={{ color: T, ...serif }}>{fmt(contact.product.price)}</p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: T + "22", color: T, ...ff }}>Đang hỏi</span>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-3">
              <div className="text-center">
                <span className="text-[10px] px-3 py-1 rounded-full" style={{ backgroundColor: MUTED, color: COFFEE, ...ff }}>Hôm nay</span>
              </div>
              {conversation.map((m) => (
                <div key={m.id} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"} gap-2.5`}>
                  {m.from === "seller" && <img src={contact.avatar} alt="" className="w-7 h-7 rounded-full object-cover self-end flex-shrink-0" />}
                  <div className="max-w-[60%]">
                    <div
                      className="px-4 py-2.5 text-sm leading-relaxed"
                      style={{
                        backgroundColor: m.from === "me" ? T : CARD,
                        color: m.from === "me" ? LINEN : ESPRESSO,
                        borderRadius: m.from === "me" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                        border: m.from === "seller" ? `1px solid ${MUTED}` : "none",
                        ...ff,
                      }}
                    >{m.text}</div>
                    <p className="text-[9px] mt-1 px-1" style={{ color: COFFEE + "99", textAlign: m.from === "me" ? "right" : "left", ...ff }}>{m.time}</p>
                  </div>
                </div>
              ))}
              {/* Typing indicator */}
              {isTyping && (
                <div className="flex gap-2.5">
                  <img src={contact.avatar} alt="" className="w-7 h-7 rounded-full object-cover self-end flex-shrink-0" />
                  <div className="px-4 py-3 rounded-2xl" style={{ backgroundColor: CARD, border: `1px solid ${MUTED}` }}>
                    <div className="flex gap-1">
                      <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: COFFEE, animationDelay: "0ms" }} />
                      <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: COFFEE, animationDelay: "150ms" }} />
                      <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: COFFEE, animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="flex items-center gap-3 px-5 py-3.5 flex-shrink-0" style={{ borderTop: `1px solid ${MUTED}`, backgroundColor: CARD }}>
              <button className="p-2.5 rounded-xl transition-all hover:bg-gray-100" style={{ border: `1px solid ${MUTED}` }}>
                <ImageIcon size={18} style={{ color: COFFEE }} />
              </button>
              <div className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-xl" style={{ backgroundColor: SOFT, border: `1.5px solid ${MUTED}` }}>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMsg()}
                  placeholder="Nhắn tin..."
                  className="flex-1 bg-transparent text-sm outline-none"
                  style={{ color: ESPRESSO, ...ff }}
                />
              </div>
              <button
                onClick={sendMsg}
                className="p-2.5 rounded-xl flex items-center justify-center transition-all hover:opacity-90"
                style={{ backgroundColor: T }}
              >
                <Send size={17} style={{ color: LINEN }} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}