import {
  DEFAULT_WAREHOUSE,
  SHIPPING_RATES,
  WarehouseLocation,
} from "../config/business";

// ── In-memory Geocoding Cache ────────────────────────────────────────────────
const geoCache = new Map<string, { lat: number; lng: number }>();

// Preload known reference points across TP.HCM districts for fast fallback
const KNOWN_HCM_COORDINATES: Record<string, { lat: number; lng: number }> = {
  // Thủ Đức
  "long thạnh mỹ": { lat: 10.8411, lng: 106.8099 },
  "tăng nhơn phú a": { lat: 10.8447, lng: 106.7909 },
  "tăng nhơn phú b": { lat: 10.8357, lng: 106.7865 },
  "hiệp phú": { lat: 10.8455, lng: 106.7762 },
  "linh trung": { lat: 10.8647, lng: 106.7845 },
  "linh chiểu": { lat: 10.8526, lng: 106.7648 },
  "thảo điền": { lat: 10.8037, lng: 106.7335 },
  "an phú": { lat: 10.7958, lng: 106.7455 },
  // Quận 1
  "bến nghé": { lat: 10.7769, lng: 106.7009 },
  "bến thành": { lat: 10.7721, lng: 106.6983 },
  "đa kao": { lat: 10.7877, lng: 106.6975 },
  "tân định": { lat: 10.7915, lng: 106.6908 },
  // Quận 3
  "võ thị sáu": { lat: 10.7846, lng: 106.6879 },
  // Quận 5, 10
  "phường 1": { lat: 10.7588, lng: 106.6781 },
  // Bình Thạnh
  "phường 25": { lat: 10.8016, lng: 106.7161 },
  // Gò Vấp
  "phường 10": { lat: 10.8347, lng: 106.6661 },
  // Tân Bình
  "phường 2": { lat: 10.8089, lng: 106.6622 },
};

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

  if (roundedKm > SHIPPING_RATES.TIER2_MAX_KM) {
    return {
      fee: 0,
      breakdown: `Khoảng cách ${roundedKm}km vượt quá vùng phục vụ tối đa (${SHIPPING_RATES.TIER2_MAX_KM}km)`,
      supported: false,
    };
  }

  if (roundedKm <= SHIPPING_RATES.BASE_KM) {
    return {
      fee: SHIPPING_RATES.BASE_FEE,
      breakdown: `Cước cố định ${SHIPPING_RATES.BASE_FEE.toLocaleString("vi-VN")}đ (${roundedKm}km <= ${SHIPPING_RATES.BASE_KM}km)`,
      supported: true,
    };
  }

  if (roundedKm <= SHIPPING_RATES.TIER1_MAX_KM) {
    const extraKm = Math.round((roundedKm - SHIPPING_RATES.BASE_KM) * 10) / 10;
    const extraFee = Math.round(extraKm * SHIPPING_RATES.TIER1_PER_KM);
    const fee = SHIPPING_RATES.BASE_FEE + extraFee;
    return {
      fee,
      breakdown: `${SHIPPING_RATES.BASE_FEE.toLocaleString("vi-VN")}đ (5km đầu) + ${extraFee.toLocaleString("vi-VN")}đ (${extraKm}km × ${SHIPPING_RATES.TIER1_PER_KM.toLocaleString("vi-VN")}đ)`,
      supported: true,
    };
  }

  // 20km < km <= 60km
  const extraKm = Math.round((roundedKm - SHIPPING_RATES.TIER1_MAX_KM) * 10) / 10;
  const extraFee = Math.round(extraKm * SHIPPING_RATES.TIER2_PER_KM);
  const fee = SHIPPING_RATES.TIER2_BASE_FEE + extraFee;
  return {
    fee,
    breakdown: `${SHIPPING_RATES.TIER2_BASE_FEE.toLocaleString("vi-VN")}đ (20km đầu) + ${extraFee.toLocaleString("vi-VN")}đ (${extraKm}km × ${SHIPPING_RATES.TIER2_PER_KM.toLocaleString("vi-VN")}đ)`,
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
  const R = 6371; // Earth's mean radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ── Resolve Coordinates for a Ward/Address in TP.HCM ────────────────────────
export async function geocodeHcmAddress(
  address: string,
  communeName: string
): Promise<{ lat: number; lng: number } | null> {
  const cleanCommune = (communeName || "").trim().toLowerCase();
  const cleanAddress = (address || "").trim().toLowerCase();

  // 1) Fast static lookup
  for (const [key, coords] of Object.entries(KNOWN_HCM_COORDINATES)) {
    if (cleanCommune.includes(key) || cleanAddress.includes(key)) {
      return coords;
    }
  }

  // 2) Cache check
  const cacheKey = `${cleanAddress}|${cleanCommune}`;
  if (geoCache.has(cacheKey)) {
    return geoCache.get(cacheKey)!;
  }

  // 3) Fallback geocoding via OpenStreetMap Nominatim
  const query = [cleanAddress, cleanCommune, "Hồ Chí Minh", "Việt Nam"]
    .filter(Boolean)
    .join(", ");

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
      query
    )}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

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

  // Default coordinate if unresolvable (Central HCM)
  return { lat: 10.7769, lng: 106.7009 };
}

// ── Main Shipping Quote Engine ───────────────────────────────────────────────
export async function calculateShippingQuote(
  input: ShippingQuoteInput
): Promise<ShippingQuoteOutput> {
  // 1. Resolve Warehouse (Origin)
  const warehouse: WarehouseLocation = {
    name: input.fromAddress?.address
      ? "Kho chỉ định"
      : DEFAULT_WAREHOUSE.name,
    phone: input.fromAddress?.address
      ? ""
      : DEFAULT_WAREHOUSE.phone,
    address: input.fromAddress?.address || DEFAULT_WAREHOUSE.address,
    communeId: input.fromAddress?.communeId || DEFAULT_WAREHOUSE.communeId,
    communeName: input.fromAddress?.communeName || DEFAULT_WAREHOUSE.communeName,
    provinceId: input.fromAddress?.provinceId || DEFAULT_WAREHOUSE.provinceId,
    provinceName: input.fromAddress?.provinceName || DEFAULT_WAREHOUSE.provinceName,
    lat:
      typeof input.fromAddress?.lat === "number"
        ? input.fromAddress.lat
        : DEFAULT_WAREHOUSE.lat,
    lng:
      typeof input.fromAddress?.lng === "number"
        ? input.fromAddress.lng
        : DEFAULT_WAREHOUSE.lng,
  };

  // 2. Resolve Destination info
  const destAddress = (input.toAddress || "").trim();
  const destCommuneName = (input.toCommuneName || "").trim();
  const destProvinceName =
    (input.toProvinceName || "Thành phố Hồ Chí Minh").trim();

  // 3. Compute distance (km)
  let computedKm: number;

  if (typeof input.distanceKm === "number" && input.distanceKm >= 0) {
    // Client already provided explicit road distance
    computedKm = Math.round(input.distanceKm * 10) / 10;
  } else {
    // Calculate from coordinates
    let destCoords: { lat: number; lng: number } | null = null;
    if (typeof input.lat === "number" && typeof input.lng === "number") {
      destCoords = { lat: input.lat, lng: input.lng };
    } else {
      destCoords = await geocodeHcmAddress(destAddress, destCommuneName);
    }

    if (!destCoords) {
      computedKm = 8.0; // Fallback reasonable default distance inside HCM
    } else {
      const crowDistance = haversineDistanceKm(
        warehouse.lat,
        warehouse.lng,
        destCoords.lat,
        destCoords.lng
      );
      // City driving route road factor ≈ 1.25
      computedKm = Math.round(crowDistance * 1.25 * 10) / 10;
    }
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
