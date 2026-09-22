import { Request, Response } from "express";
import { User } from "../models/User";

function mapSeller(u: any) {
  const sp = u.sellerProfile || {};
  return {
    _id: u._id.toString(),
    shopName: sp.shopName || u.name,
    handle: sp.handle || u.email?.split("@")[0] || "",
    description: sp.description || "",
    avatarUrl: sp.avatarUrl || "",
    coverImages: sp.coverImages || [],
    rating: sp.rating ?? 5.0,
    totalTransactions: sp.totalTransactions ?? 0,
    totalRevenue: sp.totalRevenue ?? 0,
    commissionRate: sp.commissionRate ?? 0.1,
    status: sp.status || "active",
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
      .select("name email sellerProfile")
      .lean();

    const mapped = sellers.map(mapSeller);
    res.json({ sellers: mapped });
  } catch (err) {
    console.error("[sellers] getSellers error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── GET /api/sellers/:idOrHandle ─────────────────────────────────────────────
// Get seller by ObjectId or handle
export const getSellerById = async (req: Request, res: Response): Promise<void> => {
  try {
    const param = req.params.idOrHandle as string;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(param);

    const query = isObjectId
      ? { _id: param, roles: "seller" }
      : { "sellerProfile.handle": param, roles: "seller" };

    const seller = await User.findOne(query)
      .select("name email sellerProfile")
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
