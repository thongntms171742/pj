/**
 * googleAuthService.ts — xác thực Google ID Token (JWT RS256) không phụ thuộc
 * thư viện ngoài, hỗ trợ đồng thời Web (`@react-oauth/google` / GIS) và Mobile
 * (`@react-native-google-signin/google-signin` / Expo AuthSession).
 *
 * Bảo mật:
 *   - Xác minh chữ ký RS256 bằng Google JWKS (`oauth2/v3/certs`), có cache theo max-age.
 *   - Kiểm tra `iss`, `exp`, `aud` khớp `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_IDS`.
 *   - Bắt buộc `email_verified === true` và có `sub`, `email`.
 */

import crypto from "crypto";
import { User, type IUser } from "../models/User";
import { Cart } from "../models/Cart";
import { EmailVerification } from "../models/EmailVerification";
import { ErrorCode } from "../utils/errors";
import { AuthFlowError } from "../utils/otp";

const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

export interface GoogleJwk {
  kid: string;
  kty: string;
  alg?: string;
  use?: string;
  n: string;
  e: string;
}

export interface GoogleTokenClaims {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string;
}

export type GoogleJwksFetcher = () => Promise<{ keys: GoogleJwk[]; maxAgeSec?: number }>;

let jwksCache: { keys: GoogleJwk[]; expiresAt: number } | null = null;
let testJwksFetcher: GoogleJwksFetcher | null = null;

/** Dùng cho unit test offline (không gọi ra Google API). */
export function setGoogleJwksFetcherForTest(fn: GoogleJwksFetcher | null): void {
  testJwksFetcher = fn;
  jwksCache = null;
}

export function clearGoogleJwksCacheForTest(): void {
  jwksCache = null;
}

export function getGoogleClientIds(): string[] {
  const combined = [
    process.env.GOOGLE_CLIENT_IDS || "",
    process.env.GOOGLE_CLIENT_ID || "",
  ]
    .join(",")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return [...new Set(combined)];
}

async function fetchGoogleJwks(forceRefresh = false): Promise<GoogleJwk[]> {
  if (!forceRefresh && jwksCache && Date.now() < jwksCache.expiresAt) {
    return jwksCache.keys;
  }

  if (testJwksFetcher) {
    const res = await testJwksFetcher();
    const maxAgeSec = res.maxAgeSec ?? 3600;
    jwksCache = { keys: res.keys, expiresAt: Date.now() + maxAgeSec * 1000 };
    return res.keys;
  }

  const res = await fetch(GOOGLE_JWKS_URL, {
    method: "GET",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new AuthFlowError(
      ErrorCode.UPSTREAM_ERROR,
      `Không thể tải khóa xác thực từ Google (${res.status})`,
      502
    );
  }

  const cacheControl = res.headers.get("cache-control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;

  const data = (await res.json()) as { keys?: GoogleJwk[] };
  const keys = Array.isArray(data?.keys) ? data.keys : [];
  if (keys.length === 0) {
    throw new AuthFlowError(
      ErrorCode.UPSTREAM_ERROR,
      "Google JWKS trả về danh sách khóa rỗng",
      502
    );
  }

  jwksCache = {
    keys,
    expiresAt: Date.now() + Math.max(60, maxAgeSec) * 1000,
  };
  return keys;
}

function decodeBase64UrlJson<T>(segment: string): T | null {
  try {
    const json = Buffer.from(segment, "base64url").toString("utf8");
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleTokenClaims> {
  const clientIds = getGoogleClientIds();
  if (clientIds.length === 0) {
    throw new AuthFlowError(
      ErrorCode.SERVICE_UNAVAILABLE,
      "Đăng nhập Google chưa được cấu hình (thiếu GOOGLE_CLIENT_ID)",
      503
    );
  }

  const trimmed = idToken.trim();
  const parts = trimmed.split(".");
  if (parts.length !== 3 || parts.some((p) => p.length === 0)) {
    throw new AuthFlowError(
      ErrorCode.GOOGLE_TOKEN_INVALID,
      "Google ID token không đúng định dạng JWT",
      401
    );
  }

  const [headerB64, payloadB64, sigB64] = parts;
  const header = decodeBase64UrlJson<{ alg?: string; kid?: string }>(headerB64);
  const payload = decodeBase64UrlJson<{
    iss?: string;
    aud?: string;
    sub?: string;
    email?: string;
    email_verified?: boolean | string;
    name?: string;
    picture?: string;
    exp?: number;
  }>(payloadB64);

  if (!header || !payload || header.alg !== "RS256" || !header.kid) {
    throw new AuthFlowError(
      ErrorCode.GOOGLE_TOKEN_INVALID,
      "Header Google ID token không hợp lệ",
      401
    );
  }

  let keys = await fetchGoogleJwks(false);
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    // Google có thể vừa xoay vòng key — refresh cache 1 lần.
    keys = await fetchGoogleJwks(true);
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) {
    throw new AuthFlowError(
      ErrorCode.GOOGLE_TOKEN_INVALID,
      "Không tìm thấy khóa công khai phù hợp từ Google",
      401
    );
  }

  let signatureValid = false;
  try {
    const publicKey = crypto.createPublicKey({
      key: jwk as unknown as crypto.JsonWebKey,
      format: "jwk",
    });
    const signingInput = Buffer.from(`${headerB64}.${payloadB64}`, "utf8");
    const signature = Buffer.from(sigB64, "base64url");
    signatureValid = crypto.verify("RSA-SHA256", signingInput, publicKey, signature);
  } catch {
    signatureValid = false;
  }

  if (!signatureValid) {
    throw new AuthFlowError(
      ErrorCode.GOOGLE_TOKEN_INVALID,
      "Chữ ký Google ID token không hợp lệ",
      401
    );
  }

  if (!payload.iss || !GOOGLE_ISSUERS.has(payload.iss)) {
    throw new AuthFlowError(
      ErrorCode.GOOGLE_TOKEN_INVALID,
      "Issuer của Google token không hợp lệ",
      401
    );
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= nowSec - 30) {
    throw new AuthFlowError(
      ErrorCode.GOOGLE_TOKEN_INVALID,
      "Google ID token đã hết hạn",
      401
    );
  }

  if (!payload.aud || !clientIds.includes(payload.aud)) {
    throw new AuthFlowError(
      ErrorCode.GOOGLE_TOKEN_INVALID,
      "Google ID token không thuộc ứng dụng này",
      401
    );
  }

  const emailVerified = payload.email_verified === true || payload.email_verified === "true";
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";

  if (!sub || !email || !emailVerified) {
    throw new AuthFlowError(
      ErrorCode.GOOGLE_TOKEN_INVALID,
      "Tài khoản Google chưa xác thực email hoặc thiếu thông tin định danh",
      401
    );
  }

  const fallbackName = email.split("@")[0] || "Khách hàng";
  const cleanName =
    typeof payload.name === "string" && payload.name.trim().length >= 2
      ? payload.name.trim().slice(0, 100)
      : fallbackName;

  return {
    sub,
    email,
    emailVerified: true,
    name: cleanName,
    picture: typeof payload.picture === "string" ? payload.picture.trim() : "",
  };
}

export async function authenticateWithGoogle(idToken: string): Promise<{
  user: IUser;
  isNewUser: boolean;
}> {
  const claims = await verifyGoogleIdToken(idToken);

  const existing = await User.findOne({
    $or: [{ googleId: claims.sub }, { email: claims.email }],
  });

  if (existing) {
    if (existing.accountStatus === "suspended") {
      throw new AuthFlowError(
        ErrorCode.FORBIDDEN,
        "Tài khoản của bạn đã bị khóa",
        403
      );
    }

    let dirty = false;
    if (!existing.googleId) {
      existing.googleId = claims.sub;
      existing.authProvider = existing.passwordHash ? "both" : "google";
      dirty = true;
    }
    if (existing.emailVerified === false) {
      existing.emailVerified = true;
      existing.emailVerifiedAt = new Date();
      await EmailVerification.deleteMany({ userId: existing._id });
      dirty = true;
    }
    if (!existing.avatarUrl && claims.picture) {
      existing.avatarUrl = claims.picture;
      dirty = true;
    }
    if ((!existing.name || existing.name.trim().length < 2) && claims.name) {
      existing.name = claims.name;
      dirty = true;
    }
    if (dirty) await existing.save();

    return { user: existing, isNewUser: false };
  }

  const user = await User.create({
    name: claims.name,
    email: claims.email,
    passwordHash: "",
    avatarUrl: claims.picture,
    roles: ["buyer"],
    authProvider: "google",
    googleId: claims.sub,
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });

  try {
    await Cart.create({ userId: user._id });
  } catch (cartErr) {
    console.warn("[auth] Warning: Không thể tạo cart ban đầu cho Google user:", cartErr);
  }

  return { user, isNewUser: true };
}
