import React, { useState } from "react";
import { Store, CheckCircle, AlertCircle } from "lucide-react";
import { T, ESPRESSO, COFFEE, LINEN, MUTED, SOFT, ff, serif } from "../../lib/theme";
import type { Screen } from "../../types";
import { api, ApiError } from "../../lib/api";

export function SellerApplyScreen({ go, onApplySuccess }: { go: (s: Screen) => void, onApplySuccess: () => void }) {
  const [shopName, setShopName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopName) {
      setError("Vui lòng nhập tên Shop");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/seller/apply", {
        shopName,
        description,
      });
      setSuccess(true);
      onApplySuccess();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : "Đăng ký thất bại";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: LINEN }}>
        <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-sm text-center">
          <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-6" style={{ backgroundColor: "#E9F7EF", color: "#27AE60" }}>
            <CheckCircle size={32} />
          </div>
          <h2 className="text-2xl font-bold mb-3" style={{ ...serif, color: ESPRESSO }}>Đăng ký thành công!</h2>
          <p className="text-sm mb-8 leading-relaxed" style={{ color: COFFEE, ...ff }}>
            Đơn đăng ký trở thành người bán của bạn đã được gửi. Quản trị viên sẽ xét duyệt trong thời gian sớm nhất.
          </p>
          <button
            onClick={() => go("account")}
            className="w-full py-3.5 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 shadow-md"
            style={{ backgroundColor: T, ...ff }}
          >
            Quay lại Tài khoản
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12 px-6" style={{ backgroundColor: LINEN }}>
      <div className="max-w-md mx-auto bg-white p-8 rounded-3xl shadow-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-4" style={{ backgroundColor: SOFT, color: T }}>
            <Store size={32} />
          </div>
          <h2 className="text-2xl font-bold" style={{ ...serif, color: ESPRESSO }}>Đăng ký Người bán</h2>
          <p className="text-sm mt-2" style={{ color: COFFEE, ...ff }}>Bắt đầu kinh doanh trên thrift it!</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl flex items-center gap-3 text-sm" style={{ backgroundColor: "#FDEDEC", color: "#E74C3C", ...ff }}>
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-bold mb-2" style={{ color: ESPRESSO, ...ff }}>Tên Shop</label>
            <input
              type="text"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              placeholder="Ví dụ: Tiệm đồ cũ của Linh"
              className="w-full px-4 py-3 rounded-xl outline-none transition-all"
              style={{ backgroundColor: LINEN, border: `1.5px solid ${MUTED}`, color: ESPRESSO, ...ff }}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-bold mb-2" style={{ color: ESPRESSO, ...ff }}>Giới thiệu (Tùy chọn)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mô tả ngắn về các sản phẩm bạn sẽ bán..."
              rows={4}
              className="w-full px-4 py-3 rounded-xl outline-none transition-all resize-none"
              style={{ backgroundColor: LINEN, border: `1.5px solid ${MUTED}`, color: ESPRESSO, ...ff }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 shadow-md mt-4"
            style={{ backgroundColor: T, opacity: loading ? 0.7 : 1, ...ff }}
          >
            {loading ? "Đang gửi..." : "Gửi đơn đăng ký"}
          </button>
        </form>
      </div>
    </div>
  );
}
