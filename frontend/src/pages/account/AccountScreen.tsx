import React, { useState, useEffect, useCallback } from "react";
import {
  Clock, Package, Truck, Star, X, Store, Edit3, LogOut, Plus,
  ShoppingBag, MessageCircle, MapPin, TrendingUp, Heart,
  Eye, DollarSign, Shield, PlusCircle, ExternalLink, MapPinned
} from "lucide-react";
import { T, ESPRESSO, COFFEE, LINEN, CARD, MUTED, SOFT, serif, ff, fmt } from "../../lib/theme";
import { getOrderTabStatus } from "../../lib/adapters";
import { api } from "../../lib/api";
import type { Screen, Order, OrderItem, SellerProduct, Shipment } from "../../types";

// ── Account Screen ──────────────────────────────────────────────────────────────
export function AccountScreen({
  go,
  onLogout,
  userName = "Nguyễn Thanh Linh",
  userEmail = "linh.nguyen@gmail.com",
  orders = [],
  myProducts,
  setMyProducts,
  userRole,
  setUserRole,
  onUpdateOrderStatus
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
  showToast?: (msg: string) => void;
  onUpdateOrderStatus?: (orderId: string, status: Order["status"]) => void;
}) {
  // ── State quản lý ──────────────────────────────────────────────────────────
  const [accountTab, setAccountTab] = useState<string>(
    userRole === "seller" ? "selling" : "purchases"
  );
  const [orderTab, setOrderTab] = useState<"pending" | "shipping" | "delivering" | "review" | "cancelled">("shipping");
  const [sellingTab, setSellingTab] = useState<"all" | "active" | "pending" | "sold">("all");

  useEffect(() => {
    setAccountTab(userRole === "seller" ? "selling" : "purchases");
  }, [userRole]);

  // ── Quản lý địa chỉ ───────────────────────────────────────────────────────
  const [addresses, setAddresses] = useState([
    { id: 1, label: "Nhà riêng", name: "Nguyễn Thanh Linh", phone: "0909XXX123", province: "TP. Hồ Chí Minh", district: "Quận 10", detail: "123 Đường Nguyễn Trãi", isDefault: true },
    { id: 2, label: "Văn phòng", name: "Nguyễn Thanh Linh", phone: "0909XXX123", province: "TP. Hồ Chí Minh", district: "Quận 3", detail: "456 Đường Lý Thường Kiệt", isDefault: false },
  ]);

  // ── Seller orders (fetched when user switches to "selling" tab) ──
  const [sellerOrders, setSellerOrders] = useState<Order[]>([]);
  const [sellerOrdersLoading, setSellerOrdersLoading] = useState(false);

  const loadSellerOrders = useCallback(async () => {
    setSellerOrdersLoading(true);
    try {
      const res = await api.get<{ orders: import("../../lib/api").ApiOrder[] }>("/orders/seller");
      setSellerOrders(res.orders.map((o) => ({
        id: o.orderCode,
        apiId: o._id,
        items: o.items.map((it): OrderItem => ({
          id: it.productId,
          name: it.productName,
          price: it.unitPrice,
          size: "",
          qty: it.quantity,
          image: it.productImageUrl ?? "",
          condition: it.conditionSnapshot ?? 0,
          seller: "",
        })),
        total: o.totalAmount,
        status: o.status as Order["status"],
        createdAt: new Date(o.createdAt).toLocaleDateString("vi-VN"),
        paymentMethod: o.paymentMethod ?? "",
        shippingName: o.shippingName,
        shippingPhone: o.shippingPhone,
        shippingAddress: o.shippingAddress,
      })));
    } catch {
      // fail silently — seller may not have orders yet
    } finally {
      setSellerOrdersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (accountTab === "selling") {
      loadSellerOrders();
    }
  }, [accountTab, loadSellerOrders]);

  // ── Seller shipment creation dialog ──
  const [shipDialogOrder, setShipDialogOrder] = useState<Order | null>(null);
  const [shipDialogPickup, setShipDialogPickup] = useState({
    name: "Cửa hàng của tôi",
    phone: "0909000000",
    address: "",
    province: "TP. Hồ Chí Minh",
    district: "",
    ward: "",
    email: "",
  });
  const [shipCreating, setShipCreating] = useState(false);
  const [shipError, setShipError] = useState("");

  const handleSellerUpdateStatus = (orderId: string, nextStatus: Order["status"]) => {
    setSellerOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o))
    );
    onUpdateOrderStatus?.(orderId, nextStatus);
  };

  const handleCreateShipment = async () => {
    if (!shipDialogOrder) return;
    setShipCreating(true);
    setShipError("");
    try {
      const res = await api.post<{ shipment: Shipment }>(`/orders/${shipDialogOrder.id}/shipment`, {
        pickup: shipDialogPickup,
      });
      // Update local order status to reflect SHIPPING
      setSellerOrders((prev) =>
        prev.map((o) => (o.id === shipDialogOrder.id ? { ...o, status: "SHIPPING" as const } : o))
      );
      onUpdateOrderStatus?.(shipDialogOrder.id, "SHIPPING");
      setShipDialogOrder(null);
      showToast?.(`✓ Đã tạo vận đơn cho #${shipDialogOrder.id}. Đơn hàng đang được vận chuyển!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Tạo vận đơn thất bại";
      setShipError(msg);
    } finally {
      setShipCreating(false);
    }
  };

  // ── Shipping shipments (fetched per order when order tab = shipping) ──
  const [shipments, setShipments] = useState<Record<string, Shipment>>({});
  const [shipmentsLoading, setShipmentsLoading] = useState(false);

  // Fetch shipment for an order when the user lands on "shipping" tab.
  const fetchShipment = useCallback(async (orderCode: string) => {
    if (shipments[orderCode]) return; // already loaded
    setShipmentsLoading(true);
    try {
      const res = await api.get<{ shipment: Shipment }>(`/orders/${orderCode}/shipment`);
      setShipments((prev) => ({ ...prev, [orderCode]: res.shipment }));
    } catch {
      // No shipment yet — that's fine.
    } finally {
      setShipmentsLoading(false);
    }
  }, [shipments]);

  // ── Đơn hàng & filter ──
  const allOrders = orders;
  const filteredOrders = allOrders.filter((o) => getOrderTabStatus(o.status) === orderTab);

  // Auto-fetch shipments for all "shipping" orders when tab opens.
  useEffect(() => {
    if (orderTab === "shipping") {
      filteredOrders.forEach((o) => fetchShipment(o.id));
    }
  }, [orderTab, filteredOrders, fetchShipment]);

  // ── Status badge helpers ──
  const shipmentStatusLabel: Record<string, { label: string; color: string; bg: string }> = {
    PENDING:    { label: "Chờ tạo vận đơn",  color: "#6B7280", bg: "#F3F4F6" },
    CREATED:    { label: "Đã tạo vận đơn",   color: T,          bg: T + "18" },
    PICKED_UP:  { label: "Đã lấy hàng",       color: "#2980B9", bg: "#EBF5FF" },
    IN_TRANSIT: { label: "Đang vận chuyển",   color: "#2980B9", bg: "#EBF5FF" },
    DELIVERING: { label: "Đang giao hàng",     color: "#27AE60", bg: "#E9F7EF" },
    DELIVERED:  { label: "Đã giao hàng",      color: "#27AE60", bg: "#E9F7EF" },
    RETURNED:   { label: "Hoàn trả",          color: "#E67E22", bg: "#FEF9E7" },
    CANCELLED:  { label: "Đã hủy vận đơn",   color: "#E74C3C", bg: "#FDEDEC" },
    FAILED:     { label: "Lỗi vận đơn",      color: "#E74C3C", bg: "#FDEDEC" },
  };

  // ── Tin nhắn từ người mua ─────────────────────────────────────────────────
  const [messages] = useState([
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

  // ── Tính số đơn theo tab ───────────────────────────────────────────────────
  const orderCounts = {
    pending: allOrders.filter((o) => getOrderTabStatus(o.status) === "pending").length,
    shipping: allOrders.filter((o) => getOrderTabStatus(o.status) === "shipping").length,
    delivering: allOrders.filter((o) => getOrderTabStatus(o.status) === "delivering").length,
    review: allOrders.filter((o) => getOrderTabStatus(o.status) === "review").length,
    cancelled: allOrders.filter((o) => getOrderTabStatus(o.status) === "cancelled").length,
  };

  const orderTabs = [
    { id: "pending" as const, label: "Chờ thanh toán", icon: Clock, count: orderCounts.pending, color: "#E8A838" },
    { id: "shipping" as const, label: "Vận chuyển", icon: Package, count: orderCounts.shipping, color: T },
    { id: "delivering" as const, label: "Đang giao", icon: Truck, count: orderCounts.delivering, color: "#2980B9" },
    { id: "review" as const, label: "Đánh giá", icon: Star, count: orderCounts.review, color: "#27AE60" },
    { id: "cancelled" as const, label: "Đã hủy", icon: X, count: orderCounts.cancelled, color: "#E74C3C" },
  ];

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
      cancelled: "Đã hủy đơn",
    };
    return labels[status] || status;
  };

  const unreadMessages = messages.filter(m => m.unread).length;

  // ── Render ──
  const shipmentDialog = shipDialogOrder ? (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={() => !shipCreating && setShipDialogOrder(null)}
    >
      <div
        className="rounded-2xl shadow-2xl p-6 max-w-md w-full"
        style={{ backgroundColor: LINEN }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold mb-1" style={{ ...serif, color: ESPRESSO }}>
          Tạo vận đơn cho #{shipDialogOrder.id}
        </h3>
        <p className="text-xs mb-4" style={{ color: COFFEE }}>
          Vận đơn sẽ được gửi đến đơn vị vận chuyển. Bạn không thể sửa sau khi tạo.
        </p>
        <div className="space-y-3">
          {[
            { key: "name" as const, label: "Tên cửa hàng" },
            { key: "phone" as const, label: "Số điện thoại" },
            { key: "address" as const, label: "Địa chỉ lấy hàng" },
            { key: "province" as const, label: "Tỉnh/Thành" },
            { key: "district" as const, label: "Quận/Huyện" },
            { key: "ward" as const, label: "Phường/Xã (tùy chọn)" },
            { key: "email" as const, label: "Email (tùy chọn)" },
          ].map((field) => (
            <div key={field.key}>
              <label className="text-xs font-semibold" style={{ color: COFFEE, ...ff }}>{field.label}</label>
              <input
                value={shipDialogPickup[field.key]}
                onChange={(e) => setShipDialogPickup((prev) => ({ ...prev, [field.key]: e.target.value }))}
                className="w-full mt-1 px-3 py-2 rounded-lg text-sm border outline-none"
                style={{ borderColor: MUTED, ...ff }}
                disabled={shipCreating}
              />
            </div>
          ))}
        </div>
        {shipError && (
          <div className="mt-3 p-2 rounded-lg text-xs" style={{ backgroundColor: "#FDEDEC", color: "#E74C3C" }}>
            ⚠️ {shipError}
          </div>
        )}
        <div className="mt-5 flex gap-2 justify-end">
          <button
            onClick={() => setShipDialogOrder(null)}
            disabled={shipCreating}
            className="px-4 py-2 rounded-xl text-sm font-semibold border"
            style={{ borderColor: MUTED, color: COFFEE, ...ff }}
          >
            Hủy
          </button>
          <button
            onClick={handleCreateShipment}
            disabled={shipCreating || !shipDialogPickup.address || !shipDialogPickup.district}
            className="px-4 py-2 rounded-xl text-sm font-bold transition-all hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: T, color: LINEN, ...ff }}
          >
            {shipCreating ? "Đang tạo…" : "Tạo vận đơn"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="min-h-screen" style={{ backgroundColor: LINEN }}>
      {/* Profile header */}
      <div style={{ background: `linear-gradient(135deg, ${ESPRESSO} 0%, ${COFFEE} 100%)` }}>
        <div className="max-w-[1440px] mx-auto px-8 py-8 flex items-center gap-6">
          <div className="relative">
            <img
              src={userEmail === "admin@thriftit.vn"
                ? "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=160&h=160&fit=crop&auto=format"
                : "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=160&h=160&fit=crop&auto=format"}
              alt="Avatar"
              className="w-24 h-24 rounded-full object-cover border-4 shadow-lg"
              style={{ borderColor: T }}
            />
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
                <span className="text-sm px-2.5 py-0.5 rounded-full font-bold bg-amber-500 text-espresso" style={ff}>Hệ thống Admin</span>
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
                <span className="text-sm px-2.5 py-0.5 rounded-full" style={{ backgroundColor: T + "33", color: T, ...ff }}>Seller uy tín</span>
              </div>
            )}
          </div>
          <div className="ml-auto flex items-center gap-3">
            {userEmail !== "admin@thriftit.vn" ? (
              <>
                {/* Toggle Buyer / Seller mode */}
                <button
                  onClick={() => {
                    const newRole = userRole === "buyer" ? "seller" : "buyer";
                    setUserRole(newRole);
                  }}
                  className="flex items-center gap-2.5 px-4 py-3 rounded-xl font-semibold text-sm border-2 transition-all"
                  style={{
                    borderColor: T,
                    color: T,
                    backgroundColor: "transparent",
                    ...ff
                  }}
                >
                  <Store size={15} />
                  {userRole === "buyer" ? "Kênh người bán" : "Kênh người mua"}
                </button>

                <button
                  onClick={() => go("post")}
                  className="flex items-center gap-2.5 px-5 py-3 rounded-xl font-bold text-sm shadow-lg transition-all hover:opacity-90"
                  style={{ backgroundColor: T, color: LINEN, ...ff }}
                >
                  <PlusCircle size={17} />
                  {userRole === "seller" ? "Đăng bán sản phẩm" : "Đăng bán cá nhân"}
                </button>
              </>
            ) : (
              <button
                onClick={() => go("admin")}
                className="flex items-center gap-2.5 px-5 py-3 rounded-xl font-bold text-sm shadow-lg transition-all hover:opacity-90 bg-amber-500 text-espresso"
                style={ff}
              >
                <Shield size={17} />
                Mở Admin Panel
              </button>
            )}
            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm border-2 transition-all hover:bg-white/10"
              style={{ borderColor: "#E74C3C", color: "#E74C3C", ...ff }}
            >
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
              Tài khoản này chỉ dùng để quản lý hệ thống. Bạn không tham gia các hoạt động thương mại như mua hàng hoặc ký gửi trên cửa hàng.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Để phê duyệt các sản phẩm chờ duyệt của người dùng, hãy mở Kênh quản trị chuyên dụng.
            </p>
            <div className="mt-8 flex justify-center gap-4">
              <button
                onClick={() => go("admin")}
                className="px-6 py-3 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 shadow-md"
                style={{ backgroundColor: T }}
              >
                Mở Bảng điều khiển Admin
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
              { id: "messages", label: "Tin nhắn", icon: MessageCircle, badge: unreadMessages },
              { id: "address", label: "Địa chỉ", icon: MapPin },
            ] : [
              { id: "purchases", label: "Đơn mua", icon: ShoppingBag },
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
                      <p className="text-sm font-semibold" style={{ color: ESPRESSO, ...ff }}>
                        {order.items[0]?.name}{order.items.length > 1 && ` (+${order.items.length - 1} sản phẩm khác)`}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: COFFEE, ...ff }}>
                        @{order.items[0]?.seller} · #{order.id} · {order.createdAt}
                      </p>
                      {order.shippingAddress && (
                        <p className="text-[11px] mt-1 italic max-w-[400px]" style={{ color: COFFEE + "aa", ...ff }}>
                          Giao tới: <strong>{order.shippingName}</strong> ({order.shippingPhone}) - {order.shippingAddress}
                        </p>
                      )}
                      <span className="inline-block text-xs px-2.5 py-0.5 rounded-full mt-2" style={{ backgroundColor: SOFT, color: COFFEE, ...ff }}>
                        {getOrderStatusLabel(getOrderTabStatus(order.status))}
                      </span>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-base font-bold" style={{ ...serif, color: T }}>{fmt(order.total)}</p>
                      <div className="mt-2 flex gap-2 justify-end flex-wrap">
                        {getOrderTabStatus(order.status) === "shipping" && (
                          <>
                            {/* ── Shipment tracking panel ── */}
                            {(() => {
                              const ship = shipments[order.id];
                              const loading = shipmentsLoading && !ship;
                              return (
                                <div className="w-full text-left">
                                  {loading && (
                                    <div className="mb-2 px-3 py-2 rounded-lg text-xs animate-pulse" style={{ backgroundColor: SOFT }}>
                                      Đang tải thông tin vận đơn…
                                    </div>
                                  )}
                                  {ship ? (
                                    <div className="mb-2 px-3 py-2 rounded-xl text-xs space-y-1" style={{ backgroundColor: CARD, border: `1px solid ${MUTED}` }}>
                                      {/* Provider + tracking number */}
                                      <div className="flex items-center justify-between">
                                        <span className="font-semibold capitalize" style={{ color: ESPRESSO }}>
                                          {ship.provider === "mock" ? "Giao hàng tiết kiệm" : ship.provider}
                                        </span>
                                        <span
                                          className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                          style={{ backgroundColor: (shipmentStatusLabel[ship.status]?.bg ?? "#F3F4F6"), color: (shipmentStatusLabel[ship.status]?.color ?? "#6B7280") }}
                                        >
                                          {shipmentStatusLabel[ship.status]?.label ?? ship.status}
                                        </span>
                                      </div>
                                      {/* Tracking number */}
                                      <div className="flex items-center gap-1.5">
                                        <span style={{ color: COFFEE }}>Mã vận đơn:</span>
                                        <code className="font-mono font-semibold" style={{ color: ESPRESSO }}>{ship.trackingNumber}</code>
                                        {ship.trackingUrl && (
                                          <a
                                            href={ship.trackingUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="ml-1"
                                            title="Theo dõi trên GHTK"
                                          >
                                            <ExternalLink size={11} style={{ color: T }} />
                                          </a>
                                        )}
                                      </div>
                                      {/* Estimated delivery */}
                                      {ship.estimatedDeliveryAt && (
                                        <div className="flex items-center gap-1.5" style={{ color: COFFEE }}>
                                          <MapPinned size={11} />
                                          <span>Dự kiến giao: {new Date(ship.estimatedDeliveryAt).toLocaleDateString("vi-VN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                                        </div>
                                      )}
                                      {/* Shipped / Delivered */}
                                      {ship.shippedAt && (
                                        <div className="text-[11px]" style={{ color: COFFEE }}>
                                          📦 Đã bàn giao cho đơn vị vận chuyển
                                        </div>
                                      )}
                                      {ship.deliveredAt && (
                                        <div className="text-[11px]" style={{ color: "#27AE60" }}>
                                          ✅ Đã giao: {new Date(ship.deliveredAt).toLocaleDateString("vi-VN")}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="mb-2 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: SOFT, color: COFFEE }}>
                                      Chưa có thông tin vận đơn. Shop đang chuẩn bị hàng.
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                            <div className="flex gap-2 justify-end flex-wrap mt-1">
                              <button className="text-xs px-3 py-1.5 rounded-lg font-semibold border transition-all hover:opacity-80" style={{ borderColor: MUTED, color: COFFEE, ...ff }}>Xem chi tiết</button>
                              {order.status !== "CANCELLED" && (
                                <button
                                  onClick={() => {
                                    if (confirm(`Bạn có chắc chắn muốn hủy đơn hàng #${order.id} không?`)) {
                                      onUpdateOrderStatus && onUpdateOrderStatus(order.id, "CANCELLED");
                                    }
                                  }}
                                  className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all hover:opacity-80"
                                  style={{ backgroundColor: "#FDEDEC", color: "#E74C3C", ...ff }}
                                >
                                  Hủy đơn
                                </button>
                              )}
                            </div>
                          </>
                        )}
                        {getOrderTabStatus(order.status) === "delivering" && (
                          <>
                            <button
                              onClick={() => onUpdateOrderStatus && onUpdateOrderStatus(order.id, "DELIVERED")}
                              className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all hover:opacity-80"
                              style={{ backgroundColor: "#27AE60", color: LINEN, ...ff }}
                            >
                              Xác nhận đã nhận
                            </button>
                            <button className="text-xs px-3 py-1.5 rounded-lg font-semibold border transition-all hover:opacity-80" style={{ borderColor: MUTED, color: COFFEE, ...ff }}>Xem chi tiết</button>
                          </>
                        )}
                        {getOrderTabStatus(order.status) === "review" && (
                          <button
                            onClick={() => {
                              const r = prompt("Nhập đánh giá của bạn (1-5 sao):", "5");
                              if (r !== null) {
                                onUpdateOrderStatus && onUpdateOrderStatus(order.id, "COMPLETED");
                              }
                            }}
                            className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all hover:opacity-80"
                            style={{ backgroundColor: "#27AE60", color: LINEN, ...ff }}
                          >
                            Đánh giá ngay
                          </button>
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

              {/* ── Đơn hàng cần xử lý (seller) ── */}
              <h3 className="text-lg font-bold mb-4" style={{ ...serif, color: ESPRESSO }}>Đơn hàng cần xử lý</h3>
              {sellerOrdersLoading ? (
                <div className="p-6 text-center text-sm" style={{ color: COFFEE }}>Đang tải đơn hàng…</div>
              ) : sellerOrders.filter((o) => ["PAID", "CONFIRMED", "PACKING", "SHIPPING", "DELIVERING"].includes(o.status)).length === 0 ? (
                <div className="p-6 rounded-2xl text-center text-sm mb-8" style={{ backgroundColor: CARD, border: `1px solid ${MUTED}`, color: COFFEE }}>
                  Chưa có đơn hàng nào cần xử lý
                </div>
              ) : (
                <div className="space-y-3 mb-8">
                  {sellerOrders
                    .filter((o) => ["PAID", "CONFIRMED", "PACKING", "SHIPPING", "DELIVERING"].includes(o.status))
                    .map((order) => {
                      const isPacking = order.status === "PACKING";
                      return (
                        <div key={order.id} className="flex items-center gap-4 p-4 rounded-2xl" style={{ backgroundColor: CARD, border: `1px solid ${MUTED}` }}>
                          <img src={order.items[0]?.image} alt={order.items[0]?.name} className="w-16 h-16 rounded-xl object-cover" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold" style={{ color: ESPRESSO, ...ff }}>{order.items[0]?.name}</p>
                            <p className="text-xs" style={{ color: COFFEE, ...ff }}>#{order.id} · {order.createdAt}</p>
                            {order.shippingAddress && (
                              <p className="text-[11px] mt-1 italic" style={{ color: COFFEE + "aa", ...ff }}>→ {order.shippingAddress}</p>
                            )}
                          </div>
                          <div className="text-right flex flex-col items-end gap-2">
                            <p className="text-sm font-bold" style={{ color: T, ...serif }}>{fmt(order.total)}</p>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: SOFT, color: COFFEE }}>{order.status}</span>
                            <div className="flex gap-2 flex-wrap justify-end">
                              {(order.status === "CONFIRMED" || order.status === "PAID") && (
                                <button
                                  onClick={() => handleSellerUpdateStatus(order.id, "PACKING")}
                                  className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all hover:opacity-90"
                                  style={{ backgroundColor: T, color: LINEN, ...ff }}
                                >
                                  Bắt đầu đóng gói
                                </button>
                              )}
                              {isPacking && (
                                <button
                                  onClick={() => setShipDialogOrder(order)}
                                  className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all hover:opacity-90"
                                  style={{ backgroundColor: T, color: LINEN, ...ff }}
                                >
                                  <Truck size={12} className="inline mr-1" /> Tạo vận đơn
                                </button>
                              )}
                              {(order.status === "SHIPPING" || order.status === "DELIVERING") && (
                                <button
                                  onClick={() => handleSellerUpdateStatus(order.id, "DELIVERED")}
                                  className="text-xs px-3 py-1.5 rounded-lg font-semibold border transition-all hover:opacity-80"
                                  style={{ borderColor: "#27AE60", color: "#27AE60", ...ff }}
                                >
                                  Xác nhận đã giao
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}

              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold" style={{ ...serif, color: ESPRESSO }}>Quản lý sản phẩm</h3>
                <button
                  onClick={() => go("post")}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
                  style={{ backgroundColor: T, color: LINEN, ...ff }}
                >
                  <PlusCircle size={15} />
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
                    <button onClick={() => go("post")} className="mt-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all hover:opacity-90" style={{ backgroundColor: T, color: LINEN, ...ff }}>Đăng sản phẩm đầu tiên</button>
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
                  <div
                    key={msg.id}
                    className="flex gap-4 p-4 rounded-2xl transition-all hover:shadow-md"
                    style={{ backgroundColor: CARD, border: `1px solid ${MUTED}`, borderLeft: msg.unread ? `3px solid ${T}` : `1px solid ${MUTED}` }}
                  >
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
                <button
                  className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all hover:opacity-80"
                  style={{ backgroundColor: T, color: LINEN, ...ff }}
                >
                  <PlusCircle size={15} />
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

      {shipmentDialog}
    </div>
  );
}
