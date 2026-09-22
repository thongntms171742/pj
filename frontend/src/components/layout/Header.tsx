import { ShoppingCart, MessageCircle, Bell, User, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import { ThriftLogo } from "./Logo";
import { COFFEE, T, LINEN, MUTED, ff } from "../../lib/theme";
import { FILTER_TAGS } from "../../lib/categories";
import type { Screen } from "../../types";

interface HeaderProps {
  screen: Screen;
  go: (s: Screen) => void;
  cartCount: number;
  activeTag: string;
  onTagChange: (tag: string) => void;
  headerQuery?: string;
  setHeaderQuery?: (q: string) => void;
  currentUserEmail?: string;
  unreadNotifications?: number;
}

export function Header({
  screen,
  go,
  cartCount,
  activeTag,
  onTagChange,
  headerQuery,
  setHeaderQuery,
  currentUserEmail,
  unreadNotifications = 0,
}: HeaderProps) {
  const showTags = screen === "home" || screen === "search";

  return (
    <header className="sticky top-0 z-50 w-full" style={{ backgroundColor: COFFEE }}>
      <div className="max-w-[1440px] mx-auto px-8 flex items-center gap-6 h-16">
        {/* Logo */}
        <button onClick={() => go("home")} className="flex items-center gap-3 flex-shrink-0 group">
          <ThriftLogo size={38} />
          <span className="text-xl font-bold italic" style={{ ...ff, color: LINEN, letterSpacing: "-0.3px" }}>
            thrift it!
          </span>
        </button>

        {/* Navigation links */}
        <div className="flex items-center gap-4 ml-2">
          <button
            onClick={() => go("pricing")}
            className="text-xs font-semibold hover:opacity-85 transition-all flex items-center gap-1.5 text-amber-400"
            style={ff}
          >
            <Sparkles size={13} /> Gói dịch vụ
          </button>
          {currentUserEmail === "admin@thriftit.vn" && (
            <button
              onClick={() => go("admin")}
              className="text-xs font-bold hover:opacity-90 transition-all px-2.5 py-1 rounded bg-amber-500 text-espresso"
              style={ff}
            >
              Admin Panel
            </button>
          )}
        </div>

        {/* Search bar */}
        <div className="flex-1 max-w-2xl mx-4">
          <div
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all"
            style={{ backgroundColor: "rgba(250,240,230,0.15)", border: "1.5px solid rgba(250,240,230,0.25)" }}
          >
            <Sparkles size={17} style={{ color: T, flexShrink: 0 }} />
            <input
              value={headerQuery}
              onChange={(e) => setHeaderQuery?.(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  go("search");
                }
              }}
              placeholder="Tìm sản phẩm..."
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ ...ff, color: "rgba(250,240,230,0.95)" }}
            />
            <button
              onClick={() => go("search")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90"
              style={{ backgroundColor: T, color: LINEN, ...ff }}
            >
              <Search size={13} />
              Tìm
            </button>
          </div>
        </div>

        {/* Nav icons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {[
            { id: "cart" as Screen, icon: ShoppingCart, label: "Giỏ hàng", badge: cartCount },
            { id: "chat" as Screen, icon: MessageCircle, label: "Tin nhắn", badge: 0 },
            { id: "notification" as Screen, icon: Bell, label: "Thông báo", badge: unreadNotifications },
            { id: "account" as Screen, icon: User, label: "Tài khoản", badge: 0 },
          ].map(({ id, icon: Icon, label, badge }) => (
            <button
              key={id}
              onClick={() => go(id)}
              className="relative flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl transition-all hover:bg-white/10"
              style={{ color: screen === id ? T : "rgba(250,240,230,0.85)" }}
            >
              <div className="relative">
                <Icon size={20} strokeWidth={screen === id ? 2.5 : 1.8} />
                {badge > 0 && (
                  <span
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
                    style={{ backgroundColor: T, color: LINEN, ...ff }}
                  >
                    {badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium" style={ff}>
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Filter tags sub-row */}
      {showTags && (
        <div style={{ backgroundColor: "rgba(0,0,0,0.18)", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="max-w-[1440px] mx-auto px-8 flex items-center gap-2 py-2.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            <SlidersHorizontal size={14} style={{ color: MUTED, flexShrink: 0 }} />
            <span className="text-xs font-semibold mr-1" style={{ color: MUTED, ...ff, flexShrink: 0 }}>
              Bộ lọc nhanh:
            </span>
            {FILTER_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => onTagChange(tag)}
                className="flex-shrink-0 px-3.5 py-1 rounded-full text-xs font-semibold border transition-all hover:opacity-90"
                style={{
                  backgroundColor: activeTag === tag ? T : "rgba(250,240,230,0.12)",
                  color: activeTag === tag ? LINEN : "rgba(250,240,230,0.8)",
                  borderColor: activeTag === tag ? T : "rgba(250,240,230,0.2)",
                  ...ff,
                }}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
