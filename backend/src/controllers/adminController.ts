import { Request, Response } from "express";
import { Product } from "../models/Product";
import { User } from "../models/User";
import { Order } from "../models/Order";

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

// ── GET /api/admin/pending-sellers ───────────────────────────────────────────
export const getPendingSellers = async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = await User.find({ "sellerProfile.status": "pending_approval" }).lean();
    
    const mapped = users.map((u: any) => ({
      id: u._id.toString(),
      name: u.name,
      email: u.email,
      shopName: u.sellerProfile?.shopName || u.name,
      description: u.sellerProfile?.description || "",
      status: u.sellerProfile?.status,
    }));

    res.json({ users: mapped });
  } catch (err) {
    console.error("[admin] getPendingSellers error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── PATCH /api/admin/sellers/:id/approve ─────────────────────────────────────
export const approveSeller = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) {
      res.status(404).json({ error: "Người dùng không tồn tại" });
      return;
    }

    if (!user.roles.includes("seller")) {
      user.roles.push("seller");
    }
    
    if (user.sellerProfile) {
      user.sellerProfile.status = "active";
    }

    await user.save();
    res.json({ success: true, message: "Đã duyệt người bán" });
  } catch (err) {
    console.error("[admin] approveSeller error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── PATCH /api/admin/sellers/:id/reject ──────────────────────────────────────
export const rejectSeller = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) {
      res.status(404).json({ error: "Người dùng không tồn tại" });
      return;
    }

    if (user.sellerProfile) {
      user.sellerProfile.status = "suspended";
    }

    await user.save();
    res.json({ success: true, message: "Đã từ chối người bán" });
  } catch (err) {
    console.error("[admin] rejectSeller error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── GET /api/admin/stats ─────────────────────────────────────────────────────
export const getStats = async (_req: Request, res: Response): Promise<void> => {
  try {
    const pendingListings = await Product.countDocuments({ status: "pending" });
    const pendingSellers = await User.countDocuments({ "sellerProfile.status": "pending_approval" });
    const orders = await Order.find({ status: { $in: ["CONFIRMED", "SHIPPING", "DELIVERING", "DELIVERED", "COMPLETED"] } }).lean();
    
    let totalC2CRevenue = 0;
    for (const order of orders) {
      totalC2CRevenue += order.totalAmount;
    }
    
    // Estimate 10% commission
    const platformProfit = Math.round(totalC2CRevenue * 0.1);

    res.json({
      stats: {
        pendingListings,
        pendingSellers,
        platformProfit,
      }
    });
  } catch (err) {
    console.error("[admin] getStats error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};
