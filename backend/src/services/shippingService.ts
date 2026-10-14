import {
  DEFAULT_WAREHOUSE,
  SHIPPING_RATES,
  WarehouseLocation,
} from "../config/business";
import { lookupHcmCommune } from "./addressService";
import { lookupCommuneCoords } from "./hcmCommunesData";

// ── Types ────────────────────────────────────────────────────────────────────
export interface AddressInfoInput {
  address?: string;
  communeId?: string;
  communeName?: string;
  district?: string;
  provinceId?: string;
  provinceName?: string;
  lat?: number;
  lng?: number;
}

export interface ShippingQuoteInput {
  fromAddress?: AddressInfoInput;
  toAddress?: string;
  toCommuneId?: string;
  toCommuneName?: string;
  toDistrict?: string;
  toDistrictId?: string;
  toProvinceId?: string;
  toProvinceName?: string;
  distanceKm?: number;
  lat?: number;
  lng?: number;
}

export interface ShippingQuoteOutput {
  distanceKm: number;
  fee: number;
  breakdown: string;
  supported: boolean;
  message?: string;
  warehouse: {
    name: string;
    address: string;
    communeName: string;
    provinceName: string;
  };
  destination: {
    address: string;
    communeName: string;
    provinceName: string;
  };
}

// ── In-memory Geocoding Cache ────────────────────────────────────────────────
const geoCache = new Map<string, { lat: number; lng: number }>();

function formatVnd(amount: number): string {
  return `${amount.toLocaleString("vi-VN")}đ`;
}

// ── Calculate shipping fee strictly from distance (km) ──────────────────────
export function calcShippingFee(km: number): {
  fee: number;
  breakdown: string;
  supported: boolean;
} {
  if (!Number.isFinite(km) || km < 0) {
    return {
      fee: 0,
      breakdown: "Khoảng cách không hợp lệ",
      supported: false,
    };
  }

  const roundedKm = Math.round(km * 10) / 10;

  // Beyond maximum supported radius (> 60km)
  if (roundedKm > SHIPPING_RATES.TIER2_MAX_KM) {
    return {
      fee: 0,
      breakdown: `Khoảng cách ${roundedKm}km vượt quá vùng phục vụ tối đa (${SHIPPING_RATES.TIER2_MAX_KM}km)`,
      supported: false,
    };
  }

  // Base tier: 0 - 5km
  if (roundedKm <= SHIPPING_RATES.BASE_KM) {
    return {
      fee: SHIPPING_RATES.BASE_FEE,
      breakdown: `Cước cố định ${formatVnd(SHIPPING_RATES.BASE_FEE)} (${roundedKm}km <= ${SHIPPING_RATES.BASE_KM}km)`,
      supported: true,
    };
  }

  // Tier 1: 5km - 20km
  if (roundedKm <= SHIPPING_RATES.TIER1_MAX_KM) {
    const extraKm = Math.round((roundedKm - SHIPPING_RATES.BASE_KM) * 10) / 10;
    const extraFee = Math.round(extraKm * SHIPPING_RATES.TIER1_PER_KM);
    const fee = SHIPPING_RATES.BASE_FEE + extraFee;
    return {
      fee,
      breakdown: `${formatVnd(SHIPPING_RATES.BASE_FEE)} (${SHIPPING_RATES.BASE_KM}km đầu) + ${formatVnd(extraFee)} (${extraKm}km × ${formatVnd(SHIPPING_RATES.TIER1_PER_KM)})`,
      supported: true,
    };
  }

  // Tier 2: 20km - 60km
  const extraKm = Math.round((roundedKm - SHIPPING_RATES.TIER1_MAX_KM) * 10) / 10;
  const extraFee = Math.round(extraKm * SHIPPING_RATES.TIER2_PER_KM);
  const fee = SHIPPING_RATES.TIER2_BASE_FEE + extraFee;
  return {
    fee,
    breakdown: `${formatVnd(SHIPPING_RATES.TIER2_BASE_FEE)} (20km đầu) + ${formatVnd(extraFee)} (${extraKm}km × ${formatVnd(SHIPPING_RATES.TIER2_PER_KM)})`,
    supported: true,
  };
}

// ── Great circle distance (Haversine) in km ──────────────────────────────────
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// ── Geocoding Fallback via OpenStreetMap Nominatim ───────────────────────────
async function queryNominatim(query: string): Promise<{ lat: number; lng: number } | null> {
  const cacheKey = query.trim().toLowerCase();
  if (geoCache.has(cacheKey)) {
    return geoCache.get(cacheKey)!;
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
      query
    )}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "BuildYourChristmas-Backend/1.0" },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data: any = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const coords = {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
        };
        geoCache.set(cacheKey, coords);
        return coords;
      }
    }
  } catch {
    // Non-blocking fallback
  }

  return null;
}

// ── Resolve Coordinates for Destination Address ─────────────────────────────
export async function geocodeHcmAddress(
  address: string,
  communeName: string,
  district?: string
): Promise<{ lat: number; lng: number }> {
  // 1) Fast lookup by 2-level commune name
  if (communeName) {
    const found = lookupCommuneCoords(communeName);
    if (found) return { lat: found.lat, lng: found.lng };
  }

  // 2) Fast lookup in full address text
  const fullText = [address, communeName, district].filter(Boolean).join(" ");
  if (fullText) {
    const found = lookupCommuneCoords(fullText);
    if (found) return { lat: found.lat, lng: found.lng };
  }

  // 3) Try online Geocoding
  const query = [address, communeName, district, "Hồ Chí Minh", "Việt Nam"]
    .filter(Boolean)
    .join(", ");
  const onlineCoords = await queryNominatim(query);
  if (onlineCoords) return onlineCoords;

  // 4) Central HCM fallback (Quận 1)
  return { lat: 10.7769, lng: 106.7009 };
}

// ── Main Shipping Quote Engine ───────────────────────────────────────────────
export async function calculateShippingQuote(
  input: ShippingQuoteInput
): Promise<ShippingQuoteOutput> {
  // 1. Resolve Warehouse (Origin)
  const warehouse: WarehouseLocation = {
    name: input.fromAddress?.address ? "Kho chỉ định" : DEFAULT_WAREHOUSE.name,
    phone: input.fromAddress?.address ? "" : DEFAULT_WAREHOUSE.phone,
    address: input.fromAddress?.address || DEFAULT_WAREHOUSE.address,
    communeId: input.fromAddress?.communeId || DEFAULT_WAREHOUSE.communeId,
    communeName: input.fromAddress?.communeName || DEFAULT_WAREHOUSE.communeName,
    provinceId: input.fromAddress?.provinceId || DEFAULT_WAREHOUSE.provinceId,
    provinceName: input.fromAddress?.provinceName || DEFAULT_WAREHOUSE.provinceName,
    lat: typeof input.fromAddress?.lat === "number" ? input.fromAddress.lat : DEFAULT_WAREHOUSE.lat,
    lng: typeof input.fromAddress?.lng === "number" ? input.fromAddress.lng : DEFAULT_WAREHOUSE.lng,
  };

  // If custom warehouse has communeId but no lat/lng, resolve its coordinates
  if (input.fromAddress?.communeId && (!input.fromAddress.lat || !input.fromAddress.lng)) {
    const whFound = lookupCommuneCoords(input.fromAddress.communeId);
    if (whFound) {
      warehouse.lat = whFound.lat;
      warehouse.lng = whFound.lng;
    }
  }

  // 2. Resolve Destination info
  const destAddress = (input.toAddress || "").trim();
  let destCommuneName = (input.toCommuneName || "").trim();

  // If FE only sent toCommuneId, resolve official commune name from CAS
  if (!destCommuneName && input.toCommuneId) {
    try {
      const lookup = await lookupHcmCommune(input.toCommuneId);
      if (lookup?.name) {
        destCommuneName = lookup.name;
      }
    } catch {
      // Continue with best effort
    }
  }

  const destDistrict = (input.toDistrict || "").trim();
  const destProvinceName = (input.toProvinceName || "Thành phố Hồ Chí Minh").trim();

  // 3. Compute distance (km)
  let computedKm: number;

  if (typeof input.distanceKm === "number" && input.distanceKm >= 0) {
    // Client already provided explicit road distance
    computedKm = Math.round(input.distanceKm * 10) / 10;
  } else {
    // Resolve coordinates
    let destCoords: { lat: number; lng: number } | null = null;
    if (typeof input.lat === "number" && typeof input.lng === "number") {
      destCoords = { lat: input.lat, lng: input.lng };
    } else {
      // Lookup 2-level administrative commune
      if (input.toCommuneId) {
        const found = lookupCommuneCoords(input.toCommuneId);
        if (found) {
          destCoords = { lat: found.lat, lng: found.lng };
          if (!destCommuneName) destCommuneName = found.name;
        }
      }

      if (!destCoords && destCommuneName) {
        const found = lookupCommuneCoords(destCommuneName);
        if (found) destCoords = { lat: found.lat, lng: found.lng };
      }

      if (!destCoords) {
        destCoords = await geocodeHcmAddress(destAddress, destCommuneName, destDistrict);
      }
    }

    const crowDistance = haversineDistanceKm(
      warehouse.lat,
      warehouse.lng,
      destCoords.lat,
      destCoords.lng
    );

    // City driving route road factor ≈ 1.25 (minimum 1.0 km)
    computedKm = Math.max(1.0, Math.round(crowDistance * 1.25 * 10) / 10);
  }

  // 4. Calculate fee
  const { fee, breakdown, supported } = calcShippingFee(computedKm);

  return {
    distanceKm: computedKm,
    fee,
    breakdown,
    supported,
    message: supported
      ? undefined
      : `Vượt quá bán kính phục vụ ${SHIPPING_RATES.TIER2_MAX_KM}km`,
    warehouse: {
      name: warehouse.name,
      address: warehouse.address,
      communeName: warehouse.communeName,
      provinceName: warehouse.provinceName,
    },
    destination: {
      address: destAddress,
      communeName: destCommuneName,
      provinceName: destProvinceName,
    },
  };
}
