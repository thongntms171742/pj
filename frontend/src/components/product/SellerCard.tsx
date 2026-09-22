import { Star } from "lucide-react";
import { T, COFFEE, CARD, MUTED, ESPRESSO, ff } from "../../lib/theme";
import type { Seller, Screen } from "../../types";

interface SellerCardProps {
  seller: Seller;
  go?: (s: Screen, p?: any, se?: Seller) => void;
}

export function SellerCard({ seller, go }: SellerCardProps) {
  return (
    <div
      onClick={() => go && go("seller", undefined, seller)}
      className="rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer"
      style={{ backgroundColor: CARD, border: `1px solid ${MUTED}` }}
    >
      <div className="p-5">
        <div className="flex items-center gap-3 mb-3">
          <img
            src={seller.avatar}
            alt={seller.name}
            className="w-12 h-12 rounded-full object-cover border-2"
            style={{ borderColor: T }}
          />
          <div>
            <p className="text-sm font-bold" style={{ color: ESPRESSO, ...ff }}>
              {seller.name}
            </p>
            <p className="text-xs" style={{ color: COFFEE, ...ff }}>
              @{seller.handle}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 mb-3">
          <div className="flex">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} size={12} fill={i <= Math.floor(seller.rating) ? T : "none"} stroke={T} />
            ))}
          </div>
          <span className="text-xs font-bold" style={{ color: T, ...ff }}>
            {seller.rating}
          </span>
          <span className="text-xs" style={{ color: COFFEE, ...ff }}>
            · {seller.transactions} giao dịch
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {seller.thumbs.map((src, i) => (
            <div
              key={i}
              className="rounded-lg overflow-hidden"
              style={{ paddingBottom: "100%", position: "relative", backgroundColor: MUTED }}
            >
              <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" />
            </div>
          ))}
        </div>
      </div>
      <div className="px-5 pb-4">
        <button
          className="w-full py-2 rounded-xl text-xs font-bold border transition-all hover:opacity-80"
          style={{ border: `1.5px solid ${T}`, color: T, ...ff }}
        >
          Xem cửa hàng
        </button>
      </div>
    </div>
  );
}
