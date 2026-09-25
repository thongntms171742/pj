import type {
  Contact,
  ChatMessage,
} from "../types";

// ── Contacts list (chat) ───────────────────────────────────────────────────────
export const CONTACTS: Contact[] = [
  { id: 1, name: "minhtu.vintage", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&auto=format", lastMsg: "Bạn có thể chụp thêm ảnh chi tiết không?", time: "3 phút", unread: 2, product: { name: "Áo Linen Trắng Cổ Điển 1994", price: 185000, image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=80&h=80&fit=crop&auto=format" } },
  { id: 2, name: "saigon.thrift", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&auto=format", lastMsg: "Đã xác nhận và đang chuẩn bị hàng", time: "1 giờ", unread: 0, product: { name: "Quần Jean Ống Rộng 90", price: 220000, image: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=80&h=80&fit=crop&auto=format" } },
  { id: 3, name: "hanoi.preloved", avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&h=80&fit=crop&auto=format", lastMsg: "Giá có thể thương lượng không ạ?", time: "Hôm qua", unread: 1, product: { name: "Váy Hoa Retro Pastel", price: 160000, image: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=80&h=80&fit=crop&auto=format" } },
];

// ── Chat messages per contact ──────────────────────────────────────────────────
export const CHAT_MSGS: Record<number, ChatMessage[]> = {
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

// ── Quick filter tags used by header & search ─────────────────────────────────
export const FILTER_TAGS = ["Tất cả", "Áo", "Quần", "Váy", "Áo khoác", "Phụ kiện", "Độ mới >90%", "Gần đây"];
