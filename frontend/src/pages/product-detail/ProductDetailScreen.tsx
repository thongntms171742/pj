import React, { useEffect, useState } from "react";
import { Star, Heart, ChevronRight, Plus, Minus } from "lucide-react";
import { T, ESPRESSO, COFFEE, LINEN, CARD, MUTED, SOFT, serif, ff, fmt } from "../../lib/theme";
import type { Screen, Product, Seller } from "../../types";
import { api } from "../../lib/api";
import type { ApiSeller } from "../../lib/api";
import { adaptSeller } from "../../lib/adapters";

// ── Product Detail Screen ──────────────────────────────────────────────────────
export function ProductDetailScreen({
  product,
  go,
  onLike,
  onAddToCart,
}: {
  product: Product;
  go: (s: Screen, p?: Product, se?: Seller) => void;
  onLike: (id: number) => void;
  onAddToCart: (product: Product, qty: number) => void;
}) {
  const [seller, setSeller] = useState<Seller | null>(null);
  const [selectedImg, setSelectedImg] = useState(0);
  const [showReview, setShowReview] = useState(false);
  const [qty, setQty] = useState(1);
  const [addedToCart, setAddedToCart] = useState(false);

  // Fetch seller profile from API
  useEffect(() => {
    if (!product.seller) return;
    let mounted = true;
    api
      .get<{ seller: ApiSeller }>(`/sellers/${product.seller}`)
      .then((res) => {
        if (mounted) setSeller(adaptSeller(res.seller));
      })
      .catch(() => {
        if (mounted) setSeller(null);
      });
    return () => {
      mounted = false;
    };
  }, [product.seller]);

  const condLabel = product.condition >= 95 ? "Như mới" : product.condition >= 85 ? "Rất tốt" : product.condition >= 70 ? "Tốt" : "Khá";

  const categoryImages: Record<string, string[]> = {
    "Áo": [
      product.image,
      "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=400&h=520&fit=crop",
      "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400&h=520&fit=crop"
    ],
    "Quần": [
      product.image,
      "https://images.unsplash.com/photo-1542272604-787c3835535d?w=400&h=520&fit=crop",
      "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=400&h=520&fit=crop"
    ],
    "Váy": [
      product.image,
      "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=400&h=520&fit=crop",
      "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=400&h=520&fit=crop"
    ],
  };

  const reviewImages = categoryImages[product.category] || [
    product.image,
    "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=520&fit=crop",
    "https://images.unsplash.com/photo-1495105787522-5334e3ffa0ef?w=400&h=520&fit=crop"
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: LINEN }}>
      {/* Breadcrumb */}
      <div className="px-8 py-4" style={{ backgroundColor: SOFT }}>
        <div className="max-w-[1440px] mx-auto flex items-center gap-2 text-sm" style={{ color: COFFEE, ...ff }}>
          <button onClick={() => go("home")} className="hover:text-amber-700 transition-colors">Trang chủ</button>
          <ChevronRight size={14} />
          <button onClick={() => go("search")} className="hover:text-amber-700 transition-colors">{product.category}</button>
          <ChevronRight size={14} />
          <span className="font-semibold" style={{ color: ESPRESSO }}>{product.name}</span>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-8 py-8">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 480px", gap: "48px" }}>
          {/* Left: Images */}
          <div>
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: CARD, border: `1px solid ${MUTED}` }}>
              <img
                src={reviewImages[selectedImg]}
                alt={product.name}
                className="w-full object-cover"
                style={{ height: "500px" }}
              />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-4">
              {reviewImages.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedImg(i)}
                  className="rounded-xl overflow-hidden border-2 transition-all"
                  style={{
                    borderColor: selectedImg === i ? T : "transparent",
                    opacity: selectedImg === i ? 1 : 0.7
                  }}
                >
                  <img src={img} alt="" className="w-full object-cover" style={{ height: "100px" }} />
                </button>
              ))}
            </div>

            {/* Seller info */}
            {seller && (
              <div className="mt-8 p-5 rounded-2xl" style={{ backgroundColor: CARD, border: `1px solid ${MUTED}` }}>
                <h3 className="text-sm font-bold mb-4" style={{ color: ESPRESSO, ...ff }}>Người bán</h3>
                <div className="flex items-center gap-4">
                  <img src={seller.avatar} alt={seller.name} className="w-14 h-14 rounded-full object-cover" />
                  <div className="flex-1">
                    <p className="font-bold" style={{ color: ESPRESSO, ...ff }}>{seller.name}</p>
                    <p className="text-sm" style={{ color: COFFEE, ...ff }}>@{seller.handle}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex">
                        {[1,2,3,4,5].map(i => <Star key={i} size={12} fill={T} stroke="none" />)}
                      </div>
                      <span className="text-xs font-bold" style={{ color: T }}>{seller.rating}</span>
                      <span className="text-xs" style={{ color: COFFEE }}>· {seller.transactions} giao dịch</span>
                    </div>
                  </div>
                  <button
                    onClick={() => go("seller", undefined, seller)}
                    className="px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all hover:opacity-80"
                    style={{ borderColor: T, color: T, ...ff }}
                  >
                    Xem shop
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right: Info */}
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: SOFT, color: COFFEE, ...ff }}>{product.category}</span>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: `${T}20`, color: T, ...ff }}>Size {product.size}</span>
              </div>
              <h1 className="text-2xl font-bold leading-tight" style={{ ...serif, color: ESPRESSO }}>{product.name}</h1>
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1">
                  <div className="flex">
                    {[1,2,3,4,5].map(i => <Star key={i} size={14} fill={T} stroke="none" />)}
                  </div>
                  <span className="text-sm font-bold" style={{ color: T }}>4.9</span>
                  <span className="text-sm" style={{ color: COFFEE }}>(128 đánh giá)</span>
                </div>
                <span className="text-sm" style={{ color: COFFEE }}>·</span>
                <span className="text-sm" style={{ color: COFFEE }}>234 lượt thích</span>
              </div>
            </div>

            <div className="p-6 rounded-2xl" style={{ backgroundColor: CARD, border: `2px solid ${T}30` }}>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold" style={{ ...serif, color: T }}>{fmt(product.price)}</span>
                <span className="text-sm line-through" style={{ color: MUTED }}>{fmt(product.price * 1.4)}</span>
              </div>
              <div className="flex items-center gap-3 mt-3">
                <span className="text-sm px-2.5 py-1 rounded-full font-semibold" style={{ backgroundColor: "#27AE60", color: "white", ...ff }}>
                  {product.condition}% mới
                </span>
                <span className="text-sm" style={{ color: COFFEE }}>{condLabel}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => onLike(product.id)}
                className="flex items-center gap-2 px-5 py-3 rounded-xl font-semibold border-2 transition-all hover:opacity-80"
                style={{ borderColor: T, color: product.liked ? "#E74C3C" : T, backgroundColor: product.liked ? "#FDEDEC" : "transparent", ...ff }}
              >
                <Heart size={18} fill={product.liked ? "#E74C3C" : "none"} />
                {product.liked ? "Đã thích" : "Yêu thích"}
              </button>
              <div className="flex items-center gap-1 rounded-xl overflow-hidden" style={{ border: `1.5px solid ${MUTED}`, opacity: product.status === "sold" ? 0.5 : 1 }}>
                <button disabled={product.status === "sold"} onClick={() => setQty(Math.max(1, qty - 1))} className="px-4 py-3 transition-all hover:bg-gray-100 disabled:cursor-not-allowed" style={{ backgroundColor: SOFT }}>
                  <Minus size={16} style={{ color: COFFEE }} />
                </button>
                <span className="px-4 py-3 font-bold" style={{ backgroundColor: CARD, color: ESPRESSO }}>{qty}</span>
                <button disabled={product.status === "sold"} onClick={() => setQty(qty + 1)} className="px-4 py-3 transition-all hover:bg-gray-100 disabled:cursor-not-allowed" style={{ backgroundColor: T, color: LINEN }}>
                  <Plus size={16} />
                </button>
              </div>
            </div>

            {product.status === "sold" ? (
              <button
                disabled
                className="w-full py-4 rounded-2xl text-base font-bold cursor-not-allowed opacity-50 shadow-md"
                style={{ backgroundColor: COFFEE, color: LINEN, ...ff }}
              >
                SẢN PHẨM ĐÃ BÁN (HẾT HÀNG)
              </button>
            ) : (
              <>
                <button
                  onClick={() => { onAddToCart(product, qty); setAddedToCart(true); setTimeout(() => setAddedToCart(false), 2000); }}
                  className="w-full py-4 rounded-2xl text-base font-bold shadow-lg transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ backgroundColor: addedToCart ? "#27AE60" : T, color: LINEN, ...ff }}
                >
                  {addedToCart ? "✓ Đã thêm vào giỏ hàng" : "Thêm vào giỏ hàng"}
                </button>
                <button
                  onClick={() => { onAddToCart(product, qty); go("cart"); }}
                  className="w-full py-4 rounded-2xl text-base font-bold transition-all hover:opacity-90"
                  style={{ backgroundColor: ESPRESSO, color: LINEN, ...ff }}
                >
                  Mua ngay
                </button>
              </>
            )}

            {/* Trust badges */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: "🛡️", label: "Bảo vệ người mua" },
                { icon: "🔄", label: "Đổi trả 7 ngày" },
                { icon: "📦", label: "Kiểm tra khi nhận" },
              ].map(b => (
                <div key={b.label} className="text-center p-3 rounded-xl" style={{ backgroundColor: SOFT }}>
                  <span className="text-xl">{b.icon}</span>
                  <p className="text-[10px] mt-1 font-semibold" style={{ color: COFFEE }}>{b.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
