import mongoose from "mongoose";
import dotenv from "dotenv";
import { ErrorCode } from "../utils/errors";
import { MobileAppConfig } from "../models/MobileAppConfig";
import {
  checkAppVersion,
  updateAdminAppVersionConfig,
} from "../controllers/appVersionController";
import {
  compareSemver,
  defaultPlatformConfig,
  evaluateAppUpdate,
  getAllPlatformConfigs,
  getPlatformConfig,
  normalizePlatform,
  parseSemver,
  upsertPlatformConfig,
  type MobilePlatformConfigView,
} from "../services/appVersionService";

dotenv.config();

type MockRes = {
  status: (code: number) => MockRes;
  json: (data: unknown) => MockRes;
  statusCode: number;
  body: any;
};

function makeRes(): MockRes {
  const res: any = { statusCode: 0, body: null };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data: unknown) => {
    res.body = data;
    return res;
  };
  return res as MockRes;
}

async function runCtrl(
  fn: (req: any, res: any, next: any) => unknown,
  reqObj: { query?: any; body?: any; user?: any }
) {
  const res = makeRes();
  let nextErr: unknown;
  await fn(
    { query: {}, body: undefined, ...reqObj },
    res as any,
    (err?: unknown) => {
      nextErr = err;
    }
  );
  if (nextErr) throw nextErr;
  return { status: res.statusCode, body: res.body };
}

let passed = 0;
let failed = 0;

function check(desc: string, cond: boolean) {
  if (cond) {
    console.log(`✅ PASS: ${desc}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${desc}`);
    failed++;
  }
}

async function runUnitTests() {
  console.log("\n── Running Mobile App Version & Force Update Unit Tests ──\n");

  // ── 1. Platform & Semver helpers ─────────────────────────────────────────
  check("normalizePlatform accepts android & iOS case-insensitively",
    normalizePlatform("Android") === "android" && normalizePlatform(" iOS ") === "ios"
  );
  check("normalizePlatform rejects unknown platform", normalizePlatform("windows") === null && normalizePlatform(123) === null);

  check("parseSemver handles x.y.z, v-prefix, x.y, pre-release",
    parseSemver("1.2.3")?.normalized === "1.2.3" &&
    parseSemver("v2.0.1")?.normalized === "2.0.1" &&
    parseSemver("1.5")?.normalized === "1.5.0" &&
    parseSemver("1.2.3-beta.1")?.normalized === "1.2.3"
  );
  check("parseSemver rejects malformed versions",
    parseSemver("abc") === null && parseSemver("1.2.3.4") === null && parseSemver("-1.0.0") === null
  );

  check("compareSemver compares numerically (1.10.0 > 1.2.0)",
    compareSemver(parseSemver("1.10.0")!, parseSemver("1.2.0")!) === 1 &&
    compareSemver(parseSemver("1.2.0")!, parseSemver("1.2.0")!) === 0 &&
    compareSemver(parseSemver("1.9.9")!, parseSemver("2.0.0")!) === -1
  );

  // ── 2. Update evaluation matrix ──────────────────────────────────────────
  const baseConfig: MobilePlatformConfigView = {
    platform: "android",
    latestVersion: "1.2.0",
    minSupportedVersion: "1.1.0",
    latestBuildNumber: 12,
    minBuildNumber: 10,
    forceUpdate: false,
    storeUrl: "https://play.google.com/store/apps/details?id=vn.byc.app",
    title: "Đã có bản mới",
    message: "Vui lòng cập nhật",
    releaseNotes: ["Sửa lỗi thanh toán"],
    isMaintenance: false,
    maintenanceMessage: "",
    updatedBy: "admin@byc.vn",
    updatedAt: null,
  };

  const upToDate = evaluateAppUpdate(baseConfig, { version: "1.2.0", buildNumber: 12 });
  check("On latest version & build → hasUpdate=false, forceUpdate=false", !upToDate.hasUpdate && !upToDate.forceUpdate);

  const optionalUpdate = evaluateAppUpdate(baseConfig, { version: "1.1.0", buildNumber: 11 });
  check("Between min & latest (forceUpdate flag false) → hasUpdate=true, forceUpdate=false", optionalUpdate.hasUpdate && !optionalUpdate.forceUpdate);

  const forcedByMin = evaluateAppUpdate(baseConfig, { version: "1.0.9", buildNumber: 11 });
  check("Below minSupportedVersion → hasUpdate=true, forceUpdate=true", forcedByMin.hasUpdate && forcedByMin.forceUpdate);

  const forcedByFlag = evaluateAppUpdate({ ...baseConfig, forceUpdate: true }, { version: "1.1.5", buildNumber: 11 });
  check("Flag forceUpdate=true with older version → hasUpdate=true, forceUpdate=true", forcedByFlag.hasUpdate && forcedByFlag.forceUpdate);

  const noInfiniteLoop = evaluateAppUpdate({ ...baseConfig, forceUpdate: true }, { version: "1.2.0", buildNumber: 12 });
  check("Already on latest version with forceUpdate=true → NO infinite loop", !noInfiniteLoop.hasUpdate && !noInfiniteLoop.forceUpdate);

  const newerBuild = evaluateAppUpdate(baseConfig, { version: "2.0.0", buildNumber: 99 });
  check("Newer client version → hasUpdate=false, forceUpdate=false", !newerBuild.hasUpdate && !newerBuild.forceUpdate);

  const olderBuildSameVer = evaluateAppUpdate(baseConfig, { version: "1.2.0", buildNumber: 9 });
  check("Same semver but buildNumber < minBuildNumber → hasUpdate=true, forceUpdate=true", olderBuildSameVer.hasUpdate && olderBuildSameVer.forceUpdate);

  const newerPatchSameMinBuild = evaluateAppUpdate(baseConfig, { version: "1.2.0", buildNumber: 11 });
  check("Same semver with build 11 (< latestBuild 12, >= minBuild 10) → optional update", newerPatchSameMinBuild.hasUpdate && !newerPatchSameMinBuild.forceUpdate);

  // ── 2b. Built-in defaults (Android 1.1.3 / build 7) & env overrides ──────
  const envKeys = [
    "MOBILE_ANDROID_LATEST_VERSION",
    "MOBILE_ANDROID_MIN_VERSION",
    "MOBILE_ANDROID_LATEST_BUILD",
    "MOBILE_ANDROID_MIN_BUILD",
    "MOBILE_ANDROID_FORCE_UPDATE",
    "MOBILE_ANDROID_STORE_URL",
    "MOBILE_IOS_LATEST_VERSION",
    "MOBILE_IOS_MIN_VERSION",
    "MOBILE_IOS_LATEST_BUILD",
    "MOBILE_IOS_MIN_BUILD",
    "MOBILE_IOS_FORCE_UPDATE",
    "MOBILE_IOS_STORE_URL",
  ] as const;
  const savedEnv = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));
  try {
    for (const k of envKeys) delete process.env[k];

    const androidDefault = defaultPlatformConfig("android");
    check(
      "Android default is 1.1.3 / build 7 with Play Store URL",
      androidDefault.latestVersion === "1.1.3" &&
        androidDefault.minSupportedVersion === "1.1.3" &&
        androidDefault.latestBuildNumber === 7 &&
        androidDefault.minBuildNumber === 7 &&
        androidDefault.forceUpdate === false &&
        androidDefault.storeUrl ===
          "https://play.google.com/store/apps/details?id=com.buildyourchristmas.mobile"
    );

    const iosDefault = defaultPlatformConfig("ios");
    check(
      "iOS default stays 1.0.0 / null build",
      iosDefault.latestVersion === "1.0.0" &&
        iosDefault.minSupportedVersion === "1.0.0" &&
        iosDefault.latestBuildNumber === null &&
        iosDefault.minBuildNumber === null &&
        iosDefault.storeUrl === ""
    );

    const androidCurrentEval = evaluateAppUpdate(androidDefault, {
      version: "1.1.3",
      buildNumber: 7,
    });
    check(
      "Android current build 1.1.3 (7) → hasUpdate=false, forceUpdate=false",
      !androidCurrentEval.hasUpdate && !androidCurrentEval.forceUpdate
    );

    const androidOldVersionEval = evaluateAppUpdate(androidDefault, {
      version: "1.1.2",
      buildNumber: 6,
    });
    check(
      "Android older version 1.1.2 (6) → hasUpdate=true, forceUpdate=true",
      androidOldVersionEval.hasUpdate && androidOldVersionEval.forceUpdate
    );

    const androidOldBuildSameVerEval = evaluateAppUpdate(androidDefault, {
      version: "1.1.3",
      buildNumber: 6,
    });
    check(
      "Android same version 1.1.3 with build 6 (< 7) → hasUpdate=true, forceUpdate=true",
      androidOldBuildSameVerEval.hasUpdate && androidOldBuildSameVerEval.forceUpdate
    );

    process.env.MOBILE_ANDROID_LATEST_VERSION = "1.1.4";
    process.env.MOBILE_ANDROID_MIN_VERSION = "1.1.3";
    process.env.MOBILE_ANDROID_LATEST_BUILD = "8";
    process.env.MOBILE_ANDROID_MIN_BUILD = "7";
    process.env.MOBILE_ANDROID_FORCE_UPDATE = "true";
    process.env.MOBILE_ANDROID_STORE_URL = "https://example.com/byc.apk";
    const androidEnvOverride = defaultPlatformConfig("android");
    check(
      "Android env overrides version, build, forceUpdate, storeUrl",
      androidEnvOverride.latestVersion === "1.1.4" &&
        androidEnvOverride.minSupportedVersion === "1.1.3" &&
        androidEnvOverride.latestBuildNumber === 8 &&
        androidEnvOverride.minBuildNumber === 7 &&
        androidEnvOverride.forceUpdate === true &&
        androidEnvOverride.storeUrl === "https://example.com/byc.apk"
    );

    process.env.MOBILE_ANDROID_LATEST_BUILD = "null";
    process.env.MOBILE_ANDROID_MIN_BUILD = "invalid";
    const androidEnvNullAndInvalid = defaultPlatformConfig("android");
    check(
      "Env 'null' clears build override and invalid falls back safely",
      androidEnvNullAndInvalid.latestBuildNumber === null &&
        androidEnvNullAndInvalid.minBuildNumber === 7
    );
  } finally {
    for (const k of envKeys) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  }

  // ── 3. Schema check ──────────────────────────────────────────────────────
  const doc = new MobileAppConfig({ platform: "ios" });
  check("MobileAppConfig schema defaults valid", !doc.validateSync() && doc.latestVersion === "1.0.0");
  const badDoc = new MobileAppConfig({ platform: "blackberry" as any });
  check("MobileAppConfig rejects invalid platform", !!badDoc.validateSync()?.errors?.platform);

  // ── 4. Controller validation guards (before DB) ──────────────────────────
  const badPlat = await runCtrl(checkAppVersion, { query: { platform: "windows", version: "1.0.0" } });
  check("checkAppVersion bad platform → 400 INVALID_INPUT", badPlat.status === 400 && badPlat.body?.error?.code === ErrorCode.INVALID_INPUT);

  const badBuild = await runCtrl(checkAppVersion, { query: { platform: "android", buildNumber: "-5" } });
  check("checkAppVersion negative buildNumber → 400 INVALID_INPUT", badBuild.status === 400 && badBuild.body?.error?.code === ErrorCode.INVALID_INPUT);

  const nullAdminBody = await runCtrl(updateAdminAppVersionConfig, { body: null });
  check("updateAdminAppVersionConfig null body → 400 MISSING_FIELD", nullAdminBody.status === 400 && nullAdminBody.body?.error?.code === ErrorCode.MISSING_FIELD);

  const missingPlatBody = await runCtrl(updateAdminAppVersionConfig, { body: { latestVersion: "1.2.0" } });
  check("updateAdminAppVersionConfig missing platform → 400 INVALID_INPUT", missingPlatBody.status === 400 && missingPlatBody.body?.error?.code === ErrorCode.INVALID_INPUT);

  const badNestedBody = await runCtrl(updateAdminAppVersionConfig, { body: { android: "bad" } });
  check("updateAdminAppVersionConfig non-object nested platform → 400 INVALID_INPUT", badNestedBody.status === 400 && badNestedBody.body?.error?.code === ErrorCode.INVALID_INPUT);
}

async function runDbIntegrationTests() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.log("\n⚠️  No MONGO_URI set — skipping App Version DB integration tests.");
    return;
  }

  console.log("\n── Running Mobile App Version DB Integration Tests ──\n");
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }

    const updated = await upsertPlatformConfig(
      "android",
      {
        latestVersion: "1.5.0",
        minSupportedVersion: "1.2.0",
        latestBuildNumber: 15,
        minBuildNumber: 12,
        forceUpdate: true,
        storeUrl: "https://play.google.com/store/apps/details?id=vn.byc.test",
        releaseNotes: ["Thêm Google Login", "Tối ưu chat 1-1"],
      },
      "admin@test.vn"
    );
    check("Admin upsert android config persisted", updated.latestVersion === "1.5.0" && updated.latestBuildNumber === 15);

    const clearedBuild = await upsertPlatformConfig("android", { latestBuildNumber: null, minBuildNumber: null }, "admin@test.vn");
    check("Admin can clear buildNumber back to null", clearedBuild.latestBuildNumber === null && clearedBuild.minBuildNumber === null);

    const fetched = await getPlatformConfig("android");
    check("getPlatformConfig reads saved DB config", fetched.latestVersion === "1.5.0");

    const all = await getAllPlatformConfigs();
    check("getAllPlatformConfigs returns android & ios", all.android.platform === "android" && all.ios.platform === "ios");
  } catch (err) {
    console.error("DB test error:", err);
    failed++;
  } finally {
    await MobileAppConfig.deleteMany({ updatedBy: "admin@test.vn" }).catch(() => {});
  }
}

async function main() {
  await runUnitTests();
  await runDbIntegrationTests();

  console.log("\n========================================");
  console.log(`App Version Tests: ${passed} passed, ${failed} failed.`);
  console.log("========================================\n");

  if (failed > 0) process.exit(1);
}

main().finally(() => {
  if (mongoose.connection.readyState !== 0) {
    mongoose.disconnect();
  }
});
