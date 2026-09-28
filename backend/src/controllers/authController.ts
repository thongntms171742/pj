import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User";
import { Cart } from "../models/Cart";
import { CartItem } from "../models/CartItem";
import { Product } from "../models/Product";
import { signToken } from "../middleware/auth";
import { sendError, ErrorCode, handleInternalError } from "../utils/errors";
import { mergeCart as cartMergeCart } from "./cartController";

// ── POST /api/auth/cart/merge ─────────────────────────────────────────────────
// DEPRECATED: Use POST /api/cart/merge instead.
// Kept for backward compatibility with older FE clients.
// Will be removed in a future release — see docs/API_CHANGELOG.md.

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

    // Create an empty cart for the new user
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
        sellerStatus: user.sellerProfile?.status ?? null,
      },
    });
  } catch (err) {
    handleInternalError(res, err, "[auth] login error");
  }
};

// ── POST /api/auth/cart/merge (DEPRECATED — use /api/cart/merge) ──────────────
// Thin wrapper that delegates to cartController.mergeCart and logs a deprecation warning.
export const mergeCart = async (req: Request, res: Response): Promise<void> => {
  console.warn(
    "[auth] DEPRECATED: /api/auth/cart/merge was called. " +
    "Clients should migrate to /api/cart/merge."
  );
  return cartMergeCart(req, res);
};

// (Original mergeCart implementation has been moved to controllers/cartController.ts
//  as the single source of truth. /api/auth/cart/merge is kept as a thin wrapper for
//  backward compatibility.)

// ── Helper: map populated CartItem to ApiCartItem shape ────────────────────────
export function mapCartItem(ci: any): any {
  const prod = ci.productId;
  const seller = prod?.sellerId;
  return {
    _id: ci._id.toString(),
    cartId: ci.cartId.toString(),
    productId: {
      _id: prod?._id?.toString() ?? "",
      title: prod?.title ?? "",
      description: prod?.description ?? "",
      price: prod?.price ?? 0,
      condition: prod?.condition ?? 0,
      size: prod?.size ?? "",
      quantity: prod?.quantity ?? 0,
      status: prod?.status ?? "pending",
      coverImage: prod?.coverImage ?? "",
      views: prod?.views ?? 0,
      likes: prod?.likes ?? 0,
      sellerId: seller
        ? {
            _id: seller._id.toString(),
            handle: seller.sellerProfile?.handle ?? seller.email?.split("@")[0] ?? "",
            shopName: seller.sellerProfile?.shopName ?? seller.name ?? "",
            avatarUrl: seller.sellerProfile?.avatarUrl ?? "",
            rating: seller.sellerProfile?.rating ?? 5,
          }
        : { _id: "", handle: "", shopName: "", avatarUrl: "", rating: 5 },
      categoryId: prod?.categoryId ?? null,
    },
    quantity: ci.quantity,
    priceSnapshot: ci.priceSnapshot,
    checked: ci.checked,
  };
}