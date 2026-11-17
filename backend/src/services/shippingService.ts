import mongoose from "mongoose";
import {
  SERVICE_PROVINCE_ID,
  SHIPPING_RATES,
  WarehouseLocation,
} from "../config/business";
import { WarehouseConfig } from "../models/WarehouseConfig";
import { lookupHcmCommune, WrongProvinceError } from "./addressService";
import { isHcmProvinceInput, lookupCommuneCoords } from "./hcmCommunesData";

// ── Types ────────────────────────────────────────────────────────────────────
export interface AddressInfoInput {
  name?: string;
  phone?: string;
  address?: string;
  communeId?: string;
  communeName?: string;
  ward?: string;
  district?: string;
  provinceId?: string;
  provinceName?: string;
  province?: string;
  lat?: number;
  lng?: number;
}

export interface ShippingQuoteInput {
  fromAddress?: AddressInfoInput;
  warehouseAddress?: AddressInfoInput;
  toAddress?: string;
  address?: string;
  shippingAddress?: string;
  toCommuneId?: string;
  communeId?: string;
  shippingCommuneId?: string;
  toCommuneName?: string;
  communeName?: string;
  ward?: string;
  shippingCommuneName?: string;
  toDistrict?: string;
  district?: string;
  shippingDistrict?: string;
  toDistrictId?: string;
  toProvinceId?: string;
  provinceId?: string;
  shippingProvinceId?: string;
  toProvinceName?: string;
  provinceName?: string;
  province?: string;
  shippingProvinceName?: string;
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
    phone?: string;
    address: string;
    communeId?: string;
    communeName: string;
    provinceId?: string;
    provinceName: string;
    lat?: number;
    lng?: number;
  };
  destination: {
    address: string;
    communeId?: string;
    communeName: string;
    provinceId?: string;
    provinceName: string;
  };
}

// ── Active Warehouse Runtime & DB Cache ──────────────────────────────────────
let activeWarehouseCache: WarehouseLocation | null = null;

export function resetActiveWarehouseCache(): void {
  activeWarehouseCache = null;
}

export async function getActiveWarehouse(): Promise<WarehouseLocation> {
  if (activeWarehouseCache) {
    return { ...activeWarehouseCache };
  }

  if (mongoose.connection.readyState === 1) {
    try {
      const doc = await WarehouseConfig.findOne({ key: "default" }).lean();
      if (doc) {
        activeWarehouseCache = {
          name: doc.name || "",
          phone: doc.phone || "",
          address: doc.address || "",
          communeId: doc.communeId || "",
          communeName: doc.communeName || "",
          district: doc.district || "",
          provinceId: doc.provinceId || SERVICE_PROVINCE_ID,
          provinceName: doc.provinceName || "Thành phố Hồ Chí Minh",
          lat: typeof doc.lat === "number" ? doc.lat : undefined,
          lng: typeof doc.lng === "number" ? doc.lng : undefined,
        };
        return { ...activeWarehouseCache };
      }
    } catch {
      // Fallback to empty warehouse structure if DB query fails
    }
  }

  return {
    name: "",
    phone: "",
    address: "",
    communeId: "",
    communeName: "",
    district: "",
    provinceId: SERVICE_PROVINCE_ID,
    provinceName: "Thành phố Hồ Chí Minh",
  };
}

export async function updateActiveWarehouse(
  input: AddressInfoInput,
  updatedBy = ""
): Promise<WarehouseLocation> {
  const current = await getActiveWarehouse();

  const rawProvinceId = (input.provinceId || "").trim();
  const rawProvinceName = (input.provinceName || input.province || "").trim();

  if (!isHcmProvinceInput(rawProvinceId, rawProvinceName, SERVICE_PROVINCE_ID)) {
    throw new WrongProvinceError(
      `Hệ thống chỉ hỗ trợ kho gửi hàng tại TP. Hồ Chí Minh (provinceId=${SERVICE_PROVINCE_ID})`
    );
  }

  const nextName =
    input.name !== undefined && input.name.trim() ? input.name.trim() : current.name;
  const nextPhone =
    input.phone !== undefined ? input.phone.trim() : current.phone;
  const nextAddress =
    input.address !== undefined && input.address.trim()
      ? input.address.trim()
      : current.address;
  const nextDistrict =
    input.district !== undefined ? input.district.trim() : current.district || "";

  let nextCommuneId =
    input.communeId !== undefined ? input.communeId.trim() : current.communeId;
  let nextCommuneName =
    input.communeName !== undefined
      ? input.communeName.trim()
      : input.ward !== undefined
      ? input.ward.trim()
      : current.communeName;

  let nextLat = typeof input.lat === "number" ? input.lat : undefined;
  let nextLng = typeof input.lng === "number" ? input.lng : undefined;

  const communeChanged =
    (input.communeId !== undefined && input.communeId.trim() !== current.communeId) ||
    (input.communeName !== undefined && input.communeName.trim() !== current.communeName) ||
    (input.ward !== undefined && input.ward.trim() !== current.communeName);
  const addressChanged =
    input.address !== undefined && input.address.trim() !== current.address;

  // Resolve commune and coordinates if commune or address changed
  if (nextCommuneId) {
    const foundByCode = lookupCommuneCoords(nextCommuneId);
    if (foundByCode) {
      nextCommuneId = foundByCode.code;
      if (!input.communeName && !input.ward) {
        nextCommuneName = foundByCode.name;
      }
      if (nextLat === undefined || nextLng === undefined) {
        nextLat = foundByCode.lat;
        nextLng = foundByCode.lng;
      }
    } else {
      try {
        const lookup = await lookupHcmCommune(nextCommuneId);
        nextCommuneId = lookup.id;
        if (!input.communeName && !input.ward) {
          nextCommuneName = lookup.name;
        }
      } catch {
        // Keep user-supplied communeId/communeName
      }
    }
  } else if (nextCommuneName) {
    const foundByName = lookupCommuneCoords(nextCommuneName);
    if (foundByName) {
      nextCommuneId = foundByName.code;
      nextCommuneName = foundByName.name;
      if (nextLat === undefined || nextLng === undefined) {
        nextLat = foundByName.lat;
        nextLng = foundByName.lng;
      }
    }
  }

  if (nextLat === undefined || nextLng === undefined) {
    if (communeChanged || addressChanged) {
      const geocoded = await geocodeHcmAddress(nextAddress, nextCommuneName, nextDistrict);
      nextLat = geocoded.lat;
      nextLng = geocoded.lng;
    } else {
      nextLat = current.lat;
      nextLng = current.lng;
    }
  }

  const updated: WarehouseLocation = {
    name: nextName,
    phone: nextPhone,
    address: nextAddress,
    communeId: nextCommuneId,
    communeName: nextCommuneName,
    district: nextDistrict,
    provinceId: SERVICE_PROVINCE_ID,
    provinceName: "Thành phố Hồ Chí Minh",
    lat: nextLat,
    lng: nextLng,
  };

  activeWarehouseCache = { ...updated };

  if (mongoose.connection.readyState === 1) {
    try {
      await WarehouseConfig.findOneAndUpdate(
        { key: "default" },
        { ...updated, key: "default", updatedBy },
        { upsert: true, new: true }
      );
    } catch {
      // Non-fatal if DB write fails in transient state
    }
  }

  return { ...updated };
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
  // 1. Resolve Warehouse (Origin) — uses active warehouse config from DB/cache
  const activeWh = await getActiveWarehouse();
  const customFrom = input.fromAddress || input.warehouseAddress;

  const warehouse: WarehouseLocation = {
    name: customFrom?.name || (customFrom?.address ? "Kho chỉ định" : activeWh.name),
    phone: customFrom?.phone || (customFrom?.address ? "" : activeWh.phone),
    address: customFrom?.address || activeWh.address,
    communeId: customFrom?.communeId || activeWh.communeId,
    communeName: customFrom?.communeName || customFrom?.ward || activeWh.communeName,
    provinceId: customFrom?.provinceId || activeWh.provinceId,
    provinceName: customFrom?.provinceName || customFrom?.province || activeWh.provinceName,
    lat: typeof customFrom?.lat === "number" ? customFrom.lat : activeWh.lat,
    lng: typeof customFrom?.lng === "number" ? customFrom.lng : activeWh.lng,
  };

  // If custom warehouse has communeId/communeName/address but no explicit lat/lng, resolve its coordinates
  if (customFrom && (typeof customFrom.lat !== "number" || typeof customFrom.lng !== "number")) {
    const whFound =
      (customFrom.communeId && lookupCommuneCoords(customFrom.communeId)) ||
      (customFrom.communeName && lookupCommuneCoords(customFrom.communeName)) ||
      (customFrom.ward && lookupCommuneCoords(customFrom.ward)) ||
      (customFrom.address && lookupCommuneCoords(customFrom.address));
    if (whFound) {
      warehouse.lat = whFound.lat;
      warehouse.lng = whFound.lng;
      if (!warehouse.communeId) warehouse.communeId = whFound.code;
      if (!customFrom.communeName && !customFrom.ward) warehouse.communeName = whFound.name;
    } else if (customFrom.address) {
      const geocodedWh = await geocodeHcmAddress(
        customFrom.address,
        warehouse.communeName,
        customFrom.district
      );
      warehouse.lat = geocodedWh.lat;
      warehouse.lng = geocodedWh.lng;
    }
  }

  // 2. Resolve Destination info (supports both `to*` and plain/shipping* field names from FE)
  const destAddress = (
    input.toAddress ||
    input.address ||
    input.shippingAddress ||
    ""
  ).trim();
  let destCommuneId = (
    input.toCommuneId ||
    input.communeId ||
    input.shippingCommuneId ||
    ""
  ).trim();
  let destCommuneName = (
    input.toCommuneName ||
    input.communeName ||
    input.ward ||
    input.shippingCommuneName ||
    ""
  ).trim();
  const destDistrict = (
    input.toDistrict ||
    input.district ||
    input.shippingDistrict ||
    ""
  ).trim();
  const rawDestProvinceId = (
    input.toProvinceId ||
    input.provinceId ||
    input.shippingProvinceId ||
    ""
  ).trim();
  const rawDestProvinceName = (
    input.toProvinceName ||
    input.provinceName ||
    input.province ||
    input.shippingProvinceName ||
    ""
  ).trim();

  // Check TP.HCM boundary (mã 79)
  if (!isHcmProvinceInput(rawDestProvinceId, rawDestProvinceName, SERVICE_PROVINCE_ID)) {
    return {
      distanceKm: 0,
      fee: 0,
      breakdown: `Ngoài khu vực phục vụ (chỉ giao nội thành TP. Hồ Chí Minh - mã tỉnh ${SERVICE_PROVINCE_ID})`,
      supported: false,
      message: `Hệ thống hiện chỉ hỗ trợ giao hàng tại TP. Hồ Chí Minh (mã tỉnh ${SERVICE_PROVINCE_ID})`,
      warehouse: {
        name: warehouse.name,
        phone: warehouse.phone,
        address: warehouse.address,
        communeId: warehouse.communeId,
        communeName: warehouse.communeName,
        provinceId: warehouse.provinceId,
        provinceName: warehouse.provinceName,
        lat: warehouse.lat,
        lng: warehouse.lng,
      },
      destination: {
        address: destAddress,
        communeId: destCommuneId,
        communeName: destCommuneName,
        provinceId: rawDestProvinceId,
        provinceName: rawDestProvinceName || rawDestProvinceId,
      },
    };
  }

  const destProvinceId = SERVICE_PROVINCE_ID;
  const destProvinceName = rawDestProvinceName || "Thành phố Hồ Chí Minh";

  // If FE only sent communeId, resolve official commune name
  if (!destCommuneName && destCommuneId) {
    try {
      const lookup = await lookupHcmCommune(destCommuneId);
      if (lookup?.name) {
        destCommuneName = lookup.name;
        destCommuneId = lookup.id;
      }
    } catch {
      // Continue with best effort
    }
  }

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
      // Lookup 2-level administrative commune by id
      if (destCommuneId) {
        const found = lookupCommuneCoords(destCommuneId);
        if (found) {
          destCoords = { lat: found.lat, lng: found.lng };
          if (!destCommuneName) destCommuneName = found.name;
        }
      }

      // Or by commune name / ward
      if (!destCoords && destCommuneName) {
        const found = lookupCommuneCoords(destCommuneName);
        if (found) {
          destCoords = { lat: found.lat, lng: found.lng };
          if (!destCommuneId) destCommuneId = found.code;
        }
      }

      // Or by free-text address / geocoding
      if (!destCoords) {
        const foundInAddress = lookupCommuneCoords(
          [destAddress, destCommuneName, destDistrict].filter(Boolean).join(" ")
        );
        if (foundInAddress) {
          destCoords = { lat: foundInAddress.lat, lng: foundInAddress.lng };
          if (!destCommuneId) destCommuneId = foundInAddress.code;
          if (!destCommuneName) destCommuneName = foundInAddress.name;
        } else {
          destCoords = await geocodeHcmAddress(destAddress, destCommuneName, destDistrict);
        }
      }
    }

    // Resolve warehouse coordinates if not already set
    let whCoords: { lat: number; lng: number };
    if (typeof warehouse.lat === "number" && typeof warehouse.lng === "number") {
      whCoords = { lat: warehouse.lat, lng: warehouse.lng };
    } else {
      whCoords = await geocodeHcmAddress(
        warehouse.address,
        warehouse.communeName,
        warehouse.district
      );
      warehouse.lat = whCoords.lat;
      warehouse.lng = whCoords.lng;
    }

    const crowDistance = haversineDistanceKm(
      whCoords.lat,
      whCoords.lng,
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
      phone: warehouse.phone,
      address: warehouse.address,
      communeId: warehouse.communeId,
      communeName: warehouse.communeName,
      provinceId: warehouse.provinceId,
      provinceName: warehouse.provinceName,
      lat: warehouse.lat,
      lng: warehouse.lng,
    },
    destination: {
      address: destAddress,
      communeId: destCommuneId,
      communeName: destCommuneName,
      provinceId: destProvinceId,
      provinceName: destProvinceName,
    },
  };
}
