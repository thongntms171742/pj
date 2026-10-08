import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User";
import { Cart } from "../models/Cart";
import { signToken } from "../middleware/auth";
import { sendError, ErrorCode, handleInternalError } from "../utils/errors";

// ── Input validation helpers ──────────────────────────────────────────────────
// Guard against FE sending non-string types (numbers, null, undefined) or
// pre-trimmed strings with whitespace. Without these, .toLowerCase() /
// bcrypt.compare() throw TypeError → 500 INTERNAL_ERROR instead of a
// proper 400. See docs/API_INTEGRATION_CHECKLIST.md for FE-side rules.
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

function asTrimmedString(v: unknown, maxLen = 254): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (trimmed.length === 0 || trimmed.length > maxLen) return null;
  return trimmed;
}

function validateEmail(v: unknown): string | null {
  const s = asTrimmedString(v);
  if (!s) return null;
  // Lightweight check; full RFC validation is intentionally delegated to FE.
  // BE only catches blatantly broken inputs (no @, no domain dot, control chars).
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null;
  if (/[\r\n\t]/.test(s)) return null;
  return s.toLowerCase();
}

function validatePassword(v: unknown): string | null {
  if (typeof v !== "string") return null;
  // Reject pre-trimmed password that becomes empty after trim (only whitespace)
  if (v.trim().length === 0) return null;
  if (v.length < PASSWORD_MIN_LENGTH || v.length > PASSWORD_MAX_LENGTH) return null;
  return v;
}

// ── POST /api/auth/register ───────────────────────────────────────────────────
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = (req.body && typeof req.body === "object" && !Array.isArray(req.body))
      ? (req.body as { name?: unknown; email?: unknown; password?: unknown })
      : null;
    if (!body) {
      sendError(res, ErrorCode.MISSING_FIELD, "Vui lòng điền đầy đủ thông tin");
      return;
    }
    const email = validateEmail(body.email);
    const password = validatePassword(body.password);
    const cleanName = asTrimmedString(body.name, 100);

    if (!cleanName || !email || !password) {
      // Be specific so FE can highlight the right field.
      if (!cleanName) {
        sendError(res, ErrorCode.MISSING_FIELD, "Vui lòng nhập họ tên");
        return;
      }
      if (!email) {
        sendError(res, ErrorCode.INVALID_INPUT, "Email không hợp lệ");
        return;
      }
      sendError(res, ErrorCode.INVALID_INPUT, `Mật khẩu phải từ ${PASSWORD_MIN_LENGTH} đến ${PASSWORD_MAX_LENGTH} ký tự`);
      return;
    }

    const existing = await User.findOne({ email });
    if (existing) {
      sendError(res, ErrorCode.EMAIL_ALREADY_USED, "Email đã được sử dụng");
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: cleanName,
      email,
      passwordHash,
      roles: ["buyer"],
    });

    await Cart.create({ userId: user._id });

    const token = signToken({
      id: user._id.toString(),
      email: user.email,
      roles: user.roles,
    });

    res.status(201).json({
      token,
      user: {
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        roles: user.roles,
        avatarUrl: user.avatarUrl ?? "",
      },
    });
  } catch (err) {
    handleInternalError(res, err, "[auth] register error");
  }
};

// ── POST /api/auth/login ──────────────────────────────────────────────────────
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    // Guard against req.body being null/non-object (e.g. "null" JSON literal).
    const body = (req.body && typeof req.body === "object" && !Array.isArray(req.body))
      ? (req.body as { email?: unknown; password?: unknown })
      : null;
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

    const token = signToken({
      id: user._id.toString(),
      email: user.email,
      roles: user.roles,
    });

    res.json({
      token,
      user: {
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        roles: user.roles,
        avatarUrl: user.avatarUrl || "",
      },
    });
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

    res.json({ avatarUrl, message: "Cập nhật ảnh đại diện thành công" });
  } catch (err) {
    handleInternalError(res, err, "[auth] updateAvatar error");
  }
};