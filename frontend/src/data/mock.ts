import type {
  Product,
  Seller,
  CartGroup,
  Order,
  MockAccount,
  Contact,
  ChatMessage,
} from "../types";

// ── Mock products (vintage thrift catalogue) ──────────────────────────────────
export const ALL_PRODUCTS: Product[] = [
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

// ── Mock sellers ───────────────────────────────────────────────────────────────
export const SELLERS: Seller[] = [
  { id: 1, handle: "minhtu.vintage", name: "Minh Tú Vintage", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&auto=format", rating: 4.9, transactions: 234, thumbs: ["https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=90&h=90&fit=crop", "https://images.unsplash.com/photo-1495105787522-5334e3ffa0ef?w=90&h=90&fit=crop", "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=90&h=90&fit=crop"] },
  { id: 2, handle: "saigon.thrift", name: "Sài Gòn Thrift", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&auto=format", rating: 4.8, transactions: 187, thumbs: ["https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=90&h=90&fit=crop", "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=90&h=90&fit=crop", "https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=90&h=90&fit=crop"] },
  { id: 3, handle: "hanoi.preloved", name: "Hà Nội Pre-loved", avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop&auto=format", rating: 4.7, transactions: 156, thumbs: ["https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=90&h=90&fit=crop", "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=90&h=90&fit=crop", "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=90&h=90&fit=crop"] },
  { id: 4, handle: "vintage.corner", name: "Vintage Corner HCM", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&auto=format", rating: 4.9, transactions: 312, thumbs: ["https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=90&h=90&fit=crop", "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=90&h=90&fit=crop", "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=90&h=90&fit=crop"] },
];

// ── Initial cart ───────────────────────────────────────────────────────────────
export const INIT_CART: CartGroup[] = [
  { seller: "minhtu.vintage", items: [
    { id: 1, name: "Áo Linen Trắng Cổ Điển 1994", price: 185000, size: "M", qty: 1, condition: 85, image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=100&h=100&fit=crop&auto=format", checked: true },
    { id: 4, name: "Áo Khoác Denim Rửa Cũ 80s", price: 350000, size: "M", qty: 1, condition: 80, image: "https://images.unsplash.com/photo-1495105787522-5334e3ffa0ef?w=100&h=100&fit=crop&auto=format", checked: true },
  ]},
  { seller: "saigon.thrift", items: [
    { id: 2, name: "Quần Jean Ống Rộng Thập Niên 90", price: 220000, size: "L", qty: 1, condition: 90, image: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=100&h=100&fit=crop&auto=format", checked: true },
    { id: 5, name: "Blazer Tweed Cổ Điển", price: 420000, size: "M", qty: 1, condition: 92, image: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=100&h=100&fit=crop&auto=format", checked: false },
  ]},
];

// ── Demo accounts (per business model revenue stream) ─────────────────────────
export const MOCK_ACCOUNTS: MockAccount[] = [
  { email: "linh.nguyen@gmail.com", password: "123456", name: "Nguyễn Thanh Linh" },
  { email: "shop.minhtu@thriftit.vn", password: "shop123", name: "Minh Tú Vintage" },
  { email: "demo@thriftit.vn", password: "demo123", name: "Demo User" },
  { email: "admin@thriftit.vn", password: "admin", name: "Admin" },
];

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

// ── Notifications ──────────────────────────────────────────────────────────────
export const MOCK_NOTIFICATIONS = [
  { id: 1, type: "order", title: "Đơn hàng đã được xác nhận", desc: "Đơn hàng #ORD-20240876 đã được shop xác nhận và đang chuẩn bị hàng", time: "5 phút trước", read: false, icon: "Package" },
  { id: 2, type: "chat", title: "Tin nhắn mới từ minhtu.vintage", desc: "Bạn có tin nhắn mới: Hàng đã được đóng gói xong rồi bạn nhé!", time: "15 phút trước", read: false, icon: "MessageCircle" },
  { id: 3, type: "promo", title: "Mã giảm giá 15% cho đơn hàng đầu tiên", desc: "Sử dụng mã NEWMEMBER15 để được giảm 15% cho đơn hàng đầu tiên. Hết hạn sau 7 ngày.", time: "1 giờ trước", read: false, icon: "Percent" },
  { id: 4, type: "system", title: "Cập nhật ứng dụng", desc: "thrift it! vừa cập nhật phiên bản mới với nhiều cải tiến giao diện", time: "Hôm qua", read: true, icon: "Bell" },
  { id: 5, type: "order", title: "Đơn hàng đang được giao", desc: "Đơn hàng #ORD-20240855 đang được GHN vận chuyển. Dự kiến giao trong 2-3 ngày.", time: "Hôm qua", read: true, icon: "Truck" },
  { id: 6, type: "review", title: "Nhắc đánh giá sản phẩm", desc: "Cảm ơn bạn đã mua sắm! Hãy đánh giá sản phẩm để giúp người mua khác có thêm thông tin nhé.", time: "2 ngày trước", read: true, icon: "Star" },
] as const;

// ── Seed orders (history shown on the buyer account) ──────────────────────────
export const INIT_ORDERS: Order[] = [
  { id: "ORD-20240876", items: [{ id: "1", name: "Quần Jean Ống Rộng 90", price: 220000, size: "M", qty: 1, image: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=100", condition: 85, seller: "saigon.thrift" }], total: 250000, status: "shipping", createdAt: "2024-08-16", paymentMethod: "Vietcombank" },
  { id: "ORD-20240865", items: [{ id: "2", name: "Váy Hoa Retro Pastel", price: 160000, size: "S", qty: 1, image: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=100", condition: 90, seller: "hanoi.preloved" }], total: 190000, status: "shipping", createdAt: "2024-08-15", paymentMethod: "Techcombank" },
  { id: "ORD-20240855", items: [{ id: "3", name: "Áo Linen Trắng 1994", price: 185000, size: "L", qty: 1, image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=100", condition: 95, seller: "minhtu.vintage" }], total: 215000, status: "delivering", createdAt: "2024-08-14", paymentMethod: "Vietcombank" },
  { id: "ORD-20240820", items: [{ id: "4", name: "Áo Phông Band Tee 90s", price: 95000, size: "M", qty: 1, image: "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=100", condition: 88, seller: "minhtu.vintage" }], total: 125000, status: "review", createdAt: "2024-08-10", paymentMethod: "MB Bank" },
  { id: "ORD-20240810", items: [{ id: "5", name: "Áo Len Cổ Lọ Cozy", price: 210000, size: "M", qty: 1, image: "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=100", condition: 92, seller: "vintage.corner" }], total: 240000, status: "review", createdAt: "2024-08-08", paymentMethod: "Vietcombank" },
  { id: "ORD-20240800", items: [{ id: "6", name: "Áo Khoác Denim Rửa Cũ", price: 350000, size: "L", qty: 1, image: "https://images.unsplash.com/photo-1495105787522-5334e3ffa0ef?w=100", condition: 80, seller: "minhtu.vintage" }], total: 380000, status: "review", createdAt: "2024-08-05", paymentMethod: "Techcombank" },
];

// ── Quick filter tags used by header & search ─────────────────────────────────
export const FILTER_TAGS = ["Tất cả", "Áo", "Quần", "Váy", "Áo khoác", "Phụ kiện", "Độ mới >90%", "Gần đây"];
