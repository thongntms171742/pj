import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User";
import { Cart } from "../models/Cart";
import { CartItem } from "../models/CartItem";
import { Product } from "../models/Product";
import { signToken } from "../middleware/auth";

// ── POST /api/auth/register ───────────────────────────────────────────────────
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ error: "Vui lòng điền đầy đủ thông tin" });
      return;
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      res.status(409).json({ error: "Email đã được sử dụng" });
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
        name: user.name,
        email: user.email,
        roles: user.roles,
        sellerStatus: user.sellerStatus,
      },
    });
  } catch (err) {
    console.error("[auth] register error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── POST /api/auth/login ──────────────────────────────────────────────────────
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Vui lòng nhập email và mật khẩu" });
      return;
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      res.status(401).json({ error: "Email hoặc mật khẩu không đúng" });
      return;
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      res.status(401).json({ error: "Email hoặc mật khẩu không đúng" });
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
        name: user.name,
        email: user.email,
        roles: user.roles,
        sellerStatus: user.sellerStatus,
      },
    });
  } catch (err) {
    console.error("[auth] login error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── POST /api/auth/cart/merge ─────────────────────────────────────────────────
// Merges guest cart items (by productId) into the authenticated user's cart.
export const mergeCart = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { items } = req.body as { items?: { productId: string; quantity: number }[] };

    if (!items || !Array.isArray(items)) {
      res.status(400).json({ error: "items array is required" });
      return;
    }

    // Ensure user has a cart
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = await Cart.create({ userId });
    }

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) continue;

      await CartItem.findOneAndUpdate(
        { cartId: cart._id, productId: product._id },
        {
          $inc: { quantity: item.quantity },
          $setOnInsert: {
            priceSnapshot: product.price,
            checked: false,
          },
        },
        { upsert: true, new: true }
      );
    }

    // Return full cart
    const allItems = await CartItem.find({ cartId: cart._id }).populate({
      path: "productId",
      populate: { path: "sellerId", select: "sellerProfile name email" },
    });

    // Map sellerId to flat API shape for frontend adapter
    const mapped = allItems.map((ci) => mapCartItem(ci));

    res.json({ items: mapped });
  } catch (err) {
    console.error("[auth] mergeCart error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

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

// ── POST /api/auth/seller/apply ───────────────────────────────────────────────
export const applySeller = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { shopName, phone, address, description } = req.body;
    
    if (!shopName || !phone || !address) {
      res.status(400).json({ error: "Vui lòng điền đủ thông tin (shopName, phone, address)" });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ error: "Không tìm thấy người dùng" });
      return;
    }

    if (user.sellerStatus === "PENDING") {
      res.status(400).json({ error: "Hồ sơ của bạn đang được duyệt" });
      return;
    }

    if (user.sellerStatus === "APPROVED") {
      res.status(400).json({ error: "Bạn đã là người bán" });
      return;
    }

    user.sellerStatus = "PENDING";
    user.sellerProfile = {
      handle: shopName.toLowerCase().replace(/\s+/g, '-'),
      shopName,
      description: description || "",
      coverImages: [],
      rating: 5.0,
      totalTransactions: 0,
      totalRevenue: 0,
      commissionRate: 0.1,
      status: "pending_approval",
    };
    await user.save();

    res.json({ message: "Đã gửi yêu cầu đăng ký người bán", sellerStatus: user.sellerStatus });
  } catch (err) {
    console.error("[auth] applySeller error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};
