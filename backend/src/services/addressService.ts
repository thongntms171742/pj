import { ErrorCode } from "../utils/errors";

const CAS_BASE_URL = process.env.CAS_ADDRESS_KIT_URL || "https://production.cas.so/address-kit";
const DEFAULT_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── In-memory cache ────────────────────────────────────────────────────────────
interface CacheItem<T> {
  data: T;
  expiresAt: number;
}

const memoryCache = new Map<string, CacheItem<any>>();

function getFromCache<T>(key: string): T | null {
  const item = memoryCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return item.data;
}

function setInCache<T>(key: string, data: T, ttlMs = CACHE_TTL_MS): void {
  memoryCache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

// Clear cache helper for testing
export function clearAddressCache(): void {
  memoryCache.clear();
}

// ── Validation ─────────────────────────────────────────────────────────────────
export function isValidEffectiveDate(effectiveDate: string): boolean {
  if (effectiveDate === "latest") return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(effectiveDate);
}

export class AddressServiceError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = "AddressServiceError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

// ── HTTP Fetch with Timeout ───────────────────────────────────────────────────
async function fetchWithTimeout(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      if (response.status === 404) {
        throw new AddressServiceError(
          ErrorCode.PROVINCE_NOT_FOUND,
          "Không tìm thấy thông tin đơn vị hành chính",
          404
        );
      }
      throw new AddressServiceError(
        ErrorCode.ADDRESS_UPSTREAM_ERROR,
        `CAS API trả về mã lỗi HTTP ${response.status}`,
        502
      );
    }
    return await response.json();
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new AddressServiceError(
        ErrorCode.ADDRESS_UPSTREAM_TIMEOUT,
        "Yêu cầu tới hệ thống CAS Address Kit bị quá thời gian chờ (timeout)",
        504
      );
    }
    if (err instanceof AddressServiceError) {
      throw err;
    }
    throw new AddressServiceError(
      ErrorCode.ADDRESS_UPSTREAM_ERROR,
      `Không thể kết nối tới CAS Address Kit: ${err.message || err}`,
      502
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface NormalizedProvince {
  id: string;
  name: string;
}

export interface NormalizedCommune {
  id: string;
  name: string;
  provinceId?: string;
}

export interface AddressResponse<T> {
  data: T[];
  effectiveDate: string;
}

// ── Service Methods ───────────────────────────────────────────────────────────

/**
 * Lấy danh sách tỉnh/thành phố theo effectiveDate
 */
export async function getProvinces(effectiveDate = "latest"): Promise<AddressResponse<NormalizedProvince>> {
  const cacheKey = `provinces:${effectiveDate}`;
  const cached = getFromCache<AddressResponse<NormalizedProvince>>(cacheKey);
  if (cached) {
    return cached;
  }

  const url = `${CAS_BASE_URL}/${effectiveDate}/provinces`;
  const raw = await fetchWithTimeout(url);

  // CAS response structure: { requestId, provinces: [{ code, name, ... }] }
  const rawList: any[] = Array.isArray(raw) ? raw : raw.provinces || raw.data || [];
  const normalized: NormalizedProvince[] = rawList.map((item) => ({
    id: String(item.code || item.id || ""),
    name: String(item.name || "").trim(),
  }));

  const result: AddressResponse<NormalizedProvince> = {
    data: normalized,
    effectiveDate,
  };

  setInCache(cacheKey, result);
  return result;
}

/**
 * Lấy danh sách xã/phường theo mã tỉnh/thành
 */
export async function getCommunesByProvince(
  provinceId: string,
  effectiveDate = "latest"
): Promise<AddressResponse<NormalizedCommune>> {
  const cacheKey = `communes:${effectiveDate}:${provinceId}`;
  const cached = getFromCache<AddressResponse<NormalizedCommune>>(cacheKey);
  if (cached) {
    return cached;
  }

  const url = `${CAS_BASE_URL}/${effectiveDate}/provinces/${provinceId}/communes`;
  const raw = await fetchWithTimeout(url);

  // CAS response structure: { requestId, communes: [{ code, name, provinceCode, ... }] }
  const rawList: any[] = Array.isArray(raw) ? raw : raw.communes || raw.data || [];
  const normalized: NormalizedCommune[] = rawList.map((item) => ({
    id: String(item.code || item.id || ""),
    name: String(item.name || "").trim(),
  }));

  const result: AddressResponse<NormalizedCommune> = {
    data: normalized,
    effectiveDate,
  };

  setInCache(cacheKey, result);
  return result;
}

/**
 * Lấy toàn bộ xã/phường trên toàn quốc
 */
export async function getAllCommunes(effectiveDate = "latest"): Promise<AddressResponse<NormalizedCommune>> {
  const cacheKey = `all_communes:${effectiveDate}`;
  const cached = getFromCache<AddressResponse<NormalizedCommune>>(cacheKey);
  if (cached) {
    return cached;
  }

  const url = `${CAS_BASE_URL}/${effectiveDate}/communes`;
  const raw = await fetchWithTimeout(url);

  // CAS response structure: { requestId, communes: [{ code, name, provinceCode, ... }] }
  const rawList: any[] = Array.isArray(raw) ? raw : raw.communes || raw.data || [];
  const normalized: NormalizedCommune[] = rawList.map((item) => ({
    id: String(item.code || item.id || ""),
    name: String(item.name || "").trim(),
    provinceId: item.provinceCode ? String(item.provinceCode) : undefined,
  }));

  const result: AddressResponse<NormalizedCommune> = {
    data: normalized,
    effectiveDate,
  };

  setInCache(cacheKey, result);
  return result;
}
