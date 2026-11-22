import crypto from "crypto";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { ErrorCode } from "../utils/errors";
import { User } from "../models/User";
import { EmailVerification } from "../models/EmailVerification";
import { Cart } from "../models/Cart";
import { userToDto } from "../dto/user";
import {
  verifyEmail,
  resendVerificationOtp,
  googleAuth,
  register,
  login,
} from "../controllers/authController";
import { setEmailTransportForTest, buildEmailVerificationContent } from "../services/emailService";
import {
  clearVerifyCooldownsForTest,
  isEmailVerificationRequired,
  verifyEmailOtp as verifyEmailOtpService,
} from "../services/emailVerificationService";
import {
  clearGoogleJwksCacheForTest,
  getGoogleClientIds,
  setGoogleJwksFetcherForTest,
  verifyGoogleIdToken,
} from "../services/googleAuthService";
import { AuthFlowError } from "../utils/otp";

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

async function callCtrl(fn: (req: any, res: any) => Promise<void>, body: unknown) {
  const req: any = { body };
  const res = makeRes();
  await fn(req, res as any);
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

function signMockRs256Jwt(params: {
  privateKey: crypto.KeyObject;
  kid: string;
  payload: Record<string, unknown>;
}): string {
  const headerB64 = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT", kid: params.kid })
  ).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(params.payload)).toString("base64url");
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = crypto.sign("RSA-SHA256", Buffer.from(signingInput, "utf8"), params.privateKey);
  return `${signingInput}.${sig.toString("base64url")}`;
}

async function runUnitTests() {
  console.log("\n── Running Email Verification & Google Auth Unit Tests ──\n");

  // ── 1. Input validation guards ───────────────────────────────────────────
  for (const body of [null, "text", 123, [1], {}, { email: "a@b.vn" }, { otp: "123456" }]) {
    const r = await callCtrl(verifyEmail, body);
    check(`verifyEmail ${JSON.stringify(body)} → 400 MISSING_FIELD`, r.status === 400 && r.body?.error?.code === ErrorCode.MISSING_FIELD);
  }
  const badEmailVerify = await callCtrl(verifyEmail, { email: "bad-email", otp: "123456" });
  check("verifyEmail bad email → 400 INVALID_INPUT", badEmailVerify.status === 400 && badEmailVerify.body?.error?.code === ErrorCode.INVALID_INPUT);

  for (const otp of ["123", "abcdef", "1234567"]) {
    const r = await callCtrl(verifyEmail, { email: "u@test.vn", otp });
    check(`verifyEmail bad otp "${otp}" → 400 VERIFY_OTP_INVALID`, r.status === 400 && r.body?.error?.code === ErrorCode.VERIFY_OTP_INVALID);
  }

  for (const body of [null, {}, { email: "" }, { email: "   " }]) {
    const r = await callCtrl(resendVerificationOtp, body);
    check(`resendVerificationOtp ${JSON.stringify(body)} → 400 MISSING_FIELD`, r.status === 400 && r.body?.error?.code === ErrorCode.MISSING_FIELD);
  }
  const badResendEmail = await callCtrl(resendVerificationOtp, { email: "nope" });
  check("resendVerificationOtp bad email → 400 INVALID_INPUT", badResendEmail.status === 400 && badResendEmail.body?.error?.code === ErrorCode.INVALID_INPUT);

  for (const body of [null, "str", 123, {}, { idToken: "" }, { credential: "   " }]) {
    const r = await callCtrl(googleAuth, body);
    check(`googleAuth ${JSON.stringify(body)} → 400 MISSING_FIELD`, r.status === 400 && r.body?.error?.code === ErrorCode.MISSING_FIELD);
  }

  // ── 2. Verification email template & User model / DTO checks ─────────────
  const content = buildEmailVerificationContent({
    name: `<img src=x onerror=alert(1)>`,
    otp: "987654",
    expiresInMinutes: 10,
  });
  check("Verification email escapes HTML & embeds OTP", content.html.includes("&lt;img") && content.html.includes("987654"));

  const legacyUser = new User({ name: "Legacy User", email: "legacy@test.vn", passwordHash: "h" });
  const legacyDto = userToDto(legacyUser);
  check("Legacy User defaults to emailVerified=true & authProvider=local", legacyDto.emailVerified === true && legacyDto.authProvider === "local");

  const googleOnlyUser = new User({
    name: "Google User",
    email: "g@test.vn",
    authProvider: "google",
    googleId: "sub-123",
    emailVerified: true,
  });
  check("Google user comparePassword returns false safely", (await googleOnlyUser.comparePassword("Aa@12345")) === false);
  check("Google user schema validates without passwordHash", !googleOnlyUser.validateSync());

  const evDoc = new EmailVerification({
    userId: new mongoose.Types.ObjectId(),
    email: "u@test.vn",
    otpHash: "abcd".repeat(16),
    expiresAt: new Date(Date.now() + 60_000),
  });
  check("EmailVerification schema validates cleanly", !evDoc.validateSync());

  // ── 3. Google ID Token cryptographic RS256 verification ──────────────────
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" }) as any;
  const kid = "test-google-kid-1";
  const clientId = "1234567890-web.apps.googleusercontent.com";

  const prevClientId = process.env.GOOGLE_CLIENT_ID;
  const prevClientIds = process.env.GOOGLE_CLIENT_IDS;
  const prevRequireVerify = process.env.REQUIRE_EMAIL_VERIFICATION;

  try {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_IDS;
    check("getGoogleClientIds empty when unset", getGoogleClientIds().length === 0);

    let unconfigured = false;
    try {
      await verifyGoogleIdToken("a.b.c");
    } catch (e) {
      unconfigured = e instanceof AuthFlowError && e.status === 503;
    }
    check("verifyGoogleIdToken returns 503 when GOOGLE_CLIENT_ID unset", unconfigured);

    process.env.GOOGLE_CLIENT_ID = clientId;
    process.env.GOOGLE_CLIENT_IDS = "mobile-client-id.apps.googleusercontent.com";
    check("getGoogleClientIds merges single & plural env vars", getGoogleClientIds().length === 2);

    setGoogleJwksFetcherForTest(async () => ({
      keys: [{ kid, kty: jwk.kty, alg: "RS256", use: "sig", n: jwk.n, e: jwk.e }],
      maxAgeSec: 3600,
    }));

    const nowSec = Math.floor(Date.now() / 1000);
    const validToken = signMockRs256Jwt({
      privateKey,
      kid,
      payload: {
        iss: "https://accounts.google.com",
        aud: clientId,
        sub: "google-sub-001",
        email: "GoogleUser@Gmail.com",
        email_verified: true,
        name: "Nguyễn Minh Google",
        picture: "https://lh3.googleusercontent.com/avatar.png",
        exp: nowSec + 3600,
      },
    });
    const claims = await verifyGoogleIdToken(validToken);
    check(
      "verifyGoogleIdToken accepts valid RS256 Google JWT",
      claims.sub === "google-sub-001" &&
        claims.email === "googleuser@gmail.com" &&
        claims.name === "Nguyễn Minh Google" &&
        claims.picture.startsWith("https://")
    );

    // Tampered payload
    const [h, p, s] = validToken.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({ iss: "https://accounts.google.com", aud: clientId, sub: "hacker", email: "victim@gmail.com", email_verified: true, exp: nowSec + 3600 })
    ).toString("base64url");
    let sigFailed = false;
    try {
      await verifyGoogleIdToken(`${h}.${tamperedPayload}.${s}`);
    } catch (e) {
      sigFailed = e instanceof AuthFlowError && e.code === ErrorCode.GOOGLE_TOKEN_INVALID;
    }
    check("verifyGoogleIdToken rejects tampered JWT signature", sigFailed && !!p);

    // Wrong audience
    const wrongAudToken = signMockRs256Jwt({
      privateKey,
      kid,
      payload: { iss: "accounts.google.com", aud: "other-app-id", sub: "s1", email: "a@b.com", email_verified: true, exp: nowSec + 3600 },
    });
    let audFailed = false;
    try {
      await verifyGoogleIdToken(wrongAudToken);
    } catch (e) {
      audFailed = e instanceof AuthFlowError && e.code === ErrorCode.GOOGLE_TOKEN_INVALID;
    }
    check("verifyGoogleIdToken rejects wrong audience", audFailed);

    // Expired token
    const expiredToken = signMockRs256Jwt({
      privateKey,
      kid,
      payload: { iss: "accounts.google.com", aud: clientId, sub: "s1", email: "a@b.com", email_verified: true, exp: nowSec - 120 },
    });
    let expFailed = false;
    try {
      await verifyGoogleIdToken(expiredToken);
    } catch (e) {
      expFailed = e instanceof AuthFlowError && e.code === ErrorCode.GOOGLE_TOKEN_INVALID;
    }
    check("verifyGoogleIdToken rejects expired token", expFailed);

    // Unverified Google email
    const unverifiedEmailToken = signMockRs256Jwt({
      privateKey,
      kid,
      payload: { iss: "accounts.google.com", aud: clientId, sub: "s1", email: "a@b.com", email_verified: false, exp: nowSec + 3600 },
    });
    let emailUnverifiedFailed = false;
    try {
      await verifyGoogleIdToken(unverifiedEmailToken);
    } catch (e) {
      emailUnverifiedFailed = e instanceof AuthFlowError && e.code === ErrorCode.GOOGLE_TOKEN_INVALID;
    }
    check("verifyGoogleIdToken rejects email_verified=false", emailUnverifiedFailed);

    delete process.env.REQUIRE_EMAIL_VERIFICATION;
    check("isEmailVerificationRequired defaults to true", isEmailVerificationRequired() === true);
    process.env.REQUIRE_EMAIL_VERIFICATION = "false";
    check("isEmailVerificationRequired honors false flag", isEmailVerificationRequired() === false);
  } finally {
    setGoogleJwksFetcherForTest(null);
    clearGoogleJwksCacheForTest();
    if (prevClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = prevClientId;
    if (prevClientIds === undefined) delete process.env.GOOGLE_CLIENT_IDS;
    else process.env.GOOGLE_CLIENT_IDS = prevClientIds;
    if (prevRequireVerify === undefined) delete process.env.REQUIRE_EMAIL_VERIFICATION;
    else process.env.REQUIRE_EMAIL_VERIFICATION = prevRequireVerify;
  }
}

async function runDbIntegrationTests() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.log("\n⚠️  No MONGO_URI set — skipping Email Verification & Google Auth DB tests.");
    return;
  }

  console.log("\n── Running Email Verification & Google Auth DB Tests ──\n");
  const emailVerifyAddr = `verify_${Date.now()}@example.com`;
  const googleEmailAddr = `google_${Date.now()}@gmail.com`;
  let capturedOtp = "";

  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" }) as any;
  const kid = "db-test-kid";
  const clientId = "db-test-client.apps.googleusercontent.com";

  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }

    process.env.REQUIRE_EMAIL_VERIFICATION = "true";
    process.env.GOOGLE_CLIENT_ID = clientId;

    setEmailTransportForTest(async (input) => {
      const m = input.text.match(/\b(\d{6})\b/);
      capturedOtp = m ? m[1] : "";
      return { provider: "console-fallback", delivered: false };
    });

    setGoogleJwksFetcherForTest(async () => ({
      keys: [{ kid, kty: jwk.kty, alg: "RS256", use: "sig", n: jwk.n, e: jwk.e }],
      maxAgeSec: 3600,
    }));

    // 1. Register creates unverified user, omits token, sends OTP
    clearVerifyCooldownsForTest();
    const reg = await callCtrl(register, {
      name: "Nguyễn Văn Xác Thực",
      email: emailVerifyAddr,
      password: "Aa@12345",
    });
    check(
      "Register requires email verification & withholds JWT token",
      reg.status === 201 &&
        reg.body?.requiresEmailVerification === true &&
        !reg.body?.token &&
        reg.body?.user?.emailVerified === false &&
        /^\d{6}$/.test(capturedOtp)
    );

    // 2. Unverified login blocked with 403 EMAIL_NOT_VERIFIED
    const unverifiedLogin = await callCtrl(login, {
      email: emailVerifyAddr,
      password: "Aa@12345",
    });
    check(
      "Unverified account login blocked with 403 EMAIL_NOT_VERIFIED",
      unverifiedLogin.status === 403 && unverifiedLogin.body?.error?.code === ErrorCode.EMAIL_NOT_VERIFIED
    );

    // 3. Resend cooldown check
    const resendCooldown = await callCtrl(resendVerificationOtp, { email: emailVerifyAddr });
    check(
      "Immediate resend blocked with 429 VERIFY_OTP_COOLDOWN",
      resendCooldown.status === 429 && resendCooldown.body?.error?.code === ErrorCode.VERIFY_OTP_COOLDOWN
    );

    // 4. Verify OTP activates user and returns JWT token
    const verified = await callCtrl(verifyEmail, { email: emailVerifyAddr, otp: capturedOtp });
    check(
      "verifyEmail marks verified & returns JWT",
      verified.status === 200 && !!verified.body?.token && verified.body?.user?.emailVerified === true
    );

    // 5. Login succeeds after verifyEmail
    const loginAfter = await callCtrl(login, { email: emailVerifyAddr, password: "Aa@12345" });
    check("Login succeeds after email verified", loginAfter.status === 200 && !!loginAfter.body?.token);

    // 6. Brute-force lockout on verifyEmailOtp
    clearVerifyCooldownsForTest();
    const reg2Email = `verify2_${Date.now()}@example.com`;
    await callCtrl(register, { name: "Locked User", email: reg2Email, password: "Aa@12345" });
    const wrongOtp = capturedOtp === "111111" ? "222222" : "111111";
    let locked = false;
    for (let i = 1; i <= 5; i++) {
      try {
        await verifyEmailOtpService({ email: reg2Email, otp: wrongOtp });
      } catch (e) {
        if (i === 5) locked = e instanceof AuthFlowError && e.code === ErrorCode.VERIFY_OTP_TOO_MANY_ATTEMPTS;
      }
    }
    check("5 wrong verify OTP attempts triggers VERIFY_OTP_TOO_MANY_ATTEMPTS", locked);
    await User.deleteMany({ email: reg2Email });
    await EmailVerification.deleteMany({ email: reg2Email });

    // 7. Google Sign-Up creates new user (201, isNewUser=true, authProvider=google)
    const nowSec = Math.floor(Date.now() / 1000);
    const gToken = signMockRs256Jwt({
      privateKey,
      kid,
      payload: {
        iss: "https://accounts.google.com",
        aud: clientId,
        sub: `gsub_${Date.now()}`,
        email: googleEmailAddr,
        email_verified: true,
        name: "Trần Thị Google",
        picture: "https://example.com/avatar.png",
        exp: nowSec + 3600,
      },
    });
    const gRes1 = await callCtrl(googleAuth, { idToken: gToken });
    check(
      "Google new signup returns 201 with token & authProvider=google",
      gRes1.status === 201 &&
        gRes1.body?.isNewUser === true &&
        !!gRes1.body?.token &&
        gRes1.body?.user?.authProvider === "google" &&
        gRes1.body?.user?.emailVerified === true
    );

    const gCart = await Cart.findOne({ userId: gRes1.body?.user?._id });
    check("Google signup creates initial Cart", !!gCart);

    // 8. Second Google login returns 200 & isNewUser=false
    const gRes2 = await callCtrl(googleAuth, { credential: gToken });
    check("Subsequent Google login returns 200 & isNewUser=false", gRes2.status === 200 && gRes2.body?.isNewUser === false);
  } catch (err) {
    console.error("DB test error:", err);
    failed++;
  } finally {
    setEmailTransportForTest(null);
    setGoogleJwksFetcherForTest(null);
    clearVerifyCooldownsForTest();
    clearGoogleJwksCacheForTest();
    const createdUsers = await User.find({ email: { $in: [emailVerifyAddr, googleEmailAddr] } }).select("_id");
    const ids = createdUsers.map((u) => u._id);
    if (ids.length > 0) {
      await Cart.deleteMany({ userId: { $in: ids } }).catch(() => {});
      await EmailVerification.deleteMany({ userId: { $in: ids } }).catch(() => {});
      await User.deleteMany({ _id: { $in: ids } }).catch(() => {});
    }
  }
}

async function main() {
  await runUnitTests();
  await runDbIntegrationTests();

  console.log("\n========================================");
  console.log(`Email Verification & Google Auth Tests: ${passed} passed, ${failed} failed.`);
  console.log("========================================\n");

  if (failed > 0) process.exit(1);
}

main().finally(() => {
  if (mongoose.connection.readyState !== 0) {
    mongoose.disconnect();
  }
});
