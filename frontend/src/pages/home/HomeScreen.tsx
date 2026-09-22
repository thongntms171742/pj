import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { ProductCard } from "../../components/product/ProductCard";
import { SellerCard } from "../../components/product/SellerCard";
import { T, MUTED, COFFEE, LINEN, ESPRESSO, SOFT, CARD, serif, ff } from "../../lib/theme";
import type { Product, Screen, Seller } from "../../types";
import { api } from "../../lib/api";
import type { ApiSeller } from "../../lib/api";
import { adaptSeller } from "../../lib/adapters";

interface HomeScreenProps {
  go: (s: Screen, p?: Product, se?: Seller) => void;
  products: Product[];
  onLike: (id: number) => void;
  onAddToCart: (product: Product) => void;
  loading?: boolean;
}

function ProductSkeleton() {
  return (
    <div
      className="rounded-2xl overflow-hidden animate-pulse"
      style={{ backgroundColor: CARD, border: `1px solid ${MUTED}` }}
    >
      <div className="w-full h-52" style={{ backgroundColor: SOFT }} />
      <div className="p-3 space-y-2">
        <div className="h-3 rounded w-3/4" style={{ backgroundColor: SOFT }} />
        <div className="h-3 rounded w-1/2" style={{ backgroundColor: SOFT }} />
        <div className="h-4 rounded w-1/3 mt-2" style={{ backgroundColor: SOFT }} />
      </div>
    </div>
  );
}

function SellerSkeleton() {
  return (
    <div
      className="rounded-2xl p-5 animate-pulse"
      style={{ backgroundColor: CARD, border: `1px solid ${MUTED}` }}
    >
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-full" style={{ backgroundColor: SOFT }} />
        <div className="flex-1 space-y-2">
          <div className="h-3 rounded w-2/3" style={{ backgroundColor: SOFT }} />
          <div className="h-2 rounded w-1/2" style={{ backgroundColor: SOFT }} />
        </div>
      </div>
    </div>
  );
}

export function HomeScreen({ go, products, onLike, onAddToCart, loading }: HomeScreenProps) {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [sellersLoading, setSellersLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api
      .get<{ sellers: ApiSeller[] }>("/sellers")
      .then((res) => {
        if (mounted) setSellers(res.sellers.map(adaptSeller));
      })
      .catch(() => {
        // backend unreachable — show empty list, not mock
      })
      .finally(() => mounted && setSellersLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  const productGrid = (
    <div className="grid grid-cols-5 gap-5">
      {loading
        ? Array.from({ length: 10 }).map((_, i) => <ProductSkeleton key={i} />)
        : products.length === 0
          ? (
            <div className="col-span-5 py-16 text-center" style={{ color: COFFEE, ...ff }}>
              Chưa có sản phẩm nào. Hãy là người đầu tiên đăng bán!
            </div>
          )
          : products.map((p) => (
            <ProductCard go={go} key={p.id} product={p} onLike={onLike} onAddToCart={onAddToCart} />
          ))}
    </div>
  );

  return (
    <div style={{ backgroundColor: LINEN }}>
      {/* Hero banner */}
      <div className="relative w-full overflow-hidden" style={{ height: "340px" }}>
        <img
          src="https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=1440&h=400&fit=crop&auto=format"
          alt="Vintage collection"
          className="w-full h-full object-cover object-top"
        />
        <div
          className="absolute inset-0 flex items-center"
          style={{
            background:
              "linear-gradient(90deg, rgba(58,35,18,0.8) 0%, rgba(58,35,18,0.3) 60%, transparent 100%)",
          }}
        >
          <div className="max-w-[1440px] mx-auto w-full px-8">
            <p className="text-sm font-bold mb-2 uppercase tracking-widest" style={{ color: T, ...ff }}>
              ✦ Bộ sưu tập mới tuần này
            </p>
            <h2 className="text-5xl font-bold leading-tight mb-4" style={{ ...serif, color: LINEN }}>
              Mặc vintage,
              <br />
              sống có tâm 🌿
            </h2>
            <p className="text-base mb-6" style={{ color: MUTED, ...ff }}>
              Mua và bán đồ cũ — góp phần giảm thiểu lãng phí thời trang
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => go("search")}
                className="px-6 py-3 rounded-xl font-bold text-sm transition-all hover:opacity-90 shadow-lg"
                style={{ backgroundColor: T, color: LINEN, ...ff }}
              >
                Khám phá ngay
              </button>
              <button
                onClick={() => go("post")}
                className="px-6 py-3 rounded-xl font-bold text-sm border-2 transition-all hover:bg-white/10"
                style={{ border: `2px solid ${LINEN}`, color: LINEN, ...ff }}
              >
                + Đăng bán cá nhân
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-8 py-12">
        {/* Trusted Sellers */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold" style={{ ...serif, color: ESPRESSO }}>
                Gợi ý Shop Uy Tín
              </h2>
              <p className="text-sm mt-0.5" style={{ color: COFFEE, ...ff }}>
                Được đánh giá cao từ cộng đồng thrift it!
              </p>
            </div>
            <button
              className="text-sm font-semibold flex items-center gap-1 hover:underline"
              style={{ color: T, ...ff }}
            >
              Xem tất cả <ChevronRight size={15} />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-5">
            {sellersLoading
              ? Array.from({ length: 4 }).map((_, i) => <SellerSkeleton key={i} />)
              : sellers.length === 0
                ? (
                  <div className="col-span-4 py-12 text-center" style={{ color: COFFEE, ...ff }}>
                    Chưa có shop nào.
                  </div>
                )
                : sellers.map((s) => (
                  <SellerCard key={s.id} seller={s} go={go} />
                ))}
          </div>
        </div>

        {/* New Listings */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold" style={{ ...serif, color: ESPRESSO }}>
                Mới Đăng{" "}
                <span className="text-lg font-normal italic ml-2" style={{ color: COFFEE }}>
                  Recently Listed
                </span>
              </h2>
              <p className="text-sm mt-0.5" style={{ color: COFFEE, ...ff }}>
                Những món mới nhất từ cộng đồng thrift it!
              </p>
            </div>
            <button
              onClick={() => go("search")}
              className="text-sm font-semibold flex items-center gap-1 hover:underline"
              style={{ color: T, ...ff }}
            >
              Xem tất cả <ChevronRight size={15} />
            </button>
          </div>
          {productGrid}
        </div>
      </div>
    </div>
  );
}
