import React from "react";
import { Star } from "lucide-react";
import { T, ESPRESSO, COFFEE, LINEN, MUTED, ff, serif } from "../../lib/theme";
import { ProductCard } from "../../components/product/ProductCard";
import type { Screen, Product, Seller } from "../../types";

// ── Seller Screen ──────────────────────────────────────────────────────────────
export function SellerScreen({ seller, go, products, onAddToCart }: { seller: Seller; go: (s: Screen, p?: Product, se?: Seller) => void; products: Product[]; onAddToCart: (product: Product) => void }) {
  const sellerProducts = products.filter(p => p.seller === seller.handle);

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
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold" style={{ ...serif, color: ESPRESSO }}>
            Sản phẩm của shop ({sellerProducts.length})
          </h2>
        </div>

        <div className="grid grid-cols-5 gap-5">
          {sellerProducts.map((p) => (
            <ProductCard key={p.id} product={p} onLike={() => {}} go={go} onAddToCart={onAddToCart} />
          ))}
        </div>
      </div>
    </div>
  );
}