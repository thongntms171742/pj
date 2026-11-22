/**
 * emailVerificationService.ts — xác thực email bằng OTP 6 số khi đăng ký tài khoản.
 *
 * Bảo mật:
 *   - OTP sinh bằng `crypto.randomInt`, hash HMAC-SHA256 gắn `userId`, so sánh timing-safe.
 *   - Giới hạn cooldown gửi lại OTP (mặc định 60s) và tối đa 5 lần nhập sai.
 *   - TTL index trên `EmailVerification` tự dọn bản ghi hết hạn.
 */

import { User, type IUser } from "../models/User";
import { EmailVerification } from "../models/EmailVerification";
import { ErrorCode } from "../utils/errors";
import {
  assertOtpRecordActive,
  AuthFlowError,
  consumeInvalidOtpAttempt,
  enforceOtpCooldown,
  generateOtpCode,
  hashOtpSecret,
  isValidOtpFormat,
  readPositiveIntEnv,
  restoreOtpCooldown,
  rethrowAsAuthFlowError,
  safeEqualHex,
} from "../utils/otp";
import { sendEmailVerificationOtpEmail } from "./emailService";

export function isEmailVerificationRequired(): boolean {
  return process.env.REQUIRE_EMAIL_VERIFICATION?.trim().toLowerCase() !== "false";
}

export function getVerifyOtpTtlMs(): number {
  return readPositiveIntEnv("EMAIL_VERIFY_OTP_TTL_MS", 10 * 60 * 1000);
}

export function getVerifyCooldownMs(): number {
  return readPositiveIntEnv("EMAIL_VERIFY_COOLDOWN_MS", 60 * 1000);
}

export function getVerifyMaxAttempts(): number {
  return readPositiveIntEnv("EMAIL_VERIFY_MAX_ATTEMPTS", 5);
}

const verifyCooldownMap = new Map<string, number>();

export function clearVerifyCooldownsForTest(): void {
  verifyCooldownMap.clear();
}

function checkVerifyCooldown(email: string) {
  return enforceOtpCooldown(
    verifyCooldownMap,
    email,
    getVerifyCooldownMs(),
    ErrorCode.VERIFY_OTP_COOLDOWN,
    (sec) => `Vui lòng chờ ${sec} giây trước khi gửi lại mã xác thực`
  );
}

export async function issueVerificationOtpForUser(
  user: Pick<IUser, "_id" | "email" | "name">
): Promise<{ expiresInSeconds: number }> {
  const { now, prevSentAt } = checkVerifyCooldown(user.email);

  const ttlMs = getVerifyOtpTtlMs();
  const expiresInSeconds = Math.floor(ttlMs / 1000);
  const otp = generateOtpCode();
  const otpHash = hashOtpSecret(String(user._id), otp, "email_verify");

  await EmailVerification.deleteMany({ userId: user._id });
  const record = await EmailVerification.create({
    userId: user._id,
    email: user.email,
    otpHash,
    attempts: 0,
    lastSentAt: new Date(now),
    expiresAt: new Date(now + ttlMs),
  });

  try {
    await sendEmailVerificationOtpEmail({
      to: user.email,
      name: user.name,
      otp,
      expiresInMinutes: Math.max(1, Math.round(ttlMs / 60_000)),
    });
  } catch (err) {
    await EmailVerification.deleteOne({ _id: record._id }).catch(() => {});
    restoreOtpCooldown(verifyCooldownMap, user.email, prevSentAt);
    rethrowAsAuthFlowError(err);
  }

  return { expiresInSeconds };
}

const UNIFORM_RESEND_MESSAGE =
  "Nếu tài khoản chưa xác thực tồn tại, mã OTP xác thực mới đã được gửi về email.";

export async function resendVerificationOtp(email: string): Promise<{
  message: string;
  expiresInSeconds: number;
}> {
  const ttlMs = getVerifyOtpTtlMs();
  const defaultExpires = Math.floor(ttlMs / 1000);

  const user = await User.findOne({ email }).select(
    "_id name email emailVerified accountStatus"
  );
  if (!user || user.accountStatus === "suspended") {
    // Tôn trọng cooldown trước để tránh dò tài khoản qua timing/429 khác biệt.
    checkVerifyCooldown(email);
    return { message: UNIFORM_RESEND_MESSAGE, expiresInSeconds: defaultExpires };
  }

  if (user.emailVerified !== false) {
    throw new AuthFlowError(
      ErrorCode.EMAIL_ALREADY_VERIFIED,
      "Email này đã được xác thực trước đó. Bạn có thể đăng nhập ngay.",
      409
    );
  }

  const { expiresInSeconds } = await issueVerificationOtpForUser(user);
  return { message: UNIFORM_RESEND_MESSAGE, expiresInSeconds };
}

export async function verifyEmailOtp(params: {
  email: string;
  otp: string;
}): Promise<IUser> {
  if (!isValidOtpFormat(params.otp)) {
    throw new AuthFlowError(
      ErrorCode.VERIFY_OTP_INVALID,
      "Mã OTP xác thực phải gồm 6 chữ số",
      400
    );
  }

  const user = await User.findOne({ email: params.email });
  if (!user || user.accountStatus === "suspended") {
    throw new AuthFlowError(
      ErrorCode.VERIFY_OTP_INVALID,
      "Mã OTP không đúng hoặc tài khoản không tồn tại",
      400
    );
  }

  if (user.emailVerified !== false) {
    throw new AuthFlowError(
      ErrorCode.EMAIL_ALREADY_VERIFIED,
      "Email này đã được xác thực trước đó. Bạn có thể đăng nhập ngay.",
      409
    );
  }

  const record = await EmailVerification.findOne({ userId: user._id }).sort({
    createdAt: -1,
  });
  if (!record) {
    throw new AuthFlowError(
      ErrorCode.VERIFY_OTP_INVALID,
      "Không tìm thấy mã xác thực. Vui lòng yêu cầu gửi lại OTP.",
      400
    );
  }

  const maxAttempts = getVerifyMaxAttempts();
  const clearRecords = () => EmailVerification.deleteMany({ userId: user._id });

  await assertOtpRecordActive({
    expiresAt: record.expiresAt,
    attempts: record.attempts,
    maxAttempts,
    clearRecords,
    expiredCode: ErrorCode.VERIFY_OTP_EXPIRED,
    expiredMessage: "Mã OTP đã hết hạn. Vui lòng yêu cầu gửi lại mã mới.",
    tooManyAttemptsCode: ErrorCode.VERIFY_OTP_TOO_MANY_ATTEMPTS,
    tooManyAttemptsMessage:
      "Bạn đã nhập sai OTP xác thực quá số lần cho phép. Vui lòng yêu cầu mã mới.",
  });

  const expectedHash = hashOtpSecret(String(user._id), params.otp.trim(), "email_verify");
  if (!safeEqualHex(record.otpHash, expectedHash)) {
    await consumeInvalidOtpAttempt({
      fallbackAttempts: record.attempts,
      maxAttempts,
      incrementAttempt: async () => {
        const updated = await EmailVerification.findOneAndUpdate(
          { _id: record._id },
          { $inc: { attempts: 1 } },
          { new: true }
        );
        return updated?.attempts;
      },
      clearRecords,
      tooManyAttemptsCode: ErrorCode.VERIFY_OTP_TOO_MANY_ATTEMPTS,
      tooManyAttemptsMessage:
        "Bạn đã nhập sai OTP xác thực quá số lần cho phép. Vui lòng yêu cầu mã mới.",
      invalidCode: ErrorCode.VERIFY_OTP_INVALID,
      invalidMessage: "Mã OTP xác thực không đúng",
    });
  }

  user.emailVerified = true;
  user.emailVerifiedAt = new Date();
  await user.save();

  await clearRecords();
  verifyCooldownMap.delete(user.email);

  return user;
}
