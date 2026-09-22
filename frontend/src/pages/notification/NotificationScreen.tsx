import React, { useEffect, useState } from "react";
import { Package, MessageCircle, Percent, Bell, Truck, Star } from "lucide-react";
import { T, ESPRESSO, COFFEE, LINEN, CARD, MUTED, SOFT, serif, ff } from "../../lib/theme";
import type { Screen, Notification } from "../../types";
import { api } from "../../lib/api";
import { adaptNotification } from "../../lib/adapters";

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  Package,
  MessageCircle,
  Percent,
  Bell,
  Truck,
  Star,
};

export function NotificationScreen({ go: _go }: { go: (s: Screen) => void }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api
      .get<{ notifications: import("../../lib/api").ApiNotification[] }>("/notifications")
      .then((res) => {
        if (mounted) setNotifications(res.notifications.map(adaptNotification));
      })
      .catch(() => {
        // silent — offline fallback could go here
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAll = async () => {
    try {
      await api.patch("/notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // ignore
    }
  };

  const typeColors: Record<string, string> = {
    order: "#27AE60",
    chat: "#2980B9",
    promo: T,
    system: COFFEE,
    review: "#9B59B6",
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: LINEN }}>
      <div className="max-w-[900px] mx-auto px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ ...serif, color: ESPRESSO }}>Thông báo</h1>
            <p className="text-sm mt-1" style={{ color: COFFEE, ...ff }}>
              {loading
                ? "Đang tải..."
                : unreadCount > 0
                  ? `${unreadCount} thông báo chưa đọc`
                  : "Tất cả thông báo đã được đọc"}
            </p>
          </div>
          {unreadCount > 0 && !loading && (
            <button
              onClick={handleMarkAll}
              className="text-sm font-semibold px-4 py-2 rounded-xl transition-all hover:opacity-80"
              style={{ backgroundColor: SOFT, color: COFFEE, ...ff }}
            >
              Đánh dấu đã đọc tất cả
            </button>
          )}
        </div>

        <div className="space-y-3">
          {!loading && notifications.length === 0 && (
            <div className="py-16 text-center" style={{ color: COFFEE, ...ff }}>
              Chưa có thông báo nào.
            </div>
          )}
          {notifications.map((noti) => {
            const Icon = ICON_MAP[noti.icon];
            return (
              <div
                key={noti.id}
                className="flex items-start gap-4 p-5 rounded-2xl transition-all hover:shadow-md cursor-pointer"
                style={{
                  backgroundColor: noti.read ? CARD : `${T}08`,
                  border: `1px solid ${noti.read ? MUTED : `${T}30`}`,
                }}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${typeColors[noti.type]}15` }}
                >
                  {Icon && <Icon size={22} style={{ color: typeColors[noti.type] }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold" style={{ color: ESPRESSO, ...ff }}>{noti.title}</h3>
                    {!noti.read && (
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: T }} />
                    )}
                  </div>
                  <p className="text-sm mt-1 leading-relaxed" style={{ color: COFFEE, ...ff }}>{noti.desc}</p>
                  <p className="text-xs mt-2" style={{ color: MUTED, ...ff }}>{noti.time}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
