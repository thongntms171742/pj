import mongoose from "mongoose";
import dotenv from "dotenv";
import { ErrorCode } from "../utils/errors";
import { User } from "../models/User";
import { PasswordReset } from "../models/PasswordReset";
import {
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  login,
} from "../controllers/authController";
import {
  buildPasswordResetEmailContent,
  EmailDeliveryError,
  isEmailProviderConfigured,
  sendEmail,
  setEmailTransportForTest,
} from "../services/emailService";
import {
  clearResetCooldownsForTest,
  generateOtpCode,
  hashResetSecret,
  isValidOtpFormat,
  PasswordResetError,
  requestPasswordReset,
  resetPassword as resetPasswordService,
  safeEqualHex,
  verifyResetOtp as verifyResetOtpService,
} from "../services/passwordResetService";

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

async function callController(fn: (req: any, res: any) => Promise<void>, body: unknown) {
  const req: any = { body };
  const res = makeRes();
  await fn(req, res as any);
  return { status: res.statusCode, body: res.body };
}

async function runUnitTests() {
  console.log("\n── Running Forgot Password & Email Service Unit Tests ──\n");

  // ── 1. Input validation guards (never 500) ───────────────────────────────
  for (const body of [null, "hello", 123, true, [1, 2], {}, { email: "" }, { email: "   " }]) {
    const r = await callController(forgotPassword, body);
    check(`forgotPassword ${JSON.stringify(body)} → 400 MISSING_FIELD`, r.status === 400 && r.body?.error?.code === ErrorCode.MISSING_FIELD);
  }
  for (const email of ["no-at", "a@.vn", "a@b."]) {
    const r = await callController(forgotPassword, { email });
    check(`forgotPassword bad email "${email}" → 400 INVALID_INPUT`, r.status === 400 && r.body?.error?.code === ErrorCode.INVALID_INPUT);
  }

  for (const body of [null, {}, { email: "a@b.vn" }, { otp: "123456" }, { email: "a@b.vn", otp: "" }]) {
    const r = await callController(verifyResetOtp, body);
    check(`verifyResetOtp ${JSON.stringify(body)} → 400 MISSING_FIELD`, r.status === 400 && r.body?.error?.code === ErrorCode.MISSING_FIELD);
  }
  for (const otp of ["12345", "1234567", "abcdef", "12 456"]) {
    const r = await callController(verifyResetOtp, { email: "a@b.vn", otp });
    check(`verifyResetOtp bad otp "${otp}" → 400 RESET_OTP_INVALID`, r.status === 400 && r.body?.error?.code === ErrorCode.RESET_OTP_INVALID);
  }

  for (const body of [
    null,
    {},
    { email: "a@b.vn", newPassword: "Password123" }, // thiếu otp & resetToken
    { email: "a@b.vn", otp: "123456" }, // thiếu newPassword
    { email: "a@b.vn", resetToken: "abc", newPassword: "   " },
  ]) {
    const r = await callController(resetPassword, body);
    check(`resetPassword missing ${JSON.stringify(body)} → 400 MISSING_FIELD`, r.status === 400 && r.body?.error?.code === ErrorCode.MISSING_FIELD);
  }
  for (const password of ["123", "12345678", "Abc12345", "aa@12345", "Aa @12345"]) {
    const weakPw = await callController(resetPassword, { email: "a@b.vn", otp: "123456", newPassword: password });
    check(`resetPassword weak password ${JSON.stringify(password)} → 400 INVALID_INPUT`, weakPw.status === 400 && weakPw.body?.error?.code === ErrorCode.INVALID_INPUT);
  }

  const badOtpReset = await callController(resetPassword, { email: "a@b.vn", otp: "12ab56", newPassword: "Aa@12345" });
  check("resetPassword malformed otp → 400 RESET_OTP_INVALID", badOtpReset.status === 400 && badOtpReset.body?.error?.code === ErrorCode.RESET_OTP_INVALID);

  // ── 2. OTP generation & timing-safe HMAC helpers ─────────────────────────
  const otps = Array.from({ length: 50 }, () => generateOtpCode());
  check("generateOtpCode always returns 6 numeric digits", otps.every((o) => /^\d{6}$/.test(o)));
  check("isValidOtpFormat validates 6 digits", isValidOtpFormat("012345") && !isValidOtpFormat("12345"));

  const h1 = hashResetSecret("user1", "123456", "otp");
  const h2 = hashResetSecret("user1", "123456", "otp");
  const hDiffUser = hashResetSecret("user2", "123456", "otp");
  const hDiffPurpose = hashResetSecret("user1", "123456", "reset_token");
  check("hashResetSecret deterministic", safeEqualHex(h1, h2));
  check("hashResetSecret bound to userId", !safeEqualHex(h1, hDiffUser));
  check("hashResetSecret bound to purpose", !safeEqualHex(h1, hDiffPurpose));
  check("safeEqualHex handles mismatched length safely", !safeEqualHex("abcd", "ab"));

  // ── 3. Email service: HTML escaping, Apps Script webhook fetch, fallback
  const emailContent = buildPasswordResetEmailContent({
    name: `<script>alert("xss")</script>`,
    otp: "654321",
    expiresInMinutes: 10,
  });
  check("Email HTML escapes user name", emailContent.html.includes("&lt;script&gt;") && !emailContent.html.includes("<script>alert"));
  check("Email includes OTP & TTL", emailContent.html.includes("654321") && emailContent.text.includes("654321"));

  const prevEnv = {
    NODE_ENV: process.env.NODE_ENV,
    EMAIL_WEBHOOK_URL: process.env.EMAIL_WEBHOOK_URL,
    EMAIL_WEBHOOK_SECRET: process.env.EMAIL_WEBHOOK_SECRET,
    EMAIL_CONSOLE_FALLBACK: process.env.EMAIL_CONSOLE_FALLBACK,
  };
  const origFetch = globalThis.fetch;

  try {
    delete process.env.EMAIL_WEBHOOK_URL;
    delete process.env.EMAIL_WEBHOOK_SECRET;
    process.env.NODE_ENV = "test";
    check("isEmailProviderConfigured false when webhook unset", !isEmailProviderConfigured());

    const fallbackRes = await sendEmail({ to: "u@test.vn", subject: "s", html: "<p>x</p>", text: "x" });
    check("sendEmail uses console-fallback in non-prod", fallbackRes.provider === "console-fallback" && !fallbackRes.delivered);

    process.env.NODE_ENV = "production";
    let prodMissingThrew = false;
    try {
      await sendEmail({ to: "u@test.vn", subject: "s", html: "<p>x</p>", text: "x" });
    } catch (e) {
      prodMissingThrew = e instanceof EmailDeliveryError && e.status === 503;
    }
    check("sendEmail throws 503 in production without webhook", prodMissingThrew);

    // Invalid webhook scheme rejected
    process.env.EMAIL_WEBHOOK_URL = "ftp://bad-url";
    let invalidUrlThrew = false;
    try {
      await sendEmail({ to: "u@test.vn", subject: "s", html: "<p>x</p>", text: "x" });
    } catch (e) {
      invalidUrlThrew = e instanceof EmailDeliveryError && e.status === 503;
    }
    check("Invalid EMAIL_WEBHOOK_URL throws 503", invalidUrlThrew);

    // Mock fetch for Google Apps Script webhook
    let capturedUrl = "";
    let capturedBody: any = null;
    globalThis.fetch = (async (url: any, init: any) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true }),
      } as any;
    }) as typeof fetch;

    process.env.EMAIL_WEBHOOK_URL = "https://script.google.com/macros/s/test-id/exec";
    process.env.EMAIL_WEBHOOK_SECRET = "my-secret-123";
    check("isEmailProviderConfigured true with https webhook URL", isEmailProviderConfigured());
    const webhookRes = await sendEmail({ to: "u@test.vn", subject: "OTP", html: "<b>123456</b>", text: "123456" });
    check("Webhook POSTs to EMAIL_WEBHOOK_URL with secret & payload",
      capturedUrl === "https://script.google.com/macros/s/test-id/exec" &&
      capturedBody.secret === "my-secret-123" &&
      capturedBody.to === "u@test.vn" &&
      capturedBody.text === "123456" &&
      webhookRes.provider === "webhook" &&
      webhookRes.delivered
    );

    // Webhook returns HTTP 200 with { ok: false, error: "..." }
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: false, error: "Invalid secret" }),
    }) as any) as typeof fetch;

    let appErrThrew = false;
    try {
      await sendEmail({ to: "u@test.vn", subject: "OTP", html: "<b>123456</b>", text: "123456" });
    } catch (e) {
      appErrThrew = e instanceof EmailDeliveryError && e.status === 502 && e.message.includes("Invalid secret");
    }
    check("Webhook JSON { ok: false } throws 502 EmailDeliveryError", appErrThrew);
  } finally {
    globalThis.fetch = origFetch;
    Object.entries(prevEnv).forEach(([k, v]) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    });
  }

  // ── 4. Schema check (no DB) ──────────────────────────────────────────────
  const resetDoc = new PasswordReset({
    userId: new mongoose.Types.ObjectId(),
    email: "user@test.vn",
    otpHash: h1,
    expiresAt: new Date(Date.now() + 60_000),
  });
  check("PasswordReset schema validates cleanly", !resetDoc.validateSync());
}

async function runDbIntegrationTests() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.log("\n⚠️  No MONGO_URI set — skipping Forgot Password DB integration tests.");
    return;
  }

  console.log("\n── Running Forgot Password DB Integration Tests ──\n");
  const testEmail = `forgot_pw_${Date.now()}@example.com`;
  let lastCapturedOtp = "";

  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }

    setEmailTransportForTest(async (input) => {
      const m = input.text.match(/\b(\d{6})\b/);
      lastCapturedOtp = m ? m[1] : "";
      return { provider: "console-fallback", delivered: false };
    });

    const user = await User.create({
      name: "Forgot Tester",
      email: testEmail,
      passwordHash: "$2a$10$placeholderhashplaceholderhashplace",
      roles: ["buyer"],
    });

    // 1. Unknown email → uniform 200 without sending email
    lastCapturedOtp = "";
    const unknownRes = await requestPasswordReset("nonexistent_user_xyz@example.com");
    check("Unknown email returns uniform message", !!unknownRes.message && lastCapturedOtp === "");

    // 2. Request OTP → captured OTP & immediate resend hits cooldown 429
    clearResetCooldownsForTest();
    await requestPasswordReset(testEmail);
    check("OTP generated and delivered to email transport", /^\d{6}$/.test(lastCapturedOtp));

    let hitCooldown = false;
    try {
      await requestPasswordReset(testEmail);
    } catch (err) {
      hitCooldown = err instanceof PasswordResetError && err.code === ErrorCode.RESET_OTP_COOLDOWN && err.status === 429;
    }
    check("Immediate resend blocked by RESET_OTP_COOLDOWN (429)", hitCooldown);

    // 3. 3-step flow: verifyResetOtp → resetPassword with resetToken → login
    const otp1 = lastCapturedOtp;
    const verified = await verifyResetOtpService({ email: testEmail, otp: otp1 });
    check("verifyResetOtp returns valid resetToken", verified.valid === true && verified.resetToken.length >= 32);

    // Old OTP cannot be reused after being exchanged for resetToken
    let oldOtpBlocked = false;
    try {
      await resetPasswordService({ email: testEmail, otp: otp1, newPassword: "NewPassword123!" });
    } catch (err) {
      oldOtpBlocked = err instanceof PasswordResetError && err.code === ErrorCode.RESET_OTP_INVALID;
    }
    check("Exchanged OTP cannot be reused directly", oldOtpBlocked);

    await resetPasswordService({
      email: testEmail,
      resetToken: verified.resetToken,
      newPassword: "NewPassword123!",
    });

    // Token single-use check
    let reuseTokenBlocked = false;
    try {
      await resetPasswordService({
        email: testEmail,
        resetToken: verified.resetToken,
        newPassword: "AnotherPassword123!",
      });
    } catch (err) {
      reuseTokenBlocked = err instanceof PasswordResetError && err.code === ErrorCode.RESET_TOKEN_INVALID;
    }
    check("resetToken is single-use", reuseTokenBlocked);

    const loginRes = await callController(login, { email: testEmail, password: "NewPassword123!" });
    check("User can log in with new password", loginRes.status === 200 && !!loginRes.body?.token);

    // 4. 2-step flow: direct resetPassword with OTP
    clearResetCooldownsForTest();
    await requestPasswordReset(testEmail);
    const otp2 = lastCapturedOtp;
    await resetPasswordService({ email: testEmail, otp: otp2, newPassword: "SecondPassword123!" });
    const loginRes2 = await callController(login, { email: testEmail, password: "SecondPassword123!" });
    check("2-step direct OTP reset allows login", loginRes2.status === 200 && !!loginRes2.body?.token);

    // 5. Brute-force lockout (5 wrong attempts)
    clearResetCooldownsForTest();
    await requestPasswordReset(testEmail);
    const otp3 = lastCapturedOtp;
    const wrongOtp = otp3 === "111111" ? "222222" : "111111";
    let lockedOut = false;
    for (let i = 1; i <= 5; i++) {
      try {
        await verifyResetOtpService({ email: testEmail, otp: wrongOtp });
      } catch (err) {
        if (i === 5) {
          lockedOut = err instanceof PasswordResetError && err.code === ErrorCode.RESET_OTP_TOO_MANY_ATTEMPTS;
        }
      }
    }
    check("5 wrong OTP attempts locks out with RESET_OTP_TOO_MANY_ATTEMPTS", lockedOut);

    // 6. Expired OTP check
    clearResetCooldownsForTest();
    await requestPasswordReset(testEmail);
    await PasswordReset.updateOne({ userId: user._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    let expiredErr = false;
    try {
      await verifyResetOtpService({ email: testEmail, otp: lastCapturedOtp });
    } catch (err) {
      expiredErr = err instanceof PasswordResetError && err.code === ErrorCode.RESET_OTP_EXPIRED;
    }
    check("Expired OTP returns RESET_OTP_EXPIRED", expiredErr);
  } catch (err) {
    console.error("DB integration test error:", err);
    failed++;
  } finally {
    setEmailTransportForTest(null);
    clearResetCooldownsForTest();
    await PasswordReset.deleteMany({ email: testEmail }).catch(() => {});
    await User.deleteMany({ email: testEmail }).catch(() => {});
  }
}

async function main() {
  await runUnitTests();
  await runDbIntegrationTests();

  console.log("\n========================================");
  console.log(`Forgot Password Tests: ${passed} passed, ${failed} failed.`);
  console.log("========================================\n");

  if (failed > 0) process.exit(1);
}

main().finally(() => {
  if (mongoose.connection.readyState !== 0) {
    mongoose.disconnect();
  }
});
