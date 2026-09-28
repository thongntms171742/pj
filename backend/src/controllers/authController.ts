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

// ── POST /api/auth/seller/apply ───────────────────────────────────────────────
// Allows a buyer to apply to become a seller.
// - Auto-adds "seller" role to user.roles (so FE can detect "pending application")
// - Sets sellerProfile.status = "pending_approval"
// - Auto-generates handle from email if not provided
// - Idempotent: if user already applied, returns current state
export const applySeller = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { shopName, handle, description, avatarUrl, coverImages } = req.body as {
      shopName?: string;
      handle?: string;
      description?: string;
      avatarUrl?: string;
      coverImages?: string[];
    };

    // ── Validation ──────────────────────────────────────────────────────────────
    if (!shopName || typeof shopName !== "string" || shopName.trim().length < 3 || shopName.trim().length > 100) {
      sendError(res, ErrorCode.INVALID_INPUT, "shopName phải có độ dài từ 3 đến 100 ký tự");
      return;
    }

    const trimmedShopName = shopName.trim();

    if (description != null && (typeof description !== "string" || description.length > 500)) {
      sendError(res, ErrorCode.INVALID_INPUT, "description không được vượt quá 500 ký tự");
      return;
    }

    if (avatarUrl != null && (typeof avatarUrl !== "string" || avatarUrl.length > 2048)) {
      sendError(res, ErrorCode.INVALID_INPUT, "avatarUrl không hợp lệ");
      return;
    }

    if (coverImages != null && (!Array.isArray(coverImages) || coverImages.length > 5)) {
      sendError(res, ErrorCode.INVALID_INPUT, "coverImages tối đa 5 ảnh");
      return;
    }

    // Validate handle format if provided: 3-30 chars, alphanumeric + underscore + dot
    let finalHandle: string;
    if (handle != null) {
      const handleTrim = handle.trim();
      if (!/^[a-zA-Z0-9_.]{3,30}$/.test(handleTrim)) {
        sendError(
          res,
          ErrorCode.INVALID_INPUT,
          "handle chỉ chấp nhận chữ cái, số, dấu _ và . (độ dài 3-30)"
        );
        return;
      }
      finalHandle = handleTrim.toLowerCase();
    } else {
      // Auto-generate from email local part + random suffix to avoid collision
      const user = await User.findById(userId).select("email").lean();
      if (!user) {
        sendError(res, ErrorCode.ACCOUNT_NOT_FOUND, "Không tìm thấy tài khoản");
        return;
      }
      const emailLocal = user.email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "").toLowerCase().slice(0, 20);
      finalHandle = `${emailLocal || "shop"}_${Date.now().toString().slice(-5)}`;
    }

    // ── Check existing application ───────────────────────────────────────────────
    const existingUser = await User.findById(userId);
    if (!existingUser) {
      sendError(res, ErrorCode.ACCOUNT_NOT_FOUND, "Không tìm thấy tài khoản");
      return;
    }

    if (existingUser.sellerProfile?.status === "active") {
      sendError(
        res,
        ErrorCode.SELLER_ALREADY_APPROVED,
        "Bạn đã là người bán được phê duyệt rồi (sellerStatus=active)"
      );
      return;
    }

    // ── Check uniqueness of handle and shopName (against OTHER users) ────────────
    const handleClash = await User.findOne({
      _id: { $ne: userId },
      "sellerProfile.handle": finalHandle,
    }).lean();

    if (handleClash) {
      sendError(res, ErrorCode.SELLER_HANDLE_TAKEN, `Handle "${finalHandle}" đã được sử dụng bởi người bán khác`);
      return;
    }

    const shopNameClash = await User.findOne({
      _id: { $ne: userId },
      "sellerProfile.shopName": { $regex: new RegExp(`^${trimmedShopName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    }).lean();

    if (shopNameClash) {
      sendError(res, ErrorCode.SELLER_SHOP_NAME_TAKEN, `Tên shop "${trimmedShopName}" đã được sử dụng`);
      return;
    }

    // ── Build new sellerProfile ──────────────────────────────────────────────────
    const newSellerProfile = {
      handle: finalHandle,
      shopName: trimmedShopName,
      description: description?.trim() || "",
      avatarUrl: avatarUrl?.trim() || "",
      coverImages: coverImages || [],
      rating: 5.0,
      totalTransactions: 0,
      totalRevenue: 0,
      commissionRate: 0.1,
      status: "pending_approval" as const,
    };

    // ── Persist: add seller role + sellerProfile ─────────────────────────────────
    // Capture whether this is the FIRST application (for status code semantics).
    const isFirstApplication = !existingUser.sellerProfile;

    if (!existingUser.roles.includes("seller")) {
      existingUser.roles.push("seller");
    }
    existingUser.sellerProfile = newSellerProfile;
    await existingUser.save();

    const application = {
      userId: existingUser._id.toString(),
      shopName: trimmedShopName,
      handle: finalHandle,
      status: "pending_approval" as const,
      submittedAt: new Date().toISOString(),
      estimatedReviewDays: 3,
    };

    res.status(isFirstApplication ? 201 : 200).json({
      application,
      user: {
        _id: existingUser._id.toString(),
        name: existingUser.name,
        email: existingUser.email,
        roles: existingUser.roles,
        sellerStatus: existingUser.sellerProfile?.status ?? null,
      },
    });
  } catch (err) {
    handleInternalError(res, err, "[auth] applySeller error");
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