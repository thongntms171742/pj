import { Request, Response } from "express";
import type {} from "../middleware/auth";
import { ah } from "../utils/asyncRoute";
import { ok } from "../utils/respond";
import { ErrorCode, handleInternalError, sendError } from "../utils/errors";
import {
  AppVersionError,
  evaluateAppUpdate,
  getAllPlatformConfigs,
  getPlatformConfig,
  normalizePlatform,
  upsertPlatformConfig,
} from "../services/appVersionService";
import type { MobilePlatform } from "../models/MobileAppConfig";

function handleAppVersionError(res: Response, err: unknown, ctx: string): void {
  if (err instanceof AppVersionError) {
    sendError(res, ErrorCode.INVALID_INPUT, err.message, err.status);
    return;
  }
  handleInternalError(res, err, ctx);
}

function parseBuildQuery(raw: unknown): number | null {
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new AppVersionError("buildNumber phải là số nguyên không âm");
  }
  return parsed;
}

/**
 * GET /api/app-version/check?platform=android|ios&version=1.0.0&buildNumber=1
 * Public endpoint để Mobile App kiểm tra xem có phiên bản mới hay bắt buộc cập nhật không.
 */
export const checkAppVersion = ah(async (req: Request, res: Response) => {
  try {
    const rawPlatform = req.query.platform ?? req.query.os;
    const rawVersion =
      req.query.version ?? req.query.appVersion ?? req.query.currentVersion;
    const rawBuild =
      req.query.buildNumber ?? req.query.build ?? req.query.versionCode;

    const currentVersion =
      typeof rawVersion === "string" && rawVersion.trim() ? rawVersion.trim() : null;
    const currentBuild = parseBuildQuery(rawBuild);

    if (rawPlatform === undefined || String(rawPlatform).trim() === "") {
      const configs = await getAllPlatformConfigs();
      ok(res, {
        android: evaluateAppUpdate(configs.android, {
          version: currentVersion,
          buildNumber: currentBuild,
        }),
        ios: evaluateAppUpdate(configs.ios, {
          version: currentVersion,
          buildNumber: currentBuild,
        }),
      });
      return;
    }

    const platform = normalizePlatform(rawPlatform);
    if (!platform) {
      sendError(
        res,
        ErrorCode.INVALID_INPUT,
        'platform phải là "android" hoặc "ios"'
      );
      return;
    }

    const config = await getPlatformConfig(platform);
    const evaluation = evaluateAppUpdate(config, {
      version: currentVersion,
      buildNumber: currentBuild,
    });
    ok(res, evaluation);
  } catch (err) {
    handleAppVersionError(res, err, "[appVersion] checkAppVersion error");
  }
});

/**
 * GET /api/admin/app-version
 * Admin xem cấu hình phiên bản hiện tại cho Android và iOS.
 */
export const getAdminAppVersionConfigs = ah(async (_req: Request, res: Response) => {
  try {
    const configs = await getAllPlatformConfigs();
    ok(res, { configs });
  } catch (err) {
    handleAppVersionError(res, err, "[appVersion] getAdminAppVersionConfigs error");
  }
});

async function updateMultiplePlatforms(
  res: Response,
  body: Record<string, unknown>,
  updatedBy: string
): Promise<void> {
  const updates: Partial<Record<MobilePlatform, unknown>> = {};
  for (const p of ["android", "ios"] as const) {
    if (body[p] === undefined) continue;
    if (!body[p] || typeof body[p] !== "object" || Array.isArray(body[p])) {
      sendError(res, ErrorCode.INVALID_INPUT, `Trường "${p}" phải là object cấu hình`);
      return;
    }
    updates[p] = await upsertPlatformConfig(
      p,
      body[p] as Record<string, unknown>,
      updatedBy
    );
  }
  const configs = await getAllPlatformConfigs();
  ok(res, { configs, updated: updates });
}

/**
 * PUT / PATCH / POST /api/admin/app-version
 * Hỗ trợ:
 *   1) Cập nhật 1 nền tảng: `{ platform: "android" | "ios", latestVersion, minSupportedVersion, forceUpdate, storeUrl, title, message, releaseNotes, ... }`
 *   2) Cập nhật cả 2 nền tảng: `{ android?: { ... }, ios?: { ... } }`
 */
export const updateAdminAppVersionConfig = ah(async (req: Request, res: Response) => {
  try {
    const body =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? (req.body as Record<string, unknown>)
        : null;
    if (!body) {
      sendError(res, ErrorCode.MISSING_FIELD, "Thiếu dữ liệu cấu hình phiên bản");
      return;
    }

    const updatedBy = req.user?.email || req.user?.id || "";

    if (body.android !== undefined || body.ios !== undefined) {
      await updateMultiplePlatforms(res, body, updatedBy);
      return;
    }

    const platform = normalizePlatform(body.platform ?? req.query.platform);
    if (!platform) {
      sendError(
        res,
        ErrorCode.INVALID_INPUT,
        'Vui lòng truyền platform là "android" hoặc "ios"'
      );
      return;
    }

    const config = await upsertPlatformConfig(platform, body, updatedBy);
    ok(res, { config });
  } catch (err) {
    handleAppVersionError(res, err, "[appVersion] updateAdminAppVersionConfig error");
  }
});
