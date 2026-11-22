import {
  MobileAppConfig,
  type MobileAppConfigFields,
  type MobilePlatform,
} from "../models/MobileAppConfig";

export interface SemverTuple {
  major: number;
  minor: number;
  patch: number;
  normalized: string;
}

export interface MobilePlatformConfigView {
  platform: MobilePlatform;
  latestVersion: string;
  minSupportedVersion: string;
  latestBuildNumber: number | null;
  minBuildNumber: number | null;
  forceUpdate: boolean;
  storeUrl: string;
  title: string;
  message: string;
  releaseNotes: string[];
  isMaintenance: boolean;
  maintenanceMessage: string;
  updatedBy: string;
  updatedAt: string | null;
}

export interface AppUpdateEvaluation extends MobilePlatformConfigView {
  currentVersion: string | null;
  currentBuildNumber: number | null;
  hasUpdate: boolean;
  forceUpdate: boolean;
  checkedAt: string;
}

export interface UpdatePlatformConfigInput {
  latestVersion?: string;
  minSupportedVersion?: string;
  latestBuildNumber?: number | null;
  minBuildNumber?: number | null;
  forceUpdate?: boolean;
  storeUrl?: string;
  title?: string;
  message?: string;
  releaseNotes?: string[];
  isMaintenance?: boolean;
  maintenanceMessage?: string;
}

export class AppVersionError extends Error {
  public readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AppVersionError";
    this.status = status;
  }
}

export function normalizePlatform(raw: unknown): MobilePlatform | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().toLowerCase();
  if (cleaned === "android" || cleaned === "ios") return cleaned;
  return null;
}

/**
 * Parse chuỗi version dạng `1.2.3`, `v1.2`, `1.2.3-beta.1` thành `[major, minor, patch]`.
 */
export function parseSemver(raw: unknown): SemverTuple | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/^v/i, "");
  // Cho phép "1.2" hoặc "1.2.3" kèm optional pre-release/build suffix (`-beta.1`, `+12`).
  const match = trimmed.match(/^(\d+)\.(\d+)(?:\.(\d+))?(?:[-+][A-Za-z0-9.-]+)?$/);
  if (!match) return null;

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = match[3] !== undefined ? Number(match[3]) : 0;
  if (
    !Number.isSafeInteger(major) ||
    !Number.isSafeInteger(minor) ||
    !Number.isSafeInteger(patch) ||
    major < 0 ||
    minor < 0 ||
    patch < 0
  ) {
    return null;
  }

  return {
    major,
    minor,
    patch,
    normalized: `${major}.${minor}.${patch}`,
  };
}

/** Trả về `-1` nếu a < b, `0` nếu a === b, `1` nếu a > b. */
export function compareSemver(a: SemverTuple, b: SemverTuple): -1 | 0 | 1 {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  return 0;
}

const PLATFORM_DEFAULTS: Record<
  MobilePlatform,
  {
    latestVersion: string;
    minSupportedVersion: string;
    latestBuildNumber: number | null;
    minBuildNumber: number | null;
    forceUpdate: boolean;
    storeUrl: string;
  }
> = {
  android: {
    latestVersion: "1.1.3",
    minSupportedVersion: "1.1.3",
    latestBuildNumber: 7,
    minBuildNumber: 7,
    forceUpdate: false,
    storeUrl:
      "https://play.google.com/store/apps/details?id=com.buildyourchristmas.mobile",
  },
  ios: {
    latestVersion: "1.0.0",
    minSupportedVersion: "1.0.0",
    latestBuildNumber: null,
    minBuildNumber: null,
    forceUpdate: false,
    storeUrl: "",
  },
};

function parseEnvBuildNumber(
  raw: string | undefined,
  fallback: number | null
): number | null {
  if (raw === undefined) return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  if (trimmed.toLowerCase() === "null") return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseEnvBoolean(raw: string | undefined, fallback: boolean): boolean {
  const normalized = raw?.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  return fallback;
}

export function defaultPlatformConfig(
  platform: MobilePlatform
): MobilePlatformConfigView {
  const prefix = platform === "android" ? "MOBILE_ANDROID" : "MOBILE_IOS";
  const base = PLATFORM_DEFAULTS[platform];

  const latestRaw = process.env[`${prefix}_LATEST_VERSION`]?.trim();
  const minRaw = process.env[`${prefix}_MIN_VERSION`]?.trim();
  const storeRaw = process.env[`${prefix}_STORE_URL`]?.trim();

  const latest = parseSemver(latestRaw)?.normalized || base.latestVersion;
  const min = parseSemver(minRaw)?.normalized || base.minSupportedVersion;
  const latestBuildNumber = parseEnvBuildNumber(
    process.env[`${prefix}_LATEST_BUILD`],
    base.latestBuildNumber
  );
  const minBuildNumber = parseEnvBuildNumber(
    process.env[`${prefix}_MIN_BUILD`],
    base.minBuildNumber
  );
  const forceUpdate = parseEnvBoolean(
    process.env[`${prefix}_FORCE_UPDATE`],
    base.forceUpdate
  );
  const storeUrl = storeRaw ? storeRaw : base.storeUrl;

  return {
    platform,
    latestVersion: latest,
    minSupportedVersion: min,
    latestBuildNumber,
    minBuildNumber,
    forceUpdate,
    storeUrl,
    title: "Đã có phiên bản mới",
    message: "Vui lòng cập nhật ứng dụng để có trải nghiệm tốt nhất.",
    releaseNotes: [],
    isMaintenance: false,
    maintenanceMessage: "",
    updatedBy: "",
    updatedAt: null,
  };
}

function docToConfigView(
  platform: MobilePlatform,
  doc: Partial<MobileAppConfigFields> | null
): MobilePlatformConfigView {
  const base = defaultPlatformConfig(platform);
  if (!doc) return base;
  return {
    platform,
    latestVersion: doc.latestVersion || base.latestVersion,
    minSupportedVersion: doc.minSupportedVersion || base.minSupportedVersion,
    latestBuildNumber:
      typeof doc.latestBuildNumber === "number" ? doc.latestBuildNumber : null,
    minBuildNumber:
      typeof doc.minBuildNumber === "number" ? doc.minBuildNumber : null,
    forceUpdate: Boolean(doc.forceUpdate),
    storeUrl: doc.storeUrl ?? base.storeUrl,
    title: doc.title || base.title,
    message: doc.message || base.message,
    releaseNotes: Array.isArray(doc.releaseNotes) ? doc.releaseNotes : [],
    isMaintenance: Boolean(doc.isMaintenance),
    maintenanceMessage: doc.maintenanceMessage ?? "",
    updatedBy: doc.updatedBy ?? "",
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  };
}

export function evaluateAppUpdate(
  config: MobilePlatformConfigView,
  current?: { version?: string | null; buildNumber?: number | null }
): AppUpdateEvaluation {
  const checkedAt = new Date().toISOString();
  const rawVersion = current?.version?.trim() || null;
  const currentBuild =
    typeof current?.buildNumber === "number" && Number.isFinite(current.buildNumber)
      ? Math.floor(current.buildNumber)
      : null;

  if (!rawVersion && currentBuild === null) {
    return {
      ...config,
      currentVersion: null,
      currentBuildNumber: null,
      hasUpdate: false,
      forceUpdate: false,
      checkedAt,
    };
  }

  const latestSemver = parseSemver(config.latestVersion) ?? {
    major: 1,
    minor: 0,
    patch: 0,
    normalized: "1.0.0",
  };
  const minSemver = parseSemver(config.minSupportedVersion) ?? {
    major: 1,
    minor: 0,
    patch: 0,
    normalized: "1.0.0",
  };

  let isBelowLatestVersion = false;
  let isSameAsLatestVersion = true;
  let isBelowMinVersion = false;
  let normalizedCurrent: string | null = null;

  if (rawVersion) {
    const curSemver = parseSemver(rawVersion);
    if (!curSemver) {
      throw new AppVersionError(
        `Version không hợp lệ: "${rawVersion}" (cần định dạng x.y.z, VD: 1.0.0)`
      );
    }
    normalizedCurrent = curSemver.normalized;
    const cmpLatest = compareSemver(curSemver, latestSemver);
    isBelowLatestVersion = cmpLatest < 0;
    isSameAsLatestVersion = cmpLatest === 0;
    isBelowMinVersion = compareSemver(curSemver, minSemver) < 0;
  }

  const isBelowLatestBuild =
    currentBuild !== null &&
    config.latestBuildNumber !== null &&
    isSameAsLatestVersion &&
    currentBuild < config.latestBuildNumber;

  const isBelowMinBuild =
    currentBuild !== null &&
    config.minBuildNumber !== null &&
    currentBuild < config.minBuildNumber;

  const hasUpdate = isBelowLatestVersion || isBelowLatestBuild;
  // Chỉ ép cập nhật nếu version/build nằm dưới ngưỡng tối thiểu HOẶC vẫn còn bản mới hơn
  // (tránh vòng lặp ép cập nhật khi user đã cài bản mới nhất).
  const forceUpdate =
    isBelowMinVersion || isBelowMinBuild || (hasUpdate && config.forceUpdate);

  return {
    ...config,
    currentVersion: normalizedCurrent,
    currentBuildNumber: currentBuild,
    hasUpdate,
    forceUpdate,
    checkedAt,
  };
}

export async function getPlatformConfig(
  platform: MobilePlatform
): Promise<MobilePlatformConfigView> {
  const doc = await MobileAppConfig.findOne({ platform }).lean();
  return docToConfigView(platform, doc);
}

export async function getAllPlatformConfigs(): Promise<
  Record<MobilePlatform, MobilePlatformConfigView>
> {
  const docs = await MobileAppConfig.find({
    platform: { $in: ["android", "ios"] },
  }).lean();
  const byPlatform = new Map(docs.map((d) => [d.platform, d]));
  return {
    android: docToConfigView("android", byPlatform.get("android") ?? null),
    ios: docToConfigView("ios", byPlatform.get("ios") ?? null),
  };
}

function parseOptionalBuildNumber(v: unknown, fieldName: string): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const num = typeof v === "number" ? v : Number(v);
  if (!Number.isInteger(num) || num < 0) {
    throw new AppVersionError(`${fieldName} phải là số nguyên không âm hoặc null`);
  }
  return num;
}

function parseRequiredSemverField(
  raw: unknown,
  fallback: string,
  fieldName: string,
  example: string
): SemverTuple {
  const value = raw !== undefined ? raw : fallback;
  const parsed = parseSemver(value);
  if (!parsed) {
    throw new AppVersionError(`${fieldName} không hợp lệ (cần dạng x.y.z, VD: ${example})`);
  }
  return parsed;
}

function parseStoreUrlInput(raw: unknown, fallback: string): string {
  if (raw === undefined) return fallback;
  if (typeof raw !== "string") {
    throw new AppVersionError("storeUrl phải là chuỗi URL");
  }
  const trimmedUrl = raw.trim();
  if (trimmedUrl && !/^https?:\/\/\S+$/i.test(trimmedUrl)) {
    throw new AppVersionError("storeUrl phải bắt đầu bằng http:// hoặc https://");
  }
  return trimmedUrl;
}

function parseReleaseNotesInput(raw: unknown, fallback: string[]): string[] {
  if (raw === undefined) return fallback;
  if (!Array.isArray(raw)) {
    throw new AppVersionError("releaseNotes phải là mảng chuỗi");
  }
  return raw
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0)
    .slice(0, 20);
}

function parseBoundedText(
  raw: unknown,
  fallback: string,
  maxLen: number,
  allowEmpty = false
): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (!trimmed && !allowEmpty) return fallback;
  return trimmed.slice(0, maxLen);
}

export async function upsertPlatformConfig(
  platform: MobilePlatform,
  rawInput: Record<string, unknown>,
  updatedBy = ""
): Promise<MobilePlatformConfigView> {
  const existing = await getPlatformConfig(platform);

  const latestTuple = parseRequiredSemverField(
    rawInput.latestVersion,
    existing.latestVersion,
    "latestVersion",
    "1.2.0"
  );
  const minTuple = parseRequiredSemverField(
    rawInput.minSupportedVersion,
    existing.minSupportedVersion,
    "minSupportedVersion",
    "1.0.0"
  );
  if (compareSemver(minTuple, latestTuple) > 0) {
    throw new AppVersionError("minSupportedVersion không được lớn hơn latestVersion");
  }

  const parsedLatestBuild = parseOptionalBuildNumber(
    rawInput.latestBuildNumber,
    "latestBuildNumber"
  );
  const nextLatestBuild =
    parsedLatestBuild !== undefined ? parsedLatestBuild : existing.latestBuildNumber;

  const parsedMinBuild = parseOptionalBuildNumber(
    rawInput.minBuildNumber,
    "minBuildNumber"
  );
  const nextMinBuild =
    parsedMinBuild !== undefined ? parsedMinBuild : existing.minBuildNumber;

  if (
    nextLatestBuild !== null &&
    nextMinBuild !== null &&
    nextMinBuild > nextLatestBuild
  ) {
    throw new AppVersionError("minBuildNumber không được lớn hơn latestBuildNumber");
  }

  const saved = await MobileAppConfig.findOneAndUpdate(
    { platform },
    {
      platform,
      latestVersion: latestTuple.normalized,
      minSupportedVersion: minTuple.normalized,
      latestBuildNumber: nextLatestBuild,
      minBuildNumber: nextMinBuild,
      forceUpdate:
        rawInput.forceUpdate !== undefined
          ? Boolean(rawInput.forceUpdate)
          : existing.forceUpdate,
      storeUrl: parseStoreUrlInput(rawInput.storeUrl, existing.storeUrl),
      title: parseBoundedText(rawInput.title, existing.title, 120),
      message: parseBoundedText(rawInput.message, existing.message, 500),
      releaseNotes: parseReleaseNotesInput(rawInput.releaseNotes, existing.releaseNotes),
      isMaintenance:
        rawInput.isMaintenance !== undefined
          ? Boolean(rawInput.isMaintenance)
          : existing.isMaintenance,
      maintenanceMessage: parseBoundedText(
        rawInput.maintenanceMessage,
        existing.maintenanceMessage,
        500,
        true
      ),
      updatedBy,
    },
    { upsert: true, new: true }
  ).lean();

  return docToConfigView(platform, saved);
}
