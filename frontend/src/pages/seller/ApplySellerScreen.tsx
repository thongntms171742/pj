import { useState } from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { T, COFFEE, LINEN, ESPRESSO, serif, ff, CARD, MUTED } from "../../lib/theme";
import type { Screen } from "../../types";
import { api, ApiError } from "../../lib/api";

interface ApplySellerScreenProps {
  go: (s: Screen) => void;
  setSellerStatus: (status: "NONE" | "PENDING" | "APPROVED" | "REJECTED") => void;
  showToast: (msg: string) => void;
}

export function ApplySellerScreen({ go, setSellerStatus, showToast }: ApplySellerScreenProps) {
  const [shopName, setShopName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      showToast("Vui lòng đồng ý với cam kết.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<{ sellerStatus: string; message: string }>("/auth/seller/apply", {
        shopName,
        phone,
        address,
        description,
      });
      setSellerStatus(res.sellerStatus as "PENDING");
      showToast("Đã gửi yêu cầu đăng ký người bán thành công!");
      go("home");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Có lỗi xảy ra";
      showToast(`⚠️ ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ backgroundColor: LINEN, minHeight: "100vh" }}>
      {/* Header */}
      <div className="sticky top-0 z-50 shadow-sm" style={{ backgroundColor: COFFEE }}>
        <div className="max-w-[1440px] mx-auto px-8 h-14 flex items-center gap-4">
          <button onClick={() => go("home")} className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors">
            <ArrowLeft size={20} style={{ color: LINEN }} />
          </button>
          <h1 className="text-lg font-bold" style={{ color: LINEN, ...serif }}>
            Đăng ký trở thành người bán
          </h1>
        </div>
      </div>

      <div className="max-w-[600px] mx-auto px-8 py-12">
        <div className="rounded-2xl p-8 shadow-sm" style={{ backgroundColor: CARD, border: `1px solid ${MUTED}` }}>
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold mb-2" style={{ color: ESPRESSO, ...serif }}>
              Tham gia cộng đồng người bán
            </h2>
            <p className="text-sm" style={{ color: COFFEE, ...ff }}>
              Bắt đầu hành trình sống xanh, thanh lý tủ đồ của bạn cùng thrift it!
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-bold mb-2" style={{ color: ESPRESSO, ...ff }}>
                Tên Shop / Tên hiển thị *
              </label>
              <input
                required
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="VD: Vintage Linh"
                className="w-full px-4 py-3 rounded-xl border focus:outline-none transition-colors"
                style={{ backgroundColor: "rgba(255,255,255,0.8)", borderColor: MUTED, ...ff }}
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-2" style={{ color: ESPRESSO, ...ff }}>
                Số điện thoại liên hệ *
              </label>
              <input
                required
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="09xxxxxxxx"
                className="w-full px-4 py-3 rounded-xl border focus:outline-none transition-colors"
                style={{ backgroundColor: "rgba(255,255,255,0.8)", borderColor: MUTED, ...ff }}
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-2" style={{ color: ESPRESSO, ...ff }}>
                Địa chỉ lấy hàng *
              </label>
              <input
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Số nhà, đường, phường, quận..."
                className="w-full px-4 py-3 rounded-xl border focus:outline-none transition-colors"
                style={{ backgroundColor: "rgba(255,255,255,0.8)", borderColor: MUTED, ...ff }}
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-2" style={{ color: ESPRESSO, ...ff }}>
                Giới thiệu về shop
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Chia sẻ một chút về phong cách đồ bạn bán..."
                className="w-full px-4 py-3 rounded-xl border focus:outline-none transition-colors h-24 resize-none"
                style={{ backgroundColor: "rgba(255,255,255,0.8)", borderColor: MUTED, ...ff }}
              />
            </div>

            <label className="flex items-start gap-3 mt-4 cursor-pointer group">
              <div
                className="w-5 h-5 rounded mt-0.5 flex-shrink-0 flex items-center justify-center border transition-all"
                style={{
                  backgroundColor: agreed ? T : "transparent",
                  borderColor: agreed ? T : MUTED,
                }}
              >
                {agreed && <CheckCircle2 size={14} style={{ color: LINEN }} />}
              </div>
              <input
                type="checkbox"
                className="hidden"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span className="text-sm leading-relaxed" style={{ color: COFFEE, ...ff }}>
                Tôi cam kết thông tin sản phẩm đăng bán là chính xác và tuân thủ các quy định của thrift it!.
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 mt-4 rounded-xl font-bold shadow-md transition-all hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: T, color: LINEN, ...ff }}
            >
              {loading ? "Đang gửi..." : "Gửi đăng ký"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
