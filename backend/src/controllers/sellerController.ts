import { Request, Response } from "express";
import { User } from "../models/User";
import { Product } from "../models/Product";
import { mapProduct } from "./productController";

export function mapSeller(u: any) {
  const sp = u.sellerProfile || {};
  const shopName = sp.shopName || u.name || "";
  const avatarUrl = sp.avatarUrl || "";
  const coverImages = sp.coverImages || [];
  const totalTransactions = sp.totalTransactions ?? 0;
  const handle = sp.handle || u.email?.split("@")[0] || "";

  return {
    _id: u._id.toString(),
    id: u._id.toString(),
    shopName,
    name: shopName, // Frontend expects seller.name
    handle,
    description: sp.description || "",
    avatarUrl,
    avatar: avatarUrl, // Frontend expects seller.avatar
    coverImages,
    thumbs: coverImages, // Frontend expects seller.thumbs
    rating: sp.rating ?? 5.0,
    totalTransactions,
    transactions: totalTransactions, // Frontend expects seller.transactions
    totalRevenue: sp.totalRevenue ?? 0,
    commissionRate: sp.commissionRate ?? 0.1,
    status: sp.status || "active",
    email: u.email || "",
  };
}

// ── GET /api/sellers ─────────────────────────────────────────────────────────
// List all active sellers
export const getSellers = async (_req: Request, res: Response): Promise<void> => {
  try {
    const sellers = await User.find({
      roles: "seller",
      "sellerProfile.status": { $ne: "suspended" },
    })
      .select("name email sellerProfile roles")
      .lean();

    const mapped = sellers.map(mapSeller);
    res.json({ sellers: mapped, total: mapped.length });
  } catch (err) {
    console.error("[sellers] getSellers error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── GET /api/sellers/me ───────────────────────────────────────────────────────
// Get profile of currently logged-in seller
export const getSellerMe = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const user = await User.findById(userId).lean();
    if (!user) {
      res.status(404).json({ error: "Không tìm thấy tài khoản" });
      return;
    }
    res.json({ seller: mapSeller(user) });
  } catch (err) {
    console.error("[sellers] getSellerMe error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── GET /api/sellers/:idOrHandle ─────────────────────────────────────────────
// Get seller by ObjectId, handle (@handle or handle), email, or shopName
export const getSellerById = async (req: Request, res: Response): Promise<void> => {
  try {
    const param = (req.params.idOrHandle as string || "").trim();
    const cleanHandle = param.replace(/^@/, "");
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(cleanHandle);

    let query: any;
    if (isObjectId) {
      query = {
        $or: [
          { _id: cleanHandle },
          { "sellerProfile.handle": cleanHandle },
        ],
      };
    } else {
      query = {
        $or: [
          { "sellerProfile.handle": { $regex: new RegExp(`^${cleanHandle}$`, "i") } },
          { email: cleanHandle.toLowerCase() },
          { name: { $regex: new RegExp(`^${cleanHandle}$`, "i") } },
          { "sellerProfile.shopName": { $regex: new RegExp(`^${cleanHandle}$`, "i") } },
        ],
      };
    }

    const seller = await User.findOne(query)
      .select("name email sellerProfile roles")
      .lean();

    if (!seller) {
      res.status(404).json({ error: "Không tìm thấy người bán" });
      return;
    }

    res.json({ seller: mapSeller(seller) });
  } catch (err) {
    console.error("[sellers] getSellerById error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── GET /api/sellers/:idOrHandle/products ─────────────────────────────────────
// Get all active products for a specific seller
export const getSellerProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const param = (req.params.idOrHandle as string || "").trim();
    const cleanHandle = param.replace(/^@/, "");
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(cleanHandle);

    let sellerUser: any;
    if (isObjectId) {
      sellerUser = await User.findById(cleanHandle).lean();
    }
    if (!sellerUser) {
      sellerUser = await User.findOne({
        $or: [
          { "sellerProfile.handle": { $regex: new RegExp(`^${cleanHandle}$`, "i") } },
          { email: cleanHandle.toLowerCase() },
          { name: { $regex: new RegExp(`^${cleanHandle}$`, "i") } },
          { "sellerProfile.shopName": { $regex: new RegExp(`^${cleanHandle}$`, "i") } },
        ],
      }).lean();
    }

    if (!sellerUser) {
      res.status(404).json({ error: "Không tìm thấy người bán" });
      return;
    }

    const products = await Product.find({
      sellerId: sellerUser._id,
      status: "active",
    })
      .populate({ path: "sellerId", select: "name email sellerProfile" })
      .populate({ path: "categoryId", select: "name slug" })
      .sort({ createdAt: -1 })
      .lean();

    const mapped = products.map((p) => mapProduct(p));
    res.json({ products: mapped, total: mapped.length });
  } catch (err) {
    console.error("[sellers] getSellerProducts error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};
