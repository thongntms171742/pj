import { useState } from "react";
import { ThriftLogo } from "../../components/layout/Logo";
import { T, MUTED, COFFEE, LINEN, CARD, ESPRESSO, SOFT, serif, ff } from "../../lib/theme";

interface RegisterScreenProps {
  onRegister: (userName: string, userEmail: string, password: string) => void;
  onBack: () => void;
}

export function RegisterScreen({ onRegister, onBack }: RegisterScreenProps) {
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
      onRegister(name, email, pw);
      setLoading(false);
    }, 500);
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: LINEN }}>
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
            Tham gia cộng đồng
            <br />
            thời trang bền vững 🌿
          </h2>
          <p className="text-base" style={{ color: MUTED, ...ff }}>
            Mua bán đồ vintage, góp phần bảo vệ
            <br />
            môi trường và thể hiện phong cách riêng.
          </p>
        </div>
      </div>

      <div
        className="w-[520px] flex-shrink-0 flex items-center justify-center p-12 overflow-y-auto"
        style={{ backgroundColor: CARD }}
      >
        <div className="w-full max-w-[400px]">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm font-semibold mb-6 transition-all hover:opacity-80"
            style={{ color: COFFEE, ...ff }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M11 4L6 9L11 14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Quay lại đăng nhập
          </button>

          <div className="flex flex-col items-center mb-8">
            <ThriftLogo size={52} />
            <h1 className="text-2xl font-bold italic mt-3" style={{ ...serif, color: ESPRESSO }}>
              Tạo tài khoản mới
            </h1>
            <p className="text-sm mt-1" style={{ color: COFFEE, ...ff }}>
              Tham gia cùng 4.800+ người bán
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
                Họ và tên
              </label>
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
              <label className="block text-xs font-bold mb-1.5" style={{ color: COFFEE, ...ff }}>
                Email
              </label>
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
              <label className="block text-xs font-bold mb-1.5" style={{ color: COFFEE, ...ff }}>
                Số điện thoại
              </label>
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
              <label className="block text-xs font-bold mb-1.5" style={{ color: COFFEE, ...ff }}>
                Mật khẩu
              </label>
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
              <label className="block text-xs font-bold mb-1.5" style={{ color: COFFEE, ...ff }}>
                Xác nhận mật khẩu
              </label>
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
              style={{
                backgroundColor: T,
                color: LINEN,
                ...ff,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Đang xử lý..." : "Đăng Ký"}
            </button>
          </div>

          <p className="text-xs text-center mt-6" style={{ color: COFFEE, ...ff }}>
            Bằng cách đăng ký, bạn đồng ý với{" "}
            <a href="#" className="underline" style={{ color: T }}>
              Điều khoản sử dụng
            </a>{" "}
            và{" "}
            <a href="#" className="underline" style={{ color: T }}>
              Chính sách bảo mật
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
