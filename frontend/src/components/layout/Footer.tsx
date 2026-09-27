import { ThriftLogo } from "./Logo";
import { ESPRESSO, T, LINEN, MUTED, COFFEE, ff } from "../../lib/theme";
import type { Screen } from "../../types";

export function Footer({ go }: { go: (s: Screen) => void }) {
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
              <span className="text-lg font-bold italic" style={{ ...ff, color: LINEN }}>
                thrift it!
              </span>
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
              <h4 className="text-xs font-bold tracking-widest mb-4" style={{ color: T, ...ff }}>
                {col.title.toUpperCase()}
              </h4>
              <ul className="space-y-2.5">
                {col.items.map((item) => (
                  <li key={item}>
                    <a href="#" className="text-xs hover:text-white transition-colors" style={{ color: MUTED, ...ff }}>
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div
          className="mt-10 pt-6 flex items-center justify-between"
          style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}
        >
          <p className="text-xs" style={{ color: MUTED, ...ff }}>
            © 2024 thrift it! — Nền tảng mua bán đồ vintage Việt Nam
          </p>
          <div className="flex items-center gap-6">
            {["Điều khoản sử dụng", "Chính sách riêng tư", "Cookie"].map((l) => (
              <a key={l} href="#" className="text-xs hover:text-white transition-colors" style={{ color: MUTED, ...ff }}>
                {l}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
