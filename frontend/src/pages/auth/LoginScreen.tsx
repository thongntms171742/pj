import { useState } from "react";
import { ThriftLogo } from "../../components/layout/Logo";
import { T, MUTED, COFFEE, LINEN, CARD, ESPRESSO, SOFT, serif, ff } from "../../lib/theme";

interface LoginScreenProps {
  onLogin: (userName: string, userEmail: string, password?: string) => void;
  onRegister: () => void;
}

export function LoginScreen({ onLogin, onRegister }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
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
    // Pass email+password to App; App will try /api/auth/login.
    onLogin("", email, pw);
    setTimeout(() => setLoading(false), 800);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleLogin();
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
        <div
          className="absolute inset-0 flex flex-col justify-end p-16"
          style={{
            background:
              "linear-gradient(to top, rgba(58,35,18,0.85) 0%, rgba(58,35,18,0.3) 50%, transparent 100%)",
          }}
        >
          <div className="flex items-center gap-3 mb-4">
            <ThriftLogo size={52} />
            <span className="text-4xl font-bold italic" style={{ ...serif, color: LINEN }}>
              thrift it!
            </span>
          </div>
          <h2 className="text-3xl font-bold mb-3" style={{ ...serif, color: LINEN }}>
            Thời trang cũ,
            <br />
            giá trị mới 🌿
          </h2>
          <p className="text-base" style={{ color: MUTED, ...ff }}>
            Khám phá hàng ngàn món đồ vintage độc đáo từ
            <br />
            các shop uy tín khắp Việt Nam.
          </p>
          <div className="flex items-center gap-6 mt-6">
            {[
              ["12.000+", "Sản phẩm"],
              ["4.800+", "Người bán"],
              ["98%", "Hài lòng"],
            ].map(([v, l]) => (
              <div key={l}>
                <div className="text-2xl font-bold" style={{ ...serif, color: T }}>
                  {v}
                </div>
                <div className="text-xs" style={{ color: MUTED, ...ff }}>
                  {l}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: login form */}
      <div
        className="w-[500px] flex-shrink-0 flex items-center justify-center p-12"
        style={{ backgroundColor: CARD }}
      >
        <div className="w-full max-w-[380px]">
          <div className="flex flex-col items-center mb-10">
            <ThriftLogo size={60} />
            <h1 className="text-3xl font-bold italic mt-3" style={{ ...serif, color: ESPRESSO }}>
              thrift it!
            </h1>
            <p className="text-sm mt-1" style={{ color: COFFEE, ...ff }}>
              Chào mừng bạn trở lại
            </p>
          </div>

          {error && (
            <div
              className="mb-4 px-4 py-3 rounded-xl text-sm flex items-center gap-2"
              style={{ backgroundColor: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626" }}
            >
              <span>⚠️</span>
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold mb-1.5" style={{ color: COFFEE, ...ff }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError("");
                }}
                onKeyDown={handleKeyDown}
                placeholder="ban@email.com"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none border-2 transition-all"
                style={{
                  backgroundColor: SOFT,
                  border: `2px solid ${error && !email ? "#EF4444" : MUTED}`,
                  color: ESPRESSO,
                  ...ff,
                }}
              />
            </div>
            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-xs font-bold" style={{ color: COFFEE, ...ff }}>
                  Mật khẩu
                </label>
                <a href="#" className="text-xs font-semibold hover:underline" style={{ color: T, ...ff }}>
                  Quên mật khẩu?
                </a>
              </div>
              <input
                type="password"
                value={pw}
                onChange={(e) => {
                  setPw(e.target.value);
                  setError("");
                }}
                onKeyDown={handleKeyDown}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none border-2 transition-all"
                style={{
                  backgroundColor: SOFT,
                  border: `2px solid ${error && !pw ? "#EF4444" : MUTED}`,
                  color: ESPRESSO,
                  ...ff,
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
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Đang đăng nhập...
                </>
              ) : (
                "Đăng Nhập"
              )}
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px" style={{ backgroundColor: MUTED }} />
              <span className="text-xs" style={{ color: COFFEE, ...ff }}>
                hoặc
              </span>
              <div className="flex-1 h-px" style={{ backgroundColor: MUTED }} />
            </div>

            <button
              onClick={onRegister}
              className="w-full py-3 rounded-xl text-sm font-semibold border-2 transition-all hover:bg-opacity-80"
              style={{ border: `2px solid ${MUTED}`, color: COFFEE, backgroundColor: "transparent", ...ff }}
            >
              Đăng ký tài khoản mới
            </button>
          </div>

          <p className="text-xs text-center mt-6" style={{ color: COFFEE, ...ff }}>
            Bằng cách đăng nhập, bạn đồng ý với{" "}
            <a href="#" className="underline" style={{ color: T }}>
              Điều khoản sử dụng
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
