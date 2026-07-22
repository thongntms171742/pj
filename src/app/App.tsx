import React, { useState, useRef, useEffect } from "react";
import {
  ShoppingCart, MessageCircle, User, Search, Heart, Star, ChevronRight,
  Package, Truck, CheckCircle, Clock, MapPin, LogOut, Send, Minus, Plus,
  Trash2, Tag, Shield, HelpCircle, Edit3, X, Bell, Upload, Sparkles,
  Store, SlidersHorizontal, FileText, Image as ImageIcon, ChevronDown,
  Settings, Check, Percent, ShoppingBag, TrendingUp, Eye, DollarSign,
  RefreshCw, Users
} from "lucide-react";

// ── Brand palette ──────────────────────────────────────────────────────────────
const T = "#D27D2D";
const ESPRESSO = "#3A2312";
const COFFEE = "#6F4E37";
const LINEN = "#FAF0E6";
const CARD = "#FFF8F0";
const MUTED = "#E8D5BC";
const SOFT = "#EFE0CC";

type Screen = "login" | "register" | "home" | "search" | "cart" | "chat" | "account" | "post" | "notification" | "product-detail" | "seller" | "payment" | "pricing" | "admin";

interface Product {
  id: number; name: string; price: number; seller: string;
  condition: number; size: string; category: string; image: string; liked: boolean;
  status?: "active" | "pending";
}
interface Seller {
  id: number; handle: string; name: string; avatar: string;
  rating: number; transactions: number; thumbs: string[];
}
interface CartItem {
  id: number; name: string; price: number; size: string;
  qty: number; image: string; checked: boolean; condition: number;
  buyOrRent?: "buy" | "rent";
}
interface CartGroup { seller: string; items: CartItem[]; }
interface OrderItem {
  id: string; name: string; price: number; size: string; qty: number;
  image: string; condition: number; seller: string;
}
interface Order {
  id: string; items: OrderItem[]; total: number;
  status: "pending" | "shipping" | "delivering" | "review" | "completed";
  createdAt: string; paymentMethod: string;
}

function fmt(n: number) { return n.toLocaleString("vi-VN") + "₫"; }
const ff = { fontFamily: "'Plus Jakarta Sans', sans-serif" };
const serif = { fontFamily: "'Playfair Display', serif" };

// ── LocalStorage helpers ─────────────────────────────────────────────────────────
const STORAGE_KEYS = {
  currentUser: "thriftit_currentUser",
  currentEmail: "thriftit_currentEmail",
  cart: "thriftit_cart",
  likedProducts: "thriftit_likedProducts",
};

function getStoredUser() {
  try {
    const name = localStorage.getItem(STORAGE_KEYS.currentUser);
    const email = localStorage.getItem(STORAGE_KEYS.currentEmail);
    return { name, email };
  } catch { return { name: null, email: null }; }
}

function setStoredUser(name: string, email: string) {
  try {
    localStorage.setItem(STORAGE_KEYS.currentUser, name);
    localStorage.setItem(STORAGE_KEYS.currentEmail, email);
  } catch {}
}

function clearStoredUser() {
  try {
    localStorage.removeItem(STORAGE_KEYS.currentUser);
    localStorage.removeItem(STORAGE_KEYS.currentEmail);
  } catch {}
}

function getStoredLikedProducts(): number[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.likedProducts);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function setStoredLikedProducts(ids: number[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.likedProducts, JSON.stringify(ids));
  } catch {}
}

function getStoredCart(): CartGroup[] | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.cart);
    return stored ? JSON.parse(stored) : null;
  } catch { return null; }
}

function setStoredCart(cart: CartGroup[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(cart));
  } catch {}
}

// ── Static data ────────────────────────────────────────────────────────────────
const ALL_PRODUCTS: Product[] = [
  { id: 1, name: "Áo Linen Trắng Cổ Điển 1994", price: 185000, seller: "minhtu.vintage", condition: 85, size: "M", category: "Áo", image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=520&fit=crop&auto=format", liked: false },
  { id: 2, name: "Quần Jean Ống Rộng Thập Niên 90", price: 220000, seller: "saigon.thrift", condition: 90, size: "L", category: "Quần", image: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=400&h=520&fit=crop&auto=format", liked: true },
  { id: 3, name: "Váy Hoa Retro Pastel Dáng A", price: 160000, seller: "hanoi.preloved", condition: 75, size: "S", category: "Váy", image: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=400&h=520&fit=crop&auto=format", liked: false },
  { id: 4, name: "Áo Khoác Denim Rửa Cũ 80s", price: 350000, seller: "minhtu.vintage", condition: 80, size: "M", category: "Áo khoác", image: "https://images.unsplash.com/photo-1495105787522-5334e3ffa0ef?w=400&h=520&fit=crop&auto=format", liked: false },
  { id: 5, name: "Blazer Tweed Cổ Điển", price: 420000, seller: "saigon.thrift", condition: 92, size: "M", category: "Áo khoác", image: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=400&h=520&fit=crop&auto=format", liked: true },
  { id: 6, name: "Áo Sơ Mi Kẻ Sọc Vintage", price: 130000, seller: "hanoi.preloved", condition: 70, size: "L", category: "Áo", image: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400&h=520&fit=crop&auto=format", liked: false },
  { id: 7, name: "Đầm Maxi Bohemian Floral", price: 280000, seller: "vintage.corner", condition: 88, size: "M", category: "Váy", image: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=400&h=520&fit=crop&auto=format", liked: false },
  { id: 8, name: "Áo Phông Band Tee 90s", price: 95000, seller: "minhtu.vintage", condition: 65, size: "L", category: "Áo", image: "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=400&h=520&fit=crop&auto=format", liked: true },
  { id: 9, name: "Quần Culottes Len Vintage", price: 175000, seller: "saigon.thrift", condition: 82, size: "S", category: "Quần", image: "https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=400&h=520&fit=crop&auto=format", liked: false },
  { id: 10, name: "Áo Len Cổ Lọ Cozy", price: 210000, seller: "vintage.corner", condition: 78, size: "M", category: "Áo", image: "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=400&h=520&fit=crop&auto=format", liked: false },
];

const SELLERS: Seller[] = [
  { id: 1, handle: "minhtu.vintage", name: "Minh Tú Vintage", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&auto=format", rating: 4.9, transactions: 234, thumbs: ["https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=90&h=90&fit=crop", "https://images.unsplash.com/photo-1495105787522-5334e3ffa0ef?w=90&h=90&fit=crop", "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=90&h=90&fit=crop"] },
  { id: 2, handle: "saigon.thrift", name: "Sài Gòn Thrift", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&auto=format", rating: 4.8, transactions: 187, thumbs: ["https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=90&h=90&fit=crop", "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=90&h=90&fit=crop", "https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=90&h=90&fit=crop"] },
  { id: 3, handle: "hanoi.preloved", name: "Hà Nội Pre-loved", avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop&auto=format", rating: 4.7, transactions: 156, thumbs: ["https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=90&h=90&fit=crop", "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=90&h=90&fit=crop", "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=90&h=90&fit=crop"] },
  { id: 4, handle: "vintage.corner", name: "Vintage Corner HCM", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&auto=format", rating: 4.9, transactions: 312, thumbs: ["https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=90&h=90&fit=crop", "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=90&h=90&fit=crop", "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=90&h=90&fit=crop"] },
];

const INIT_CART: CartGroup[] = [
  { seller: "minhtu.vintage", items: [
    { id: 1, name: "Áo Linen Trắng Cổ Điển 1994", price: 185000, size: "M", qty: 1, condition: 85, image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=100&h=100&fit=crop&auto=format", checked: true },
    { id: 4, name: "Áo Khoác Denim Rửa Cũ 80s", price: 350000, size: "M", qty: 1, condition: 80, image: "https://images.unsplash.com/photo-1495105787522-5334e3ffa0ef?w=100&h=100&fit=crop&auto=format", checked: true },
  ]},
  { seller: "saigon.thrift", items: [
    { id: 2, name: "Quần Jean Ống Rộng Thập Niên 90", price: 220000, size: "L", qty: 1, condition: 90, image: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=100&h=100&fit=crop&auto=format", checked: true },
    { id: 5, name: "Blazer Tweed Cổ Điển", price: 420000, size: "M", qty: 1, condition: 92, image: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=100&h=100&fit=crop&auto=format", checked: false },
  ]},
];

const CONTACTS = [
  { id: 1, name: "minhtu.vintage", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&auto=format", lastMsg: "Bạn có thể chụp thêm ảnh chi tiết không?", time: "3 phút", unread: 2, product: { name: "Áo Linen Trắng Cổ Điển 1994", price: 185000, image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=80&h=80&fit=crop&auto=format" } },
  { id: 2, name: "saigon.thrift", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&auto=format", lastMsg: "Đã xác nhận và đang chuẩn bị hàng", time: "1 giờ", unread: 0, product: { name: "Quần Jean Ống Rộng 90", price: 220000, image: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=80&h=80&fit=crop&auto=format" } },
  { id: 3, name: "hanoi.preloved", avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&h=80&fit=crop&auto=format", lastMsg: "Giá có thể thương lượng không ạ?", time: "Hôm qua", unread: 1, product: { name: "Váy Hoa Retro Pastel", price: 160000, image: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=80&h=80&fit=crop&auto=format" } },
];

const CHAT_MSGS: Record<number, Array<{ id: number; from: "me" | "seller"; text: string; time: string }>> = {
  1: [
    { id: 1, from: "seller", text: "Xin chào bạn! Shop có thể giúp gì nào? 🌿", time: "14:20" },
    { id: 2, from: "me", text: "Mình quan tâm áo linen trắng, còn size M không ạ?", time: "14:21" },
    { id: 3, from: "seller", text: "Vâng bạn ơi, còn đúng 1 cái size M! Hàng đẹp lắm, mới giặt hấp phẳng rồi nè 🧺", time: "14:22" },
    { id: 4, from: "me", text: "Bạn có thể chụp thêm ảnh chi tiết không? Ảnh cổ áo và tay áo ấy", time: "14:23" },
    { id: 5, from: "seller", text: "Được bạn nhé, mình chụp ngay đây! Hàng vintage 1994 nên có vài nét xỉn màu nhẹ, rất đẹp 🧡", time: "14:25" },
    { id: 6, from: "me", text: "Oke không sao, mình thích vintage look đó. Ship tới HCM mất bao lâu?", time: "14:26" },
    { id: 7, from: "seller", text: "Giao Hàng Nhanh 3-5 ngày, phí ship khoảng 30.000₫ bạn nhé. Shop đóng gói cẩn thận 📦", time: "14:28" },
  ],
  2: [
    { id: 1, from: "seller", text: "Cảm ơn bạn đã tin tưởng Sài Gòn Thrift! 💛", time: "10:30" },
    { id: 2, from: "me", text: "Mình vừa đặt quần jean ống rộng, bao giờ giao ạ?", time: "10:31" },
    { id: 3, from: "seller", text: "Đã xác nhận và đang chuẩn bị hàng bạn ơi, sẽ giao trong 24h nhé!", time: "10:45" },
  ],
  3: [
    { id: 1, from: "me", text: "Chào shop! Váy hoa retro còn không ạ?", time: "Hôm qua" },
    { id: 2, from: "seller", text: "Còn bạn ơi! Bạn thích size nào? Shop có S và M", time: "Hôm qua" },
    { id: 3, from: "me", text: "Giá có thể thương lượng không ạ?", time: "Hôm qua" },
  ],
};

// ── Logo ───────────────────────────────────────────────────────────────────────
function ThriftLogo({ size = 48 }: { size?: number }) {
  return (
    <img 
      src="https://i.postimg.cc/44tgtTTG/thrift-logo.png" 
      alt="thrift it! Logo"
      style={{
        width: size, 
        height: size, 
        objectFit: "contain"
      }} 
    />
  );
}

// ── Header ─────────────────────────────────────────────────────────────────────
const FILTER_TAGS = ["Tất cả", "Áo", "Quần", "Váy", "Áo khoác", "Phụ kiện", "Độ mới >90%", "Gần đây"];

function Header({ screen, go, cartCount, activeTag, onTagChange, headerQuery, setHeaderQuery, currentUserEmail }: { screen: Screen; go: (s: Screen) => void; cartCount: number; activeTag: string; onTagChange: (tag: string) => void; headerQuery?: string; setHeaderQuery?: (q: string) => void; currentUserEmail?: string }) {
  const showTags = screen === "home" || screen === "search";

  return (
    <header className="sticky top-0 z-50 w-full" style={{ backgroundColor: COFFEE }}>
      <div className="max-w-[1440px] mx-auto px-8 flex items-center gap-6 h-16">
        {/* Logo */}
        <button onClick={() => go("home")} className="flex items-center gap-3 flex-shrink-0 group">
          <ThriftLogo size={38}  />
          <span className="text-xl font-bold italic" style={{ ...serif, color: LINEN, letterSpacing: "-0.3px" }}>
            thrift it!
          </span>
        </button>

        {/* Navigation links */}
        <div className="flex items-center gap-4 ml-2">
          <button onClick={() => go("pricing")} className="text-xs font-semibold hover:opacity-85 transition-all flex items-center gap-1.5 text-amber-400" style={ff}>
            <Sparkles size={13} /> Gói dịch vụ
          </button>
          {currentUserEmail === "admin@thriftit.vn" && (
            <button onClick={() => go("admin")} className="text-xs font-bold hover:opacity-90 transition-all px-2.5 py-1 rounded bg-amber-500 text-espresso" style={ff}>
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
              onKeyDown={(e) => { if (e.key === "Enter") { go("search"); } }}
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
            { id: "chat" as Screen, icon: MessageCircle, label: "Tin nhắn", badge: 3 },
            { id: "notification" as Screen, icon: Bell, label: "Thông báo", badge: 5 },
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
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
                    style={{ backgroundColor: T, color: LINEN, ...ff }}>
                    {badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium" style={ff}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Filter tags sub-row */}
      {showTags && (
        <div style={{ backgroundColor: "rgba(0,0,0,0.18)", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="max-w-[1440px] mx-auto px-8 flex items-center gap-2 py-2.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            <SlidersHorizontal size={14} style={{ color: MUTED, flexShrink: 0 }} />
            <span className="text-xs font-semibold mr-1" style={{ color: MUTED, ...ff, flexShrink: 0 }}>Bộ lọc nhanh:</span>
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

// ── Footer ─────────────────────────────────────────────────────────────────────
function Footer({ go }: { go: (s: Screen) => void }) {
  const links = [
    { title: "Về thrift it!", items: ["Giới thiệu", "Blog vintage", "Câu chuyện người dùng", "Tuyển dụng"] },
    { title: "Hỗ trợ người mua", items: ["Hướng dẫn mua hàng", "Chính sách đổi trả", "Thanh toán an toàn", "Theo dõi đơn hàng"] },
    { title: "Hỗ trợ người bán", items: ["Hướng dẫn đăng bán", "Phí & hoa hồng", "Quy tắc cộng đồng", "Trở thành shop uy tín"] },
    { title: "Kết nối với chúng tôi", items: ["Instagram", "TikTok", "Facebook", "Zalo OA"] },
  ];
  return (
    <footer style={{ backgroundColor: ESPRESSO }}>
      <div className="max-w-[1440px] mx-auto px-8 py-12">
        <div className="grid grid-cols-5 gap-10">
          <div className="col-span-1">
            <div className="flex items-center gap-2.5 mb-3">
              <ThriftLogo size={36} />
              <span className="text-lg font-bold italic" style={{ ...serif, color: LINEN }}>thrift it!</span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: MUTED, ...ff }}>
              Thị trường C2C thời trang cũ hàng đầu Việt Nam. Mua bán đồ vintage chất lượng, giá tốt.
            </p>
            <button
              onClick={() => go("post")}
              className="mt-4 px-4 py-2 rounded-lg text-xs font-bold transition-all hover:opacity-90"
              style={{ backgroundColor: T, color: LINEN, ...ff }}
            >
              + Đăng bán ngay
            </button>
          </div>
          {links.map((col) => (
            <div key={col.title}>
              <h4 className="text-xs font-bold tracking-widest mb-4" style={{ color: T, ...ff }}>{col.title.toUpperCase()}</h4>
              <ul className="space-y-2.5">
                {col.items.map((item) => (
                  <li key={item}>
                    <a href="#" className="text-xs hover:text-white transition-colors" style={{ color: MUTED, ...ff }}>{item}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 pt-6 flex items-center justify-between" style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <p className="text-xs" style={{ color: MUTED, ...ff }}>© 2024 thrift it! — Nền tảng mua bán đồ vintage Việt Nam</p>
          <div className="flex items-center gap-6">
            {["Điều khoản sử dụng", "Chính sách riêng tư", "Cookie"].map((l) => (
              <a key={l} href="#" className="text-xs hover:text-white transition-colors" style={{ color: MUTED, ...ff }}>{l}</a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

// ── Login Screen ───────────────────────────────────────────────────────────────
const MOCK_ACCOUNTS = [
  { email: "linh.nguyen@gmail.com", password: "123456", name: "Nguyễn Thanh Linh" },
  { email: "shop.minhtu@thriftit.vn", password: "shop123", name: "Minh Tú Vintage" },
  { email: "demo@thriftit.vn", password: "demo123", name: "Demo User" },
  { email: "admin@thriftit.vn", password: "admin", name: "Admin" },
];

function LoginScreen({ onLogin, onRegister }: { onLogin: (userName: string, userEmail: string) => void; onRegister: () => void }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = () => {
    setError("");
    
    if (!email.trim() || !pw.trim()) {
      setError("Vui lòng nhập đầy đủ email và mật khẩu");
      return;
    }

    if (!email.includes("@")) {
      setError("Email không hợp lệ");
      return;
    }

    setLoading(true);
    
    // Simulate network delay
    setTimeout(() => {
      const account = MOCK_ACCOUNTS.find(
        (acc) => acc.email.toLowerCase() === email.toLowerCase() && acc.password === pw
      );

      if (account) {
        onLogin(account.name, account.email);
      } else {
        setError("Email hoặc mật khẩu không đúng. Vui lòng thử lại.");
      }
      setLoading(false);
    }, 500);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleLogin();
    }
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: LINEN }}>
      {/* Left: hero image */}
      <div className="flex-1 relative overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=900&h=1080&fit=crop&auto=format"
          alt="Vintage clothing collection"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 flex flex-col justify-end p-16"
          style={{ background: "linear-gradient(to top, rgba(58,35,18,0.85) 0%, rgba(58,35,18,0.3) 50%, transparent 100%)" }}>
          <div className="flex items-center gap-3 mb-4">
            <ThriftLogo size={52} />
            <span className="text-4xl font-bold italic" style={{ ...serif, color: LINEN }}>thrift it!</span>
          </div>
          <h2 className="text-3xl font-bold mb-3" style={{ ...serif, color: LINEN }}>
            Thời trang cũ,<br />giá trị mới 🌿
          </h2>
          <p className="text-base" style={{ color: MUTED, ...ff }}>
            Khám phá hàng ngàn món đồ vintage độc đáo từ<br />các shop uy tín khắp Việt Nam.
          </p>
          <div className="flex items-center gap-6 mt-6">
            {[["12.000+", "Sản phẩm"], ["4.800+", "Người bán"], ["98%", "Hài lòng"]].map(([v, l]) => (
              <div key={l}>
                <div className="text-2xl font-bold" style={{ ...serif, color: T }}>{v}</div>
                <div className="text-xs" style={{ color: MUTED, ...ff }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: login form */}
      <div className="w-[500px] flex-shrink-0 flex items-center justify-center p-12" style={{ backgroundColor: CARD }}>
        <div className="w-full max-w-[380px]">
          {/* Logo mark */}
          <div className="flex flex-col items-center mb-10">
            <ThriftLogo size={60} />
            <h1 className="text-3xl font-bold italic mt-3" style={{ ...serif, color: ESPRESSO }}>thrift it!</h1>
            <p className="text-sm mt-1" style={{ color: COFFEE, ...ff }}>Chào mừng bạn trở lại</p>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl text-sm flex items-center gap-2"
              style={{ backgroundColor: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626" }}>
              <span>⚠️</span>
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold mb-1.5" style={{ color: COFFEE, ...ff }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                onKeyDown={handleKeyDown}
                placeholder="ban@email.com"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none border-2 transition-all"
                style={{ 
                  backgroundColor: SOFT, 
                  border: `2px solid ${error && !email ? "#EF4444" : MUTED}`, 
                  color: ESPRESSO, 
                  ...ff,
                  outline: "none"
                }}
              />
            </div>
            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-xs font-bold" style={{ color: COFFEE, ...ff }}>Mật khẩu</label>
                <a href="#" className="text-xs font-semibold hover:underline" style={{ color: T, ...ff }}>Quên mật khẩu?</a>
              </div>
              <input
                type="password"
                value={pw}
                onChange={(e) => { setPw(e.target.value); setError(""); }}
                onKeyDown={handleKeyDown}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none border-2 transition-all"
                style={{ 
                  backgroundColor: SOFT, 
                  border: `2px solid ${error && !pw ? "#EF4444" : MUTED}`, 
                  color: ESPRESSO, 
                  ...ff,
                  outline: "none"
                }}
              />
            </div>

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full py-3.5 rounded-xl text-base font-bold shadow-lg transition-all hover:opacity-90 active:scale-[0.98] mt-2 flex items-center justify-center gap-2"
              style={{ 
                backgroundColor: loading ? `${T}80` : T, 
                color: LINEN, 
                ...ff,
                cursor: loading ? "not-allowed" : "pointer"
              }}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Đang đăng nhập...
                </>
              ) : (
                "Đăng Nhập"
              )}
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px" style={{ backgroundColor: MUTED }} />
              <span className="text-xs" style={{ color: COFFEE, ...ff }}>hoặc</span>
              <div className="flex-1 h-px" style={{ backgroundColor: MUTED }} />
            </div>

            <button onClick={onRegister} className="w-full py-3 rounded-xl text-sm font-semibold border-2 transition-all hover:bg-opacity-80"
              style={{ border: `2px solid ${MUTED}`, color: COFFEE, backgroundColor: "transparent", ...ff }}>
              Đăng ký tài khoản mới
            </button>
          </div>

          {/* Demo accounts hint */}
          <div className="mt-4 p-4 rounded-xl" style={{ backgroundColor: `${T}10`, border: `1px solid ${T}30` }}>
            <p className="text-xs font-semibold mb-2" style={{ color: ESPRESSO, ...ff }}>🔑 Tài khoản demo theo Gói doanh thu (Slide):</p>
            <div className="space-y-2">
              <p className="text-[11px] leading-relaxed" style={{ color: COFFEE, ...ff }}>
                🟢 <strong>linh.nguyen@gmail.com</strong> (MK: <strong>123456</strong>)<br />
                ➔ Khách hàng: Gói thuê đồ <strong>Premium Rental (599k/tháng)</strong>.
              </p>
              <p className="text-[11px] leading-relaxed" style={{ color: COFFEE, ...ff }}>
                🔵 <strong>shop.minhtu@thriftit.vn</strong> (MK: <strong>shop123</strong>)<br />
                ➔ Chủ shop: Đang dùng <strong>Dịch vụ Media Standard (450k)</strong>.
              </p>
              <p className="text-[11px] leading-relaxed" style={{ color: COFFEE, ...ff }}>
                🟡 <strong>demo@thriftit.vn</strong> (MK: <strong>demo123</strong>)<br />
                ➔ Tài khoản thường: Chưa mua gói (có thể tự đặt để test).
              </p>
              <p className="text-[11px] leading-relaxed" style={{ color: COFFEE, ...ff }}>
                🔴 <strong>admin@thriftit.vn</strong> (MK: <strong>admin</strong>)<br />
                ➔ Quản trị viên: Duyệt tin đăng C2C & Cập nhật tiến độ B2B Media.
              </p>
            </div>
          </div>

          <p className="text-xs text-center mt-6" style={{ color: COFFEE, ...ff }}>
            Bằng cách đăng nhập, bạn đồng ý với{" "}
            <a href="#" className="underline" style={{ color: T }}>Điều khoản sử dụng</a>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Product Card ───────────────────────────────────────────────────────────────
function ProductCard({ product, onLike, go, onAddToCart }: { product: Product; onLike: (id: number) => void; go: (s: Screen, p?: Product, se?: Seller) => void; onAddToCart?: (product: Product) => void }) {
  const condColor = product.condition >= 90 ? "#27AE60" : product.condition >= 75 ? T : "#E67E22";
  return (
    <div
      onClick={() => go("product-detail", product)}
      className="rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-200 cursor-pointer group"
      style={{ backgroundColor: CARD, border: `1px solid ${MUTED}` }}
    >
      <div className="relative overflow-hidden" style={{ paddingBottom: "130%" }}>
        <img
          src={product.image}
          alt={product.name}
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        <button
          onClick={(e) => { e.stopPropagation(); onLike(product.id); }}
          className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full flex items-center justify-center shadow-md transition-all hover:scale-110"
          style={{ backgroundColor: "rgba(255,248,240,0.9)" }}
        >
          <Heart size={15} fill={product.liked ? T : "none"} stroke={product.liked ? T : COFFEE} />
        </button>
        <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: condColor, color: LINEN, ...ff }}>
            {product.condition}%
          </span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(58,35,18,0.75)", color: LINEN, ...ff }}>
            {product.size}
          </span>
        </div>
      </div>
      <div className="p-3">
        <p className="text-sm font-semibold truncate leading-snug" style={{ color: ESPRESSO, ...ff }}>{product.name}</p>
        <p 
          onClick={(e) => { e.stopPropagation(); const seller = SELLERS.find(s => s.handle === product.seller); if (seller) go("seller", undefined, seller); }}
          className="text-xs mt-0.5 hover:underline cursor-pointer" 
          style={{ color: COFFEE, ...ff }}
        >
          @{product.seller}
        </p>
        <p className="text-base font-bold mt-1.5" style={{ ...serif, color: T }}>{fmt(product.price)}</p>
        <div className="flex gap-2 mt-3 pt-2" style={{ borderTop: `1px dashed ${MUTED}55` }}>
          <button 
            onClick={(e) => { e.stopPropagation(); onAddToCart && onAddToCart(product); }}
            className="flex-1 py-2 rounded-xl text-[11px] font-bold transition-all hover:opacity-90"
            style={{ backgroundColor: T, color: LINEN }}
          >
            Thêm giỏ hàng
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onAddToCart && onAddToCart(product); go("cart"); }}
            className="p-2 rounded-xl transition-all hover:bg-opacity-80 flex items-center justify-center"
            style={{ border: `1.5px solid ${T}`, color: T, backgroundColor: "transparent" }}
          >
            <ShoppingCart size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Seller Card ────────────────────────────────────────────────────────────────
function SellerCard({ seller, go }: { seller: Seller; go?: (s: Screen, p?: Product, se?: Seller) => void }) {
  return (
    <div
      onClick={() => go && go("seller", undefined, seller)}
      className="rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer"
      style={{ backgroundColor: CARD, border: `1px solid ${MUTED}` }}
    >
      <div className="p-5">
        <div className="flex items-center gap-3 mb-3">
          <img src={seller.avatar} alt={seller.name} className="w-12 h-12 rounded-full object-cover border-2" style={{ borderColor: T }} />
          <div>
            <p className="text-sm font-bold" style={{ color: ESPRESSO, ...ff }}>{seller.name}</p>
            <p className="text-xs" style={{ color: COFFEE, ...ff }}>@{seller.handle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 mb-3">
          <div className="flex">
            {[1,2,3,4,5].map((i) => (
              <Star key={i} size={12} fill={i <= Math.floor(seller.rating) ? T : "none"} stroke={T} />
            ))}
          </div>
          <span className="text-xs font-bold" style={{ color: T, ...ff }}>{seller.rating}</span>
          <span className="text-xs" style={{ color: COFFEE, ...ff }}>· {seller.transactions} giao dịch</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {seller.thumbs.map((src, i) => (
            <div key={i} className="rounded-lg overflow-hidden" style={{ paddingBottom: "100%", position: "relative", backgroundColor: MUTED }}>
              <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" />
            </div>
          ))}
        </div>
      </div>
      <div className="px-5 pb-4">
        <button className="w-full py-2 rounded-xl text-xs font-bold border transition-all hover:opacity-80"
          style={{ border: `1.5px solid ${T}`, color: T, ...ff }}>
          Xem cửa hàng
        </button>
      </div>
    </div>
  );
}

// ── Home Screen ────────────────────────────────────────────────────────────────
function HomeScreen({ go, products, onLike, onAddToCart }: { go: (s: Screen, p?: Product, se?: Seller) => void; products: Product[]; onLike: (id: number) => void; onAddToCart: (product: Product) => void }) {
  return (
    <div style={{ backgroundColor: LINEN }}>
      {/* Hero banner */}
      <div className="relative w-full overflow-hidden" style={{ height: "340px" }}>
        <img
          src="https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=1440&h=400&fit=crop&auto=format"
          alt="Vintage collection"
          className="w-full h-full object-cover object-top"
        />
        <div className="absolute inset-0 flex items-center" style={{ background: "linear-gradient(90deg, rgba(58,35,18,0.8) 0%, rgba(58,35,18,0.3) 60%, transparent 100%)" }}>
          <div className="max-w-[1440px] mx-auto w-full px-8">
            <p className="text-sm font-bold mb-2 uppercase tracking-widest" style={{ color: T, ...ff }}>✦ Bộ sưu tập mới tuần này</p>
            <h2 className="text-5xl font-bold leading-tight mb-4" style={{ ...serif, color: LINEN }}>
              Mặc vintage,<br />sống có tâm 🌿
            </h2>
            <p className="text-base mb-6" style={{ color: MUTED, ...ff }}>Mua và bán đồ cũ — góp phần giảm thiểu lãng phí thời trang</p>
            <div className="flex gap-3">
              <button onClick={() => go("search")}
                className="px-6 py-3 rounded-xl font-bold text-sm transition-all hover:opacity-90 shadow-lg"
                style={{ backgroundColor: T, color: LINEN, ...ff }}>
                Khám phá ngay
              </button>
              <button onClick={() => go("post")}
                className="px-6 py-3 rounded-xl font-bold text-sm border-2 transition-all hover:bg-white/10"
                style={{ border: `2px solid ${LINEN}`, color: LINEN, ...ff }}>
                + Đăng bán cá nhân
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-8 py-12">
        {/* Trusted Sellers */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold" style={{ ...serif, color: ESPRESSO }}>Gợi ý Shop Uy Tín</h2>
              <p className="text-sm mt-0.5" style={{ color: COFFEE, ...ff }}>Được đánh giá cao từ cộng đồng thrift it!</p>
            </div>
            <button className="text-sm font-semibold flex items-center gap-1 hover:underline" style={{ color: T, ...ff }}>
              Xem tất cả <ChevronRight size={15} />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-5">
            {SELLERS.map((s) => <SellerCard key={s.id} seller={s} go={go} />)}
          </div>
        </div>

        {/* New Listings */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold" style={{ ...serif, color: ESPRESSO }}>
                Mới Đăng <span className="text-lg font-normal italic ml-2" style={{ color: COFFEE }}>Recently Listed</span>
              </h2>
              <p className="text-sm mt-0.5" style={{ color: COFFEE, ...ff }}>Những món mới nhất từ cộng đồng thrift it!</p>
            </div>
            <button onClick={() => go("search")} className="text-sm font-semibold flex items-center gap-1 hover:underline" style={{ color: T, ...ff }}>
              Xem tất cả <ChevronRight size={15} />
            </button>
          </div>
          <div className="grid grid-cols-5 gap-5">
           {products.map((p) => <ProductCard go={go} key={p.id} product={p} onLike={onLike} onAddToCart={onAddToCart} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Filter Sidebar ─────────────────────────────────────────────────────────────
interface FilterState {
  cats: string[];
  minP: string;
  maxP: string;
  sizes: string[];
  cond: number;
  ai: boolean;
}

interface FilterSidebarProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}

function FilterSidebar({ filters, onChange }: FilterSidebarProps) {
  const { cats, minP, maxP, sizes, cond, ai } = filters;

  const toggleCat = (c: string) => onChange({
    ...filters,
    cats: cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c]
  });
  const toggleSize = (s: string) => onChange({
    ...filters,
    sizes: sizes.includes(s) ? sizes.filter((x) => x !== s) : [...sizes, s]
  });
  const setMinP = (v: string) => onChange({ ...filters, minP: v });
  const setMaxP = (v: string) => onChange({ ...filters, maxP: v });
  const setCond = (v: number) => onChange({ ...filters, cond: v });
  const setAi = (v: boolean) => onChange({ ...filters, ai: v });
  const clearAll = () => onChange({ cats: [], minP: "", maxP: "", sizes: [], cond: 50, ai: false });

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="py-5" style={{ borderBottom: `1px solid ${MUTED}` }}>
      <h4 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: COFFEE, ...ff }}>{label}</h4>
      {children}
    </div>
  );

  return (
    <aside className="w-60 flex-shrink-0 rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: CARD, border: `1px solid ${MUTED}`, alignSelf: "start", position: "sticky", top: "128px" }}>
      <div className="px-5 pt-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold" style={{ ...serif, color: ESPRESSO }}>Bộ lọc nâng cao</h3>
          <button onClick={clearAll} className="text-xs font-semibold hover:underline" style={{ color: T, ...ff }}>Xóa tất cả</button>
        </div>
        <p className="text-xs" style={{ color: COFFEE, ...ff }}>Tìm đúng món bạn cần</p>
      </div>
      <div className="px-5">
        <Row label="Danh mục">
          <div className="space-y-2">
            {["Áo", "Quần", "Váy", "Áo khoác", "Phụ kiện"].map((c) => (
              <label key={c} className="flex items-center gap-2.5 cursor-pointer group">
                <div
                  onClick={() => toggleCat(c)}
                  className="w-4 h-4 rounded border-2 flex items-center justify-center transition-all"
                  style={{ borderColor: cats.includes(c) ? T : MUTED, backgroundColor: cats.includes(c) ? T : "transparent" }}
                >
                  {cats.includes(c) && <Check size={10} style={{ color: LINEN }} />}
                </div>
                <span className="text-sm" style={{ color: ESPRESSO, ...ff }}>{c}</span>
              </label>
            ))}
          </div>
        </Row>

        <Row label="Khoảng giá (₫)">
          <div className="space-y-2">
            <input value={minP} onChange={(e) => setMinP(e.target.value)} placeholder="Từ" className="w-full px-3 py-2 rounded-lg text-xs outline-none border" style={{ border: `1.5px solid ${MUTED}`, color: ESPRESSO, backgroundColor: SOFT, ...ff }} />
            <input value={maxP} onChange={(e) => setMaxP(e.target.value)} placeholder="Đến" className="w-full px-3 py-2 rounded-lg text-xs outline-none border" style={{ border: `1.5px solid ${MUTED}`, color: ESPRESSO, backgroundColor: SOFT, ...ff }} />
            <div className="flex gap-1.5 flex-wrap">
              {[
                { label: "< 100k", min: "", max: "100000" },
                { label: "100-300k", min: "100000", max: "300000" },
                { label: "300-500k", min: "300000", max: "500000" },
                { label: "> 500k", min: "500000", max: "" }
              ].map((r) => {
                const isActive = minP === r.min && maxP === r.max;
                return (
                  <button key={r.label} onClick={() => { setMinP(r.min); setMaxP(r.max); }}
                    className="text-[10px] px-2.5 py-1 rounded-full border transition-all"
                    style={{ border: `1px solid ${isActive ? T : MUTED}`, backgroundColor: isActive ? T : "transparent", color: isActive ? LINEN : COFFEE, ...ff }}>
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>
        </Row>

        <Row label="Kích cỡ">
          <div className="flex flex-wrap gap-1.5">
            {["XS", "S", "M", "L", "XL", "XXL", "XXXL"].map((s) => (
              <button
                key={s}
                onClick={() => toggleSize(s)}
                className="w-10 h-8 rounded-lg text-xs font-bold border transition-all"
                style={{ border: `1.5px solid ${sizes.includes(s) ? T : MUTED}`, backgroundColor: sizes.includes(s) ? T : "transparent", color: sizes.includes(s) ? LINEN : COFFEE, ...ff }}
              >{s}</button>
            ))}
          </div>
        </Row>

        <Row label={`Độ mới tối thiểu: ${cond}%`}>
          <input type="range" min={30} max={100} value={cond} onChange={(e) => setCond(Number(e.target.value))}
            className="w-full h-2 rounded-full cursor-pointer" style={{ accentColor: T }} />
          <div className="flex justify-between mt-1">
            <span className="text-[10px]" style={{ color: COFFEE, ...ff }}>30%</span>
            <span className="text-[10px]" style={{ color: COFFEE, ...ff }}>100%</span>
          </div>
        </Row>

        <div className="py-5" style={{ borderBottom: `1px solid ${MUTED}` }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold" style={{ color: ESPRESSO, ...ff }}>✨ Gợi ý từ AI</p>
              <p className="text-xs mt-0.5" style={{ color: COFFEE, ...ff }}>Để AI tìm món phù hợp phong cách bạn</p>
            </div>
            <button
              onClick={() => setAi(!ai)}
              className="w-12 h-6 rounded-full transition-all relative"
              style={{ backgroundColor: ai ? T : MUTED }}
            >
              <span className="absolute top-0.5 w-5 h-5 rounded-full transition-all shadow-sm"
                style={{ backgroundColor: "white", left: ai ? "calc(100% - 22px)" : "2px" }} />
            </button>
          </div>
        </div>

        <div className="py-5">
          <button className="w-full py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-90"
            style={{ backgroundColor: T, color: LINEN, ...ff }}>
            Áp dụng bộ lọc
          </button>
        </div>
      </div>
    </aside>
  );
}

// ── Search Screen ──────────────────────────────────────────────────────────────
function SearchScreen({ products, onLike, go, onAddToCart, activeTag, headerQuery }: { products: Product[]; onLike: (id: number) => void; go: (s: Screen, p?: Product) => void; onAddToCart: (product: Product) => void; activeTag?: string; headerQuery?: string }) {
  const [query, setQuery] = useState(headerQuery || "");
  const [sort, setSort] = useState("Mới nhất");
  const [filters, setFilters] = useState<FilterState>({
    cats: [],
    minP: "",
    maxP: "",
    sizes: [],
    cond: 50,
    ai: false
  });

  // Update filters when activeTag changes (from header quick filters)
  useEffect(() => {
    if (activeTag === "Tất cả" || !activeTag) {
      setFilters({ cats: [], minP: "", maxP: "", sizes: [], cond: 50, ai: false });
    } else if (activeTag === "Áo") {
      setFilters({ cats: ["Áo"], minP: "", maxP: "", sizes: [], cond: 50, ai: false });
    } else if (activeTag === "Quần") {
      setFilters({ cats: ["Quần"], minP: "", maxP: "", sizes: [], cond: 50, ai: false });
    } else if (activeTag === "Váy") {
      setFilters({ cats: ["Váy"], minP: "", maxP: "", sizes: [], cond: 50, ai: false });
    } else if (activeTag === "Áo khoác") {
      setFilters({ cats: ["Áo khoác"], minP: "", maxP: "", sizes: [], cond: 50, ai: false });
    } else if (activeTag === "Phụ kiện") {
      setFilters({ cats: ["Phụ kiện"], minP: "", maxP: "", sizes: [], cond: 50, ai: false });
    } else if (activeTag === "Độ mới >90%") {
      setFilters({ cats: [], minP: "", maxP: "", sizes: [], cond: 90, ai: false });
    } else if (activeTag === "Gần đây") {
      setFilters({ cats: [], minP: "", maxP: "", sizes: [], cond: 50, ai: false });
    }
  }, [activeTag]);

  // Filter products based on filters and search query
  const filteredProducts = products.filter(p => {
    // Search query
    const q = query.toLowerCase();
    const matchesQuery = !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.seller.toLowerCase().includes(q);
    
    // Category filter
    const matchesCat = filters.cats.length === 0 || filters.cats.includes(p.category);
    
    // Size filter
    const matchesSize = filters.sizes.length === 0 || filters.sizes.includes(p.size);
    
    // Condition filter
    const matchesCond = p.condition >= filters.cond;
    
    // Price filter
    const minPrice = filters.minP ? parseInt(filters.minP.replace(/\D/g, '')) : 0;
    const maxPrice = filters.maxP ? parseInt(filters.maxP.replace(/\D/g, '')) : Infinity;
    const matchesPrice = p.price >= minPrice && p.price <= maxPrice;
    
    return matchesQuery && matchesCat && matchesSize && matchesCond && matchesPrice;
  });

  // Sort products
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    switch (sort) {
      case "Giá tăng dần": return a.price - b.price;
      case "Giá giảm dần": return b.price - a.price;
      case "Độ mới cao nhất": return b.condition - a.condition;
      case "Nổi bật nhất": return (b.liked ? 1 : 0) - (a.liked ? 1 : 0);
      default: return a.id - b.id;
    }
  });

  return (
    <div className="min-h-screen" style={{ backgroundColor: LINEN }}>
      <div className="max-w-[1440px] mx-auto px-8 py-8">
        {/* Search bar */}
        <div className="mb-6">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ backgroundColor: CARD, border: `1.5px solid ${MUTED}` }}>
            <Search size={18} style={{ color: COFFEE }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm sản phẩm..."
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: ESPRESSO, ...ff }}
            />
            {query && (
              <button onClick={() => setQuery("")} className="p-1 rounded-full hover:bg-gray-100">
                <X size={16} style={{ color: COFFEE }} />
              </button>
            )}
          </div>
        </div>

        {/* Search summary */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold" style={{ ...serif, color: ESPRESSO }}>
              {query ? <>Kết quả cho <span style={{ color: T }}>"{query}"</span></> : "Tất cả sản phẩm"}
            </h2>
            <p className="text-sm mt-0.5" style={{ color: COFFEE, ...ff }}>{sortedProducts.length} sản phẩm{filters.cats.length > 0 || filters.sizes.length > 0 || filters.minP || filters.maxP ? " · Đã lọc" : ""}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm" style={{ color: COFFEE, ...ff }}>Sắp xếp theo:</span>
            <div className="relative">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 rounded-xl text-sm outline-none border cursor-pointer"
                style={{ border: `1.5px solid ${MUTED}`, color: ESPRESSO, backgroundColor: CARD, ...ff }}
              >
                {["Mới nhất", "Giá tăng dần", "Giá giảm dần", "Độ mới cao nhất", "Nổi bật nhất"].map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: COFFEE }} />
            </div>
          </div>
        </div>

        <div className="flex gap-7">
          <FilterSidebar filters={filters} onChange={setFilters} />
          <div className="flex-1">
            {/* AI suggestion banner */}
            {!filters.ai && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl mb-6" style={{ backgroundColor: `${T}18`, border: `1.5px solid ${T}44` }}>
                <Sparkles size={18} style={{ color: T }} />
                <p className="text-sm" style={{ color: ESPRESSO, ...ff }}>
                  <strong>AI gợi ý:</strong> Dựa trên lịch sử tìm kiếm, bạn có thể thích các kiểu áo linen cổ điển và áo sơ mi vintage oversize.
                </p>
              </div>
            )}

            <div className="grid grid-cols-4 gap-5">
              {sortedProducts.map((p) => <ProductCard key={p.id} product={p} onLike={onLike} go={go} onAddToCart={onAddToCart} />)}
            </div>

            {sortedProducts.length === 0 && (
              <div className="text-center py-20">
                <p className="text-lg font-bold" style={{ color: ESPRESSO }}>Không tìm thấy sản phẩm nào</p>
                <p className="text-sm mt-2" style={{ color: COFFEE }}>Thử điều chỉnh bộ lọc hoặc từ khóa tìm kiếm</p>
              </div>
            )}

            {/* Load more */}
            {sortedProducts.length > 0 && (
              <div className="flex justify-center mt-10">
                <button className="px-8 py-3 rounded-xl text-sm font-bold border-2 transition-all hover:opacity-80"
                  style={{ border: `2px solid ${T}`, color: T, ...ff }}>
                  Tải thêm sản phẩm
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Cart Screen ────────────────────────────────────────────────────────────────
function CartScreen({ go, cartGroups, updateCart }: { go: (s: Screen) => void; cartGroups: CartGroup[]; updateCart: (cart: CartGroup[]) => void }) {
  const [promo, setPromo] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoError, setPromoError] = useState(false);

  const allItems = cartGroups.flatMap((g) => g.items);
  const checkedItems = allItems.filter((i) => i.checked);
  const allChecked = allItems.length > 0 && allItems.every((i) => i.checked);
  const someChecked = allItems.some((i) => i.checked);

  const subtotal = checkedItems.reduce((s, i) => s + i.price * i.qty, 0);
  const discount = promoApplied ? Math.round(subtotal * 0.1) : 0;
  const ship = checkedItems.length > 0 ? 30000 : 0;
  const total = subtotal - discount + ship;

  const toggleAll = () => {
    const next = !allChecked;
    const newCart = cartGroups.map((g) => ({ ...g, items: g.items.map((i) => ({ ...i, checked: next })) }));
    updateCart(newCart);
  };
  const toggleGroup = (seller: string) => {
    const group = cartGroups.find((g) => g.seller === seller);
    if (!group) return;
    const allGroupChecked = group.items.every((i) => i.checked);
    const newCart = cartGroups.map((g) => g.seller !== seller ? g : { ...g, items: g.items.map((i) => ({ ...i, checked: !allGroupChecked })) });
    updateCart(newCart);
  };
  const toggleItem = (seller: string, id: number) => {
    const newCart = cartGroups.map((g) => g.seller !== seller ? g : { ...g, items: g.items.map((i) => i.id === id ? { ...i, checked: !i.checked } : i) });
    updateCart(newCart);
  };
  const adjustQty = (seller: string, id: number, d: number) => {
    const newCart = cartGroups.map((g) => g.seller !== seller ? g : { ...g, items: g.items.map((i) => i.id === id ? { ...i, qty: Math.max(1, i.qty + d) } : i) });
    updateCart(newCart);
  };
  const removeItem = (seller: string, id: number) => {
    const newCart = cartGroups.map((g) => ({ ...g, items: g.items.filter((i) => !(g.seller === seller && i.id === id)) })).filter((g) => g.items.length > 0);
    updateCart(newCart);
  };
  const removeChecked = () => {
    const newCart = cartGroups.map((g) => ({ ...g, items: g.items.filter((i) => !i.checked) })).filter((g) => g.items.length > 0);
    updateCart(newCart);
  };

  const applyPromo = () => {
    if (!promo.trim()) return;
    if (promo.toUpperCase() === "THRIFT10" || promo.toUpperCase() === "VINTAGE") {
      setPromoApplied(true);
      setPromoError(false);
    } else {
      setPromoError(true);
      setPromoApplied(false);
    }
  };

  // Inline checkbox button for reuse
  const Checkbox = ({ checked, onClick }: { checked: boolean; onClick: () => void }) => (
    <button
      onClick={onClick}
      className="flex-shrink-0 flex items-center justify-center rounded transition-all"
      style={{
        width: 20, height: 20,
        border: `2px solid ${checked ? T : MUTED}`,
        backgroundColor: checked ? T : "transparent",
      }}
    >
      {checked && <Check size={11} strokeWidth={3} style={{ color: LINEN }} />}
    </button>
  );

  return (
    <div style={{ backgroundColor: LINEN, minHeight: "100vh" }}>
      {/* Page title bar */}
      <div style={{ backgroundColor: COFFEE, borderBottom: `2px solid rgba(0,0,0,0.15)` }}>
        <div className="max-w-[1440px] mx-auto px-8 py-4 flex items-center gap-3">
          <ShoppingCart size={22} style={{ color: LINEN }} />
          <h1 className="text-xl font-bold italic" style={{ ...serif, color: LINEN }}>
            Giỏ hàng của tôi
          </h1>
          <span className="text-sm px-3 py-0.5 rounded-full ml-1" style={{ backgroundColor: "rgba(255,255,255,0.18)", color: LINEN, ...ff }}>
            {allItems.length} sản phẩm
          </span>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-8 py-8">
        {allItems.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-28 gap-5">
            <div className="w-24 h-24 rounded-full flex items-center justify-center" style={{ backgroundColor: MUTED }}>
              <ShoppingCart size={44} style={{ color: COFFEE }} strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <p className="text-xl font-bold mb-1" style={{ ...serif, color: ESPRESSO }}>Giỏ hàng trống</p>
              <p className="text-sm" style={{ color: COFFEE, ...ff }}>Hãy thêm vài món vintage vào giỏ nhé!</p>
            </div>
            <button className="px-8 py-3 rounded-xl font-bold text-sm transition-all hover:opacity-90 shadow-md"
              style={{ backgroundColor: T, color: LINEN, ...ff }}>
              Tiếp tục mua sắm
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: "28px", alignItems: "start" }}>

            {/* ── LEFT COLUMN ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

              {/* Select-all toolbar */}
              <div
                className="flex items-center gap-4 px-5 py-3 rounded-2xl"
                style={{ backgroundColor: CARD, border: `1px solid ${MUTED}` }}
              >
                <Checkbox checked={allChecked} onClick={toggleAll} />
                <span className="text-sm font-semibold" style={{ color: ESPRESSO, ...ff }}>
                  Chọn tất cả ({allItems.length} sản phẩm)
                </span>
                {someChecked && (
                  <button
                    onClick={removeChecked}
                    className="ml-auto text-xs font-semibold flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all hover:opacity-80"
                    style={{ color: "#C0392B", backgroundColor: "#FDEDEC", ...ff }}
                  >
                    <Trash2 size={12} /> Xóa đã chọn ({checkedItems.length})
                  </button>
                )}
              </div>

              {/* Seller groups */}
              {cartGroups.map((group) => {
                const groupChecked = group.items.every((i) => i.checked);
                const groupTotal = group.items.filter((i) => i.checked).reduce((s, i) => s + i.price * i.qty, 0);
                return (
                  <div
                    key={group.seller}
                    className="rounded-2xl overflow-hidden"
                    style={{ backgroundColor: CARD, border: `1px solid ${MUTED}`, boxShadow: "0 2px 8px rgba(58,35,18,0.06)" }}
                  >
                    {/* Seller header row */}
                    <div
                      className="flex items-center gap-3 px-5 py-3"
                      style={{ backgroundColor: SOFT, borderBottom: `1px solid ${MUTED}` }}
                    >
                      <Checkbox checked={groupChecked} onClick={() => toggleGroup(group.seller)} />
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                        style={{ backgroundColor: COFFEE, color: LINEN }}>
                        {group.seller.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-bold" style={{ color: ESPRESSO, ...ff }}>@{group.seller}</span>
                        <span className="ml-2 text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: `${T}22`, color: T, ...ff }}>
                          ⭐ Shop uy tín
                        </span>
                      </div>
                      <span className="text-xs font-semibold" style={{ color: COFFEE, ...ff }}>
                        {group.items.length} món · {fmt(groupTotal)}
                      </span>
                    </div>

                    {/* Items */}
                    {group.items.map((item, idx) => (
                      <div
                        key={`${item.id}-${item.buyOrRent || 'buy'}`}
                        className="flex items-center gap-4 px-5 py-4"
                        style={{
                          borderBottom: idx < group.items.length - 1 ? `1px solid ${MUTED}55` : "none",
                          backgroundColor: item.checked ? `${T}06` : CARD,
                          transition: "background-color 0.15s",
                        }}
                      >
                        <Checkbox checked={item.checked} onClick={() => toggleItem(group.seller, item.id)} />

                        {/* Product image */}
                        <div className="relative flex-shrink-0">
                          <img
                            src={item.image}
                            alt={item.name}
                            style={{ width: 88, height: 88, objectFit: "cover", borderRadius: 12, border: `1px solid ${MUTED}` }}
                          />
                          <span
                            className="absolute bottom-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: ESPRESSO + "dd", color: LINEN, ...ff }}
                          >
                            {item.condition}%
                          </span>
                        </div>

                        {/* Product info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p className="text-sm font-bold leading-snug" style={{ color: ESPRESSO, ...ff }}>{item.name}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            {item.buyOrRent === "rent" && (
                              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-300">
                                🔄 Thuê đồ thành viên
                              </span>
                            )}
                            <span className="text-xs px-2.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: SOFT, color: COFFEE, border: `1.5px solid ${MUTED}`, ...ff }}>
                              Size {item.size}
                            </span>
                            <span className="text-xs px-2.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: SOFT, color: COFFEE, border: `1.5px solid ${MUTED}`, ...ff }}>
                              Độ mới {item.condition}%
                            </span>
                          </div>
                          <p className="text-xs mt-2" style={{ color: COFFEE, ...ff }}>
                            Đơn giá: <span style={{ color: ESPRESSO, fontWeight: 600 }}>{item.buyOrRent === "rent" ? "0₫ (Thuê bao Premium)" : fmt(item.price)}</span>
                          </p>
                        </div>

                        {/* Quantity controls */}
                        <div className="flex items-center gap-0 rounded-xl overflow-hidden flex-shrink-0"
                          style={{ border: `1.5px solid ${MUTED}` }}>
                          <button
                            onClick={() => adjustQty(group.seller, item.id, -1)}
                            className="flex items-center justify-center transition-all hover:opacity-70"
                            style={{ width: 34, height: 34, backgroundColor: SOFT, color: COFFEE }}
                          >
                            <Minus size={13} />
                          </button>
                          <span
                            className="flex items-center justify-center text-sm font-bold"
                            style={{ width: 38, height: 34, color: ESPRESSO, backgroundColor: CARD, borderLeft: `1.5px solid ${MUTED}`, borderRight: `1.5px solid ${MUTED}`, ...ff }}
                          >
                            {item.qty}
                          </span>
                          <button
                            onClick={() => adjustQty(group.seller, item.id, 1)}
                            className="flex items-center justify-center transition-all hover:opacity-90"
                            style={{ width: 34, height: 34, backgroundColor: T, color: LINEN }}
                          >
                            <Plus size={13} />
                          </button>
                        </div>

                        {/* Line total */}
                        <div className="text-right flex-shrink-0" style={{ minWidth: 110 }}>
                          <p className="text-base font-bold" style={{ ...serif, color: T }}>{fmt(item.buyOrRent === "rent" ? 0 : item.price * item.qty)}</p>
                          {item.qty > 1 && (
                            <p className="text-xs mt-0.5" style={{ color: COFFEE, ...ff }}>{fmt(item.price)} × {item.qty}</p>
                          )}
                        </div>

                        {/* Remove */}
                        <button
                          onClick={() => removeItem(group.seller, item.id)}
                          className="flex-shrink-0 p-2 rounded-xl transition-all hover:opacity-80 ml-1"
                          style={{ backgroundColor: "#FDEDEC" }}
                        >
                          <Trash2 size={15} style={{ color: "#C0392B" }} />
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })}

              {/* Suggested upsell hint */}
              <div
                className="flex items-center gap-3 px-5 py-3.5 rounded-2xl"
                style={{ backgroundColor: `${T}0F`, border: `1.5px dashed ${T}55` }}
              >
                <Sparkles size={18} style={{ color: T, flexShrink: 0 }} />
                <p className="text-sm" style={{ color: ESPRESSO, ...ff }}>
                  <strong>Gợi ý từ AI:</strong> Bạn thường mua cùng với "Áo Linen" — thử xem thêm{" "}
                  <span className="font-bold underline cursor-pointer" style={{ color: T }}>Quần linen ống rộng vintage</span> nhé!
                </p>
              </div>
            </div>

            {/* ── RIGHT COLUMN: Summary panel ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", position: "sticky", top: "128px" }}>

              {/* Promo code card */}
              <div
                className="rounded-2xl overflow-hidden"
                style={{ backgroundColor: CARD, border: `1px solid ${MUTED}`, boxShadow: "0 2px 8px rgba(58,35,18,0.06)" }}
              >
                <div className="px-5 py-3.5 flex items-center gap-2" style={{ backgroundColor: SOFT, borderBottom: `1px solid ${MUTED}` }}>
                  <Percent size={15} style={{ color: T }} />
                  <span className="text-sm font-bold" style={{ color: ESPRESSO, ...ff }}>Mã giảm giá</span>
                </div>
                <div className="p-4">
                  <div className="flex gap-2">
                    <input
                      value={promo}
                      onChange={(e) => { setPromo(e.target.value); setPromoError(false); }}
                      onKeyDown={(e) => e.key === "Enter" && applyPromo()}
                      placeholder="Nhập mã giảm giá..."
                      className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none border-2 transition-all"
                      style={{
                        backgroundColor: SOFT,
                        border: `2px solid ${promoError ? "#C0392B" : promoApplied ? "#27AE60" : MUTED}`,
                        color: ESPRESSO,
                        ...ff,
                      }}
                    />
                    <button
                      onClick={applyPromo}
                      className="px-4 py-2.5 rounded-xl text-sm font-bold flex-shrink-0 transition-all hover:opacity-90 active:scale-[0.97]"
                      style={{
                        backgroundColor: promoApplied ? "#27AE6022" : T,
                        color: promoApplied ? "#27AE60" : LINEN,
                        border: `2px solid ${promoApplied ? "#27AE60" : T}`,
                        ...ff,
                      }}
                    >
                      {promoApplied ? "✓ Đã dùng" : "Áp dụng"}
                    </button>
                  </div>
                  {promoError && (
                    <p className="text-xs mt-2" style={{ color: "#C0392B", ...ff }}>
                      ✗ Mã không hợp lệ hoặc đã hết hạn. Thử mã <strong>THRIFT10</strong>
                    </p>
                  )}
                  {promoApplied && (
                    <p className="text-xs mt-2 font-semibold" style={{ color: "#27AE60", ...ff }}>
                      ✓ Đã áp dụng mã — giảm 10% tạm tính!
                    </p>
                  )}
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {["THRIFT10", "VINTAGE", "FREESHIP"].map((code) => (
                      <button
                        key={code}
                        onClick={() => { setPromo(code); setPromoError(false); }}
                        className="text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all hover:opacity-80"
                        style={{ border: `1px dashed ${T}`, color: T, backgroundColor: `${T}0F`, ...ff }}
                      >
                        {code}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Order summary card */}
              <div
                className="rounded-2xl overflow-hidden"
                style={{ backgroundColor: CARD, border: `1px solid ${MUTED}`, boxShadow: "0 2px 8px rgba(58,35,18,0.06)" }}
              >
                <div className="px-5 py-3.5 flex items-center gap-2" style={{ backgroundColor: SOFT, borderBottom: `1px solid ${MUTED}` }}>
                  <Tag size={15} style={{ color: T }} />
                  <span className="text-sm font-bold" style={{ color: ESPRESSO, ...ff }}>Tóm tắt đơn hàng</span>
                </div>

                <div className="px-5 pt-4 pb-2 space-y-3">
                  {/* Line items */}
                  {cartGroups.map((g) => {
                    const groupCheckedItems = g.items.filter((i) => i.checked);
                    if (groupCheckedItems.length === 0) return null;
                    return (
                      <div key={g.seller}>
                        <p className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: COFFEE, ...ff }}>
                          @{g.seller}
                        </p>
                        {groupCheckedItems.map((item) => (
                          <div key={item.id} className="flex justify-between items-start mb-1">
                            <span className="text-xs leading-snug pr-2 flex-1" style={{ color: ESPRESSO, ...ff }}>
                              {item.name} <span style={{ color: COFFEE }}>×{item.qty}</span>
                            </span>
                            <span className="text-xs font-semibold flex-shrink-0" style={{ color: ESPRESSO, ...ff }}>
                              {item.buyOrRent === "rent" ? "0₫" : fmt(item.price * item.qty)}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>

                {/* Totals */}
                <div className="px-5 pb-5 pt-2" style={{ borderTop: `1px solid ${MUTED}` }}>
                  <div className="space-y-2.5 pt-3">
                    <div className="flex justify-between text-sm">
                      <span style={{ color: COFFEE, ...ff }}>Tạm tính ({checkedItems.length} sản phẩm)</span>
                      <span style={{ color: ESPRESSO, ...ff }}>{fmt(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span style={{ color: COFFEE, ...ff }}>Phí vận chuyển</span>
                      <span style={{ color: ESPRESSO, ...ff }}>{checkedItems.length > 0 ? fmt(ship) : "—"}</span>
                    </div>
                    {promoApplied && (
                      <div className="flex justify-between text-sm font-semibold">
                        <span style={{ color: "#27AE60", ...ff }}>Giảm giá (10%)</span>
                        <span style={{ color: "#27AE60", ...ff }}>−{fmt(discount)}</span>
                      </div>
                    )}
                  </div>

                  <div
                    className="flex justify-between items-center mt-4 pt-4"
                    style={{ borderTop: `2px solid ${MUTED}` }}
                  >
                    <span className="font-bold text-base" style={{ color: ESPRESSO, ...ff }}>Tổng thanh toán</span>
                    <span className="text-2xl font-bold" style={{ ...serif, color: T }}>{fmt(total)}</span>
                  </div>

                  {/* CTA Button */}
                  <button
                    className="w-full mt-4 py-4 rounded-2xl font-bold text-base shadow-lg transition-all hover:opacity-90 active:scale-[0.98]"
                    style={{
                      backgroundColor: checkedItems.length === 0 ? MUTED : T,
                      color: checkedItems.length === 0 ? COFFEE : LINEN,
                      cursor: checkedItems.length === 0 ? "not-allowed" : "pointer",
                      ...ff,
                    }}
                    onClick={() => go("payment")}
                    disabled={checkedItems.length === 0}
                  >
                    {checkedItems.length === 0
                      ? "Chọn sản phẩm để mua"
                      : `Mua Hàng (${checkedItems.length} món)`}
                  </button>

                  <div className="flex items-center justify-center gap-1.5 mt-3">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M6 1L7.5 4.5H11L8.5 6.5L9.5 10L6 8L2.5 10L3.5 6.5L1 4.5H4.5L6 1Z" fill={COFFEE} />
                    </svg>
                    <p className="text-[11px]" style={{ color: COFFEE, ...ff }}>
                      🔒 Thanh toán bảo mật · Đổi trả trong 7 ngày
                    </p>
                  </div>
                </div>
              </div>

              {/* Trust badges */}
              <div
                className="rounded-2xl px-4 py-3 grid grid-cols-3 gap-2"
                style={{ backgroundColor: CARD, border: `1px solid ${MUTED}` }}
              >
                {[
                  { icon: "🛡️", label: "Bảo vệ người mua" },
                  { icon: "🔄", label: "Đổi trả dễ dàng" },
                  { icon: "⚡", label: "Giao hàng nhanh" },
                ].map((b) => (
                  <div key={b.label} className="flex flex-col items-center gap-1 py-1">
                    <span className="text-lg">{b.icon}</span>
                    <span className="text-[10px] text-center font-semibold leading-tight" style={{ color: COFFEE, ...ff }}>{b.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Chat Screen ────────────────────────────────────────────────────────────────
function ChatScreen() {
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

  useEffect(() => {
    scrollToBottom();
  }, [active, conversation.length]);

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
        <div className="rounded-2xl overflow-hidden shadow-sm flex" style={{ height: "calc(100vh - 200px)", border: `1px solid ${MUTED}` }}>
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

interface SellerProduct {
  id: number;
  name: string;
  price: number;
  quantity: number;
  status: "active" | "pending" | "sold";
  image: string;
  views: number;
  likes: number;
  createdAt: string;
}

// ── Account Screen ──────────────────────────────────────────────────────────────
function AccountScreen({
  go,
  onLogout,
  userName = "Nguyễn Thanh Linh",
  userEmail = "linh.nguyen@gmail.com",
  orders = [],
  myProducts,
  setMyProducts,
  userRole,
  setUserRole,
  rentalPlan,
  mediaPlan,
  mediaStatus,
  setMediaStatus,
  rentedItems,
  setRentedItems,
  onOpenCheckoutPlan
}: {
  go: (s: Screen) => void;
  onLogout: () => void;
  userName?: string;
  userEmail?: string;
  orders?: Order[];
  myProducts: SellerProduct[];
  setMyProducts: React.Dispatch<React.SetStateAction<SellerProduct[]>>;
  userRole: "buyer" | "seller";
  setUserRole: (role: "buyer" | "seller") => void;
  rentalPlan: string;
  mediaPlan: string;
  mediaStatus: string;
  setMediaStatus: (status: string) => void;
  rentedItems: Array<{ id: number; name: string; image: string; rentDate: string; returnDate: string }>;
  setRentedItems: React.Dispatch<React.SetStateAction<Array<{ id: number; name: string; image: string; rentDate: string; returnDate: string }>>>;
  onOpenCheckoutPlan: (type: "rental" | "media", name: string, price: number) => void;
}) {
  // ── State quản lý ──────────────────────────────────────────────────────────
  const [accountTab, setAccountTab] = useState<string>(
    userRole === "seller"
      ? (mediaPlan !== "None" ? "media" : "selling")
      : "purchases"
  );
  const [orderTab, setOrderTab] = useState<"pending" | "shipping" | "delivering" | "review">("shipping");
  const [sellingTab, setSellingTab] = useState<"all" | "active" | "pending" | "sold">("all");

  useEffect(() => {
    setAccountTab(
      userRole === "seller"
        ? (mediaPlan !== "None" ? "media" : "selling")
        : "purchases"
    );
  }, [userRole, mediaPlan]);

  // ── Quản lý địa chỉ ───────────────────────────────────────────────────────
  const [addresses, setAddresses] = useState([
    { id: 1, label: "Nhà riêng", name: "Nguyễn Thanh Linh", phone: "0909XXX123", province: "TP. Hồ Chí Minh", district: "Quận 10", detail: "123 Đường Nguyễn Trãi", isDefault: true },
    { id: 2, label: "Văn phòng", name: "Nguyễn Thanh Linh", phone: "0909XXX123", province: "TP. Hồ Chí Minh", district: "Quận 3", detail: "456 Đường Lý Thường Kiệt", isDefault: false },
  ]);

  // ── Tin nhắn từ người mua ─────────────────────────────────────────────────
  const [messages, setMessages] = useState([
    { id: 1, buyer: "minh.nguyen", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100", product: "Áo Khoác Denim Rửa Cũ 80s", productImg: "https://images.unsplash.com/photo-1495105787522-5334e3ffa0ef?w=150", message: "Còn size M không ạ?", time: "5 phút trước", unread: true },
    { id: 2, buyer: "thu.tran", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100", product: "Quần Jean Ống Rộng", productImg: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=150", message: "Ship cho em đi Hà Nội được không?", time: "1 giờ trước", unread: true },
    { id: 3, buyer: "khanh.nguyen", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100", product: "Áo Len Cổ Lọ Cozy", productImg: "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=150", message: "Cảm ơn shop, đã nhận được ạ!", time: "Hôm qua", unread: false },
  ]);

  // ── Thống kê cho người bán ─────────────────────────────────────────────────
  const sellerStats = {
    totalProducts: myProducts.length,
    activeProducts: myProducts.filter(p => p.status === "active").length,
    pendingProducts: myProducts.filter(p => p.status === "pending").length,
    soldProducts: myProducts.filter(p => p.status === "sold").length,
    totalViews: myProducts.reduce((sum, p) => sum + p.views, 0),
    totalLikes: myProducts.reduce((sum, p) => sum + p.likes, 0),
    estimatedRevenue: myProducts.filter(p => p.status === "sold").reduce((sum, p) => sum + p.price, 0),
  };

  // ── Đơn hàng: merge mock + orders thật ─────────────────────────────────────
  const mockOrders: Order[] = [
    { id: "ORD-20240876", items: [{ id: "1", name: "Quần Jean Ống Rộng 90", price: 220000, size: "M", qty: 1, image: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=100", condition: 85, seller: "saigon.thrift" }], total: 250000, status: "shipping", createdAt: "2024-08-16", paymentMethod: "Vietcombank" },
    { id: "ORD-20240865", items: [{ id: "2", name: "Váy Hoa Retro Pastel", price: 160000, size: "S", qty: 1, image: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=100", condition: 90, seller: "hanoi.preloved" }], total: 190000, status: "shipping", createdAt: "2024-08-15", paymentMethod: "Techcombank" },
    { id: "ORD-20240855", items: [{ id: "3", name: "Áo Linen Trắng 1994", price: 185000, size: "L", qty: 1, image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=100", condition: 95, seller: "minhtu.vintage" }], total: 215000, status: "delivering", createdAt: "2024-08-14", paymentMethod: "Vietcombank" },
    { id: "ORD-20240820", items: [{ id: "4", name: "Áo Phông Band Tee 90s", price: 95000, size: "M", qty: 1, image: "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=100", condition: 88, seller: "minhtu.vintage" }], total: 125000, status: "review", createdAt: "2024-08-10", paymentMethod: "MB Bank" },
    { id: "ORD-20240810", items: [{ id: "5", name: "Áo Len Cổ Lọ Cozy", price: 210000, size: "M", qty: 1, image: "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=100", condition: 92, seller: "vintage.corner" }], total: 240000, status: "review", createdAt: "2024-08-08", paymentMethod: "Vietcombank" },
    { id: "ORD-20240800", items: [{ id: "6", name: "Áo Khoác Denim Rửa Cũ", price: 350000, size: "L", qty: 1, image: "https://images.unsplash.com/photo-1495105787522-5334e3ffa0ef?w=100", condition: 80, seller: "minhtu.vintage" }], total: 380000, status: "review", createdAt: "2024-08-05", paymentMethod: "Techcombank" },
  ];

  const allOrders = [...orders, ...mockOrders];

  // ── Tính số đơn theo tab ───────────────────────────────────────────────────
  const orderCounts = {
    pending: allOrders.filter(o => o.status === "pending").length,
    shipping: allOrders.filter(o => o.status === "shipping").length,
    delivering: allOrders.filter(o => o.status === "delivering").length,
    review: allOrders.filter(o => o.status === "review").length,
  };

  const orderTabs = [
    { id: "pending" as const, label: "Chờ thanh toán", icon: Clock, count: orderCounts.pending, color: "#E8A838" },
    { id: "shipping" as const, label: "Vận chuyển", icon: Package, count: orderCounts.shipping, color: T },
    { id: "delivering" as const, label: "Đang giao", icon: Truck, count: orderCounts.delivering, color: "#2980B9" },
    { id: "review" as const, label: "Đánh giá", icon: Star, count: orderCounts.review, color: "#27AE60" },
  ];

  const filteredOrders = allOrders.filter(o => o.status === orderTab);

  // ── Filter sản phẩm theo tab bán ─────────────────────────────────────────────
  const filteredProducts = sellingTab === "all" ? myProducts : myProducts.filter(p => p.status === sellingTab);

  // ── Helper ──────────────────────────────────────────────────────────────────
  const getStatusBadge = (status: string) => {
    const badges: Record<string, { bg: string; color: string; label: string }> = {
      active: { bg: "bg-green-50", color: "text-green-600", label: "● Đang bán" },
      pending: { bg: "bg-amber-50", color: "text-amber-600", label: "⏳ Chờ duyệt" },
      sold: { bg: "bg-blue-50", color: "text-blue-600", label: "✓ Đã bán" },
    };
    return badges[status] || badges.pending;
  };

  const getOrderStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: "Chờ thanh toán",
      shipping: "Đang vận chuyển",
      delivering: "Đang giao hàng",
      review: "Chờ đánh giá",
    };
    return labels[status] || status;
  };

  const unreadMessages = messages.filter(m => m.unread).length;

  return (
    <div className="min-h-screen" style={{ backgroundColor: LINEN }}>
      {/* Profile header */}
      <div style={{ background: `linear-gradient(135deg, ${ESPRESSO} 0%, ${COFFEE} 100%)` }}>
        <div className="max-w-[1440px] mx-auto px-8 py-8 flex items-center gap-6">
          <div className="relative">
            <img src={userEmail === "admin@thriftit.vn" ? "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=160&h=160&fit=crop&auto=format" : "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=160&h=160&fit=crop&auto=format"} alt="Avatar" className="w-24 h-24 rounded-full object-cover border-4 shadow-lg" style={{ borderColor: T }} />
            {userEmail !== "admin@thriftit.vn" && (
              <button className="absolute bottom-0 right-0 w-8 h-8 rounded-full flex items-center justify-center shadow-md" style={{ backgroundColor: T }}>
                <Edit3 size={13} style={{ color: LINEN }} />
              </button>
            )}
          </div>
          <div>
            <h2 className="text-2xl font-bold" style={{ ...serif, color: LINEN }}>{userName}</h2>
            <p className="text-sm mt-0.5" style={{ color: MUTED, ...ff }}>{userEmail}</p>
            {userEmail === "admin@thriftit.vn" ? (
              <div className="flex items-center gap-5 mt-3">
                <span className="text-sm px-2.5 py-0.5 rounded-full font-bold bg-amber-500 text-espresso" style={ff}>Hệ thống Admin 🛡️</span>
              </div>
            ) : (
              <div className="flex items-center gap-5 mt-3">
                <div className="flex items-center gap-1.5">
                  <div className="flex">{[1,2,3,4,5].map((i) => <Star key={i} size={13} fill={T} stroke="none" />)}</div>
                  <span className="text-sm font-bold" style={{ color: T, ...ff }}>4.9</span>
                </div>
                <div className="h-4 w-px" style={{ backgroundColor: MUTED + "66" }} />
                <span className="text-sm" style={{ color: MUTED, ...ff }}>{sellerStats.soldProducts} giao dịch</span>
                <div className="h-4 w-px" style={{ backgroundColor: MUTED + "66" }} />
                <span className="text-sm px-2.5 py-0.5 rounded-full" style={{ backgroundColor: T + "33", color: T, ...ff }}>Seller uy tín ✓</span>
              </div>
            )}
          </div>
          <div className="ml-auto flex items-center gap-3">
            {userEmail !== "admin@thriftit.vn" ? (
              <>
                {mediaPlan !== "None" ? (
                  <>
                    {/* Toggle switch between Buyer and Seller interfaces */}
                    <button
                      onClick={() => {
                        const newRole = userRole === "buyer" ? "seller" : "buyer";
                        setUserRole(newRole);
                        alert(newRole === "seller" ? "Đã chuyển sang giao diện Kênh Người Bán (Shop Mode)!" : "Đã chuyển sang giao diện Kênh Người Mua!");
                      }}
                      className="flex items-center gap-2.5 px-4 py-3 rounded-xl font-semibold text-sm border-2 transition-all"
                      style={{
                        borderColor: T,
                        color: T,
                        backgroundColor: "transparent",
                        ...ff
                      }}
                    >
                      <RefreshCw size={15} />
                      {userRole === "buyer" ? "Kênh người bán 🏪" : "Kênh người mua 🛍️"}
                    </button>

                    <button onClick={() => go("post")} className="flex items-center gap-2.5 px-5 py-3 rounded-xl font-bold text-sm shadow-lg transition-all hover:opacity-90" style={{ backgroundColor: T, color: LINEN, ...ff }}>
                      <Store size={17} />
                      {userRole === "seller" ? "Đăng bán sản phẩm Shop" : "Đăng bán cá nhân"}
                    </button>
                  </>
                ) : (
                  <>
                    {/* For regular buyers: show upgrade to partner option and simple registration */}
                    <button
                      onClick={() => go("pricing")}
                      className="flex items-center gap-2.5 px-4 py-3 rounded-xl font-semibold text-sm border-2 transition-all hover:bg-gray-50"
                      style={{
                        borderColor: T,
                        color: T,
                        backgroundColor: "transparent",
                        ...ff
                      }}
                    >
                      <Store size={15} />
                      Mở Shop đối tác 🏪
                    </button>

                    <button onClick={() => go("post")} className="flex items-center gap-2.5 px-5 py-3 rounded-xl font-bold text-sm shadow-lg transition-all hover:opacity-90" style={{ backgroundColor: T, color: LINEN, ...ff }}>
                      <Plus size={17} />
                      Đăng bán thanh lý
                    </button>
                  </>
                )}
              </>
            ) : (
              <button onClick={() => go("admin")} className="flex items-center gap-2.5 px-5 py-3 rounded-xl font-bold text-sm shadow-lg transition-all hover:opacity-90 bg-amber-500 text-espresso" style={ff}>
                <Shield size={17} />
                Mở Admin Panel 🛠
              </button>
            )}
            <button onClick={onLogout} className="flex items-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm border-2 transition-all hover:bg-white/10" style={{ borderColor: "#E74C3C", color: "#E74C3C", ...ff }}>
              <LogOut size={17} />
              Đăng xuất
            </button>
          </div>
        </div>
      </div>

      {userEmail === "admin@thriftit.vn" ? (
        <div className="max-w-[1440px] mx-auto px-8 py-12">
          <div className="bg-white border border-muted rounded-3xl p-10 text-center shadow-sm max-w-2xl mx-auto animate-fade-in">
            <div className="w-16 h-16 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto mb-6">
              <Shield size={32} />
            </div>
            <h3 className="text-xl font-bold font-serif" style={{ color: ESPRESSO, ...serif }}>Tài khoản Điều hành Admin</h3>
            <p className="text-sm text-coffee mt-3 leading-relaxed" style={ff}>
              Tài khoản này chỉ dùng để quản lý hệ thống. Bạn không tham gia các hoạt động thương mại như mua hàng, ký gửi hoặc thuê trang phục trên cửa hàng.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Để phê duyệt các sản phẩm chờ duyệt của người dùng hoặc điều chỉnh tiến trình B2B Media, hãy mở Kênh quản trị chuyên dụng.
            </p>
            <div className="mt-8 flex justify-center gap-4">
              <button
                onClick={() => go("admin")}
                className="px-6 py-3 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 shadow-md"
                style={{ backgroundColor: T }}
              >
                Mở Bảng điều khiển Admin 🛠
              </button>
              <button
                onClick={onLogout}
                className="px-6 py-3 rounded-xl text-xs font-bold border-2 transition-all hover:bg-gray-50"
                style={{ borderColor: MUTED, color: COFFEE }}
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-[1440px] mx-auto px-8 py-8">
        {/* Tab điều hướng chính */}
        <div className="flex items-center gap-2 mb-8">
          {(userRole === "seller" ? [
            { id: "selling", label: "Kinh doanh", icon: TrendingUp },
            { id: "media", label: "Dịch vụ Media", icon: Store },
            { id: "messages", label: "Tin nhắn", icon: MessageCircle, badge: unreadMessages },
            { id: "address", label: "Địa chỉ", icon: MapPin },
          ] : [
            { id: "purchases", label: "Đơn mua", icon: ShoppingBag },
            { id: "rental", label: "Gói thuê đồ", icon: Sparkles },
            { id: "messages", label: "Tin nhắn", icon: MessageCircle, badge: unreadMessages },
            { id: "address", label: "Địa chỉ", icon: MapPin },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setAccountTab(tab.id)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all"
              style={{
                backgroundColor: accountTab === tab.id ? COFFEE : CARD,
                color: accountTab === tab.id ? LINEN : COFFEE,
                border: `1px solid ${accountTab === tab.id ? COFFEE : MUTED}`,
                ...ff
              }}
            >
              <tab.icon size={17} />
              {tab.label}
              {tab.badge && tab.badge > 0 && (
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: "#E74C3C", color: LINEN }}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── TABS CONTENT ───────────────────────────────────────────────────── */}
        {accountTab === "rental" && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold" style={{ ...serif, color: ESPRESSO }}>Gói thuê đồ hội viên</h2>
            <div className="grid grid-cols-2 gap-6">
              <div className="p-6 rounded-2xl" style={{ backgroundColor: CARD, border: `2px solid ${rentalPlan === "Premium Rental" ? T : MUTED}` }}>
                <h3 className="text-lg font-bold" style={{ ...serif, color: ESPRESSO }}>Premium Rental</h3>
                <p className="text-sm mt-1 text-coffee">Thuê tối đa 4 món · 0₫ mỗi món · Phí ship ưu đãi</p>
                <button className="mt-4 px-6 py-2 rounded-xl font-bold text-sm text-linen" style={{ backgroundColor: rentalPlan === "Premium Rental" ? MUTED : T }} onClick={() => rentalPlan !== "Premium Rental" && onOpenCheckoutPlan("rental", "Premium Rental", 599000)}>
                  {rentalPlan === "Premium Rental" ? "Đang sử dụng" : "Nâng cấp (599.000đ/tháng)"}
                </button>
              </div>
              <div className="p-6 rounded-2xl" style={{ backgroundColor: CARD, border: `2px solid ${rentalPlan === "Basic Rental" ? T : MUTED}` }}>
                <h3 className="text-lg font-bold" style={{ ...serif, color: ESPRESSO }}>Basic Rental</h3>
                <p className="text-sm mt-1 text-coffee">Thuê tối đa 3 món · 0₫ mỗi món · Giặt hấp cao cấp</p>
                <button className="mt-4 px-6 py-2 rounded-xl font-bold text-sm text-linen" style={{ backgroundColor: rentalPlan === "Basic Rental" ? MUTED : T }} onClick={() => rentalPlan !== "Basic Rental" && onOpenCheckoutPlan("rental", "Basic Rental", 299000)}>
                  {rentalPlan === "Basic Rental" ? "Đang sử dụng" : "Chọn gói (299.000đ/tháng)"}
                </button>
              </div>
            </div>
            {rentedItems.length > 0 && (
              <div className="mt-8">
                <h3 className="text-lg font-bold mb-4" style={{ ...serif, color: ESPRESSO }}>Đồ đang thuê</h3>
                <div className="space-y-3">
                  {rentedItems.map((item) => (
                    <div key={item.id} className="flex gap-4 p-4 rounded-xl bg-white border border-muted">
                      <img src={item.image} className="w-16 h-16 rounded-lg object-cover" />
                      <div className="flex-1">
                        <p className="font-bold">{item.name}</p>
                        <p className="text-xs text-coffee">Từ: {item.rentDate} · Đến: {item.returnDate}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {accountTab === "media" && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold" style={{ ...serif, color: ESPRESSO }}>Dịch vụ Media cho Shop (B2B Photography)</h2>
            {mediaPlan === "None" ? (
              <div className="p-6 rounded-2xl bg-white border border-muted text-center py-8">
                <p className="text-sm text-coffee">Shop của bạn chưa đăng ký gói dịch vụ Media nào.</p>
                <button
                  onClick={() => onOpenCheckoutPlan("media", "Standard Package", 450000)}
                  className="mt-4 px-6 py-2.5 rounded-xl font-bold text-xs text-white hover:opacity-90 transition-all"
                  style={{ backgroundColor: T }}
                >
                  Đăng ký chụp ảnh Lookbook (Standard - 450k)
                </button>
              </div>
            ) : (
              <div className="p-6 rounded-2xl bg-white border border-muted">
                <h3 className="text-lg font-bold" style={{ color: ESPRESSO, ...ff }}>{mediaPlan} đang chạy</h3>
                <p className="mt-2 text-sm text-coffee">Trạng thái hiện tại: <span className="font-bold" style={{ color: T }}>{mediaStatus}</span></p>
                <div className="mt-6">
                  <p className="text-xs font-bold mb-3">Thanh tiến trình:</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2.5 py-1 rounded bg-green-100 text-green-700 font-semibold">✓ Đã nhận sản phẩm</span>
                    <span className="text-xs">➔</span>
                    <span className="text-xs px-2.5 py-1 rounded bg-amber-100 text-amber-700 font-semibold">{mediaStatus}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: ĐƠN MUA ─────────────────────────────────────────────────── */}
        {accountTab === "purchases" && (
          <div>
            <h2 className="text-xl font-bold mb-5" style={{ ...serif, color: ESPRESSO }}>Đơn mua của tôi</h2>
            <div className="grid grid-cols-4 gap-3 mb-6">
              {orderTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setOrderTab(tab.id)}
                  className="flex flex-col items-center gap-2 py-4 rounded-2xl transition-all hover:shadow-md"
                  style={{ backgroundColor: orderTab === tab.id ? tab.color + "18" : CARD, border: `2px solid ${orderTab === tab.id ? tab.color : MUTED}` }}
                >
                  <div className="relative">
                    <tab.icon size={26} style={{ color: tab.color }} strokeWidth={1.8} />
                    {tab.count > 0 && (
                      <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: tab.color, color: LINEN, ...ff }}>
                        {tab.count}
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-center leading-tight" style={{ color: orderTab === tab.id ? tab.color : COFFEE, ...ff }}>{tab.label}</span>
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {filteredOrders.map((order) => (
                <div key={order.id} className="flex items-center gap-4 p-4 rounded-2xl shadow-sm" style={{ backgroundColor: CARD, border: `1px solid ${MUTED}` }}>
                  <img src={order.items[0]?.image} alt={order.items[0]?.name} className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: ESPRESSO, ...ff }}>{order.items[0]?.name}{order.items.length > 1 && ` (+${order.items.length - 1} sản phẩm khác)`}</p>
                    <p className="text-xs mt-0.5" style={{ color: COFFEE, ...ff }}>@{order.items[0]?.seller} · #{order.id} · {order.createdAt}</p>
                    <span className="inline-block text-xs px-2.5 py-0.5 rounded-full mt-2" style={{ backgroundColor: SOFT, color: COFFEE, ...ff }}>{getOrderStatusLabel(order.status)}</span>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-base font-bold" style={{ ...serif, color: T }}>{fmt(order.total)}</p>
                    <div className="mt-2 flex gap-2 justify-end flex-wrap">
                      {order.status === "shipping" && (
                        <>
                          <button className="text-xs px-3 py-1.5 rounded-lg font-semibold border transition-all hover:opacity-80" style={{ borderColor: MUTED, color: COFFEE, ...ff }}>Xem chi tiết</button>
                          <button className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all hover:opacity-80" style={{ backgroundColor: "#FDEDEC", color: "#E74C3C", ...ff }}>Hủy đơn</button>
                        </>
                      )}
                      {order.status === "delivering" && (
                        <>
                          <button className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all hover:opacity-80" style={{ backgroundColor: "#27AE60", color: LINEN, ...ff }}>Xác nhận đã nhận</button>
                          <button className="text-xs px-3 py-1.5 rounded-lg font-semibold border transition-all hover:opacity-80" style={{ borderColor: MUTED, color: COFFEE, ...ff }}>Xem chi tiết</button>
                        </>
                      )}
                      {order.status === "review" && (
                        <button className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all hover:opacity-80" style={{ backgroundColor: "#27AE60", color: LINEN, ...ff }}>Đánh giá</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {filteredOrders.length === 0 && (
                <div className="py-16 flex flex-col items-center gap-3">
                  <Package size={48} style={{ color: MUTED }} />
                  <p className="text-base" style={{ color: COFFEE, ...ff }}>Chưa có đơn hàng nào</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: KINH DOANH (BÁN HÀNG) ───────────────────────────────────── */}
        {accountTab === "selling" && (
          <div>
            <h2 className="text-xl font-bold mb-5" style={{ ...serif, color: ESPRESSO }}>Bảng điều khiển kinh doanh</h2>
            <div className="grid grid-cols-4 gap-4 mb-8">
              {[
                { label: "Sản phẩm đang bán", value: sellerStats.activeProducts, icon: Store, color: "#27AE60" },
                { label: "Lượt xem tuần này", value: sellerStats.totalViews.toLocaleString(), icon: Eye, color: "#2980B9" },
                { label: "Lượt thích", value: sellerStats.totalLikes.toString(), icon: Heart, color: "#E74C3C" },
                { label: "Doanh thu ước tính", value: fmt(sellerStats.estimatedRevenue), icon: DollarSign, color: T },
              ].map((stat) => (
                <div key={stat.label} className="p-4 rounded-2xl" style={{ backgroundColor: CARD, border: `1px solid ${MUTED}` }}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: stat.color + "18" }}>
                      <stat.icon size={18} style={{ color: stat.color }} />
                    </div>
                    <span className="text-xs font-semibold" style={{ color: COFFEE, ...ff }}>{stat.label}</span>
                  </div>
                  <p className="text-2xl font-bold" style={{ ...serif, color: ESPRESSO }}>{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold" style={{ ...serif, color: ESPRESSO }}>Quản lý sản phẩm</h3>
              <button onClick={() => go("post")} className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all hover:opacity-90" style={{ backgroundColor: T, color: LINEN, ...ff }}>
                <Plus size={15} />
                Đăng sản phẩm mới
              </button>
            </div>

            <div className="flex gap-2 mb-4">
              {[
                { id: "all" as const, label: "Tất cả", count: sellerStats.totalProducts },
                { id: "active" as const, label: "Đang bán", count: sellerStats.activeProducts },
                { id: "pending" as const, label: "Chờ duyệt", count: sellerStats.pendingProducts },
                { id: "sold" as const, label: "Đã bán", count: sellerStats.soldProducts },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSellingTab(tab.id)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold transition-all"
                  style={{ backgroundColor: sellingTab === tab.id ? COFFEE : SOFT, color: sellingTab === tab.id ? LINEN : COFFEE }}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {filteredProducts.map((product) => {
                const badge = getStatusBadge(product.status);
                return (
                  <div key={product.id} className="flex gap-4 p-4 rounded-2xl transition-all hover:shadow-md" style={{ backgroundColor: CARD, border: `1px solid ${MUTED}` }}>
                    <img src={product.image} alt={product.name} className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h4 className="text-sm font-bold" style={{ color: ESPRESSO, ...ff }}>{product.name}</h4>
                          <p className="text-lg font-bold mt-1" style={{ ...serif, color: T }}>{fmt(product.price)}</p>
                          <p className="text-xs mt-1" style={{ color: COFFEE, ...ff }}>Còn lại: {product.quantity} cái · Đăng: {product.createdAt}</p>
                        </div>
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${badge.bg} ${badge.color}`} style={{ borderColor: "currentColor" }}>{badge.label}</span>
                      </div>
                      <div className="flex items-center gap-4 mt-3">
                        <span className="flex items-center gap-1 text-xs" style={{ color: COFFEE, ...ff }}><Eye size={13} /> {product.views} lượt xem</span>
                        <span className="flex items-center gap-1 text-xs" style={{ color: COFFEE, ...ff }}><Heart size={13} /> {product.likes} lượt thích</span>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button className="px-3 py-1.5 text-xs rounded-xl border font-semibold transition-all hover:opacity-80" style={{ borderColor: MUTED, color: COFFEE, ...ff }}>Sửa</button>
                      <button className="px-3 py-1.5 text-xs rounded-xl font-semibold transition-all hover:opacity-80" style={{ backgroundColor: "#FDEDEC", color: "#E74C3C", ...ff }}>Xóa</button>
                    </div>
                  </div>
                );
              })}
              {filteredProducts.length === 0 && (
                <div className="py-12 flex flex-col items-center gap-3">
                  <Store size={48} style={{ color: MUTED }} />
                  <p className="text-base" style={{ color: COFFEE, ...ff }}>Chưa có sản phẩm nào</p>
                  <button onClick={() => go("post")} className="mt-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all hover:opacity-80" style={{ backgroundColor: T, color: LINEN, ...ff }}>Đăng sản phẩm đầu tiên</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: TIN NHẮN ─────────────────────────────────────────────────── */}
        {accountTab === "messages" && (
          <div>
            <h2 className="text-xl font-bold mb-5" style={{ ...serif, color: ESPRESSO }}>Tin nhắn từ người mua</h2>
            <div className="space-y-3">
              {messages.map((msg) => (
                <div key={msg.id} className="flex gap-4 p-4 rounded-2xl transition-all hover:shadow-md" style={{ backgroundColor: CARD, border: `1px solid ${MUTED}`, borderLeft: msg.unread ? `3px solid ${T}` : `1px solid ${MUTED}` }}>
                  <img src={msg.avatar} alt={msg.buyer} className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm" style={{ color: ESPRESSO, ...ff }}>@{msg.buyer}</span>
                        {msg.unread && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: T }} />}
                      </div>
                      <span className="text-xs" style={{ color: COFFEE, ...ff }}>{msg.time}</span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: COFFEE, ...ff }}>Về: <span className="font-medium">{msg.product}</span></p>
                    <p className="text-sm mt-2" style={{ color: ESPRESSO, ...ff }}>"{msg.message}"</p>
                  </div>
                  <img src={msg.productImg} alt={msg.product} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                  <button className="px-4 py-2 rounded-xl text-xs font-semibold self-center transition-all hover:opacity-80" style={{ backgroundColor: COFFEE, color: LINEN, ...ff }}>Trả lời</button>
                </div>
              ))}
              {messages.length === 0 && (
                <div className="py-16 flex flex-col items-center gap-3">
                  <MessageCircle size={48} style={{ color: MUTED }} />
                  <p className="text-base" style={{ color: COFFEE, ...ff }}>Chưa có tin nhắn nào</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: ĐỊA CHỈ ──────────────────────────────────────────────────── */}
        {accountTab === "address" && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold" style={{ ...serif, color: ESPRESSO }}>Địa chỉ giao hàng</h2>
              <button className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all hover:opacity-80" style={{ backgroundColor: T, color: LINEN, ...ff }}>
                <Plus size={15} />
                Thêm địa chỉ mới
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {addresses.map((addr) => (
                <div key={addr.id} className="p-5 rounded-2xl" style={{ backgroundColor: CARD, border: `1px solid ${addr.isDefault ? T : MUTED}` }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm" style={{ color: ESPRESSO, ...ff }}>{addr.label}</span>
                      {addr.isDefault && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: T + "18", color: T, ...ff }}>Mặc định</span>}
                    </div>
                    <div className="flex gap-2">
                      <button className="text-xs font-semibold" style={{ color: COFFEE, ...ff }}>Sửa</button>
                      {!addr.isDefault && <button className="text-xs font-semibold" style={{ color: "#E74C3C", ...ff }}>Xóa</button>}
                    </div>
                  </div>
                  <p className="font-semibold text-sm" style={{ color: ESPRESSO, ...ff }}>{addr.name} · {addr.phone}</p>
                  <p className="text-xs mt-1" style={{ color: COFFEE, ...ff }}>{addr.detail}, {addr.district}, {addr.province}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}

// ── Payment Screen ──────────────────────────────────────────────────────────────
function PaymentScreen({ go, cartGroups, updateCart, addOrder }: { go: (s: Screen) => void; cartGroups: CartGroup[]; updateCart: (cart: CartGroup[]) => void; addOrder: (items: OrderItem[], total: number, payment: string) => void }) {
  const [step, setStep] = useState<"card" | "otp">("card");
  const [selectedCard, setSelectedCard] = useState<string>("card-1");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [otpError, setOtpError] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [orderId, setOrderId] = useState("");
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Mock saved cards
  const savedCards = [
    { id: "card-1", bank: "Vietcombank", type: "VISA", last4: "4521", exp: "12/27", default: true },
    { id: "card-2", bank: "Techcombank", type: "MASTER", last4: "8834", exp: "09/26", default: false },
    { id: "card-3", bank: "MB Bank", type: "VISA", last4: "1109", exp: "03/28", default: false },
  ];

  const selectedCardData = savedCards.find(c => c.id === selectedCard);

  // Calculate totals
  const allItems = cartGroups.flatMap(g => g.items);
  const checkedItems = allItems.filter(i => i.checked);
  const subtotal = checkedItems.reduce((s, i) => s + (i.buyOrRent === "rent" ? 0 : i.price * i.qty), 0);
  const ship = checkedItems.length > 0 ? 30000 : 0;
  const total = subtotal + ship;

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    setOtpError(false);

    // Auto-focus next input
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all filled
    if (newOtp.every(d => d !== "") && newOtp.join("").length === 6) {
      handleVerifyOtp(newOtp.join(""));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOtp = (code: string) => {
    // Mock: accept any 6 digits, but "123456" fails
    if (code === "123456") {
      setOtpError(true);
      return;
    }
    setIsProcessing(true);

    // Create order items from checked cart items
    const orderItems: OrderItem[] = checkedItems.map(item => ({
      id: item.id.toString(),
      name: item.name,
      price: item.price,
      size: item.size,
      qty: item.qty,
      image: item.image,
      condition: item.condition,
      seller: cartGroups.find(g => g.items.some(i => i.id === item.id))?.seller || "",
    }));

    // Generate order ID
    const newOrderId = `ORD-${Date.now().toString().slice(-6)}`;
    setOrderId(newOrderId);

    // Add order and clear cart
    addOrder(orderItems, total, `${selectedCardData?.bank} ***${selectedCardData?.last4}`);
    const newCart = cartGroups.map(g => ({
      ...g,
      items: g.items.filter(i => !i.checked)
    })).filter(g => g.items.length > 0);
    updateCart(newCart);

    setTimeout(() => {
      setIsProcessing(false);
      setIsSuccess(true);
    }, 2000);
  };

  const handlePayNow = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setStep("otp");
    }, 1500);
  };

  const cardTypeColors: Record<string, string> = {
    VISA: "#1A1F71",
    MASTER: "#EB001B",
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: LINEN }}>
        <div className="text-center p-10 rounded-3xl" style={{ backgroundColor: CARD, border: `1px solid ${MUTED}`, maxWidth: 480, width: "100%" }}>
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6" style={{ backgroundColor: "#27AE6022" }}>
            <CheckCircle size={48} style={{ color: "#27AE60" }} />
          </div>
          <h2 className="text-2xl font-bold mb-2" style={{ ...serif, color: ESPRESSO }}>Thanh toán thành công!</h2>
          <p className="text-sm mb-6" style={{ color: COFFEE, ...ff }}>
            Cảm ơn bạn đã mua sắm tại Thrifti. Đơn hàng của bạn đang được xử lý và sẽ giao trong 2-5 ngày.
          </p>
          <div className="space-y-3 mb-8 p-4 rounded-2xl" style={{ backgroundColor: SOFT, border: `1px solid ${MUTED}` }}>
            <div className="flex justify-between">
              <span className="text-sm" style={{ color: COFFEE, ...ff }}>Mã đơn hàng</span>
              <span className="text-sm font-bold" style={{ color: ESPRESSO, ...ff }}>#{orderId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm" style={{ color: COFFEE, ...ff }}>Phương thức</span>
              <span className="text-sm font-bold" style={{ color: ESPRESSO, ...ff }}>{selectedCardData?.bank} ****{selectedCardData?.last4}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm" style={{ color: COFFEE, ...ff }}>Tổng thanh toán</span>
              <span className="text-lg font-bold" style={{ ...serif, color: T }}>{fmt(total)}</span>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => go("account")} className="flex-1 py-3 rounded-xl font-bold text-sm transition-all hover:opacity-90" style={{ backgroundColor: T, color: LINEN, ...ff }}>
              Xem đơn mua
            </button>
            <button onClick={() => go("home")} className="flex-1 py-3 rounded-xl font-bold text-sm border transition-all hover:opacity-90" style={{ borderColor: MUTED, color: COFFEE, backgroundColor: CARD, ...ff }}>
              Tiếp tục mua sắm
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: LINEN }}>
      {/* Header */}
      <div style={{ backgroundColor: COFFEE }}>
        <div className="max-w-[600px] mx-auto px-6 py-5 flex items-center gap-4">
          <button onClick={() => go("cart")} className="flex items-center gap-2 text-sm font-semibold transition-all hover:opacity-80" style={{ color: LINEN, ...ff }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M11 4L6 9L11 14" stroke={LINEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Quay lại
          </button>
          <div className="h-5 w-px" style={{ backgroundColor: LINEN + "44" }} />
          <h1 className="text-xl font-bold italic" style={{ ...serif, color: LINEN }}>Thanh toán</h1>
        </div>
      </div>

      <div className="max-w-[600px] mx-auto px-6 py-8">
        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-3 mb-8">
          {[
            { num: 1, label: "Chọn thẻ" },
            { num: 2, label: "Xác thực OTP" },
            { num: 3, label: "Hoàn tất" },
          ].map((s, i) => (
            <div key={s.num} className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{
                    backgroundColor: step === "card" ? (i === 0 ? T : MUTED) : step === "otp" ? (i <= 1 ? T : MUTED) : T,
                    color: (step === "card" && i === 0) || (step === "otp" && i <= 1) || step !== "card" && step !== "otp" ? LINEN : COFFEE,
                  }}
                >
                  {i < ["card", "otp", "success"].indexOf(step === "otp" ? "otp" : step === "card" ? "card" : "success") ? <Check size={14} /> : s.num}
                </div>
                <span className="text-sm font-semibold" style={{ color: (step === "card" && i === 0) || (step === "otp" && i <= 1) ? T : COFFEE, ...ff }}>{s.label}</span>
              </div>
              {i < 2 && <div className="w-12 h-px" style={{ backgroundColor: MUTED }} />}
            </div>
          ))}
        </div>

        {/* STEP 1: Chọn thẻ */}
        {step === "card" && (
          <div className="space-y-6">
            {/* Order Summary Card */}
            <div className="rounded-2xl p-5" style={{ backgroundColor: CARD, border: `1px solid ${MUTED}` }}>
              <h3 className="text-base font-bold mb-4" style={{ ...serif, color: ESPRESSO }}>Đơn hàng của bạn</h3>
              <div className="space-y-3">
                {checkedItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <img src={item.image} alt={item.name} className="w-12 h-12 rounded-lg object-cover" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: ESPRESSO, ...ff }}>{item.name}</p>
                      <p className="text-xs" style={{ color: COFFEE, ...ff }}>Size {item.size} · ×{item.qty}</p>
                    </div>
                    <span className="text-sm font-bold" style={{ color: T }}>{item.buyOrRent === "rent" ? "0₫" : fmt(item.price * item.qty)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 space-y-2" style={{ borderTop: `1px solid ${MUTED}` }}>
                <div className="flex justify-between text-sm">
                  <span style={{ color: COFFEE }}>Tạm tính</span>
                  <span style={{ color: ESPRESSO }}>{fmt(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: COFFEE }}>Phí vận chuyển</span>
                  <span style={{ color: ESPRESSO }}>{fmt(ship)}</span>
                </div>
                <div className="flex justify-between items-center pt-2" style={{ borderTop: `1px solid ${MUTED}` }}>
                  <span className="font-bold" style={{ color: ESPRESSO }}>Tổng thanh toán</span>
                  <span className="text-2xl font-bold" style={{ ...serif, color: T }}>{fmt(total)}</span>
                </div>
              </div>
            </div>

            {/* Saved Cards */}
            <div>
              <h3 className="text-base font-bold mb-3" style={{ ...serif, color: ESPRESSO }}>Phương thức thanh toán</h3>
              <div className="space-y-3">
                {savedCards.map((card) => (
                  <button
                    key={card.id}
                    onClick={() => setSelectedCard(card.id)}
                    className="w-full p-4 rounded-2xl flex items-center gap-4 transition-all"
                    style={{
                      backgroundColor: selectedCard === card.id ? `${T}0F` : CARD,
                      border: `2px solid ${selectedCard === card.id ? T : MUTED}`,
                    }}
                  >
                    <div className="w-12 h-8 rounded flex items-center justify-center text-xs font-bold" style={{ backgroundColor: cardTypeColors[card.type] || COFFEE, color: LINEN }}>
                      {card.type}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-bold" style={{ color: ESPRESSO, ...ff }}>{card.bank}</p>
                      <p className="text-xs" style={{ color: COFFEE, ...ff }}>{card.type} •••• {card.last4} · {card.exp}</p>
                    </div>
                    {card.default && <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ backgroundColor: T + "22", color: T, ...ff }}>Mặc định</span>}
                    {selectedCard === card.id && <CheckCircle size={20} style={{ color: T }} />}
                  </button>
                ))}
              </div>
            </div>

            {/* Add new card hint */}
            <button className="w-full p-4 rounded-2xl border-2 border-dashed text-sm font-semibold transition-all hover:opacity-80" style={{ borderColor: MUTED, color: COFFEE, backgroundColor: CARD, ...ff }}>
              + Thêm thẻ mới
            </button>

            {/* Pay Button */}
            <button
              onClick={handlePayNow}
              disabled={isProcessing}
              className="w-full py-4 rounded-2xl font-bold text-base shadow-lg transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ backgroundColor: isProcessing ? MUTED : T, color: LINEN, cursor: isProcessing ? "not-allowed" : "pointer", ...ff }}
            >
              {isProcessing ? "Đang xử lý..." : `Thanh toán ${fmt(total)}`}
            </button>

            <p className="text-center text-xs" style={{ color: COFFEE, ...ff }}>
              🔒 Thanh toán được bảo mật bởi SSL · Mã hóa end-to-end
            </p>
          </div>
        )}

        {/* STEP 2: OTP Verification */}
        {step === "otp" && (
          <div className="space-y-6">
            {/* OTP Card */}
            <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: CARD, border: `1px solid ${MUTED}` }}>
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${T}18` }}>
                <Shield size={32} style={{ color: T }} />
              </div>
              <h3 className="text-lg font-bold mb-2" style={{ ...serif, color: ESPRESSO }}>Xác thực thanh toán</h3>
              <p className="text-sm mb-4" style={{ color: COFFEE, ...ff }}>
                Nhập mã OTP được gửi đến số điện thoại <strong style={{ color: ESPRESSO }}>0909***123</strong>
              </p>
              <p className="text-xs mb-6 px-4 py-2.5 rounded-xl" style={{ backgroundColor: SOFT, color: COFFEE, border: `1.5px solid ${MUTED}`, ...ff }}>
                🔑 <strong>Hướng dẫn Demo:</strong> Nhập 6 chữ số bất kỳ (VD: 000000) để xác thực thành công. Nhập <strong>123456</strong> để mô phỏng lỗi giao dịch.
              </p>

              {/* OTP Input */}
              <div className="flex justify-center gap-2 mb-4">
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { if (el) otpRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    className="w-12 h-14 rounded-xl text-center text-xl font-bold outline-none transition-all"
                    style={{
                      backgroundColor: SOFT,
                      border: `2px solid ${otpError ? "#E74C3C" : digit ? T : MUTED}`,
                      color: ESPRESSO,
                    }}
                  />
                ))}
              </div>

              {otpError && (
                <p className="text-sm mb-4" style={{ color: "#E74C3C", ...ff }}>
                  Mã OTP không đúng. Vui lòng thử lại.
                </p>
              )}

              <p className="text-xs" style={{ color: COFFEE, ...ff }}>
                Mã có hiệu lực trong <strong>60 giây</strong>
              </p>

              <button className="mt-4 text-sm font-semibold" style={{ color: T, ...ff }}>
                Gửi lại mã
              </button>
            </div>

            {/* Payment Info */}
            <div className="rounded-2xl p-4" style={{ backgroundColor: SOFT, border: `1px solid ${MUTED}` }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: ESPRESSO, ...ff }}>{selectedCardData?.bank}</p>
                  <p className="text-xs" style={{ color: COFFEE, ...ff }}>{selectedCardData?.type} •••• {selectedCardData?.last4}</p>
                </div>
                <span className="text-lg font-bold" style={{ ...serif, color: T }}>{fmt(total)}</span>
              </div>
            </div>

            {/* Processing Overlay */}
            {isProcessing && (
              <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
                <div className="p-6 rounded-2xl text-center" style={{ backgroundColor: CARD }}>
                  <div className="w-12 h-12 rounded-full border-4 border-t-transparent mx-auto mb-4 animate-spin" style={{ borderColor: T, borderTopColor: "transparent" }} />
                  <p className="font-bold" style={{ color: ESPRESSO, ...ff }}>Đang xác thực...</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Post Listing Screen ────────────────────────────────────────────────────────
function PostScreen({ go, onAddProduct }: { go: (s: Screen) => void; onAddProduct: (newProd: { name: string; price: number; category: string; desc: string; size: string; condition: number; image: string }) => void }) {
  const [dragging, setDragging] = useState(false);
  const [photoCount, setPhotoCount] = useState(0);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [size, setSize] = useState("M");
  const [condition, setCondition] = useState(80);
  const [category, setCategory] = useState("Áo");

  const condLabel = condition >= 95 ? "Như mới" : condition >= 85 ? "Rất tốt" : condition >= 70 ? "Tốt" : condition >= 55 ? "Khá" : "Trung bình";

  const previewImages = [
    "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=120&h=120&fit=crop&auto=format",
    "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=120&h=120&fit=crop&auto=format",
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: LINEN }}>
      {/* Page header */}
      <div style={{ backgroundColor: COFFEE }}>
        <div className="max-w-[1440px] mx-auto px-8 py-5 flex items-center gap-4">
          <button
            onClick={() => go("account")}
            className="flex items-center gap-2 text-sm font-semibold transition-all hover:opacity-80"
            style={{ color: LINEN, ...ff }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M11 4L6 9L11 14" stroke={LINEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Quay lại
          </button>
          <div className="h-5 w-px" style={{ backgroundColor: LINEN + "44" }} />
          <h1 className="text-xl font-bold italic" style={{ ...serif, color: LINEN }}>Đăng bán cá nhân (C2C)</h1>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs px-3 py-1.5 rounded-full" style={{ backgroundColor: "rgba(250,240,230,0.15)", color: LINEN, ...ff }}>
              Bước 1/2 — Thông tin sản phẩm
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-8 py-8">
        <div className="grid grid-cols-[1fr_440px] gap-8">
          {/* Left: Photo upload */}
          <div>
            <h2 className="text-xl font-bold mb-2" style={{ ...serif, color: ESPRESSO }}>Ảnh sản phẩm</h2>
            <p className="text-sm mb-5" style={{ color: COFFEE, ...ff }}>Tối đa 6 ảnh · JPG, PNG · Tối đa 10MB/ảnh</p>

            {/* Drag-drop zone */}
            <div
              onDragOver={(e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragging(false); setPhotoCount((p) => Math.min(p + 1, 6)); }}
              className="w-full rounded-2xl border-2 border-dashed flex flex-col items-center justify-center transition-all cursor-pointer"
              style={{
                height: "260px",
                borderColor: dragging ? T : MUTED,
                backgroundColor: dragging ? T + "08" : SOFT,
              }}
              onClick={() => setPhotoCount((p) => Math.min(p + 1, 6))}
            >
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: dragging ? T + "22" : MUTED }}>
                <Upload size={28} style={{ color: dragging ? T : COFFEE }} />
              </div>
              <p className="text-base font-semibold" style={{ color: dragging ? T : ESPRESSO, ...ff }}>
                {dragging ? "Thả ảnh vào đây!" : "Kéo thả ảnh hoặc nhấn để chọn"}
              </p>
              <p className="text-sm mt-1" style={{ color: COFFEE, ...ff }}>Ảnh đầu tiên sẽ là ảnh bìa sản phẩm</p>
            </div>

            {/* Uploaded preview grid */}
            {photoCount > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold mb-3" style={{ color: COFFEE, ...ff }}>Ảnh đã tải lên ({photoCount}/6)</p>
                <div className="grid grid-cols-6 gap-2">
                  {Array.from({ length: photoCount }).map((_, i) => (
                    <div key={i} className="relative rounded-xl overflow-hidden group" style={{ paddingBottom: "100%", backgroundColor: MUTED }}>
                      <img
                        src={previewImages[i % previewImages.length]}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      {i === 0 && (
                        <span className="absolute bottom-1 left-0 right-0 text-center text-[9px] font-bold py-0.5"
                          style={{ backgroundColor: T + "cc", color: LINEN, ...ff }}>Ảnh bìa</span>
                      )}
                      <button
                        onClick={() => setPhotoCount((p) => p - 1)}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ backgroundColor: "rgba(58,35,18,0.7)" }}
                      >
                        <X size={10} style={{ color: LINEN }} />
                      </button>
                    </div>
                  ))}
                  {photoCount < 6 && (
                    <button
                      onClick={() => setPhotoCount((p) => Math.min(p + 1, 6))}
                      className="rounded-xl flex items-center justify-center border-2 border-dashed transition-all hover:opacity-80"
                      style={{ paddingBottom: "100%", position: "relative", borderColor: MUTED, backgroundColor: SOFT }}
                    >
                      <Plus size={20} style={{ color: COFFEE, position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Tips */}
            <div className="mt-6 p-4 rounded-xl" style={{ backgroundColor: T + "12", border: `1.5px solid ${T}33` }}>
              <p className="text-sm font-semibold mb-2" style={{ color: ESPRESSO, ...ff }}>💡 Mẹo chụp ảnh bán nhanh</p>
              <ul className="space-y-1.5">
                {[
                  "Chụp dưới ánh sáng tự nhiên để màu sắc thật nhất",
                  "Chụp nhiều góc: trước, sau, cổ, tay áo, chi tiết",
                  "Đặt hàng phẳng hoặc mặc trên người mannequin",
                  "Ảnh rõ nét và không bị mờ sẽ bán nhanh gấp 3 lần",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-1.5 text-xs" style={{ color: COFFEE, ...ff }}>
                    <span style={{ color: T, flexShrink: 0 }}>✓</span> {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Right: Form */}
          <div className="rounded-2xl overflow-hidden shadow-sm self-start sticky top-36" style={{ backgroundColor: CARD, border: `1px solid ${MUTED}` }}>
            <div className="px-6 py-4" style={{ borderBottom: `1px solid ${MUTED}`, backgroundColor: SOFT }}>
              <h3 className="text-base font-bold" style={{ ...serif, color: ESPRESSO }}>Thông tin sản phẩm</h3>
            </div>
            <div className="px-6 py-5 space-y-5">
              {/* Name */}
              <div>
                <label className="text-xs font-bold block mb-1.5" style={{ color: COFFEE, ...ff }}>Tên sản phẩm *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="VD: Áo linen vintage trắng năm 1994..."
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none border-2 transition-all"
                  style={{ backgroundColor: SOFT, border: `2px solid ${MUTED}`, color: ESPRESSO, ...ff }}
                />
              </div>

              {/* Category */}
              <div>
                <label className="text-xs font-bold block mb-1.5" style={{ color: COFFEE, ...ff }}>Danh mục *</label>
                <div className="flex gap-2 flex-wrap">
                  {["Áo", "Quần", "Váy", "Áo khoác", "Phụ kiện"].map((c) => (
                    <button
                      key={c}
                      onClick={() => setCategory(c)}
                      className="px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all"
                      style={{ backgroundColor: category === c ? T : "transparent", color: category === c ? LINEN : COFFEE, borderColor: category === c ? T : MUTED, ...ff }}
                    >{c}</button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-bold block mb-1.5" style={{ color: COFFEE, ...ff }}>Mô tả chi tiết</label>
                <textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="Chất liệu, nguồn gốc, lý do bán, tình trạng thực tế, hướng dẫn giặt..."
                  rows={4}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none border-2 resize-none transition-all"
                  style={{ backgroundColor: SOFT, border: `2px solid ${MUTED}`, color: ESPRESSO, ...ff }}
                />
              </div>

              {/* Price & Size grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold block mb-1.5" style={{ color: COFFEE, ...ff }}>Giá bán (₫) *</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="150000"
                      className="w-full px-4 py-3 rounded-xl text-sm outline-none border-2 transition-all"
                      style={{ backgroundColor: SOFT, border: `2px solid ${MUTED}`, color: ESPRESSO, ...ff }}
                    />
                    {price && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold" style={{ color: T, ...ff }}>
                        {fmt(Number(price))}
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold block mb-1.5" style={{ color: COFFEE, ...ff }}>Kích cỡ (Size)</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {["XS","S","M","L","XL","XXL"].map((s) => (
                      <button
                        key={s}
                        onClick={() => setSize(s)}
                        className="flex-1 py-2.5 rounded-lg text-xs font-bold border-2 transition-all min-w-[32px]"
                        style={{ backgroundColor: size === s ? T : "transparent", color: size === s ? LINEN : COFFEE, borderColor: size === s ? T : MUTED, ...ff }}
                      >{s}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Condition */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-bold" style={{ color: COFFEE, ...ff }}>Độ mới (%)</label>
                  <span className="text-sm font-bold" style={{ color: T, ...ff }}>
                    {condition}% — <span style={{ ...serif }}>{condLabel}</span>
                  </span>
                </div>
                <input type="range" min={30} max={100} value={condition} onChange={(e) => setCondition(Number(e.target.value))}
                  className="w-full h-2.5 rounded-full cursor-pointer" style={{ accentColor: T }} />
                <div className="flex justify-between mt-1">
                  <span className="text-[10px]" style={{ color: COFFEE + "88", ...ff }}>30% Cũ</span>
                  <span className="text-[10px]" style={{ color: COFFEE + "88", ...ff }}>100% Mới nguyên</span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="pt-2 flex gap-3">
                <button
                  onClick={() => {
                    if (!name.trim()) {
                      alert("Vui lòng nhập tên sản phẩm!");
                      return;
                    }
                    if (!price || Number(price) <= 0) {
                      alert("Vui lòng nhập giá bán hợp lệ!");
                      return;
                    }
                    
                    const categoryImages: Record<string, string> = {
                      "Áo": "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=400&h=520&fit=crop",
                      "Quần": "https://images.unsplash.com/photo-1542272604-787c3835535d?w=400&h=520&fit=crop",
                      "Váy": "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=400&h=520&fit=crop",
                      "Áo khoác": "https://images.unsplash.com/photo-1495105787522-5334e3ffa0ef?w=400&h=520&fit=crop",
                      "Phụ kiện": "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=520&fit=crop",
                    };
                    const selectedImage = photoCount > 0 
                      ? previewImages[0] 
                      : (categoryImages[category] || "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=520&fit=crop");

                    onAddProduct({
                      name,
                      price: Number(price),
                      category,
                      desc,
                      size,
                      condition,
                      image: selectedImage
                    });
                    go("account");
                  }}
                  className="flex-1 py-3.5 rounded-xl font-bold text-base shadow-md transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ backgroundColor: T, color: LINEN, ...ff }}
                >
                  Đăng bán ngay 🌿
                </button>
                <button
                  className="px-5 py-3.5 rounded-xl font-semibold text-sm border-2 transition-all hover:opacity-80"
                  style={{ border: `2px solid ${MUTED}`, color: COFFEE, ...ff }}
                >
                  Lưu nháp
                </button>
              </div>
              <p className="text-[10px] text-center" style={{ color: COFFEE, ...ff }}>
                Sản phẩm của bạn sẽ được duyệt trong vòng 2–4 giờ trước khi hiển thị
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Register Screen ─────────────────────────────────────────────────────────────
function RegisterScreen({ onRegister, onBack }: { onRegister: (userName: string, userEmail: string) => void; onBack: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = () => {
    setError("");

    if (!name.trim() || !email.trim() || !pw.trim() || !phone.trim()) {
      setError("Vui lòng nhập đầy đủ thông tin");
      return;
    }

    if (!email.includes("@")) {
      setError("Email không hợp lệ");
      return;
    }

    if (pw.length < 6) {
      setError("Mật khẩu phải có ít nhất 6 ký tự");
      return;
    }

    if (pw !== confirmPw) {
      setError("Mật khẩu xác nhận không khớp");
      return;
    }

    setLoading(true);
    setTimeout(() => {
      onRegister(name, email);
    }, 500);
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: LINEN }}>
      {/* Left: hero image */}
      <div className="flex-1 relative overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=900&h=1080&fit=crop&auto=format"
          alt="Vintage clothing collection"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 flex flex-col justify-end p-16"
          style={{ background: "linear-gradient(to top, rgba(58,35,18,0.85) 0%, rgba(58,35,18,0.3) 50%, transparent 100%)" }}>
          <div className="flex items-center gap-3 mb-4">
            <ThriftLogo size={52} />
            <span className="text-4xl font-bold italic" style={{ ...serif, color: LINEN }}>thrift it!</span>
          </div>
          <h2 className="text-3xl font-bold mb-3" style={{ ...serif, color: LINEN }}>
            Tham gia cộng đồng<br />thời trang bền vững 🌿
          </h2>
          <p className="text-base" style={{ color: MUTED, ...ff }}>
            Mua bán đồ vintage, góp phần bảo vệ<br />môi trường và thể hiện phong cách riêng.
          </p>
        </div>
      </div>

      {/* Right: register form */}
      <div className="w-[520px] flex-shrink-0 flex items-center justify-center p-12 overflow-y-auto" style={{ backgroundColor: CARD }}>
        <div className="w-full max-w-[400px]">
          {/* Back button */}
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm font-semibold mb-6 transition-all hover:opacity-80"
            style={{ color: COFFEE, ...ff }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M11 4L6 9L11 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Quay lại đăng nhập
          </button>

          {/* Logo mark */}
          <div className="flex flex-col items-center mb-8">
            <ThriftLogo size={52} />
            <h1 className="text-2xl font-bold italic mt-3" style={{ ...serif, color: ESPRESSO }}>Tạo tài khoản mới</h1>
            <p className="text-sm mt-1" style={{ color: COFFEE, ...ff }}>Tham gia cùng 4.800+ người bán</p>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl text-sm flex items-center gap-2"
              style={{ backgroundColor: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626" }}>
              <span>⚠️</span>
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold mb-1.5" style={{ color: COFFEE, ...ff }}>Họ và tên</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nguyễn Văn A"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none border-2 transition-all"
                style={{ backgroundColor: SOFT, border: `2px solid ${MUTED}`, color: ESPRESSO, ...ff }}
              />
            </div>

            <div>
              <label className="block text-xs font-bold mb-1.5" style={{ color: COFFEE, ...ff }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none border-2 transition-all"
                style={{ backgroundColor: SOFT, border: `2px solid ${MUTED}`, color: ESPRESSO, ...ff }}
              />
            </div>

            <div>
              <label className="block text-xs font-bold mb-1.5" style={{ color: COFFEE, ...ff }}>Số điện thoại</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0901234567"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none border-2 transition-all"
                style={{ backgroundColor: SOFT, border: `2px solid ${MUTED}`, color: ESPRESSO, ...ff }}
              />
            </div>

            <div>
              <label className="block text-xs font-bold mb-1.5" style={{ color: COFFEE, ...ff }}>Mật khẩu</label>
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="Tối thiểu 6 ký tự"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none border-2 transition-all"
                style={{ backgroundColor: SOFT, border: `2px solid ${MUTED}`, color: ESPRESSO, ...ff }}
              />
            </div>

            <div>
              <label className="block text-xs font-bold mb-1.5" style={{ color: COFFEE, ...ff }}>Xác nhận mật khẩu</label>
              <input
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="Nhập lại mật khẩu"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none border-2 transition-all"
                style={{ backgroundColor: SOFT, border: `2px solid ${MUTED}`, color: ESPRESSO, ...ff }}
              />
            </div>

            <button
              onClick={handleRegister}
              disabled={loading}
              className="w-full py-3.5 rounded-xl text-base font-bold shadow-lg transition-all hover:opacity-90 active:scale-[0.98] mt-2"
              style={{ backgroundColor: T, color: LINEN, ...ff, cursor: loading ? "not-allowed" : "pointer" }}
            >
              {loading ? "Đang xử lý..." : "Đăng Ký"}
            </button>
          </div>

          <p className="text-xs text-center mt-6" style={{ color: COFFEE, ...ff }}>
            Bằng cách đăng ký, bạn đồng ý với{" "}
            <a href="#" className="underline" style={{ color: T }}>Điều khoản sử dụng</a>
            {" "}và{" "}
            <a href="#" className="underline" style={{ color: T }}>Chính sách bảo mật</a>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Notification Screen ────────────────────────────────────────────────────────
const MOCK_NOTIFICATIONS = [
  { id: 1, type: "order", title: "Đơn hàng đã được xác nhận", desc: "Đơn hàng #ORD-20240876 đã được shop xác nhận và đang chuẩn bị hàng", time: "5 phút trước", read: false, icon: Package },
  { id: 2, type: "chat", title: "Tin nhắn mới từ minhtu.vintage", desc: "Bạn có tin nhắn mới: Hàng đã được đóng gói xong rồi bạn nhé!", time: "15 phút trước", read: false, icon: MessageCircle },
  { id: 3, type: "promo", title: "Mã giảm giá 15% cho đơn hàng đầu tiên", desc: "Sử dụng mã NEWMEMBER15 để được giảm 15% cho đơn hàng đầu tiên. Hết hạn sau 7 ngày.", time: "1 giờ trước", read: false, icon: Percent },
  { id: 4, type: "system", title: "Cập nhật ứng dụng", desc: "thrift it! vừa cập nhật phiên bản mới với nhiều cải tiến giao diện", time: "Hôm qua", read: true, icon: Bell },
  { id: 5, type: "order", title: "Đơn hàng đang được giao", desc: "Đơn hàng #ORD-20240855 đang được GHN vận chuyển. Dự kiến giao trong 2-3 ngày.", time: "Hôm qua", read: true, icon: Truck },
  { id: 6, type: "review", title: "Nhắc đánh giá sản phẩm", desc: "Cảm ơn bạn đã mua sắm! Hãy đánh giá sản phẩm để giúp người mua khác có thêm thông tin nhé.", time: "2 ngày trước", read: true, icon: Star },
];

function NotificationScreen({ go }: { go: (s: Screen) => void }) {
  const [notifications] = useState(MOCK_NOTIFICATIONS);
  const unreadCount = notifications.filter(n => !n.read).length;

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
              {unreadCount > 0 ? `${unreadCount} thông báo chưa đọc` : "Tất cả thông báo đã được đọc"}
            </p>
          </div>
          {unreadCount > 0 && (
            <button className="text-sm font-semibold px-4 py-2 rounded-xl transition-all hover:opacity-80"
              style={{ backgroundColor: SOFT, color: COFFEE, ...ff }}>
              Đánh dấu đã đọc tất cả
            </button>
          )}
        </div>

        <div className="space-y-3">
          {notifications.map((noti) => (
            <div
              key={noti.id}
              className="flex items-start gap-4 p-5 rounded-2xl transition-all hover:shadow-md cursor-pointer"
              style={{ 
                backgroundColor: noti.read ? CARD : `${T}08`,
                border: `1px solid ${noti.read ? MUTED : `${T}30`}`
              }}
            >
              <div 
                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${typeColors[noti.type]}15` }}
              >
                <noti.icon size={22} style={{ color: typeColors[noti.type] }} />
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
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Product Detail Screen ──────────────────────────────────────────────────────
function ProductDetailScreen({
  product,
  go,
  onLike,
  onAddToCart,
  rentalPlan,
  onRentProduct
}: {
  product: Product;
  go: (s: Screen, p?: Product, se?: Seller) => void;
  onLike: (id: number) => void;
  onAddToCart: (product: Product, qty: number, buyOrRent?: "buy" | "rent") => void;
  rentalPlan: string;
  onRentProduct: (product: Product) => void;
}) {
  const seller = SELLERS.find(s => s.handle === product.seller);
  const [selectedImg, setSelectedImg] = useState(0);
  const [showReview, setShowReview] = useState(false);
  const [qty, setQty] = useState(1);
  const [addedToCart, setAddedToCart] = useState(false);

  const condLabel = product.condition >= 95 ? "Như mới" : product.condition >= 85 ? "Rất tốt" : product.condition >= 70 ? "Tốt" : "Khá";

  const categoryImages: Record<string, string[]> = {
    "Áo": [
      product.image,
      "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=400&h=520&fit=crop",
      "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400&h=520&fit=crop"
    ],
    "Quần": [
      product.image,
      "https://images.unsplash.com/photo-1542272604-787c3835535d?w=400&h=520&fit=crop",
      "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=400&h=520&fit=crop"
    ],
    "Váy": [
      product.image,
      "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=400&h=520&fit=crop",
      "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=400&h=520&fit=crop"
    ],
  };

  const reviewImages = categoryImages[product.category] || [
    product.image,
    "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=520&fit=crop",
    "https://images.unsplash.com/photo-1495105787522-5334e3ffa0ef?w=400&h=520&fit=crop"
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: LINEN }}>
      {/* Breadcrumb */}
      <div className="px-8 py-4" style={{ backgroundColor: SOFT }}>
        <div className="max-w-[1440px] mx-auto flex items-center gap-2 text-sm" style={{ color: COFFEE, ...ff }}>
          <button onClick={() => go("home")} className="hover:text-amber-700 transition-colors">Trang chủ</button>
          <ChevronRight size={14} />
          <button onClick={() => go("search")} className="hover:text-amber-700 transition-colors">{product.category}</button>
          <ChevronRight size={14} />
          <span className="font-semibold" style={{ color: ESPRESSO }}>{product.name}</span>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-8 py-8">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 480px", gap: "48px" }}>
          {/* Left: Images */}
          <div>
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: CARD, border: `1px solid ${MUTED}` }}>
              <img
                src={reviewImages[selectedImg]}
                alt={product.name}
                className="w-full object-cover"
                style={{ height: "500px" }}
              />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-4">
              {reviewImages.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedImg(i)}
                  className="rounded-xl overflow-hidden border-2 transition-all"
                  style={{ 
                    borderColor: selectedImg === i ? T : "transparent",
                    opacity: selectedImg === i ? 1 : 0.7
                  }}
                >
                  <img src={img} alt="" className="w-full object-cover" style={{ height: "100px" }} />
                </button>
              ))}
            </div>

            {/* Seller info */}
            {seller && (
              <div className="mt-8 p-5 rounded-2xl" style={{ backgroundColor: CARD, border: `1px solid ${MUTED}` }}>
                <h3 className="text-sm font-bold mb-4" style={{ color: ESPRESSO, ...ff }}>Người bán</h3>
                <div className="flex items-center gap-4">
                  <img src={seller.avatar} alt={seller.name} className="w-14 h-14 rounded-full object-cover" />
                  <div className="flex-1">
                    <p className="font-bold" style={{ color: ESPRESSO, ...ff }}>{seller.name}</p>
                    <p className="text-sm" style={{ color: COFFEE, ...ff }}>@{seller.handle}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex">
                        {[1,2,3,4,5].map(i => <Star key={i} size={12} fill={T} stroke="none" />)}
                      </div>
                      <span className="text-xs font-bold" style={{ color: T }}>{seller.rating}</span>
                      <span className="text-xs" style={{ color: COFFEE }}>· {seller.transactions} giao dịch</span>
                    </div>
                  </div>
                  <button
                    onClick={() => go("seller", undefined, seller)}
                    className="px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all hover:opacity-80"
                    style={{ borderColor: T, color: T, ...ff }}
                  >
                    Xem shop
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right: Info */}
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: SOFT, color: COFFEE, ...ff }}>{product.category}</span>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: `${T}20`, color: T, ...ff }}>Size {product.size}</span>
              </div>
              <h1 className="text-2xl font-bold leading-tight" style={{ ...serif, color: ESPRESSO }}>{product.name}</h1>
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1">
                  <div className="flex">
                    {[1,2,3,4,5].map(i => <Star key={i} size={14} fill={T} stroke="none" />)}
                  </div>
                  <span className="text-sm font-bold" style={{ color: T }}>4.9</span>
                  <span className="text-sm" style={{ color: COFFEE }}>(128 đánh giá)</span>
                </div>
                <span className="text-sm" style={{ color: COFFEE }}>·</span>
                <span className="text-sm" style={{ color: COFFEE }}>234 lượt thích</span>
              </div>
            </div>

            <div className="p-6 rounded-2xl" style={{ backgroundColor: CARD, border: `2px solid ${T}30` }}>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold" style={{ ...serif, color: T }}>{fmt(product.price)}</span>
                <span className="text-sm line-through" style={{ color: MUTED }}>{fmt(product.price * 1.4)}</span>
              </div>
              <div className="flex items-center gap-3 mt-3">
                <span className="text-sm px-2.5 py-1 rounded-full font-semibold" style={{ backgroundColor: "#27AE60", color: "white", ...ff }}>
                  {product.condition}% mới
                </span>
                <span className="text-sm" style={{ color: COFFEE }}>{condLabel}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => onLike(product.id)}
                className="flex items-center gap-2 px-5 py-3 rounded-xl font-semibold border-2 transition-all hover:opacity-80"
                style={{ borderColor: T, color: product.liked ? "#E74C3C" : T, backgroundColor: product.liked ? "#FDEDEC" : "transparent", ...ff }}
              >
                <Heart size={18} fill={product.liked ? "#E74C3C" : "none"} />
                {product.liked ? "Đã thích" : "Yêu thích"}
              </button>
              <div className="flex items-center gap-1 rounded-xl overflow-hidden" style={{ border: `1.5px solid ${MUTED}` }}>
                <button onClick={() => setQty(Math.max(1, qty - 1))} className="px-4 py-3 transition-all hover:bg-gray-100" style={{ backgroundColor: SOFT }}>
                  <Minus size={16} style={{ color: COFFEE }} />
                </button>
                <span className="px-4 py-3 font-bold" style={{ backgroundColor: CARD, color: ESPRESSO }}>{qty}</span>
                <button onClick={() => setQty(qty + 1)} className="px-4 py-3 transition-all hover:bg-gray-100" style={{ backgroundColor: T, color: LINEN }}>
                  <Plus size={16} />
                </button>
              </div>
            </div>

            <button
              onClick={() => { onAddToCart(product, qty); setAddedToCart(true); setTimeout(() => setAddedToCart(false), 2000); }}
              className="w-full py-4 rounded-2xl text-base font-bold shadow-lg transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ backgroundColor: addedToCart ? "#27AE60" : T, color: LINEN, ...ff }}
            >
              {addedToCart ? "✓ Đã thêm vào giỏ hàng" : "Thêm vào giỏ hàng"}
            </button>
            <button
              onClick={() => { onAddToCart(product, qty); go("cart"); }}
              className="w-full py-4 rounded-2xl text-base font-bold transition-all hover:opacity-90"
              style={{ backgroundColor: ESPRESSO, color: LINEN, ...ff }}
            >
              Mua ngay
            </button>
            <button
              onClick={() => onRentProduct(product)}
              className="w-full py-4 rounded-2xl text-base font-bold transition-all hover:opacity-90 border-2"
              style={{ borderColor: T, color: T, backgroundColor: "transparent", ...ff }}
            >
              {rentalPlan !== "None" ? "🔄 Thuê đồ hội viên (0₫ với Premium)" : "🔄 Đăng ký Thuê đồ (chỉ từ 45.000₫/ngày)"}
            </button>

            {/* Trust badges */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: "🛡️", label: "Bảo vệ người mua" },
                { icon: "🔄", label: "Đổi trả 7 ngày" },
                { icon: "📦", label: "Kiểm tra khi nhận" },
              ].map(b => (
                <div key={b.label} className="text-center p-3 rounded-xl" style={{ backgroundColor: SOFT }}>
                  <span className="text-xl">{b.icon}</span>
                  <p className="text-[10px] mt-1 font-semibold" style={{ color: COFFEE }}>{b.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Seller Screen ──────────────────────────────────────────────────────────────
function SellerScreen({ seller, go, products, onAddToCart }: { seller: Seller; go: (s: Screen, p?: Product, se?: Seller) => void; products: Product[]; onAddToCart: (product: Product) => void }) {
  const sellerProducts = products.filter(p => p.seller === seller.handle);

  return (
    <div className="min-h-screen" style={{ backgroundColor: LINEN }}>
      {/* Seller header */}
      <div style={{ background: `linear-gradient(135deg, ${ESPRESSO} 0%, ${COFFEE} 100%)` }}>
        <div className="max-w-[1440px] mx-auto px-8 py-10">
          <div className="flex items-center gap-6">
            <img src={seller.avatar} alt={seller.name} className="w-28 h-28 rounded-full object-cover border-4" style={{ borderColor: T }} />
            <div className="flex-1">
              <h1 className="text-3xl font-bold" style={{ ...serif, color: LINEN }}>{seller.name}</h1>
              <p className="text-lg mt-1" style={{ color: MUTED, ...ff }}>@{seller.handle}</p>
              <div className="flex items-center gap-6 mt-4">
                <div className="flex items-center gap-1.5">
                  <div className="flex">
                    {[1,2,3,4,5].map(i => <Star key={i} size={16} fill={T} stroke="none" />)}
                  </div>
                  <span className="text-lg font-bold" style={{ color: T }}>{seller.rating}</span>
                  <span className="text-sm" style={{ color: MUTED }}>({seller.transactions} đánh giá)</span>
                </div>
                <div className="h-8 w-px" style={{ backgroundColor: MUTED + "44" }} />
                <span className="text-sm px-3 py-1 rounded-full" style={{ backgroundColor: T + "33", color: T, ...ff }}>Shop uy tín ✓</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button className="px-6 py-3 rounded-xl font-bold transition-all hover:opacity-90"
                style={{ backgroundColor: T, color: LINEN, ...ff }}>
                + Theo dõi
              </button>
              <button onClick={() => go("chat")} className="px-6 py-3 rounded-xl font-bold border-2 transition-all hover:opacity-90"
                style={{ borderColor: LINEN, color: LINEN, ...ff }}>
                Nhắn tin
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold" style={{ ...serif, color: ESPRESSO }}>
            Sản phẩm của shop ({sellerProducts.length})
          </h2>
        </div>

        <div className="grid grid-cols-5 gap-5">
          {sellerProducts.map((p) => (
            <ProductCard key={p.id} product={p} onLike={() => {}} go={(s) => go("product-detail", p)} onAddToCart={onAddToCart} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Pricing Screen ─────────────────────────────────────────────────────────────
function PricingScreen({
  go,
  rentalPlan,
  mediaPlan,
  onOpenCheckoutPlan
}: {
  go: (s: Screen) => void;
  rentalPlan: string;
  mediaPlan: string;
  onOpenCheckoutPlan: (type: "rental" | "media", name: string, price: number) => void;
}) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: LINEN }}>
      <div className="max-w-[1000px] mx-auto px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold font-serif" style={{ ...serif, color: ESPRESSO }}>Gói cước & Dịch vụ của chúng tôi</h1>
          <p className="text-sm mt-2 text-coffee" style={ff}>Xem thông tin chi tiết và chọn gói phù hợp nhất với nhu cầu của bạn</p>
        </div>

        <div className="grid grid-cols-2 gap-8">
          {/* Section 1: Clothing Rental Subscription */}
          <div className="p-8 rounded-3xl bg-white shadow-sm border border-muted flex flex-col justify-between" style={{ minHeight: "500px" }}>
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="p-2 rounded-xl bg-orange-100 text-orange-600">
                  <Sparkles size={24} />
                </span>
                <h2 className="text-xl font-bold" style={{ ...serif, color: ESPRESSO }}>Gói Thuê Đồ (Rental Subscription)</h2>
              </div>
              <p className="text-xs text-coffee leading-relaxed mb-6" style={ff}>
                Dành cho khách hàng muốn sở hữu tủ đồ vô hạn, đặc biệt là những người thường xuyên đi tiệc, sự kiện, chụp ảnh. Thuê đồ thay vị mua mới để tiết kiệm đến 85% chi phí!
              </p>

              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-linen border cursor-pointer hover:border-amber-600 transition-all" onClick={() => onOpenCheckoutPlan("rental", "Basic Rental", 299000)}>
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-sm">Basic Plan</span>
                    <span className="text-sm font-bold text-amber-700">299.000₫ / tháng</span>
                  </div>
                  <p className="text-[11px] text-coffee mt-1">Thuê tối đa 3 món cùng lúc, đã bao gồm phí giặt hấp & giao nhận tại nhà.</p>
                </div>

                <div className="p-4 rounded-xl bg-orange-50 border-2 cursor-pointer hover:border-amber-600 transition-all" style={{ borderColor: T }} onClick={() => onOpenCheckoutPlan("rental", "Premium Rental", 599000)}>
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-sm">Premium Plan</span>
                    <span className="text-sm font-bold text-amber-700">599.000₫ / tháng</span>
                  </div>
                  <p className="text-[11px] text-coffee mt-1">Thuê tối đa 4 món cùng lúc, không giới hạn lượt đổi trả trong tháng, ưu tiên đồ hiệu cao cấp.</p>
                </div>
              </div>
            </div>

            <div className="mt-8">
              {rentalPlan !== "None" ? (
                <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-center text-xs font-bold">
                  ✓ Bạn đang sử dụng gói: {rentalPlan}
                </div>
              ) : (
                <button
                  onClick={() => onOpenCheckoutPlan("rental", "Premium Rental", 599000)}
                  className="w-full py-3.5 rounded-xl text-sm font-bold shadow-lg transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ backgroundColor: T, color: LINEN, ...ff }}
                >
                  Đăng ký Premium Plan ngay
                </button>
              )}
            </div>
          </div>

          {/* Section 2: Shop Photo & Video Services */}
          <div className="p-8 rounded-3xl bg-white shadow-sm border border-muted flex flex-col justify-between" style={{ minHeight: "500px" }}>
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="p-2 rounded-xl bg-blue-100 text-blue-600">
                  <Store size={24} />
                </span>
                <h2 className="text-xl font-bold" style={{ ...serif, color: ESPRESSO }}>Dịch vụ ảnh & video cho Shop</h2>
              </div>
              <p className="text-xs text-coffee leading-relaxed mb-6" style={ff}>
                Dành cho các shop ký gửi (B2B) gặp khó khăn trong việc tự chụp ảnh mẫu. Studio chuyên nghiệp của chúng tôi sẽ nâng tầm hình ảnh sản phẩm để tăng tỷ lệ chốt đơn!
              </p>

              <div className="space-y-3">
                {[
                  { name: "Gói Basic", price: 250000, desc: "Chụp 10 ảnh sản phẩm chất lượng cao với phông nền studio tiêu chuẩn." },
                  { name: "Gói Standard", price: 450000, desc: "Chụp 15 ảnh sản phẩm đa góc + 1 video ngắn review (Shorts/TikTok/Reels)." },
                  { name: "Gói Premium", price: 650000, desc: "Chụp 20 ảnh chi tiết + 1 video ngắn + Chỉnh sửa hậu kỳ, ánh sáng & bộ lọc màu vintage." },
                ].map((pkg) => (
                  <div key={pkg.name} className="p-3.5 rounded-xl border bg-linen flex justify-between items-center cursor-pointer hover:border-amber-600 transition-all" onClick={() => onOpenCheckoutPlan("media", pkg.name, pkg.price)}>
                    <div>
                      <span className="font-bold text-xs">{pkg.name}</span>
                      <p className="text-[10px] text-coffee mt-0.5">{pkg.desc}</p>
                    </div>
                    <span className="text-xs font-bold text-amber-700 flex-shrink-0 ml-2">{fmt(pkg.price)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8">
              {mediaPlan !== "None" ? (
                <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-center text-xs font-bold">
                  ✓ Shop đang chạy gói: {mediaPlan}
                </div>
              ) : (
                <button
                  onClick={() => onOpenCheckoutPlan("media", "Standard Package", 450000)}
                  className="w-full py-3.5 rounded-xl text-sm font-bold shadow-lg transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ backgroundColor: ESPRESSO, color: LINEN, ...ff }}
                >
                  Đặt gói chụp Standard (450k)
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Admin Screen ───────────────────────────────────────────────────────────────
function AdminScreen({
  go,
  products,
  setProducts,
  mediaPlan,
  setMediaPlan,
  mediaStatus,
  setMediaStatus,
  myProductsByEmail,
  setMyProductsByEmail,
  rentalPlan,
  setRentalPlan,
  userRole,
  setUserRole,
  onLogout
}: {
  go: (s: Screen) => void;
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  mediaPlan: string;
  setMediaPlan: (plan: string) => void;
  mediaStatus: string;
  setMediaStatus: (status: string) => void;
  myProductsByEmail: Record<string, SellerProduct[]>;
  setMyProductsByEmail: React.Dispatch<React.SetStateAction<Record<string, SellerProduct[]>>>;
  rentalPlan: string;
  setRentalPlan: (plan: string) => void;
  userRole: string;
  setUserRole: (role: "buyer" | "seller") => void;
  onLogout: () => void;
}) {
  const [activeAdminTab, setActiveAdminTab] = useState<"stats" | "c2c" | "b2b" | "users">("stats");
  const [commissionRate, setCommissionRate] = useState<number>(10); // Default 10% commission rate
  const [timeFilter, setTimeFilter] = useState<"week" | "month" | "quarter" | "year">("week");
  const [selectedStatDetail, setSelectedStatDetail] = useState<"rental" | "media" | null>(null);

  const getChartData = () => {
    switch (timeFilter) {
      case "week":
        return [
          { label: "T2", val: 82000000 },
          { label: "T3", val: 95000000 },
          { label: "T4", val: 78000000 },
          { label: "T5", val: 110000000 },
          { label: "T6", val: 125000000 },
          { label: "T7", val: 140000000 },
          { label: "CN", val: 155000000 }
        ];
      case "month":
        return [
          { label: "Tuần 1", val: 320000000 },
          { label: "Tuần 2", val: 380000000 },
          { label: "Tuần 3", val: 410000000 },
          { label: "Tuần 4", val: 460000000 }
        ];
      case "quarter":
        return [
          { label: "Tháng 1", val: 1250000000 },
          { label: "Tháng 2", val: 1480000000 },
          { label: "Tháng 3", val: 1650000000 }
        ];
      case "year":
        return [
          { label: "Quý 1", val: 4500000000 },
          { label: "Quý 2", val: 5100000000 },
          { label: "Quý 3", val: 4800000000 },
          { label: "Quý 4", val: 5900000000 }
        ];
    }
  };

  const pendingProducts = Object.values(myProductsByEmail).flat().filter(p => p.status === "pending");

  const handleApproveListing = (id: number) => {
    setMyProductsByEmail(prev => {
      const updated = { ...prev };
      for (const email in updated) {
        updated[email] = updated[email].map(p => p.id === id ? { ...p, status: "active" } : p);
      }
      return updated;
    });
    setProducts(prev => prev.map(p => p.id === id ? { ...p, status: "active" } : p));
    alert("Duyệt tin đăng bán C2C thành công! Sản phẩm đã xuất hiện trên trang chủ.");
  };

  const handleRejectListing = (id: number) => {
    setMyProductsByEmail(prev => {
      const updated = { ...prev };
      for (const email in updated) {
        updated[email] = updated[email].filter(p => p.id !== id);
      }
      return updated;
    });
    setProducts(prev => prev.filter(p => p.id !== id));
    alert("Đã từ chối tin đăng bán sản phẩm.");
  };

  const mediaStatusOptions = [
    "Đang chờ duyệt sản phẩm gửi tới studio",
    "Đang chuẩn bị đạo cụ & lên lịch chụp (24/07)",
    "Đang thực hiện bộ ảnh lookbook (đã nhận sản phẩm)",
    "Đang hậu kỳ & chỉnh sửa video ngắn",
    "Đã hoàn thành & Bàn giao hình ảnh"
  ];

  // Calculated stats based on commission
  const totalC2CRevenue = 143200000;
  const platformProfitFromC2C = Math.round(totalC2CRevenue * (commissionRate / 100));

  return (
    <div className="min-h-screen flex w-full" style={{ backgroundColor: "#F7F5F0" }}>
      {/* ── Left Sidebar (Admin Panel Dark Slate Styling) ── */}
      <div className="w-64 flex-shrink-0 flex flex-col justify-between" style={{ backgroundColor: COFFEE, color: LINEN }}>
        <div>
          <div className="p-6 border-b border-white/10 flex flex-col gap-2.5">
            <div className="flex items-center gap-3">
              <ThriftLogo size={38} />
              <span className="text-xl font-bold italic" style={{ ...serif, color: LINEN, letterSpacing: "-0.3px" }}>
                thrift it!
              </span>
              <span className="px-2 py-0.5 rounded bg-amber-500 text-espresso text-[9px] font-bold uppercase tracking-wider flex-shrink-0" style={ff}>
                Admin
              </span>
            </div>
            <span className="text-[10px] text-amber-400/80 font-semibold uppercase tracking-wider block" style={ff}>
              Hệ thống quản trị nền tảng
            </span>
          </div>

          <div className="p-4 space-y-1">
            {[
              { id: "stats", label: "Tổng quan thống kê", icon: TrendingUp },
              { id: "c2c", label: "Duyệt bài đăng C2C", icon: Package, badge: pendingProducts.length },
              { id: "b2b", label: "Tiến độ B2B Studio", icon: Store },
              { id: "users", label: "Quản lý Tài khoản", icon: Users }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveAdminTab(tab.id as any)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-semibold transition-all hover:bg-white/5"
                style={{
                  backgroundColor: activeAdminTab === tab.id ? "rgba(255,255,255,0.1)" : "transparent",
                  color: activeAdminTab === tab.id ? LINEN : MUTED,
                  ...ff
                }}
              >
                <div className="flex items-center gap-2.5">
                  <tab.icon size={15} style={{ color: activeAdminTab === tab.id ? T : "inherit" }} />
                  <span>{tab.label}</span>
                </div>
                {tab.badge && tab.badge > 0 ? (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-red-500 text-white">
                    {tab.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-white/10">
          <button
            onClick={onLogout}
            className="w-full py-2.5 rounded-xl text-xs font-bold bg-red-600 text-white transition-all hover:bg-red-700 active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <LogOut size={14} />
            Đăng xuất Admin
          </button>
        </div>
      </div>

      {/* ── Main Content Area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header bar */}
        <div className="h-16 bg-white border-b border-muted px-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-coffee uppercase tracking-wider" style={ff}>Bảng điều khiển</span>
            <span className="text-xs text-muted-foreground">/</span>
            <span className="text-xs font-semibold text-espresso capitalize" style={ff}>
              {activeAdminTab === "stats" ? "Thống kê tổng quan" : activeAdminTab === "c2c" ? "Duyệt bài đăng" : activeAdminTab === "b2b" ? "Đơn hàng Studio" : "Danh sách tài khoản"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs font-bold text-espresso">System Administrator</p>
              <p className="text-[10px] text-muted-foreground">admin@thriftit.vn</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center font-bold text-amber-700 text-sm">
              AD
            </div>
          </div>
        </div>

        {/* Inner Scrollable Workspace */}
        <div className="flex-1 overflow-y-auto p-8">
          {/* TAB 1: OVERVIEW STATS */}
          {activeAdminTab === "stats" && (
            <div className="space-y-8 animate-fade-in">
              <div className="grid grid-cols-4 gap-5">
                {[
                  { label: "Doanh thu Hội viên Thuê", value: "738.900.000₫", sub: "Xem chi tiết 🔍", color: "#27AE60", icon: Sparkles, detailId: "rental" as const },
                  { label: "Doanh thu Media Shop", value: "63.900.000₫", sub: "Xem chi tiết 🔍", color: T, icon: Store, detailId: "media" as const },
                  { label: "Phí Hoa hồng C2C", value: `${fmt(platformProfitFromC2C)}`, sub: `Tỷ lệ hoa hồng: ${commissionRate}%`, color: "#2980B9", icon: DollarSign },
                  { label: "Tin C2C chờ duyệt", value: `${pendingProducts.length} bài đăng`, sub: "Cần phê duyệt", color: "#E74C3C", icon: Clock },
                ].map((stat) => (
                  <div 
                    key={stat.label} 
                    onClick={() => stat.detailId && setSelectedStatDetail(stat.detailId)}
                    className={`p-5 rounded-2xl bg-white border border-muted shadow-sm flex items-center justify-between transition-all ${stat.detailId ? "cursor-pointer hover:border-amber-500 hover:shadow-md hover:scale-[1.01] active:scale-[0.99]" : ""}`}
                  >
                    <div>
                      <span className="text-xs font-bold text-coffee" style={ff}>{stat.label}</span>
                      <p className="text-xl font-bold mt-1.5" style={{ ...serif, color: stat.color }}>{stat.value}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{stat.sub}</p>
                    </div>
                    <span className="p-2.5 rounded-xl bg-gray-50 text-gray-500 border border-muted">
                      <stat.icon size={18} style={{ color: stat.color }} />
                    </span>
                  </div>
                ))}
              </div>

              {/* Commission Control panel & SVG Area Chart */}
              <div className="grid grid-cols-2 gap-8">
                <div className="p-6 rounded-3xl bg-white border border-muted shadow-sm flex flex-col justify-between" style={{ minHeight: "340px" }}>
                  <div>
                    <h3 className="text-sm font-bold mb-2" style={{ color: ESPRESSO, ...ff }}>Cấu hình tỷ lệ Chiết khấu Platform</h3>
                    <p className="text-xs text-coffee mb-6 leading-relaxed" style={ff}>
                      Điều chỉnh tỷ lệ hoa hồng chiết khấu trên mỗi bài đăng C2C thành công. Thu nhập hoa hồng giả lập trên Dashboard sẽ tự động cập nhật.
                    </p>
                  </div>
                  <div className="space-y-5">
                    <div className="flex justify-between items-center text-xs font-bold" style={ff}>
                      <span className="text-coffee">Tỷ lệ hoa hồng sàn:</span>
                      <span className="text-amber-700 font-mono text-sm">{commissionRate}%</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="30"
                      value={commissionRate}
                      onChange={(e) => setCommissionRate(Number(e.target.value))}
                      className="w-full accent-amber-600 h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                      <span>Min: 5%</span>
                      <span>Max: 30%</span>
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-gray-50 border text-[11px] text-coffee mt-4 leading-relaxed" style={ff}>
                    ℹ️ <strong>Phí hoa hồng ước tính:</strong> {fmt(platformProfitFromC2C)} (dựa trên tổng doanh số ký gửi C2C đạt 143.200.000₫).
                  </div>
                </div>

                <div className="p-6 rounded-3xl bg-white border border-muted shadow-sm flex flex-col justify-between" style={{ minHeight: "340px" }}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold mb-1" style={{ color: ESPRESSO, ...ff }}>Biểu đồ doanh thu dự kiến</h3>
                      <p className="text-xs text-coffee" style={ff}>Tổng doanh thu (Hội viên + Media + C2C):</p>
                    </div>
                    {/* Time Filters */}
                    <div className="flex gap-1.5 p-1 rounded-xl bg-gray-50 border border-muted flex-shrink-0">
                      {[
                        { id: "week" as const, label: "Tuần" },
                        { id: "month" as const, label: "Tháng" },
                        { id: "quarter" as const, label: "Quý" },
                        { id: "year" as const, label: "Năm" }
                      ].map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setTimeFilter(t.id)}
                          className="px-2.5 py-1 rounded-lg text-[9px] font-bold transition-all"
                          style={{
                            backgroundColor: timeFilter === t.id ? COFFEE : "transparent",
                            color: timeFilter === t.id ? LINEN : COFFEE
                          }}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* SVG Chart */}
                  <div className="relative flex-1 flex items-end h-44 w-full">
                    {/* Y-axis gridlines */}
                    <div className="absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between pointer-events-none">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="w-full border-t border-dashed border-gray-100" />
                      ))}
                    </div>

                    <svg className="w-full h-full" viewBox="0 0 500 150">
                      {/* Gradient Fill for Area Chart */}
                      <defs>
                        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={T} stopOpacity="0.25" />
                          <stop offset="100%" stopColor={T} stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      {/* Line & Area Points */}
                      {(() => {
                        const points = getChartData();
                        const count = points.length;

                        // Convert to SVG coordinates (x: 40 to 460, y: 120 to 25)
                        const coords = points.map((p, idx) => {
                          const x = 35 + idx * ((500 - 70) / (count - 1 || 1));
                          // add commission contribution dynamically, scaled by the period length!
                          const multiplier = timeFilter === "week" ? 1 : timeFilter === "month" ? 4 : timeFilter === "quarter" ? 12 : 48;
                          const totalVal = p.val + (platformProfitFromC2C * multiplier / 10); 
                          
                          // map values dynamically depending on period
                          let minVal = 50000000;
                          let maxVal = 170000000;
                          if (timeFilter === "month") { minVal = 200000000; maxVal = 550000000; }
                          else if (timeFilter === "quarter") { minVal = 1000000000; maxVal = 2000000000; }
                          else if (timeFilter === "year") { minVal = 3000000000; maxVal = 7000000000; }
                          
                          const y = 120 - ((totalVal - minVal) / (maxVal - minVal)) * 95;
                          return { x, y, label: p.label, val: totalVal };
                        });

                        const linePath = coords.map((c, idx) => `${idx === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
                        const areaPath = `${linePath} L ${coords[coords.length - 1].x} 120 L ${coords[0].x} 120 Z`;

                        return (
                          <>
                            {/* Area fill */}
                            <path d={areaPath} fill="url(#chartGrad)" />

                            {/* Line path */}
                            <path d={linePath} fill="none" stroke={T} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

                            {/* Data points */}
                            {coords.map((c, idx) => (
                              <g key={idx} className="group">
                                <circle cx={c.x} cy={c.y} r="3.5" fill="white" stroke={T} strokeWidth="2" />
                                <text x={c.x} y={c.y - 10} textAnchor="middle" className="text-[9px] font-bold fill-espresso" style={ff}>
                                  {timeFilter === "year" || timeFilter === "quarter" ? `${(c.val / 1000000000).toFixed(2)}B` : `${(c.val / 1000000).toFixed(1)}M`}
                                </text>
                                {/* X-axis labels */}
                                <text x={c.x} y="138" textAnchor="middle" className="text-[10px] font-bold fill-coffee" style={ff}>
                                  {c.label}
                                </text>
                              </g>
                            ))}
                          </>
                        );
                      })()}
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Overlay Stat Detail Modal */}
          {selectedStatDetail && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-espresso/60 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-white rounded-3xl max-w-2xl w-full p-8 shadow-2xl border border-muted animate-slide-up">
                <div className="flex justify-between items-center border-b border-muted pb-4 mb-6">
                  <div>
                    <h3 className="text-lg font-bold font-serif" style={{ color: ESPRESSO, ...serif }}>
                      {selectedStatDetail === "rental" ? "Chi tiết doanh thu Hội viên Thuê" : "Chi tiết doanh thu Dịch vụ Media Shop"}
                    </h3>
                    <p className="text-xs text-coffee mt-1" style={ff}>Phân rã gói đăng ký từ người dùng & shop đối tác</p>
                  </div>
                  <button 
                    onClick={() => setSelectedStatDetail(null)}
                    className="w-8 h-8 rounded-full border border-muted hover:bg-gray-50 flex items-center justify-center text-gray-500 hover:text-espresso transition-all"
                  >
                    ✕
                  </button>
                </div>

                {selectedStatDetail === "rental" ? (
                  <div className="space-y-6" style={ff}>
                    {/* Rental plans stats table */}
                    <div className="overflow-hidden border border-muted rounded-xl">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-gray-50 border-b border-muted text-coffee font-bold">
                            <th className="p-3">Gói Hội Viên</th>
                            <th className="p-3 text-center">Lượt đăng ký</th>
                            <th className="p-3 text-right">Doanh thu</th>
                            <th className="p-3 text-right">Tỷ lệ đóng góp</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-muted text-espresso">
                          {[
                            { name: "Gói Basic (99k/tháng)", count: "120 tài khoản", rev: 11880000, pct: "1.6%" },
                            { name: "Gói Standard (299k/tháng)", count: "450 tài khoản", rev: 134550000, pct: "18.2%" },
                            { name: "Gói Premium (599k/tháng)", count: "989 tài khoản", rev: 592470000, pct: "80.2%" },
                          ].map((row) => (
                            <tr key={row.name} className="hover:bg-linen/20">
                              <td className="p-3 font-semibold">{row.name}</td>
                              <td className="p-3 text-center">{row.count}</td>
                              <td className="p-3 text-right font-bold text-amber-700">{fmt(row.rev)}</td>
                              <td className="p-3 text-right font-mono">{row.pct}</td>
                            </tr>
                          ))}
                          <tr className="bg-gray-50 font-bold border-t border-muted">
                            <td className="p-3">Tổng cộng</td>
                            <td className="p-3 text-center">1,559 lượt</td>
                            <td className="p-3 text-right text-amber-800">{fmt(738900000)}</td>
                            <td className="p-3 text-right">100%</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-coffee mb-2">Tài khoản đăng ký gần đây:</h4>
                      <div className="space-y-2">
                        {[
                          { name: "Nguyễn Thanh Linh", email: "linh.nguyen@gmail.com", pkg: "Gói Premium (599k)", time: "Hôm nay, 14:20" },
                          { name: "Phạm Hùng Cường", email: "cuong.pham@gmail.com", pkg: "Gói Standard (299k)", time: "Hôm qua, 18:45" },
                          { name: "Trần Thị Mai", email: "mai.tran@gmail.com", pkg: "Gói Basic (99k)", time: "20/07/2026, 09:30" }
                        ].map((user, idx) => (
                          <div key={idx} className="flex justify-between items-center p-2.5 rounded-xl border border-muted bg-gray-50 text-[11px]">
                            <div>
                              <span className="font-semibold text-espresso">{user.name}</span>
                              <span className="text-muted-foreground ml-1.5">({user.email})</span>
                            </div>
                            <div className="text-right">
                              <span className="font-bold text-amber-700">{user.pkg}</span>
                              <p className="text-[10px] text-muted-foreground mt-0.5">{user.time}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6" style={ff}>
                    {/* Media plans stats table */}
                    <div className="overflow-hidden border border-muted rounded-xl">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-gray-50 border-b border-muted text-coffee font-bold">
                            <th className="p-3">Gói Dịch Vụ Media</th>
                            <th className="p-3 text-center">Lượt đăng ký</th>
                            <th className="p-3 text-right">Doanh thu</th>
                            <th className="p-3 text-right">Tỷ lệ đóng góp</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-muted text-espresso">
                          {[
                            { name: "Gói Basic (250k)", count: "42 shop", rev: 10500000, pct: "16.4%" },
                            { name: "Gói Standard (450k)", count: "68 shop", rev: 30600000, pct: "47.9%" },
                            { name: "Gói Premium (650k)", count: "35 shop", rev: 22750000, pct: "35.7%" },
                          ].map((row) => (
                            <tr key={row.name} className="hover:bg-linen/20">
                              <td className="p-3 font-semibold">{row.name}</td>
                              <td className="p-3 text-center">{row.count}</td>
                              <td className="p-3 text-right font-bold text-amber-700">{fmt(row.rev)}</td>
                              <td className="p-3 text-right font-mono">{row.pct}</td>
                            </tr>
                          ))}
                          <tr className="bg-gray-50 font-bold border-t border-muted">
                            <td className="p-3">Tổng cộng</td>
                            <td className="p-3 text-center">145 lượt</td>
                            <td className="p-3 text-right text-amber-800">{fmt(63900000)}</td>
                            <td className="p-3 text-right">100%</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-coffee mb-2">Shop đăng ký gần đây:</h4>
                      <div className="space-y-2">
                        {[
                          { name: "Minh Tú Vintage", email: "shop.minhtu@thriftit.vn", pkg: "Gói Standard (450k)", time: "Hôm nay, 11:05" },
                          { name: "Retro Zone Shop", email: "shop.retrozone@gmail.com", pkg: "Gói Premium (650k)", time: "Hôm qua, 15:10" },
                          { name: "Classic Closet", email: "shop.classiccloset@gmail.com", pkg: "Gói Basic (250k)", time: "19/07/2026, 16:40" }
                        ].map((user, idx) => (
                          <div key={idx} className="flex justify-between items-center p-2.5 rounded-xl border border-muted bg-gray-50 text-[11px]">
                            <div>
                              <span className="font-semibold text-espresso">{user.name}</span>
                              <span className="text-muted-foreground ml-1.5">({user.email})</span>
                            </div>
                            <div className="text-right">
                              <span className="font-bold text-amber-700">{user.pkg}</span>
                              <p className="text-[10px] text-muted-foreground mt-0.5">{user.time}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: C2C LISTING MODERATION */}
          {activeAdminTab === "c2c" && (
            <div className="p-6 rounded-3xl bg-white border border-muted shadow-sm animate-fade-in">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-base font-bold font-serif" style={{ color: ESPRESSO }}>Bài đăng chờ duyệt ({pendingProducts.length})</h3>
                <span className="text-xs text-muted-foreground font-semibold">Cần duyệt trước khi hiển thị trên Home</span>
              </div>

              {pendingProducts.length === 0 ? (
                <div className="text-center py-16 text-coffee" style={ff}>
                  <div className="w-12 h-12 rounded-full bg-green-50 text-green-600 flex items-center justify-center mx-auto text-xl font-bold mb-3">✓</div>
                  <p className="text-sm font-bold">Không có bài đăng nào cần duyệt!</p>
                  <p className="text-xs text-muted-foreground mt-1">Các bài đăng từ cá nhân và shop đều đã hoạt động.</p>
                </div>
              ) : (
                <div className="overflow-hidden border border-muted rounded-2xl">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-muted text-coffee font-bold">
                        <th className="p-4 w-24">Ảnh</th>
                        <th className="p-4">Sản phẩm</th>
                        <th className="p-4">Người đăng</th>
                        <th className="p-4">Giá bán</th>
                        <th className="p-4 text-center">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-muted bg-white">
                      {pendingProducts.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50/55 transition-colors">
                          <td className="p-4">
                            <img src={p.image} className="w-12 h-16 rounded-lg object-cover border" />
                          </td>
                          <td className="p-4">
                            <p className="font-bold text-espresso text-sm">{p.name}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">ID: PROD-{p.id} · C2C Listing</p>
                          </td>
                          <td className="p-4 font-mono font-bold text-coffee">
                            @{p.seller || "linh.vintage"}
                          </td>
                          <td className="p-4 font-bold text-amber-700">
                            {fmt(p.price)}
                          </td>
                          <td className="p-4">
                            <div className="flex gap-2 justify-center">
                              <button
                                onClick={() => handleApproveListing(p.id)}
                                className="px-3 py-1.5 rounded-xl text-[10px] font-bold text-white transition-all bg-green-600 hover:bg-green-700"
                              >
                                ✓ Duyệt bài
                              </button>
                              <button
                                onClick={() => handleRejectListing(p.id)}
                                className="px-3 py-1.5 rounded-xl text-[10px] font-bold text-white transition-all bg-red-600 hover:bg-red-700"
                              >
                                ✗ Từ chối
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: B2B STUDIO SCHEDULE */}
          {activeAdminTab === "b2b" && (
            <div className="p-6 rounded-3xl bg-white border border-muted shadow-sm animate-fade-in">
              <h3 className="text-base font-bold font-serif mb-4" style={{ color: ESPRESSO }}>Đơn hàng Dịch vụ Media Studio B2B</h3>
              
              {mediaPlan === "None" ? (
                <div className="text-center py-16 text-coffee">
                  <p className="text-sm">Hiện tại chưa có Shop nào đặt dịch vụ ảnh & video lookbook.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="p-5 rounded-2xl border bg-gray-50 flex justify-between items-start">
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-700 uppercase">Đang chụp mẫu</span>
                      <p className="text-sm font-bold text-espresso">Shop đặt dịch vụ: <strong className="text-amber-700">@minhtu.vintage</strong></p>
                      <p className="text-xs text-coffee">Gói: <strong>{mediaPlan}</strong> (Chụp ảnh & làm video ngắn lookbook)</p>
                      <p className="text-xs text-coffee">Mức giá: <strong>450.000đ</strong></p>
                    </div>

                    <div className="w-80">
                      <label className="text-xs font-bold block mb-2 text-coffee">Cập nhật Trạng thái Tiến trình (Đồng bộ thời gian thực):</label>
                      <div className="relative">
                        <select
                          value={mediaStatus}
                          onChange={(e) => {
                            setMediaStatus(e.target.value);
                            alert("Đã đồng bộ cập nhật tiến độ B2B Studio sang Shop!");
                          }}
                          className="w-full appearance-none px-4 py-2.5 rounded-xl text-xs outline-none border cursor-pointer bg-white"
                          style={{ borderColor: MUTED, color: ESPRESSO }}
                        >
                          {mediaStatusOptions.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-coffee" />
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl" style={{ backgroundColor: `${T}10`, border: `1.5px solid ${T}30` }}>
                    <p className="text-xs leading-relaxed text-coffee" style={ff}>
                      💡 <strong>Hướng dẫn demo B2B:</strong> Hãy đổi trạng thái phía trên sang *"Đang hậu kỳ & chỉnh sửa video ngắn"*, sau đó đăng nhập tài khoản <strong>shop.minhtu@thriftit.vn</strong> để thấy thanh tiến trình cập nhật ngay lập tức ở mục <strong>"Dịch vụ Media"</strong>!
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: MOCK USERS DIRECTORY MANAGEMENT */}
          {activeAdminTab === "users" && (
            <div className="p-6 rounded-3xl bg-white border border-muted shadow-sm animate-fade-in">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-base font-bold font-serif" style={{ color: ESPRESSO }}>Quản lý Danh sách tài khoản demo</h3>
                <span className="text-[10px] bg-amber-500 text-espresso font-bold px-2 py-0.5 rounded">Admin Control Panel</span>
              </div>

              <div className="overflow-hidden border border-muted rounded-2xl">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-muted text-coffee font-bold">
                      <th className="p-4">Họ và tên</th>
                      <th className="p-4">Email</th>
                      <th className="p-4">Vai trò (Role)</th>
                      <th className="p-4">Gói Thuê (Rental)</th>
                      <th className="p-4 text-center">Thao tác đổi Role</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-muted bg-white">
                    {[
                      { name: "Nguyễn Thanh Linh", email: "linh.nguyen@gmail.com", role: userRole, plan: rentalPlan, isCurrent: true },
                      { name: "Minh Tú Vintage", email: "shop.minhtu@thriftit.vn", role: "seller", plan: "None", isCurrent: false },
                      { name: "Demo User", email: "demo@thriftit.vn", role: "buyer", plan: "None", isCurrent: false },
                    ].map((user) => (
                      <tr key={user.email} className={`hover:bg-gray-50/55 transition-colors ${user.isCurrent ? "bg-amber-50/30" : ""}`}>
                        <td className="p-4">
                          <p className="font-bold text-espresso text-sm">{user.name}</p>
                          {user.isCurrent && <span className="text-[9px] bg-amber-600 text-white font-bold px-1.5 py-0.5 rounded mt-1 inline-block">Đang đăng nhập</span>}
                        </td>
                        <td className="p-4 font-mono font-bold text-coffee">{user.email}</td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${user.role === "seller" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                            {user.role === "seller" ? "Người bán (Shop)" : "Người mua (Khách)"}
                          </span>
                        </td>
                        <td className="p-4 text-coffee font-bold">{user.plan}</td>
                        <td className="p-4 text-center">
                          {user.isCurrent ? (
                            <button
                              onClick={() => {
                                const switched = userRole === "buyer" ? "seller" : "buyer";
                                setUserRole(switched);
                                alert(`Đã chuyển đổi vai trò tài khoản hiện tại sang: ${switched === "seller" ? "Shop" : "Khách hàng"}`);
                              }}
                              className="px-3.5 py-1.5 rounded-xl text-[10px] font-bold text-white transition-all bg-espresso hover:opacity-90"
                            >
                              🔄 Chuyển sang {userRole === "buyer" ? "Shop" : "Khách"}
                            </button>
                          ) : (
                            <span className="text-muted-foreground text-[10px] italic">Yêu cầu đăng nhập để đổi</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── App Shell ──────────────────────────────────────────────────────────────────
export default function App() {
  // Load initial state from localStorage
  const storedUser = getStoredUser();
  const storedLiked = getStoredLikedProducts();
  const storedCart = getStoredCart();

  const [screen, setScreen] = useState<Screen>(() => {
    if (!storedUser.name) return "login";
    if (storedUser.email === "admin@thriftit.vn") return "admin";
    const savedScreen = localStorage.getItem("thriftit_screen");
    return (savedScreen as Screen) || "home";
  });
  
  const [products, setProducts] = useState<Product[]>(() => {
    // Apply stored liked products and active status
    return ALL_PRODUCTS.map(p => ({
      ...p,
      liked: storedLiked.includes(p.id),
      status: "active"
    }));
  });
  
  const [currentUser, setCurrentUser] = useState<string>(storedUser.name || "Nguyễn Thanh Linh");
  const [currentEmail, setCurrentEmail] = useState<string>(storedUser.email || "linh.nguyen@gmail.com");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null);
  const [cartGroups, setCartGroups] = useState<CartGroup[]>(storedCart || INIT_CART);
  const [activeTag, setActiveTag] = useState<string>(""); // Quick filter tag from header
  const [headerQuery, setHeaderQuery] = useState<string>(""); // Search query from header
  const [orders, setOrders] = useState<Order[]>([]);
  const [userRole, setUserRole] = useState<"buyer" | "seller">(() => {
    if (storedUser.email === "shop.minhtu@thriftit.vn") return "seller";
    return "buyer";
  });
  const [rentalPlan, setRentalPlan] = useState<string>(() => {
    if (storedUser.email === "linh.nguyen@gmail.com") return "Premium Rental";
    return "None";
  });
  const [mediaPlan, setMediaPlan] = useState<string>(() => {
    if (storedUser.email === "shop.minhtu@thriftit.vn") return "Standard Package";
    return "None";
  });
  const [mediaStatus, setMediaStatus] = useState<string>(() => {
    if (storedUser.email === "shop.minhtu@thriftit.vn") return "Đang chuẩn bị đạo cụ & lên lịch chụp (24/07)";
    return "";
  });
  const [rentedItems, setRentedItems] = useState<Array<{ id: number; name: string; image: string; rentDate: string; returnDate: string }>>(() => {
    if (storedUser.email === "linh.nguyen@gmail.com") {
      return [
        { id: 3, name: "Váy Hoa Retro Pastel Dáng A", image: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=120", rentDate: "15/07/2026", returnDate: "28/07/2026" },
        { id: 7, name: "Đầm Maxi Bohemian Floral", image: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=120", rentDate: "18/07/2026", returnDate: "30/07/2026" },
      ];
    }
    return [];
  });
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Split products list dynamically by account email to prevent mixing C2C listings and B2B shop listings!
  const [myProductsByEmail, setMyProductsByEmail] = useState<Record<string, SellerProduct[]>>({
    "linh.nguyen@gmail.com": [
      { id: 1, name: "Áo Khoác Denim Rửa Cũ 80s", price: 350000, quantity: 1, status: "active" as const, image: "https://images.unsplash.com/photo-1495105787522-5334e3ffa0ef?w=150", views: 127, likes: 12, createdAt: "2024-08-15" },
      { id: 2, name: "Quần Jean Ống Rộng Thập Niên 90", price: 220000, quantity: 2, status: "pending" as const, image: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=150", views: 43, likes: 5, createdAt: "2024-08-18" },
      { id: 3, name: "Áo Len Cổ Lọ Cozy", price: 210000, quantity: 1, status: "sold" as const, image: "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=150", views: 89, likes: 8, createdAt: "2024-08-10" },
    ],
    "shop.minhtu@thriftit.vn": [
      { id: 101, name: "Váy Lụa Slip Dress Vintage", price: 420000, quantity: 1, status: "active" as const, image: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=150", views: 245, likes: 34, createdAt: "2024-08-14" },
      { id: 102, name: "Blazer Dạ Oversize Caro", price: 580000, quantity: 1, status: "active" as const, image: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=150", views: 189, likes: 21, createdAt: "2024-08-16" }
    ],
    "demo@thriftit.vn": []
  });

  const myProducts = myProductsByEmail[currentEmail] || [];
  const setMyProducts = (newProds: React.SetStateAction<SellerProduct[]>) => {
    setMyProductsByEmail(prev => ({
      ...prev,
      [currentEmail]: typeof newProds === "function" ? (newProds as any)(prev[currentEmail] || []) : newProds
    }));
  };

  // State hooks for pricing purchase checkout flow simulation
  const [checkoutPlan, setCheckoutPlan] = useState<{ type: "rental" | "media"; name: string; price: number } | null>(null);
  const [paymentStep, setPaymentStep] = useState<"checkout" | "processing" | "success">("checkout");
  const [selectedPayMethod, setSelectedPayMethod] = useState<string>("MoMo");

  const handleAddProduct = (newProd: { name: string; price: number; category: string; desc: string; size: string; condition: number; image: string }) => {
    const newId = products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1;
    const sellerHandle = currentEmail === "shop.minhtu@thriftit.vn" ? "minhtu.vintage" : "linh.vintage";
    
    const addedProduct: Product = {
      id: newId,
      name: newProd.name,
      price: newProd.price,
      seller: sellerHandle,
      condition: newProd.condition,
      size: newProd.size,
      category: newProd.category,
      image: newProd.image,
      liked: false,
      status: "pending"
    };
    setProducts((prev) => [addedProduct, ...prev]);

    const newSellerProd: SellerProduct = {
      id: newId,
      name: newProd.name,
      price: newProd.price,
      quantity: 1,
      status: "pending" as const,
      image: newProd.image,
      views: 0,
      likes: 0,
      createdAt: new Date().toLocaleDateString("vi-VN"),
    };
    setMyProducts((prev) => [newSellerProd, ...prev]);

    setToastMsg(`Đã gửi yêu cầu đăng bán sản phẩm "${newProd.name}". Admin sẽ duyệt tin của bạn trong thời gian sớm nhất!`);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const go = (s: Screen, product?: Product, seller?: Seller) => {
    if (currentEmail === "admin@thriftit.vn" && s !== "admin" && s !== "login") {
      setScreen("admin");
      localStorage.setItem("thriftit_screen", "admin");
      return;
    }
    if (product) setSelectedProduct(product);
    if (seller) setSelectedSeller(seller);
    setScreen(s);
    localStorage.setItem("thriftit_screen", s);
  };

  const goToSearchWithTag = (tag: string) => {
    setActiveTag(tag);
    setScreen("search");
  };

  const toggleLike = (id: number) => {
    setProducts((prev) => {
      const updated = prev.map((p) => p.id === id ? { ...p, liked: !p.liked } : p);
      // Save to localStorage
      const likedIds = updated.filter(p => p.liked).map(p => p.id);
      setStoredLikedProducts(likedIds);
      return updated;
    });
  };

  const updateCart = (newCart: CartGroup[]) => {
    setCartGroups(newCart);
    setStoredCart(newCart);
  };

  const addToCart = (product: Product, qty: number = 1, buyOrRent: "buy" | "rent" = "buy") => {
    setToastMsg(buyOrRent === "rent" ? `Đã thêm dịch vụ Thuê "${product.name}" vào giỏ hàng!` : `Đã thêm ${qty} x "${product.name}" vào giỏ hàng!`);
    setTimeout(() => setToastMsg(null), 2500);

    const existingGroup = cartGroups.find(g => g.seller === product.seller);
    
    if (existingGroup) {
      const existingItem = existingGroup.items.find(i => i.id === product.id && i.buyOrRent === buyOrRent);
      if (existingItem) {
        const newCart = cartGroups.map(g => {
          if (g.seller === product.seller) {
            return {
              ...g,
              items: g.items.map(i => (i.id === product.id && i.buyOrRent === buyOrRent) ? { ...i, qty: i.qty + qty } : i)
            };
          }
          return g;
        });
        updateCart(newCart);
      } else {
        const newCart = cartGroups.map(g => {
          if (g.seller === product.seller) {
            return {
              ...g,
              items: [...g.items, {
                id: product.id,
                name: product.name,
                price: buyOrRent === "rent" ? 0 : product.price,
                size: product.size,
                qty,
                image: product.image,
                checked: false,
                condition: product.condition,
                buyOrRent
              }]
            };
          }
          return g;
        });
        updateCart(newCart);
      }
    } else {
      const newCart = [...cartGroups, {
        seller: product.seller,
        items: [{
          id: product.id,
          name: product.name,
          price: buyOrRent === "rent" ? 0 : product.price,
          size: product.size,
          qty,
          image: product.image,
          checked: false,
          condition: product.condition,
          buyOrRent
        }]
      }];
      updateCart(newCart);
    }
  };

  const handleRentProduct = (product: Product) => {
    if (rentalPlan === "None") {
      alert("Vui lòng đăng ký Gói thuê bao thành viên (Rental Plan) trong tài khoản của bạn để thuê sản phẩm này với giá 0₫!");
      go("account");
      return;
    }

    if (rentedItems.some(item => item.id === product.id)) {
      alert("Bạn đã thuê sản phẩm này rồi!");
      return;
    }

    if (rentedItems.length >= 4) {
      alert("Bạn đã thuê tối đa 4 sản phẩm cùng lúc. Vui lòng trả bớt sản phẩm cũ trước khi thuê thêm.");
      return;
    }

    addToCart(product, 1, "rent");
  };

  const cartCount = cartGroups.flatMap((g) => g.items).filter((i) => i.checked).length;
  const showHeader = screen !== "login" && screen !== "register";

  const handleLogin = (userName: string, userEmail: string) => {
    setCurrentUser(userName);
    setCurrentEmail(userEmail);
    setStoredUser(userName, userEmail);

    if (userEmail === "linh.nguyen@gmail.com") {
      setUserRole("buyer");
      setRentalPlan("Premium Rental");
      setMediaPlan("None");
      setRentedItems([
        { id: 3, name: "Váy Hoa Retro Pastel Dáng A", image: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=120", rentDate: "15/07/2026", returnDate: "28/07/2026" },
        { id: 7, name: "Đầm Maxi Bohemian Floral", image: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=120", rentDate: "18/07/2026", returnDate: "30/07/2026" },
      ]);
    } else if (userEmail === "shop.minhtu@thriftit.vn") {
      setUserRole("seller");
      setRentalPlan("None");
      setMediaPlan("Standard Package");
      setMediaStatus("Đang chuẩn bị đạo cụ & lên lịch chụp (24/07)");
      setRentedItems([]);
    } else {
      setUserRole("buyer");
      setRentalPlan("None");
      setMediaPlan("None");
      setRentedItems([]);
    }

    if (userEmail === "admin@thriftit.vn") {
      go("admin");
    } else {
      go("home");
    }
  };

  const handleLogout = () => {
    setCurrentUser("Nguyễn Thanh Linh");
    setCurrentEmail("linh.nguyen@gmail.com");
    setUserRole("buyer");
    setRentalPlan("Premium Rental");
    setMediaPlan("None");
    setRentedItems([
      { id: 3, name: "Váy Hoa Retro Pastel Dáng A", image: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=120", rentDate: "15/07/2026", returnDate: "28/07/2026" },
      { id: 7, name: "Đầm Maxi Bohemian Floral", image: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=120", rentDate: "18/07/2026", returnDate: "30/07/2026" },
    ]);
    clearStoredUser();
    localStorage.removeItem("thriftit_screen");
    go("login");
  };

  const addOrder = (orderItems: OrderItem[], total: number, paymentMethod: string) => {
    const newOrder: Order = {
      id: `ORD-${Date.now().toString().slice(-6)}`,
      items: orderItems,
      total,
      status: "shipping",
      createdAt: new Date().toLocaleDateString("vi-VN"),
      paymentMethod,
    };
    setOrders(prev => [newOrder, ...prev]);

    // Handle adding checked rental items to rentedItems
    const checkedCartRentedItems = cartGroups.flatMap(g => g.items).filter(i => i.checked && i.buyOrRent === "rent");
    if (checkedCartRentedItems.length > 0) {
      const newRented = checkedCartRentedItems.map(item => ({
        id: item.id,
        name: item.name,
        image: item.image,
        rentDate: new Date().toLocaleDateString("vi-VN"),
        returnDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString("vi-VN")
      }));
      setRentedItems(prev => [...newRented, ...prev]);
    }
  };

  const handleOpenCheckoutPlan = (type: "rental" | "media", name: string, price: number) => {
    setCheckoutPlan({ type, name, price });
    setPaymentStep("checkout");
  };

  return (
    <div className="w-full max-w-[1440px] mx-auto min-w-[320px] shadow-sm relative" style={{ backgroundColor: LINEN, ...ff }}>
      {toastMsg && (
        <div className="fixed top-24 right-8 z-[9999] px-6 py-4 rounded-2xl shadow-xl flex items-center gap-3 animate-fade-in-down transition-all"
             style={{ backgroundColor: ESPRESSO, color: LINEN, border: `1.5px solid ${T}` }}>
          <Sparkles size={18} style={{ color: T }} />
          <span className="text-sm font-bold">{toastMsg}</span>
        </div>
      )}

      {checkoutPlan && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl relative animate-scale-up">
            {/* Step 1: Selecting Payment Method & QR Code */}
            {paymentStep === "checkout" && (
              <div>
                <h3 className="text-xl font-bold mb-4 font-serif" style={{ ...serif, color: ESPRESSO }}>Thanh toán dịch vụ</h3>
                <div className="p-4 rounded-xl mb-4" style={{ backgroundColor: SOFT }}>
                  <p className="text-xs text-coffee">Gói đăng ký:</p>
                  <p className="text-sm font-bold">{checkoutPlan.name}</p>
                  <p className="text-sm font-bold text-amber-700 mt-1">{fmt(checkoutPlan.price)}</p>
                </div>

                <p className="text-xs font-bold mb-2">Chọn phương thức thanh toán:</p>
                <div className="grid grid-cols-3 gap-2.5 mb-6">
                  {["MoMo", "ZaloPay", "Ngân hàng"].map((method) => (
                    <button
                      key={method}
                      onClick={() => setSelectedPayMethod(method)}
                      className="py-2.5 rounded-xl border text-xs font-semibold transition-all"
                      style={{
                        borderColor: selectedPayMethod === method ? T : MUTED,
                        backgroundColor: selectedPayMethod === method ? `${T}11` : "white",
                        color: selectedPayMethod === method ? T : COFFEE,
                        ...ff
                      }}
                    >
                      {method}
                    </button>
                  ))}
                </div>

                {/* QR Code Simulation */}
                <div className="flex flex-col items-center p-4 rounded-2xl bg-gray-50 border border-dashed mb-6">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=thriftit-${checkoutPlan.type}-${checkoutPlan.price}`}
                    alt="Payment QR Code"
                    className="w-36 h-36 object-contain"
                  />
                  <p className="text-[10px] text-muted-foreground mt-2 font-semibold">Quét mã QR bằng ứng dụng ngân hàng hoặc ví điện tử</p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setCheckoutPlan(null)}
                    className="flex-1 py-3 rounded-xl text-xs font-bold border-2 transition-all hover:bg-gray-100"
                    style={{ borderColor: MUTED, color: COFFEE }}
                  >
                    Hủy bỏ
                  </button>
                  <button
                    onClick={() => {
                      setPaymentStep("processing");
                      setTimeout(() => {
                        setPaymentStep("success");
                        // Apply changes
                        if (checkoutPlan.type === "rental") {
                          setRentalPlan(checkoutPlan.name);
                        } else {
                          setMediaPlan(checkoutPlan.name);
                          setMediaStatus("Đang chuẩn bị đạo cụ & lên lịch chụp (24/07)");
                          setUserRole("seller"); // Automatically upgrade to seller role so they can see the "Dịch vụ Media" tab!
                        }
                      }, 2000);
                    }}
                    className="flex-1 py-3 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90"
                    style={{ backgroundColor: T }}
                  >
                    Xác nhận đã chuyển khoản
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Processing Spinner */}
            {paymentStep === "processing" && (
              <div className="flex flex-col items-center py-12">
                <div className="w-12 h-12 border-4 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
                <h4 className="text-base font-bold mt-6" style={ff}>Đang xác thực giao dịch...</h4>
                <p className="text-xs text-muted-foreground mt-1">Hệ thống đang kiểm tra số dư tài khoản</p>
              </div>
            )}

            {/* Step 3: Success Screen */}
            {paymentStep === "success" && (
              <div className="text-center py-6">
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto text-3xl font-bold">✓</div>
                <h4 className="text-lg font-bold mt-6 font-serif" style={{ ...serif, color: ESPRESSO }}>Kích hoạt dịch vụ thành công!</h4>
                <p className="text-xs text-coffee mt-2 px-4 leading-relaxed" style={ff}>
                  Cảm ơn bạn đã lựa chọn dịch vụ của thrift it!. Gói cước <strong style={{ color: T }}>{checkoutPlan.name}</strong> đã được kích hoạt tức thì.
                </p>
                <button
                  onClick={() => {
                    setCheckoutPlan(null);
                    setPaymentStep("checkout");
                    go("account");
                  }}
                  className="w-full mt-8 py-3 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90"
                  style={{ backgroundColor: T }}
                >
                  Truy cập trang cá nhân
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {(screen === "login" || screen === "register") ? (
        screen === "register" ? (
          <RegisterScreen onRegister={handleLogin} onBack={() => go("login")} />
        ) : (
          <LoginScreen onLogin={handleLogin} onRegister={() => go("register")} />
        )
      ) : (
        <>
          {screen !== "admin" && <Header screen={screen} go={go} cartCount={cartCount} activeTag={activeTag} onTagChange={goToSearchWithTag} headerQuery={headerQuery} setHeaderQuery={setHeaderQuery} currentUserEmail={currentEmail} />}
          <main>
            {screen === "home" && <HomeScreen go={go} products={products.filter(p => p.status !== "pending")} onLike={toggleLike} onAddToCart={addToCart} />}
            {screen === "search" && <SearchScreen products={products.filter(p => p.status !== "pending")} onLike={toggleLike} go={go} onAddToCart={addToCart} activeTag={activeTag} headerQuery={headerQuery} />}
            {screen === "cart" && <CartScreen go={go} cartGroups={cartGroups} updateCart={updateCart} />}
            {screen === "chat" && <ChatScreen />}
            {screen === "notification" && <NotificationScreen go={go} />}
            {screen === "product-detail" && selectedProduct && <ProductDetailScreen product={selectedProduct} go={go} onLike={toggleLike} onAddToCart={addToCart} rentalPlan={rentalPlan} onRentProduct={handleRentProduct} />}
            {screen === "seller" && selectedSeller && <SellerScreen seller={selectedSeller} go={go} products={products.filter(p => p.status !== "pending")} onAddToCart={addToCart} />}
            {screen === "payment" && <PaymentScreen go={go} cartGroups={cartGroups} updateCart={updateCart} addOrder={addOrder} />}
            {screen === "account" && <AccountScreen go={go} onLogout={handleLogout} userName={currentUser} userEmail={currentEmail} orders={orders} myProducts={myProducts} setMyProducts={setMyProducts} userRole={userRole} setUserRole={setUserRole} rentalPlan={rentalPlan} mediaPlan={mediaPlan} mediaStatus={mediaStatus} setMediaStatus={setMediaStatus} rentedItems={rentedItems} setRentedItems={setRentedItems} onOpenCheckoutPlan={handleOpenCheckoutPlan} />}
            {screen === "post" && <PostScreen go={go} onAddProduct={handleAddProduct} />}
            {screen === "pricing" && <PricingScreen go={go} rentalPlan={rentalPlan} mediaPlan={mediaPlan} onOpenCheckoutPlan={handleOpenCheckoutPlan} />}
            {screen === "admin" && <AdminScreen go={go} products={products} setProducts={setProducts} mediaPlan={mediaPlan} setMediaPlan={setMediaPlan} mediaStatus={mediaStatus} setMediaStatus={setMediaStatus} myProductsByEmail={myProductsByEmail} setMyProductsByEmail={setMyProductsByEmail} rentalPlan={rentalPlan} setRentalPlan={setRentalPlan} userRole={userRole} setUserRole={setUserRole} onLogout={handleLogout} />}
          </main>
          {screen !== "cart" && screen !== "payment" && screen !== "admin" && <Footer go={go} />}
        </>
      )}
    </div>
  );
}
