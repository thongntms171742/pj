import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { User, type IUser } from "../models/User";
import { Cart } from "../models/Cart";
import { signToken } from "../middleware/auth";
import { sendError, ErrorCode, handleInternalError } from "../utils/errors";
import { ok, created } from "../utils/respond";
import { userToDto } from "../dto/user";
import { AuthFlowError, isValidOtpFormat } from "../utils/otp";
import {
  requestPasswordReset,
  resetPassword as performPasswordReset,
  verifyResetOtp as verifyOtpService,
} from "../services/passwordResetService";
import {
  isEmailVerificationRequired,
  issueVerificationOtpForUser,
  resendVerificationOtp as resendVerificationOtpService,
  verifyEmailOtp,
} from "../services/emailVerificationService";
import { authenticateWithGoogle } from "../services/googleAuthService";

// ── Input validation helpers ──────────────────────────────────────────────────
// Guard against FE sending non-string types (numbers, null, undefined) or
// pre-trimmed strings with whitespace. Without these, .toLowerCase() /
// bcrypt.compare() throw TypeError → 500 INTERNAL_ERROR instead of a
// proper 400.
const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 100;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const PASSWORD_REQUIREMENT_MSG =
  `Mật khẩu phải từ ${PASSWORD_MIN_LENGTH} đến ${PASSWORD_MAX_LENGTH} ký tự, không chứa khoảng trắng và gồm chữ hoa, chữ thường, số, ký tự đặc biệt (VD: Aa@12345)`;

function asPlainObject(body: unknown): Record<string, unknown> | null {
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

function handleAuthServiceError(res: Response, err: unknown, ctx: string): void {
  if (err instanceof AuthFlowError) {
    sendError(res, err.code, err.message, err.status, err.details);
    return;
  }
  handleInternalError(res, err, ctx);
}

async function ensureInitialCart(userId: unknown): Promise<void> {
  try {
    await Cart.updateOne(
      { userId },
      { $setOnInsert: { userId, items: [] } },
      { upsert: true }
    );
  } catch (cartErr) {
    console.warn("[auth] Warning: Không thể tạo cart ban đầu cho user (sẽ được tạo tự động khi truy cập /api/cart):", cartErr);
  }
}

function buildAuthPayload(user: IUser) {
  const token = signToken({
    id: user._id.toString(),
    email: user.email,
    roles: user.roles,
  });
  return {
    token,
    user: userToDto(user),
  };
}

function asTrimmedString(v: unknown, maxLen = 254): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (trimmed.length === 0 || trimmed.length > maxLen) return null;
  return trimmed;
}

export function validateName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const normalized = v.trim().replace(/\s+/g, " ");
  if (normalized.length < NAME_MIN_LENGTH || normalized.length > NAME_MAX_LENGTH) {
    return null;
  }
  // Chặn control chars & HTML tag; bắt buộc có ít nhất 1 chữ cái.
  if (/[\r\n\t<>]/.test(normalized)) return null;
  if (!/\p{L}/u.test(normalized)) return null;
  return normalized;
}

export function validateEmail(v: unknown): string | null {
  const s = asTrimmedString(v);
  if (!s) return null;
  if (/[\r\n\t\s]/.test(s)) return null;
  const atIdx = s.indexOf("@");
  if (atIdx <= 0 || atIdx !== s.lastIndexOf("@")) return null;

  const local = s.slice(0, atIdx);
  const domain = s.slice(atIdx + 1);
  if (local.length > 64 || domain.length > 253) return null;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return null;
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return null;

  const labels = domain.split(".");
  if (labels.length < 2) return null;
  for (const label of labels) {
    if (!/^[A-Za-z0-9-]+$/.test(label)) return null;
    if (label.startsWith("-") || label.endsWith("-")) return null;
  }
  const tld = labels[labels.length - 1];
  if (!/^[A-Za-z]{2,}$/.test(tld)) return null;

  return s.toLowerCase();
}

/**
 * Kiểm tra độ mạnh mật khẩu (mẫu chuẩn: Aa@12345):
 *   - 8..128 ký tự, không chứa khoảng trắng
 *   - Có ít nhất: 1 chữ hoa (A-Z), 1 chữ thường (a-z), 1 chữ số (0-9), 1 ký tự đặc biệt
 */
export function validatePassword(v: unknown): string | null {
  if (typeof v !== "string") return null;
  if (v.length < PASSWORD_MIN_LENGTH || v.length > PASSWORD_MAX_LENGTH) return null;
  if (/\s/.test(v)) return null;
  if (!/[A-Z]/.test(v)) return null;
  if (!/[a-z]/.test(v)) return null;
  if (!/\d/.test(v)) return null;
  if (!/[^A-Za-z0-9\s]/.test(v)) return null;
  return v;
}

/** Parse `req.body` as a plain object and validate its `email` field, sending standardized errors on failure. */
function parseBodyWithEmail(
  req: Request,
  res: Response,
  missingBodyMsg: string,
  missingEmailMsg = "Vui lòng nhập email"
): { body: Record<string, unknown>; email: string } | null {
  const body = asPlainObject(req.body);
  if (!body) {
    sendError(res, ErrorCode.MISSING_FIELD, missingBodyMsg);
    return null;
  }

  const emailRaw = asTrimmedString(body.email);
  if (!emailRaw) {
    sendError(res, ErrorCode.MISSING_FIELD, missingEmailMsg);
    return null;
  }

  const email = validateEmail(emailRaw);
  if (!email) {
    sendError(res, ErrorCode.INVALID_INPUT, "Email không hợp lệ");
    return null;
  }

  return { body, email };
}

/** Shared parser for `{ email, otp }` verification requests (`verifyEmail` & `verifyResetOtp`). */
function parseEmailAndOtpRequest(
  req: Request,
  res: Response,
  otpErrorCode: typeof ErrorCode.VERIFY_OTP_INVALID | typeof ErrorCode.RESET_OTP_INVALID
): { email: string; otp: string } | null {
  const body = asPlainObject(req.body);
  if (!body) {
    sendError(res, ErrorCode.MISSING_FIELD, "Vui lòng nhập email và mã OTP");
    return null;
  }

  const emailRaw = asTrimmedString(body.email);
  const otpRaw = asTrimmedString(body.otp, 16);
  if (!emailRaw || !otpRaw) {
    sendError(res, ErrorCode.MISSING_FIELD, "Vui lòng nhập email và mã OTP");
    return null;
  }

  const email = validateEmail(emailRaw);
  if (!email) {
    sendError(res, ErrorCode.INVALID_INPUT, "Email không hợp lệ");
    return null;
  }

  if (!isValidOtpFormat(otpRaw)) {
    sendError(res, otpErrorCode, "Mã OTP phải gồm 6 chữ số");
    return null;
  }

  return { email, otp: otpRaw };
}

async function finishImmediateSignup(res: Response, user: IUser): Promise<void> {
  await ensureInitialCart(user._id);
  created(res, {
    requiresEmailVerification: false,
    ...buildAuthPayload(user),
  });
}

// ── POST /api/auth/register ───────────────────────────────────────────────────
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = asPlainObject(req.body);
    if (!body) {
      sendError(res, ErrorCode.MISSING_FIELD, "Vui lòng điền đầy đủ thông tin");
      return;
    }

    const rawName = asTrimmedString(body.name, NAME_MAX_LENGTH);
    if (!rawName) {
      sendError(res, ErrorCode.MISSING_FIELD, "Vui lòng nhập họ tên");
      return;
    }
    const cleanName = validateName(body.name);
    if (!cleanName) {
      sendError(
        res,
        ErrorCode.INVALID_INPUT,
        `Họ tên phải từ ${NAME_MIN_LENGTH} đến ${NAME_MAX_LENGTH} ký tự và chứa chữ cái hợp lệ`
      );
      return;
    }

    const rawEmail = asTrimmedString(body.email);
    if (!rawEmail) {
      sendError(res, ErrorCode.MISSING_FIELD, "Vui lòng nhập email");
      return;
    }
    const email = validateEmail(rawEmail);
    if (!email) {
      sendError(res, ErrorCode.INVALID_INPUT, "Email không hợp lệ");
      return;
    }

    if (typeof body.password !== "string" || body.password.trim().length === 0) {
      sendError(
        res,
        body.password === "" || body.password === undefined || body.password === null
          ? ErrorCode.MISSING_FIELD
          : ErrorCode.INVALID_INPUT,
        "Vui lòng nhập mật khẩu"
      );
      return;
    }
    const password = validatePassword(body.password);
    if (!password) {
      sendError(res, ErrorCode.INVALID_INPUT, PASSWORD_REQUIREMENT_MSG);
      return;
    }

    const existing = await User.findOne({ email });
    if (existing && existing.emailVerified !== false) {
      sendError(res, ErrorCode.EMAIL_ALREADY_USED, "Email đã được sử dụng");
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const requireVerify = isEmailVerificationRequired();

    // Nếu tài khoản từng đăng ký nhưng chưa xác thực email: cho phép đăng ký lại
    // với thông tin mới nhất và gửi OTP xác thực (vẫn áp dụng cooldown 60s).
    if (existing && existing.emailVerified === false) {
      existing.name = cleanName;
      existing.passwordHash = passwordHash;
      if (!requireVerify) {
        existing.emailVerified = true;
        existing.emailVerifiedAt = new Date();
      }
      await existing.save();

      if (!requireVerify) {
        await finishImmediateSignup(res, existing);
        return;
      }

      const { expiresInSeconds } = await issueVerificationOtpForUser(existing);
      ok(res, {
        requiresEmailVerification: true,
        message: "Tài khoản chưa kích hoạt. Mã OTP xác thực mới đã được gửi về email.",
        email: existing.email,
        expiresInSeconds,
        user: userToDto(existing),
      });
      return;
    }

    const user = await User.create({
      name: cleanName,
      email,
      passwordHash,
      roles: ["buyer"],
      authProvider: "local",
      emailVerified: !requireVerify,
      ...(requireVerify ? {} : { emailVerifiedAt: new Date() }),
    });

    if (!requireVerify) {
      await finishImmediateSignup(res, user);
      return;
    }

    try {
      const { expiresInSeconds } = await issueVerificationOtpForUser(user);
      await ensureInitialCart(user._id);
      created(res, {
        requiresEmailVerification: true,
        message: "Đăng ký thành công. Vui lòng nhập mã OTP 6 số đã gửi về email để kích hoạt tài khoản.",
        email: user.email,
        expiresInSeconds,
        user: userToDto(user),
      });
    } catch (verifyErr) {
      // Tránh giữ bản ghi user rác khi hệ thống gửi email đang lỗi upstream.
      await User.deleteOne({ _id: user._id }).catch(() => {});
      throw verifyErr;
    }
  } catch (err) {
    handleAuthServiceError(res, err, "[auth] register error");
  }
};

// ── POST /api/auth/verify-email ───────────────────────────────────────────────
export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = parseEmailAndOtpRequest(req, res, ErrorCode.VERIFY_OTP_INVALID);
    if (!parsed) return;

    const user = await verifyEmailOtp(parsed);
    await ensureInitialCart(user._id);
    ok(res, buildAuthPayload(user));
  } catch (err) {
    handleAuthServiceError(res, err, "[auth] verifyEmail error");
  }
};

// ── POST /api/auth/resend-verification-otp ────────────────────────────────────
export const resendVerificationOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = parseBodyWithEmail(req, res, "Vui lòng nhập email");
    if (!parsed) return;

    const result = await resendVerificationOtpService(parsed.email);
    ok(res, result);
  } catch (err) {
    handleAuthServiceError(res, err, "[auth] resendVerificationOtp error");
  }
};

// ── POST /api/auth/google ─────────────────────────────────────────────────────
export const googleAuth = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = asPlainObject(req.body);
    if (!body) {
      sendError(res, ErrorCode.MISSING_FIELD, "Thiếu Google idToken");
      return;
    }

    const rawToken = body.idToken ?? body.credential;
    const idToken = asTrimmedString(rawToken, 8192);
    if (!idToken) {
      sendError(res, ErrorCode.MISSING_FIELD, "Thiếu Google idToken");
      return;
    }

    const { user, isNewUser } = await authenticateWithGoogle(idToken);
    const payload = { ...buildAuthPayload(user), isNewUser };
    if (isNewUser) {
      created(res, payload);
      return;
    }
    ok(res, payload);
  } catch (err) {
    handleAuthServiceError(res, err, "[auth] googleAuth error");
  }
};

// ── POST /api/auth/login ──────────────────────────────────────────────────────
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    // Guard against req.body being null/non-object (e.g. "null" JSON literal).
    const body = asPlainObject(req.body);
    if (!body) {
      sendError(res, ErrorCode.MISSING_FIELD, "Vui lòng nhập email và mật khẩu");
      return;
    }
    // Note: for login we DON'T enforce password min-length — that would let
    // attackers distinguish "wrong creds" from "invalid format" and break
    // a uniform INVALID_CREDENTIALS response. Just guard against TypeError.
    const email = validateEmail(body.email);
    const passwordRaw = body.password;
    const password = typeof passwordRaw === "string" && passwordRaw.length > 0
      ? passwordRaw
      : null;

    if (!email || !password) {
      sendError(res, ErrorCode.MISSING_FIELD, "Vui lòng nhập email và mật khẩu");
      return;
    }

    const user = await User.findOne({ email });
    if (!user) {
      // Uniform message: don't reveal whether email exists.
      sendError(res, ErrorCode.INVALID_CREDENTIALS, "Email hoặc mật khẩu không đúng");
      return;
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      sendError(res, ErrorCode.INVALID_CREDENTIALS, "Email hoặc mật khẩu không đúng");
      return;
    }

    if (user.accountStatus === "suspended") {
      sendError(res, ErrorCode.FORBIDDEN, "Tài khoản của bạn đã bị khóa");
      return;
    }

    if (user.emailVerified === false) {
      sendError(
        res,
        ErrorCode.EMAIL_NOT_VERIFIED,
        "Email chưa được xác thực. Vui lòng nhập mã OTP hoặc yêu cầu gửi lại mã xác thực."
      );
      return;
    }

    ok(res, buildAuthPayload(user));
  } catch (err) {
    handleInternalError(res, err, "[auth] login error");
  }
};

// ── PUT /api/auth/me/avatar ──────────────────────────────────────────────────
export const updateAvatar = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { avatarUrl } = req.body as { avatarUrl?: string };

    if (!avatarUrl || typeof avatarUrl !== "string") {
      sendError(res, ErrorCode.INVALID_INPUT, "Thiếu avatarUrl hoặc không hợp lệ");
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      sendError(res, ErrorCode.ACCOUNT_NOT_FOUND, "Không tìm thấy người dùng");
      return;
    }

    user.avatarUrl = avatarUrl;
    await user.save();

    ok(res, { user: userToDto(user) });
  } catch (err) {
    handleInternalError(res, err, "[auth] updateAvatar error");
  }
};

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
export const getMe = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const user = await User.findById(userId).select("-passwordHash");
    if (!user) {
      sendError(res, ErrorCode.USER_NOT_FOUND, "Không tìm thấy người dùng", 404);
      return;
    }

    ok(res, { user: userToDto(user) });
  } catch (err) {
    handleInternalError(res, err, "[auth] getMe error");
  }
};

// ── PATCH /api/auth/me ────────────────────────────────────────────────────────
export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { name, phone, avatarUrl } = req.body as {
      name?: string;
      phone?: string;
      avatarUrl?: string;
    };

    const user = await User.findById(userId);
    if (!user) {
      sendError(res, ErrorCode.USER_NOT_FOUND, "Không tìm thấy người dùng", 404);
      return;
    }

    if (name !== undefined) {
      const cleanName = validateName(name);
      if (!cleanName) {
        sendError(
          res,
          ErrorCode.INVALID_INPUT,
          `Họ tên phải từ ${NAME_MIN_LENGTH} đến ${NAME_MAX_LENGTH} ký tự và chứa chữ cái hợp lệ`
        );
        return;
      }
      user.name = cleanName;
    }

    if (phone !== undefined) {
      user.phone = typeof phone === "string" ? phone.trim() : "";
    }

    if (avatarUrl !== undefined) {
      user.avatarUrl = typeof avatarUrl === "string" ? avatarUrl.trim() : "";
    }

    await user.save();

    ok(res, { user: userToDto(user) });
  } catch (err) {
    handleInternalError(res, err, "[auth] updateProfile error");
  }
};

// ── POST /api/auth/forgot-password ────────────────────────────────────────────
export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = parseBodyWithEmail(req, res, "Vui lòng nhập email");
    if (!parsed) return;

    const result = await requestPasswordReset(parsed.email);
    ok(res, result);
  } catch (err) {
    handleAuthServiceError(res, err, "[auth] forgotPassword error");
  }
};

// ── POST /api/auth/verify-reset-otp ───────────────────────────────────────────
export const verifyResetOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = parseEmailAndOtpRequest(req, res, ErrorCode.RESET_OTP_INVALID);
    if (!parsed) return;

    const result = await verifyOtpService(parsed);
    ok(res, result);
  } catch (err) {
    handleAuthServiceError(res, err, "[auth] verifyResetOtp error");
  }
};

// ── POST /api/auth/reset-password ─────────────────────────────────────────────
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = parseBodyWithEmail(req, res, "Vui lòng điền đầy đủ thông tin");
    if (!parsed) return;
    const { body, email } = parsed;

    const otpRaw = body.otp !== undefined ? asTrimmedString(body.otp, 16) : null;
    const resetTokenRaw =
      body.resetToken !== undefined ? asTrimmedString(body.resetToken, 256) : null;

    if (!otpRaw && !resetTokenRaw) {
      sendError(res, ErrorCode.MISSING_FIELD, "Vui lòng nhập mã OTP hoặc resetToken");
      return;
    }

    if (otpRaw && !isValidOtpFormat(otpRaw)) {
      sendError(res, ErrorCode.RESET_OTP_INVALID, "Mã OTP phải gồm 6 chữ số");
      return;
    }

    const newPasswordRaw = body.newPassword !== undefined ? body.newPassword : body.password;
    if (typeof newPasswordRaw !== "string" || newPasswordRaw.trim().length === 0) {
      sendError(res, ErrorCode.MISSING_FIELD, "Vui lòng nhập mật khẩu mới");
      return;
    }

    const newPassword = validatePassword(newPasswordRaw);
    if (!newPassword) {
      sendError(res, ErrorCode.INVALID_INPUT, PASSWORD_REQUIREMENT_MSG);
      return;
    }

    const result = await performPasswordReset({
      email,
      otp: otpRaw ?? undefined,
      resetToken: resetTokenRaw ?? undefined,
      newPassword,
    });
    ok(res, result);
  } catch (err) {
    handleAuthServiceError(res, err, "[auth] resetPassword error");
  }
};