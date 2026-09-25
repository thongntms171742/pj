import React, { useState } from "react";
import {
  TrendingUp, Package, Users, LogOut, DollarSign, Clock
} from "lucide-react";
import {
  T, ESPRESSO, COFFEE, LINEN, MUTED, SOFT, ff, serif, fmt,
} from "../../lib/theme";
import type { Product, Screen, SellerProduct } from "../../types";
import { ThriftLogo } from "../../components/layout/Logo";
import { api, ApiError } from "../../lib/api";

interface AdminScreenProps {
  go: (s: Screen) => void;
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  myProductsByEmail: Record<string, SellerProduct[]>;
  setMyProductsByEmail: React.Dispatch<React.SetStateAction<Record<string, SellerProduct[]>>>;
  userRole: string;
  setUserRole: (role: "buyer" | "seller") => void;
  onLogout: () => void;
}

export function AdminScreen({
  go,
  products,
  setProducts,
  myProductsByEmail,
  setMyProductsByEmail,
  userRole,
  setUserRole,
  onLogout
}: AdminScreenProps) {
  const [activeAdminTab, setActiveAdminTab] = useState<"stats" | "c2c" | "users">("stats");
  const [commissionRate, setCommissionRate] = useState<number>(10);
  const [timeFilter, setTimeFilter] = useState<"week" | "month" | "quarter" | "year">("week");
  const [adminStats, setAdminStats] = useState<{ pendingListings: number; soldProducts: number; totalOrders: number; totalUsers: number; totalSellers: number; platformProfit: number } | null>(null);

  React.useEffect(() => {
    let mounted = true;
    api
      .get<{ stats: typeof adminStats }>("/admin/stats")
      .then((res) => mounted && setAdminStats(res.stats))
      .catch(() => {/* silent */});
    return () => {
      mounted = false;
    };
  }, []);

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

  const handleApproveListing = async (id: number, apiId?: string) => {
    const previousMyProducts = myProductsByEmail;
    const previousProducts = products;

    // Optimistic local update
    setMyProductsByEmail(prev => {
      const updated = { ...prev };
      for (const email in updated) {
        updated[email] = updated[email].map(p => p.id === id ? { ...p, status: "active" } : p);
      }
      return updated;
    });
    setProducts(prev => prev.map(p => p.id === id ? { ...p, status: "active" } : p));

    if (apiId) {
      try {
        await api.patch(`/admin/listings/${apiId}/approve`);
        alert("Duyệt tin đăng bán C2C thành công! Sản phẩm đã xuất hiện trên trang chủ.");
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : "Lỗi duyệt tin";
        alert(`Duyệt thất bại: ${msg}`);
        setMyProductsByEmail(previousMyProducts);
        setProducts(previousProducts);
      }
    } else {
      alert("Duyệt tin đăng bán C2C thành công! Sản phẩm đã xuất hiện trên trang chủ.");
    }
  };

  const handleRejectListing = async (id: number, apiId?: string) => {
    const previousMyProducts = myProductsByEmail;
    const previousProducts = products;

    setMyProductsByEmail(prev => {
      const updated = { ...prev };
      for (const email in updated) {
        updated[email] = updated[email].filter(p => p.id !== id);
      }
      return updated;
    });
    setProducts(prev => prev.filter(p => p.id !== id));

    if (apiId) {
      try {
        await api.patch(`/admin/listings/${apiId}/reject`);
        alert("Đã từ chối tin đăng bán sản phẩm.");
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : "Lỗi từ chối";
        console.error("Reject failed:", msg);
        alert(`Từ chối thất bại: ${msg}`);
        setMyProductsByEmail(previousMyProducts);
        setProducts(previousProducts);
      }
    } else {
      alert("Đã từ chối tin đăng bán sản phẩm.");
    }
  };

  // Platform revenue: pull from /admin/stats; fall back to 0 when API not ready
  const totalC2CRevenue = adminStats?.platformProfit
    ? Math.round(adminStats.platformProfit / (commissionRate / 100))
    : 0;
  const platformProfitFromC2C = adminStats?.platformProfit ?? 0;

  return (
    <div className="min-h-screen flex w-full" style={{ backgroundColor: "#F7F5F0" }}>
      {/* ── Left Sidebar ── */}
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
              {activeAdminTab === "stats" ? "Thống kê tổng quan" : activeAdminTab === "c2c" ? "Duyệt bài đăng" : "Danh sách tài khoản"}
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
              <div className="grid grid-cols-3 gap-5">
                {[
                  { label: "Phí Hoa hồng C2C", value: `${fmt(platformProfitFromC2C)}`, sub: `Tỷ lệ hoa hồng: ${commissionRate}%`, color: "#2980B9", icon: DollarSign },
                  { label: "Tin C2C chờ duyệt", value: `${pendingProducts.length} bài đăng`, sub: "Cần phê duyệt", color: "#E74C3C", icon: Clock },
                  { label: "Tổng doanh số C2C", value: fmt(totalC2CRevenue), sub: "Doanh số ký gửi", color: "#27AE60", icon: TrendingUp },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="p-5 rounded-2xl bg-white border border-muted shadow-sm flex items-center justify-between transition-all hover:shadow-md"
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
                      Điều chỉnh tỷ lệ hoa hồng chiết khấu trên mỗi giao dịch C2C thành công. Thu nhập hoa hồng sẽ tự động cập nhật.
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
                    <strong>Phí hoa hồng ước tính:</strong> {fmt(platformProfitFromC2C)} (dựa trên tổng doanh số C2C đạt {fmt(totalC2CRevenue)}).
                  </div>
                </div>

                <div className="p-6 rounded-3xl bg-white border border-muted shadow-sm flex flex-col justify-between" style={{ minHeight: "340px" }}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold mb-1" style={{ color: ESPRESSO, ...ff }}>Biểu đồ doanh thu</h3>
                      <p className="text-xs text-coffee" style={ff}>Tổng doanh thu sàn C2C:</p>
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
                      <defs>
                        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={T} stopOpacity="0.25" />
                          <stop offset="100%" stopColor={T} stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      {(() => {
                        const points = getChartData();
                        const count = points.length;

                        const coords = points.map((p, idx) => {
                          const x = 35 + idx * ((500 - 70) / (count - 1 || 1));
                          const multiplier = timeFilter === "week" ? 1 : timeFilter === "month" ? 4 : timeFilter === "quarter" ? 12 : 48;
                          const totalVal = p.val + (platformProfitFromC2C * multiplier / 10);

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
                            <path d={areaPath} fill="url(#chartGrad)" />
                            <path d={linePath} fill="none" stroke={T} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                            {coords.map((c, idx) => (
                              <g key={idx}>
                                <circle cx={c.x} cy={c.y} r="3.5" fill="white" stroke={T} strokeWidth="2" />
                                <text x={c.x} y={c.y - 10} textAnchor="middle" className="text-[9px] font-bold fill-espresso" style={ff}>
                                  {timeFilter === "year" || timeFilter === "quarter" ? `${(c.val / 1000000000).toFixed(2)}B` : `${(c.val / 1000000).toFixed(1)}M`}
                                </text>
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
                                onClick={() => handleApproveListing(p.id, p.apiId)}
                                className="px-3 py-1.5 rounded-xl text-[10px] font-bold text-white transition-all bg-green-600 hover:bg-green-700"
                              >
                                ✓ Duyệt bài
                              </button>
                              <button
                                onClick={() => handleRejectListing(p.id, p.apiId)}
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

          {/* TAB 3: USERS DIRECTORY MANAGEMENT */}
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
                      <th className="p-4 text-center">Thao tác đổi Role</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-muted bg-white">
                    {[
                      { name: "Nguyễn Thanh Linh", email: "linh.nguyen@gmail.com", role: "buyer", isCurrent: true },
                      { name: "Minh Tú Vintage", email: "shop.minhtu@thriftit.vn", role: "seller", isCurrent: false },
                      { name: "Demo User", email: "demo@thriftit.vn", role: "buyer", isCurrent: false },
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
                        <td className="p-4 text-center">
                          {user.isCurrent ? (
                            <button
                              onClick={() => {
                                const switched = userRole === "buyer" ? "seller" : "buyer";
                                setUserRole(switched);
                              }}
                              className="px-3.5 py-1.5 rounded-xl text-[10px] font-bold text-white transition-all bg-espresso hover:opacity-90"
                            >
                              Chuyển sang {userRole === "buyer" ? "Shop" : "Khách"}
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
