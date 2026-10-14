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

// Flat shipping fee default (fallback when distance cannot be computed).
export const SHIPPING_FEE = 20_000;

// Decoration fee has been removed: 0 VND for all sizes.
export const DECORATION_FEE_BY_SIZE: Record<TreeSize, number> = {
  S: 0,
  M: 0,
  L: 0,
};

// ── Shipping distance & fee policy ──────────────────────────────────────────
export const SHIPPING_RATES = {
  BASE_KM: 5,
  BASE_FEE: 30_000,
  TIER1_MAX_KM: 20,
  TIER1_PER_KM: 4_600,
  TIER2_BASE_FEE: 100_000,
  TIER2_MAX_KM: 60,
  TIER2_PER_KM: 4_300,
};

// ── Default Shop Warehouse ──────────────────────────────────────────────────
export interface WarehouseLocation {
  name: string;
  phone: string;
  address: string;
  communeId: string;
  communeName: string;
  district?: string;
  provinceId: string;
  provinceName: string;
  lat: number;
  lng: number;
}

export const DEFAULT_WAREHOUSE: WarehouseLocation = {
  name: "Kho Trung Tâm Rừng Trong Phố",
  phone: "0901234567",
  address: "Lô E2a-7, Đường D1, Khu Công Nghệ Cao",
  communeId: "26842",
  communeName: "Phường Tăng Nhơn Phú",
  provinceId: "79",
  provinceName: "Thành phố Hồ Chí Minh",
  lat: 10.8447,
  lng: 106.7909,
};

// CAS Address Kit province id for TP.HCM. Override via SERVICE_PROVINCE_ID
// if you switch delivery regions later.
export const SERVICE_PROVINCE_ID =
  process.env.SERVICE_PROVINCE_ID?.trim() || "79";

// Personalization regex (Unicode letters/digits + space + . ' - &)
export const PERSONALIZATION_REGEX = /^[\p{L}\p{N} .'\-&]+$/u;
export const PERSONALIZATION_DEFAULT_MAX_LENGTH = 12;