import { T } from "../../lib/theme";

// ── Logo ───────────────────────────────────────────────────────────────────────
export function ThriftLogo({ size = 48 }: { size?: number }) {
  return (
    <img
      src="https://i.postimg.cc/44tgtTTG/thrift-logo.png"
      alt="thrift it! Logo"
      style={{
        width: size,
        height: size,
        objectFit: "contain",
      }}
    />
  );
}

// ── Reusable inline check-box matching the brand ──────────────────────────────
export function BrandCheckbox({ checked, onClick }: { checked: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 flex items-center justify-center rounded transition-all"
      style={{
        width: 20,
        height: 20,
        border: `2px solid ${checked ? T : "#E8D5BC"}`,
        backgroundColor: checked ? T : "transparent",
      }}
    >
      {checked && (
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <path d="M1 5.5L4.5 9L10 2" stroke="#FAF0E6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
