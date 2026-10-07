// ── Business constants (Build Your Christmas) ───────────────────────────────
// All money is in VND (integer). All shipping/decorating/seed prices are
// illustrative — replace with supplier quotes via admin API.

export type DeliveryOption = "READY_TO_DISPLAY" | "DIY_KIT" | "SEPARATE";
export type TreeSize = "S" | "M" | "L";

export const DELIVERY_OPTIONS: ReadonlyArray<DeliveryOption> = [
  "READY_TO_DISPLAY",
  "DIY_KIT",
  "SEPARATE",
];

// Flat shipping fee regardless of size.
export const SHIPPING_FEE = 30_000;

// Decoration fee applied only when customer chose "Ready to Display" service.
// Indexed by base tree size.
export const DECORATION_FEE_BY_SIZE: Record<TreeSize, number> = {
  S: 50_000,
  M: 80_000,
  L: 120_000,
};

// CAS Address Kit province id for TP.HCM. Override via SERVICE_PROVINCE_ID
// if you switch delivery regions later.
export const SERVICE_PROVINCE_ID =
  process.env.SERVICE_PROVINCE_ID?.trim() || "79";

// Personalization regex (Unicode letters/digits + space + . ' - &)
export const PERSONALIZATION_REGEX = /^[\p{L}\p{N} .'\-&]+$/u;
export const PERSONALIZATION_DEFAULT_MAX_LENGTH = 12;