import React, { useState, useEffect } from "react";
import { Star, MessageCircle } from "lucide-react";
import { T, ESPRESSO, COFFEE, LINEN, CARD, MUTED, SOFT, ff, serif } from "../../lib/theme";
import { ProductCard } from "../../components/product/ProductCard";
import type { Screen, Product, Seller } from "../../types";
import { api } from "../../lib/api";

// ── Seller Screen ──────────────────────────────────────────────────────────────
export function SellerScreen({ seller, go, products, onAddToCart }: { seller: Seller; go: (s: Screen, p?: Product, se?: Seller) => void; products: Product[]; onAddToCart: (product: Product) => void }) {
  const sellerProducts = products.filter(p => p.seller === seller.handle);
  const [activeTab, setActiveTab] = useState<"products" | "reviews">("products");
  const [reviews, setReviews] = useState<any[]>([]);

  useEffect(() => {
    api.get<{ reviews: any[] }>(`/sellers/${seller.id}/reviews`)
      .then((res) => setReviews(res.reviews || []))
      .catch(() => {});
  }, [seller.id]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: LINEN }}>
      {/* Seller header */}
      <div style={{ background: `linear-gradient(135deg, ${ESPRESSO} 0%, ${COFFEE} 100%)` }}>
        <div className="max-w-[1440px] mx-auto px-8 py-10">
          <div className="flex items-center gap-6">
            <img src={seller.avatar} alt={seller.name} className="w-28 h-28 rounded-full object-cover border-4" style={{ borderColor: T }} />
            <div className="flex-1">
              <h1 className="text-3xl font-bold" style={{ ...serif, color: LINEN }}>{seller.name}</h1>
              <p className="text-lg mt-1" style={{ color: MUTED, ...ff }}>@{seller.handle}</p>
              <div className="flex items-center gap-6 mt-4">
                <div className="flex items-center gap-1.5">
                  <div className="flex">
                    {[1,2,3,4,5].map(i => <Star key={i} size={16} fill={T} stroke="none" />)}
                  </div>
                  <span className="text-lg font-bold" style={{ color: T }}>{seller.rating}</span>
                  <span className="text-sm" style={{ color: MUTED }}>({seller.transactions} đánh giá)</span>
                </div>
                <div className="h-8 w-px" style={{ backgroundColor: MUTED + "44" }} />
                <span className="text-sm px-3 py-1 rounded-full" style={{ backgroundColor: T + "33", color: T, ...ff }}>Shop uy tín ✓</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button className="px-6 py-3 rounded-xl font-bold transition-all hover:opacity-90"
                style={{ backgroundColor: T, color: LINEN, ...ff }}>
                + Theo dõi
              </button>
              <button onClick={() => go("chat")} className="px-6 py-3 rounded-xl font-bold border-2 transition-all hover:opacity-90"
                style={{ borderColor: LINEN, color: LINEN, ...ff }}>
                Nhắn tin
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-8 py-8">
        <div className="flex gap-4 mb-8">
          <button
            onClick={() => setActiveTab("products")}
            className={`px-6 py-2.5 rounded-full font-bold text-sm transition-all border-2`}
            style={{
              borderColor: activeTab === "products" ? T : "transparent",
              backgroundColor: activeTab === "products" ? T + "11" : "transparent",
              color: activeTab === "products" ? T : COFFEE,
            }}
          >
            Sản phẩm ({sellerProducts.length})
          </button>
          <button
            onClick={() => setActiveTab("reviews")}
            className={`px-6 py-2.5 rounded-full font-bold text-sm transition-all border-2`}
            style={{
              borderColor: activeTab === "reviews" ? T : "transparent",
              backgroundColor: activeTab === "reviews" ? T + "11" : "transparent",
              color: activeTab === "reviews" ? T : COFFEE,
            }}
          >
            Đánh giá ({reviews.length})
          </button>
        </div>

        {activeTab === "products" ? (
          <div className="grid grid-cols-5 gap-5">
            {sellerProducts.map((p) => (
              <ProductCard key={p.id} product={p} onLike={() => {}} go={go} onAddToCart={onAddToCart} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-6">
            {reviews.length === 0 ? (
              <div className="col-span-2 p-12 text-center" style={{ color: COFFEE, ...ff }}>
                <MessageCircle size={48} className="mx-auto mb-4 opacity-50" />
                <p className="font-semibold text-lg">Shop chưa có đánh giá nào</p>
                <p className="text-sm mt-1">Hãy là người đầu tiên trải nghiệm và đánh giá nhé!</p>
              </div>
            ) : (
              reviews.map((review: any) => (
                <div key={review.id} className="p-6 rounded-3xl flex gap-5 shadow-sm" style={{ backgroundColor: CARD }}>
                  <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center font-bold text-lg" style={{ color: COFFEE }}>
                    {review.userName?.[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-1">
                      <div>
                        <h4 className="font-bold text-base" style={{ color: ESPRESSO }}>{review.userName}</h4>
                        <p className="text-xs mt-0.5" style={{ color: MUTED }}>{new Date(review.createdAt).toLocaleDateString("vi-VN")}</p>
                      </div>
                      <div className="flex text-amber-500">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} size={16} fill={i < review.rating ? "currentColor" : "none"} stroke="currentColor" />
                        ))}
                      </div>
                    </div>
                    <p className="text-sm mt-3 leading-relaxed" style={{ color: ESPRESSO }}>{review.comment || "Không có bình luận"}</p>
                    <div className="mt-4 p-3 rounded-xl flex gap-3 items-center cursor-pointer transition-all hover:bg-black/5" style={{ backgroundColor: SOFT }} onClick={() => go("product-detail", { id: parseInt(review.productId) || 0 } as any)}>
                      <img src={review.productImage} alt={review.productName} className="w-12 h-12 rounded-lg object-cover" />
                      <div>
                        <p className="text-xs font-semibold line-clamp-1" style={{ color: ESPRESSO }}>{review.productName}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}