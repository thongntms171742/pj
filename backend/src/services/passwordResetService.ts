/**
 * passwordResetService.ts — nghiệp vụ Quên mật khẩu bằng mã OTP 6 số qua Email.
 *
 * Hỗ trợ cả 2 luồng FE/Mobile:
 *   1) 3 bước: forgot-password → verify-reset-otp (nhận resetToken) → reset-password
 *   2) 2 bước: forgot-password → reset-password (gửi trực tiếp otp + newPassword)
 */

import bcrypt from "bcryptjs";
import { User } from "../models/User";
import { PasswordReset, type IPasswordReset } from "../models/PasswordReset";
import { ErrorCode } from "../utils/errors";
import {
  assertOtpRecordActive,
  AuthFlowError,
  consumeInvalidOtpAttempt,
  enforceOtpCooldown,
  generateHexToken,
  generateOtpCode,
  hashOtpSecret,
  isValidOtpFormat,
  readPositiveIntEnv,
  restoreOtpCooldown,
  rethrowAsAuthFlowError,
  safeEqualHex,
} from "../utils/otp";
import { isEmailProviderConfigured, sendPasswordResetOtpEmail } from "./emailService";

export const PasswordResetError = AuthFlowError;
export {
  generateOtpCode,
  isValidOtpFormat,
  safeEqualHex,
};

export function generateResetToken(): string {
  return generateHexToken(32);
}

export function hashResetSecret(
  userId: string,
  secret: string,
  purpose: "otp" | "reset_token"
): string {
  return hashOtpSecret(userId, secret, purpose);
}

export function getOtpTtlMs(): number {
  return readPositiveIntEnv("PASSWORD_RESET_OTP_TTL_MS", 10 * 60 * 1000);
}

export function getResetTokenTtlMs(): number {
  return readPositiveIntEnv("PASSWORD_RESET_TOKEN_TTL_MS", 10 * 60 * 1000);
}

export function getOtpCooldownMs(): number {
  return readPositiveIntEnv("PASSWORD_RESET_COOLDOWN_MS", 60 * 1000);
}

export function getOtpMaxAttempts(): number {
  return readPositiveIntEnv("PASSWORD_RESET_MAX_ATTEMPTS", 5);
}

const requestCooldownMap = new Map<string, number>();

export function clearResetCooldownsForTest(): void {
  requestCooldownMap.clear();
}

const UNIFORM_FORGOT_MESSAGE =
  "Nếu email tồn tại trong hệ thống, mã OTP đặt lại mật khẩu đã được gửi.";

export async function requestPasswordReset(email: string): Promise<{
  message: string;
  expiresInSeconds: number;
  devOtp?: string;
}> {
  const { now, prevSentAt } = enforceOtpCooldown(
    requestCooldownMap,
    email,
    getOtpCooldownMs(),
    ErrorCode.RESET_OTP_COOLDOWN,
    (sec) => `Vui lòng chờ ${sec} giây trước khi gửi lại mã OTP`
  );

  const otpTtlMs = getOtpTtlMs();
  const expiresInSeconds = Math.floor(otpTtlMs / 1000);

  const user = await User.findOne({ email }).select("_id name email accountStatus");
  if (!user || user.accountStatus === "suspended") {
    return { message: UNIFORM_FORGOT_MESSAGE, expiresInSeconds };
  }

  const otp = generateOtpCode();
  const otpHash = hashOtpSecret(String(user._id), otp, "otp");

  await PasswordReset.deleteMany({ userId: user._id });
  const createdRecord = await PasswordReset.create({
    userId: user._id,
    email: user.email,
    otpHash,
    resetTokenHash: null,
    attempts: 0,
    lastSentAt: new Date(now),
    expiresAt: new Date(now + otpTtlMs),
  });

  try {
    await sendPasswordResetOtpEmail({
      to: user.email,
      name: user.name,
      otp,
      expiresInMinutes: Math.max(1, Math.round(otpTtlMs / 60_000)),
    });
  } catch (err) {
    await PasswordReset.deleteOne({ _id: createdRecord._id }).catch(() => {});
    restoreOtpCooldown(requestCooldownMap, email, prevSentAt);
    rethrowAsAuthFlowError(err);
  }

  const exposeDevOtp =
    process.env.NODE_ENV !== "production" &&
    !isEmailProviderConfigured() &&
    process.env.AUTH_DEV_EXPOSE_OTP === "true";

  return {
    message: UNIFORM_FORGOT_MESSAGE,
    expiresInSeconds,
    ...(exposeDevOtp ? { devOtp: otp } : {}),
  };
}

async function validateActiveOtpRecord(
  email: string,
  otp: string
): Promise<{ userId: string; record: IPasswordReset }> {
  const user = await User.findOne({ email }).select("_id accountStatus");
  if (!user || user.accountStatus === "suspended") {
    throw new AuthFlowError(
      ErrorCode.RESET_OTP_INVALID,
      "Mã OTP không đúng hoặc không tồn tại",
      400
    );
  }

  const record = await PasswordReset.findOne({ userId: user._id }).sort({ createdAt: -1 });
  if (!record || !record.otpHash) {
    throw new AuthFlowError(
      ErrorCode.RESET_OTP_INVALID,
      "Mã OTP không đúng hoặc đã được sử dụng",
      400
    );
  }

  const maxAttempts = getOtpMaxAttempts();
  const clearRecords = () => PasswordReset.deleteMany({ userId: user._id });

  await assertOtpRecordActive({
    expiresAt: record.expiresAt,
    attempts: record.attempts,
    maxAttempts,
    clearRecords,
    expiredCode: ErrorCode.RESET_OTP_EXPIRED,
    expiredMessage: "Mã OTP đã hết hạn. Vui lòng yêu cầu mã mới.",
    tooManyAttemptsCode: ErrorCode.RESET_OTP_TOO_MANY_ATTEMPTS,
    tooManyAttemptsMessage:
      "Bạn đã nhập sai OTP quá số lần cho phép. Vui lòng yêu cầu mã mới.",
  });

  const expectedHash = hashOtpSecret(String(user._id), otp, "otp");
  if (!safeEqualHex(record.otpHash, expectedHash)) {
    await consumeInvalidOtpAttempt({
      fallbackAttempts: record.attempts,
      maxAttempts,
      incrementAttempt: async () => {
        const updated = await PasswordReset.findOneAndUpdate(
          { _id: record._id },
          { $inc: { attempts: 1 } },
          { new: true }
        );
        return updated?.attempts;
      },
      clearRecords,
      tooManyAttemptsCode: ErrorCode.RESET_OTP_TOO_MANY_ATTEMPTS,
      tooManyAttemptsMessage:
        "Bạn đã nhập sai OTP quá số lần cho phép. Vui lòng yêu cầu mã mới.",
      invalidCode: ErrorCode.RESET_OTP_INVALID,
      invalidMessage: "Mã OTP không đúng",
    });
  }

  return { userId: String(user._id), record };
}

export async function verifyResetOtp(params: {
  email: string;
  otp: string;
}): Promise<{
  valid: true;
  resetToken: string;
  expiresInSeconds: number;
}> {
  if (!isValidOtpFormat(params.otp)) {
    throw new AuthFlowError(
      ErrorCode.RESET_OTP_INVALID,
      "Mã OTP phải gồm 6 chữ số",
      400
    );
  }
  const { userId, record } = await validateActiveOtpRecord(params.email, params.otp.trim());

  const resetToken = generateResetToken();
  const tokenTtlMs = getResetTokenTtlMs();

  record.resetTokenHash = hashOtpSecret(userId, resetToken, "reset_token");
  record.otpHash = "";
  record.attempts = 0;
  record.expiresAt = new Date(Date.now() + tokenTtlMs);
  await record.save();

  return {
    valid: true,
    resetToken,
    expiresInSeconds: Math.floor(tokenTtlMs / 1000),
  };
}

export async function resetPassword(params: {
  email: string;
  otp?: string;
  resetToken?: string;
  newPassword: string;
}): Promise<{ message: string }> {
  const user = await User.findOne({ email: params.email }).select(
    "_id accountStatus authProvider emailVerified"
  );
  if (!user || user.accountStatus === "suspended") {
    throw new AuthFlowError(
      params.resetToken ? ErrorCode.RESET_TOKEN_INVALID : ErrorCode.RESET_OTP_INVALID,
      "Thông tin xác thực đặt lại mật khẩu không hợp lệ",
      400
    );
  }

  const userIdStr = String(user._id);

  if (params.resetToken) {
    const record = await PasswordReset.findOne({ userId: user._id }).sort({ createdAt: -1 });
    if (!record || !record.resetTokenHash) {
      throw new AuthFlowError(
        ErrorCode.RESET_TOKEN_INVALID,
        "Phiên đặt lại mật khẩu không hợp lệ hoặc đã được sử dụng",
        400
      );
    }
    if (record.expiresAt.getTime() <= Date.now()) {
      await PasswordReset.deleteMany({ userId: user._id });
      throw new AuthFlowError(
        ErrorCode.RESET_OTP_EXPIRED,
        "Phiên đặt lại mật khẩu đã hết hạn. Vui lòng thực hiện lại.",
        400
      );
    }
    const expectedHash = hashOtpSecret(userIdStr, params.resetToken, "reset_token");
    if (!safeEqualHex(record.resetTokenHash, expectedHash)) {
      throw new AuthFlowError(
        ErrorCode.RESET_TOKEN_INVALID,
        "Phiên đặt lại mật khẩu không hợp lệ",
        400
      );
    }
  } else if (params.otp !== undefined) {
    if (!isValidOtpFormat(params.otp)) {
      throw new AuthFlowError(
        ErrorCode.RESET_OTP_INVALID,
        "Mã OTP phải gồm 6 chữ số",
        400
      );
    }
    await validateActiveOtpRecord(params.email, params.otp.trim());
  } else {
    throw new AuthFlowError(
      ErrorCode.MISSING_FIELD,
      "Vui lòng cung cấp mã OTP hoặc resetToken",
      400
    );
  }

  const passwordHash = await bcrypt.hash(params.newPassword, 10);
  const nextProvider = user.authProvider === "google" ? "both" : user.authProvider;
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        passwordHash,
        authProvider: nextProvider,
        ...(user.emailVerified === false
          ? { emailVerified: true, emailVerifiedAt: new Date() }
          : {}),
      },
    }
  );
  await PasswordReset.deleteMany({ userId: user._id });
  requestCooldownMap.delete(params.email);

  return {
    message: "Đặt lại mật khẩu thành công. Bạn có thể đăng nhập với mật khẩu mới.",
  };
}
