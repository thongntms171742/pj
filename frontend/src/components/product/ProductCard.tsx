import { Heart } from "lucide-react";
import { T, COFFEE, LINEN, CARD, MUTED, ESPRESSO, serif, fmt } from "../../lib/theme";
import type { Product, Screen, Seller } from "../../types";

interface ProductCardProps {
  product: Product;
  onLike: (id: number) => void;
  go: (s: Screen, p?: Product, se?: Seller) => void;
  onAddToCart?: (product: Product) => void;
}

export function ProductCard({ product, onLike, go }: ProductCardProps) {
  const condColor = product.condition >= 90 ? "#27AE60" : product.condition >= 75 ? T : "#E67E22";
  const isSold = product.status === "sold";
  return (
    <div
      onClick={() => go("product-detail", product)}
      className="rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-200 cursor-pointer group"
      style={{ backgroundColor: CARD, border: `1px solid ${MUTED}` }}
    >
      <div className="relative overflow-hidden" style={{ paddingBottom: "130%" }}>
        <img
          src={product.image}
          alt={product.name}
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        {isSold && (
          <div className="absolute inset-0 bg-black/55 backdrop-blur-[0.5px] flex items-center justify-center z-10">
            <span
              className="text-[11px] font-bold tracking-widest text-white px-2.5 py-1.5 border-2 border-white rounded-lg rotate-12"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              ĐÃ BÁN
            </span>
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onLike(product.id);
          }}
          className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full flex items-center justify-center shadow-md transition-all hover:scale-110"
          style={{ backgroundColor: "rgba(255,248,240,0.9)" }}
        >
          <Heart size={15} fill={product.liked ? T : "none"} stroke={product.liked ? T : COFFEE} />
        </button>
        <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5">
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: condColor, color: LINEN, fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            {product.condition}%
          </span>
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: "rgba(58,35,18,0.75)",
              color: LINEN,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            {product.size}
          </span>
        </div>
      </div>
      <div className="p-3">
        <p className="text-sm font-semibold truncate leading-snug" style={{ color: ESPRESSO, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          {product.name}
        </p>
        <p className="text-xs mt-0.5" style={{ color: COFFEE, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          {product.sellerName ? `Shop: ${product.sellerName}` : `@${product.seller}`}
        </p>
        <p className="text-base font-bold mt-1.5" style={{ ...serif, color: T }}>
          {fmt(product.price)}
        </p>
      </div>
    </div>
  );
}
