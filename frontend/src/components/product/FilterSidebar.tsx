import { T, MUTED, COFFEE, ESPRESSO, SOFT, CARD, LINEN, ff } from "../../lib/theme";
import type { FilterState } from "../../types";

interface FilterSidebarProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}

export function FilterSidebar({ filters, onChange }: FilterSidebarProps) {
  const { cats, minP, maxP, sizes, cond, ai } = filters;

  const toggleCat = (c: string) =>
    onChange({
      ...filters,
      cats: cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c],
    });
  const toggleSize = (s: string) =>
    onChange({
      ...filters,
      sizes: sizes.includes(s) ? sizes.filter((x) => x !== s) : [...sizes, s],
    });
  const setMinP = (v: string) => onChange({ ...filters, minP: v });
  const setMaxP = (v: string) => onChange({ ...filters, maxP: v });
  const setCond = (v: number) => onChange({ ...filters, cond: v });
  const setAi = (v: boolean) => onChange({ ...filters, ai: v });
  const clearAll = () =>
    onChange({ cats: [], minP: "", maxP: "", sizes: [], cond: 50, ai: false });

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="py-5" style={{ borderBottom: `1px solid ${MUTED}` }}>
      <h4 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: COFFEE, ...ff }}>
        {label}
      </h4>
      {children}
    </div>
  );

  return (
    <aside
      className="w-60 flex-shrink-0 rounded-2xl overflow-hidden shadow-sm"
      style={{
        backgroundColor: CARD,
        border: `1px solid ${MUTED}`,
        alignSelf: "start",
        position: "sticky",
        top: "128px",
      }}
    >
      <div className="px-5 pt-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold" style={{ ...ff, fontFamily: "'Playfair Display', serif", color: ESPRESSO }}>
            Bộ lọc nâng cao
          </h3>
          <button
            onClick={clearAll}
            className="text-xs font-semibold hover:underline"
            style={{ color: T, ...ff }}
          >
            Xóa tất cả
          </button>
        </div>
        <p className="text-xs" style={{ color: COFFEE, ...ff }}>
          Tìm đúng món bạn cần
        </p>
      </div>
      <div className="px-5">
        <Row label="Danh mục">
          <div className="space-y-2">
            {["Áo", "Quần", "Váy", "Áo khoác", "Phụ kiện"].map((c) => (
              <label key={c} className="flex items-center gap-2.5 cursor-pointer group">
                <div
                  onClick={() => toggleCat(c)}
                  className="w-4 h-4 rounded border-2 flex items-center justify-center transition-all"
                  style={{
                    borderColor: cats.includes(c) ? T : MUTED,
                    backgroundColor: cats.includes(c) ? T : "transparent",
                  }}
                >
                  {cats.includes(c) && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M1 5L4 8L9 2" stroke={LINEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className="text-sm" style={{ color: ESPRESSO, ...ff }}>
                  {c}
                </span>
              </label>
            ))}
          </div>
        </Row>

        <Row label="Khoảng giá (₫)">
          <div className="space-y-2">
            <input
              value={minP}
              onChange={(e) => setMinP(e.target.value)}
              placeholder="Từ"
              className="w-full px-3 py-2 rounded-lg text-xs outline-none border"
              style={{ border: `1.5px solid ${MUTED}`, color: ESPRESSO, backgroundColor: SOFT, ...ff }}
            />
            <input
              value={maxP}
              onChange={(e) => setMaxP(e.target.value)}
              placeholder="Đến"
              className="w-full px-3 py-2 rounded-lg text-xs outline-none border"
              style={{ border: `1.5px solid ${MUTED}`, color: ESPRESSO, backgroundColor: SOFT, ...ff }}
            />
            <div className="flex gap-1.5 flex-wrap">
              {[
                { label: "< 100k", min: "", max: "100000" },
                { label: "100-300k", min: "100000", max: "300000" },
                { label: "300-500k", min: "300000", max: "500000" },
                { label: "> 500k", min: "500000", max: "" },
              ].map((r) => {
                const isActive = minP === r.min && maxP === r.max;
                return (
                  <button
                    key={r.label}
                    onClick={() => {
                      setMinP(r.min);
                      setMaxP(r.max);
                    }}
                    className="text-[10px] px-2.5 py-1 rounded-full border transition-all"
                    style={{
                      border: `1px solid ${isActive ? T : MUTED}`,
                      backgroundColor: isActive ? T : "transparent",
                      color: isActive ? LINEN : COFFEE,
                      ...ff,
                    }}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>
        </Row>

        <Row label="Kích cỡ">
          <div className="flex flex-wrap gap-1.5">
            {["XS", "S", "M", "L", "XL", "XXL", "XXXL"].map((s) => (
              <button
                key={s}
                onClick={() => toggleSize(s)}
                className="w-10 h-8 rounded-lg text-xs font-bold border transition-all"
                style={{
                  border: `1.5px solid ${sizes.includes(s) ? T : MUTED}`,
                  backgroundColor: sizes.includes(s) ? T : "transparent",
                  color: sizes.includes(s) ? LINEN : COFFEE,
                  ...ff,
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </Row>

        <Row label={`Độ mới tối thiểu: ${cond}%`}>
          <input
            type="range"
            min={30}
            max={100}
            value={cond}
            onChange={(e) => setCond(Number(e.target.value))}
            className="w-full h-2 rounded-full cursor-pointer"
            style={{ accentColor: T }}
          />
          <div className="flex justify-between mt-1">
            <span className="text-[10px]" style={{ color: COFFEE, ...ff }}>
              30%
            </span>
            <span className="text-[10px]" style={{ color: COFFEE, ...ff }}>
              100%
            </span>
          </div>
        </Row>

        <div className="py-5" style={{ borderBottom: `1px solid ${MUTED}` }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold" style={{ color: ESPRESSO, ...ff }}>
                ✨ Gợi ý từ AI
              </p>
              <p className="text-xs mt-0.5" style={{ color: COFFEE, ...ff }}>
                Để AI tìm món phù hợp phong cách bạn
              </p>
            </div>
            <button
              onClick={() => setAi(!ai)}
              className="w-12 h-6 rounded-full transition-all relative"
              style={{ backgroundColor: ai ? T : MUTED }}
            >
              <span
                className="absolute top-0.5 w-5 h-5 rounded-full transition-all shadow-sm"
                style={{ backgroundColor: "white", left: ai ? "calc(100% - 22px)" : "2px" }}
              />
            </button>
          </div>
        </div>

        <div className="py-5">
          <button
            className="w-full py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-90"
            style={{ backgroundColor: T, color: LINEN, ...ff }}
          >
            Áp dụng bộ lọc
          </button>
        </div>
      </div>
    </aside>
  );
}
