import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User";
import { Cart } from "../models/Cart";
import { signToken } from "../middleware/auth";
import { sendError, ErrorCode, handleInternalError } from "../utils/errors";

// ── POST /api/auth/register ───────────────────────────────────────────────────
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      sendError(res, ErrorCode.MISSING_FIELD, "Vui lòng điền đầy đủ thông tin");
      return;
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      sendError(res, ErrorCode.EMAIL_ALREADY_USED, "Email đã được sử dụng");
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email: email.toLowerCase(),
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
    const { email, password } = req.body;

    if (!email || !password) {
      sendError(res, ErrorCode.MISSING_FIELD, "Vui lòng nhập email và mật khẩu");
      return;
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
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