// ── Business constants (Build Your Christmas) ───────────────────────────────
// All money is in VND (integer). All shipping/decorating/seed prices are
// illustrative — replace with supplier quotes via admin API.

export type DeliveryOption = "READY_TO_DISPLAY" | "DIY_KIT" | "SEPARATE";
export type TreeSize =  "M" | "L" | "XL" | "2XL";

export const DELIVERY_OPTIONS: ReadonlyArray<DeliveryOption> = [
  "READY_TO_DISPLAY",
  "DIY_KIT",
  "SEPARATE",
];

// Flat shipping fee default (fallback when distance cannot be computed).
export const SHIPPING_FEE = 20_000;

// Decoration fee has been removed: 0 VND for all sizes.
export const DECORATION_FEE_BY_SIZE: Record<TreeSize, number> = {
  M: 0,
  L: 0,
  XL: 0,
  "2XL": 0,
};

// ── Shipping distance & fee policy ──────────────────────────────────────────
export const SHIPPING_RATES = {
  BASE_KM: 5,
  BASE_FEE: 30_000,
  TIER1_MAX_KM: 20,
  TIER1_PER_KM: 4_600,
  TIER2_BASE_FEE: 120_000,
  TIER2_MAX_KM: 60,
  TIER2_PER_KM: 4_300,
};

// CAS Address Kit province id for TP.HCM. Override via SERVICE_PROVINCE_ID
// if you switch delivery regions later.
export const SERVICE_PROVINCE_ID =
  process.env.SERVICE_PROVINCE_ID?.trim() || "79";

// ── Shop Warehouse Location Type ────────────────────────────────────────────
// Không hardcode địa chỉ hay toạ độ kho tại đây; toàn bộ thông tin địa chỉ
// được nhập từ FE / Admin và lưu trong DB (WarehouseConfig).
export interface WarehouseLocation {
  name: string;
  phone: string;
  address: string;
  communeId: string;
  communeName: string;
  district?: string;
  provinceId: string;
  provinceName: string;
  lat?: number;
  lng?: number;
}

// Personalization regex (Unicode letters/digits + space + . ' - &)
export const PERSONALIZATION_REGEX = /^[\p{L}\p{N} .'\-&]+$/u;
export const PERSONALIZATION_DEFAULT_MAX_LENGTH = 12;