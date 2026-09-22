import React, { useState } from "react";
import { Upload, X, Plus } from "lucide-react";
import { T, ESPRESSO, COFFEE, LINEN, CARD, MUTED, SOFT, serif, ff, fmt } from "../../lib/theme";
import type { Screen } from "../../types";

// ── Post Listing Screen ────────────────────────────────────────────────────────
export function PostScreen({ go, onAddProduct }: { go: (s: Screen) => void; onAddProduct: (newProd: { name: string; price: number; category: string; desc: string; size: string; condition: number; image: string }) => void }) {
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
                    if (photoCount === 0) {
                      alert("Vui lòng tải lên ít nhất 1 ảnh sản phẩm để tiếp tục!");
                      return;
                    }
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