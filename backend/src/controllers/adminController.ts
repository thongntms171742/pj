import { Request, Response } from "express";
import { Product } from "../models/Product";
import { PlatformFeeConfig } from "../models/PlatformFeeConfig";

// ── GET /api/admin/pending-listings ───────────────────────────────────────────
export const getPendingListings = async (_req: Request, res: Response): Promise<void> => {
  try {
    const products = await Product.find({ status: "pending" })
      .populate({ path: "sellerId", select: "name email sellerProfile" })
      .populate({ path: "categoryId", select: "name slug" })
      .sort({ createdAt: -1 })
      .lean();

    const mapped = products.map((p: any) => {
      const seller = p.sellerId;
      return {
        _id: p._id.toString(),
        title: p.title,
        description: p.description,
        price: p.price,
        condition: p.condition,
        size: p.size,
        quantity: p.quantity,
        status: p.status,
        coverImage: p.coverImage,
        views: p.views,
        likes: p.likes,
        location: p.location,
        sellerId: seller
          ? {
              _id: seller._id.toString(),
              handle: seller.sellerProfile?.handle ?? seller.email?.split("@")[0] ?? "",
              shopName: seller.sellerProfile?.shopName ?? seller.name ?? "",
              avatarUrl: seller.sellerProfile?.avatarUrl ?? "",
              rating: seller.sellerProfile?.rating ?? 5,
            }
          : { _id: "", handle: "", shopName: "", avatarUrl: "", rating: 5 },
        categoryId: p.categoryId
          ? { _id: p.categoryId._id.toString(), name: p.categoryId.name, slug: p.categoryId.slug }
          : null,
      };
    });

    res.json({ products: mapped });
  } catch (err) {
    console.error("[admin] getPendingListings error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── PATCH /api/admin/listings/:id/approve ─────────────────────────────────────
export const approveListing = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const product = await Product.findByIdAndUpdate(id, { status: "active" }, { new: true });

    if (!product) {
      res.status(404).json({ error: "Sản phẩm không tồn tại" });
      return;
    }

    res.json({ product });
  } catch (err) {
    console.error("[admin] approveListing error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── PATCH /api/admin/listings/:id/reject ──────────────────────────────────────
export const rejectListing = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const product = await Product.findByIdAndUpdate(id, { status: "archived" }, { new: true });

    if (!product) {
      res.status(404).json({ error: "Sản phẩm không tồn tại" });
      return;
    }

    res.json({ product });
  } catch (err) {
    console.error("[admin] rejectListing error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── GET /api/admin/platform-fee ──────────────────────────────────────────────
export const getPlatformFee = async (_req: Request, res: Response): Promise<void> => {
  try {
    const configs = await PlatformFeeConfig.find().sort({ effectiveFrom: -1 }).lean();
    res.json({ configs });
  } catch (err) {
    console.error("[admin] getPlatformFee error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── GET /api/admin/pending-sellers ───────────────────────────────────────────
export const getPendingSellers = async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = await import("../models/User").then(m => m.User).then(User => User.find({ sellerStatus: "PENDING" }).lean());
    res.json({ users: users.map(u => ({
      id: u._id.toString(),
      name: u.name,
      email: u.email,
      shopName: u.sellerProfile?.shopName || "",
      description: u.sellerProfile?.description || "",
      createdAt: u.createdAt,
      status: u.sellerStatus,
    }))});
  } catch (err) {
    console.error("[admin] getPendingSellers error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── POST /api/admin/platform-fee ─────────────────────────────────────────────
export const setPlatformFee = async (req: Request, res: Response): Promise<void> => {
  try {
    const { rate, effectiveFrom } = req.body;
    
    // Deactivate current active config
    await PlatformFeeConfig.updateMany({ active: true }, { active: false });
    
    // Create new config
    const newConfig = await PlatformFeeConfig.create({
      rate,
      effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
      active: true,
      createdBy: req.user?.id,
    });
    
    res.json({ config: newConfig });
  } catch (err) {
    console.error("[admin] setPlatformFee error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── PATCH /api/admin/sellers/:id/approve ─────────────────────────────────────
export const approveSeller = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const User = await import("../models/User").then(m => m.User);
    const user = await User.findById(id);
    if (!user) {
      res.status(404).json({ error: "Người dùng không tồn tại" });
      return;
    }
    user.sellerStatus = "APPROVED";
    if (user.sellerProfile) {
      user.sellerProfile.status = "active";
    }
    if (!user.roles.includes("seller")) {
      user.roles.push("seller");
    }
    await user.save();
    res.json({ user });
  } catch (err) {
    console.error("[admin] approveSeller error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── PATCH /api/admin/sellers/:id/reject ──────────────────────────────────────
export const rejectSeller = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const User = await import("../models/User").then(m => m.User);
    const user = await User.findById(id);
    if (!user) {
      res.status(404).json({ error: "Người dùng không tồn tại" });
      return;
    }
    user.sellerStatus = "REJECTED";
    await user.save();
    res.json({ user });
  } catch (err) {
    console.error("[admin] rejectSeller error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};
