import { useEffect, useState } from "react";
import { Search, X, ChevronDown, Sparkles } from "lucide-react";
import { ProductCard } from "../../components/product/ProductCard";
import { FilterSidebar } from "../../components/product/FilterSidebar";
import { T, MUTED, COFFEE, LINEN, CARD, ESPRESSO, SOFT, ff, serif } from "../../lib/theme";
import type { FilterState, Product, Screen } from "../../types";

interface SearchScreenProps {
  products: Product[];
  onLike: (id: number) => void;
  go: (s: Screen, p?: Product) => void;
  onAddToCart: (product: Product) => void;
  activeTag?: string;
  headerQuery?: string;
}

export function SearchScreen({
  products,
  onLike,
  go,
  onAddToCart,
  activeTag,
  headerQuery,
}: SearchScreenProps) {
  const [query, setQuery] = useState(headerQuery || "");
  const [sort, setSort] = useState("Mới nhất");
  const [filters, setFilters] = useState<FilterState>({
    cats: [],
    minP: "",
    maxP: "",
    sizes: [],
    cond: 50,
    ai: false,
  });

  useEffect(() => {
    if (activeTag === "Tất cả" || !activeTag) {
      setFilters({ cats: [], minP: "", maxP: "", sizes: [], cond: 50, ai: false });
    } else if (activeTag === "Áo") {
      setFilters({ cats: ["Áo"], minP: "", maxP: "", sizes: [], cond: 50, ai: false });
    } else if (activeTag === "Quần") {
      setFilters({ cats: ["Quần"], minP: "", maxP: "", sizes: [], cond: 50, ai: false });
    } else if (activeTag === "Váy") {
      setFilters({ cats: ["Váy"], minP: "", maxP: "", sizes: [], cond: 50, ai: false });
    } else if (activeTag === "Áo khoác") {
      setFilters({ cats: ["Áo khoác"], minP: "", maxP: "", sizes: [], cond: 50, ai: false });
    } else if (activeTag === "Phụ kiện") {
      setFilters({ cats: ["Phụ kiện"], minP: "", maxP: "", sizes: [], cond: 50, ai: false });
    } else if (activeTag === "Độ mới >90%") {
      setFilters({ cats: [], minP: "", maxP: "", sizes: [], cond: 90, ai: false });
    } else if (activeTag === "Gần đây") {
      setFilters({ cats: [], minP: "", maxP: "", sizes: [], cond: 50, ai: false });
    }
  }, [activeTag]);

  const filteredProducts = products.filter((p) => {
    const q = query.toLowerCase();
    const matchesQuery =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.seller.toLowerCase().includes(q);
    const matchesCat = filters.cats.length === 0 || filters.cats.includes(p.category);
    const matchesSize = filters.sizes.length === 0 || filters.sizes.includes(p.size);
    const matchesCond = p.condition >= filters.cond;
    const minPrice = filters.minP ? parseInt(filters.minP.replace(/\D/g, "")) : 0;
    const maxPrice = filters.maxP ? parseInt(filters.maxP.replace(/\D/g, "")) : Infinity;
    const matchesPrice = p.price >= minPrice && p.price <= maxPrice;
    return matchesQuery && matchesCat && matchesSize && matchesCond && matchesPrice;
  });

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    switch (sort) {
      case "Giá tăng dần":
        return a.price - b.price;
      case "Giá giảm dần":
        return b.price - a.price;
      case "Độ mới cao nhất":
        return b.condition - a.condition;
      case "Nổi bật nhất":
        return (b.liked ? 1 : 0) - (a.liked ? 1 : 0);
      default:
        return a.id - b.id;
    }
  });

  return (
    <div className="min-h-screen" style={{ backgroundColor: LINEN }}>
      <div className="max-w-[1440px] mx-auto px-8 py-8">
        <div className="mb-6">
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ backgroundColor: CARD, border: `1.5px solid ${MUTED}` }}
          >
            <Search size={18} style={{ color: COFFEE }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm sản phẩm..."
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: ESPRESSO, ...ff }}
            />
            {query && (
              <button onClick={() => setQuery("")} className="p-1 rounded-full hover:bg-gray-100">
                <X size={16} style={{ color: COFFEE }} />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold" style={{ ...serif, color: ESPRESSO }}>
              {query ? (
                <>
                  Kết quả cho <span style={{ color: T }}>"{query}"</span>
                </>
              ) : (
                "Tất cả sản phẩm"
              )}
            </h2>
            <p className="text-sm mt-0.5" style={{ color: COFFEE, ...ff }}>
              {sortedProducts.length} sản phẩm
              {filters.cats.length > 0 ||
              filters.sizes.length > 0 ||
              filters.minP ||
              filters.maxP
                ? " · Đã lọc"
                : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm" style={{ color: COFFEE, ...ff }}>
              Sắp xếp theo:
            </span>
            <div className="relative">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 rounded-xl text-sm outline-none border cursor-pointer"
                style={{ border: `1.5px solid ${MUTED}`, color: ESPRESSO, backgroundColor: CARD, ...ff }}
              >
                {["Mới nhất", "Giá tăng dần", "Giá giảm dần", "Độ mới cao nhất", "Nổi bật nhất"].map(
                  (o) => (
                    <option key={o}>{o}</option>
                  )
                )}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: COFFEE }}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-7">
          <FilterSidebar filters={filters} onChange={setFilters} />
          <div className="flex-1">
            {!filters.ai && (
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-xl mb-6"
                style={{ backgroundColor: `${T}18`, border: `1.5px solid ${T}44` }}
              >
                <Sparkles size={18} style={{ color: T }} />
                <p className="text-sm" style={{ color: ESPRESSO, ...ff }}>
                  <strong>AI gợi ý:</strong> Dựa trên lịch sử tìm kiếm, bạn có thể thích các kiểu áo
                  linen cổ điển và áo sơ mi vintage oversize.
                </p>
              </div>
            )}

            <div className="grid grid-cols-4 gap-5">
              {sortedProducts.map((p) => (
                <ProductCard key={p.id} product={p} onLike={onLike} go={go} onAddToCart={onAddToCart} />
              ))}
            </div>

            {sortedProducts.length === 0 && (
              <div className="text-center py-20">
                <p className="text-lg font-bold" style={{ color: ESPRESSO }}>
                  Không tìm thấy sản phẩm nào
                </p>
                <p className="text-sm mt-2" style={{ color: COFFEE }}>
                  Thử điều chỉnh bộ lọc hoặc từ khóa tìm kiếm
                </p>
              </div>
            )}

            {sortedProducts.length > 0 && (
              <div className="flex justify-center mt-10">
                <button
                  className="px-8 py-3 rounded-xl text-sm font-bold border-2 transition-all hover:opacity-80"
                  style={{ border: `2px solid ${T}`, color: T, ...ff }}
                >
                  Tải thêm sản phẩm
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
