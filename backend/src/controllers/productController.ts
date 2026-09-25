import { Request, Response } from "express";
import "../models";
import { Product } from "../models/Product";
import { User } from "../models/User";
import { Category } from "../models/Category";

// ── Helper: Map Product document to frontend-compatible shape ─────────────────
export function mapProduct(p: any) {
  const seller = p.sellerId;
  const cat = p.categoryId;
  const sellerHandle = seller?.sellerProfile?.handle ?? seller?.email?.split("@")[0] ?? "";
  const sellerShopName = seller?.sellerProfile?.shopName ?? seller?.name ?? "";
  const sellerAvatar = seller?.sellerProfile?.avatarUrl ?? "";
  const sellerRating = seller?.sellerProfile?.rating ?? 5.0;

  return {
    _id: p._id.toString(),
    id: p._id.toString(),
    title: p.title,
    name: p.title, // alias for frontend Product.name
    description: p.description || "",
    price: p.price,
    condition: p.condition,
    size: p.size,
    quantity: p.quantity,
    status: p.status,
    reservedUntil: p.reservedUntil,
    reservedByOrderId: p.reservedByOrderId,
    coverImage: p.coverImage || "",
    image: p.coverImage || "", // alias for frontend Product.image
    views: p.views || 0,
    likes: p.likes || 0,
    location: p.location || "",
    seller: sellerHandle, // string handle (e.g. "minhtu.vintage")
    sellerName: sellerShopName, // string shop name
    sellerAvatar: sellerAvatar, // string avatar url
    sellerId:
      seller && typeof seller === "object" && seller._id
        ? {
            _id: seller._id.toString(),
            id: seller._id.toString(),
            handle: sellerHandle,
            shopName: sellerShopName,
            name: sellerShopName,
            avatarUrl: sellerAvatar,
            avatar: sellerAvatar,
            rating: sellerRating,
          }
        : { _id: "", id: "", handle: "", shopName: "", name: "", avatarUrl: "", avatar: "", rating: 5 },
    categoryId:
      cat && typeof cat === "object" && cat._id
        ? { _id: cat._id.toString(), name: cat.name || "", slug: cat.slug || "" }
        : null,
    category: cat?.name || "",
  };
}

// ── GET /api/products ─────────────────────────────────────────────────────────
// Returns products with filtering by seller, sellerId, category, and status.
export const getProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { seller, sellerId, category, status } = req.query;

    const filter: any = {};
    if (status && typeof status === "string") {
      filter.status = status;
    } else {
      filter.status = "active";
    }

    if (sellerId && typeof sellerId === "string") {
      filter.sellerId = sellerId;
    } else if (seller && typeof seller === "string") {
      const cleanHandle = seller.replace(/^@/, "").trim();
      const sellerUser = await User.findOne({
        $or: [
          { "sellerProfile.handle": { $regex: new RegExp(`^${cleanHandle}$`, "i") } },
          { email: cleanHandle.toLowerCase() },
          { name: { $regex: new RegExp(`^${cleanHandle}$`, "i") } },
        ],
      }).lean();

      if (sellerUser) {
        filter.sellerId = sellerUser._id;
      } else {
        res.json({ products: [], total: 0 });
        return;
      }
    }

    if (category && typeof category === "string") {
      const cat = await Category.findOne({
        $or: [{ slug: category }, { name: category }],
      }).lean();
      if (cat) filter.categoryId = cat._id;
    }

    const products = await Product.find(filter)
      .populate({
        path: "sellerId",
        select: "name email sellerProfile",
      })
      .populate({
        path: "categoryId",
        select: "name slug",
      })
      .sort({ createdAt: -1 })
      .lean();

    const mapped = products.map(mapProduct);
    res.json({ products: mapped, total: mapped.length });
  } catch (err) {
    console.error("[products] getProducts error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── GET /api/products/mine (or /api/products/seller) ─────────────────────────
// Returns all listings belonging to currently authenticated seller + dashboard statistics.
export const getMyProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { status } = req.query;

    const filter: any = { sellerId: userId };
    if (status && typeof status === "string" && status !== "all") {
      filter.status = status;
    }

    const products = await Product.find(filter)
      .populate({ path: "sellerId", select: "name email sellerProfile" })
      .populate({ path: "categoryId", select: "name slug" })
      .sort({ createdAt: -1 })
      .lean();

    const mapped = products.map(mapProduct);

    // Compute seller summary stats
    const allMy = await Product.find({ sellerId: userId }).lean();
    const stats = {
      totalProducts: allMy.length,
      activeProducts: allMy.filter((p) => p.status === "active").length,
      pendingProducts: allMy.filter((p) => p.status === "pending").length,
      soldProducts: allMy.filter((p) => p.status === "sold").length,
      totalViews: allMy.reduce((sum, p) => sum + (p.views || 0), 0),
      totalLikes: allMy.reduce((sum, p) => sum + (p.likes || 0), 0),
      estimatedRevenue: allMy
        .filter((p) => p.status === "sold")
        .reduce((sum, p) => sum + (p.price || 0), 0),
    };

    res.json({ products: mapped, stats, total: mapped.length });
  } catch (err) {
    console.error("[products] getMyProducts error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── POST /api/products ────────────────────────────────────────────────────────
// Create a new product listing (seller only). Defaults to status = "pending".
export const createProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { title, name, price, condition, size, quantity, description, coverImage, image, categoryId } = req.body;

    const productTitle = title || name;
    const productImage = coverImage || image || "";

    if (!productTitle || price == null || condition == null || !size) {
      res.status(400).json({ error: "Thiếu thông tin sản phẩm bắt buộc (title/name, price, condition, size)" });
      return;
    }

    const product = await Product.create({
      title: productTitle,
      description: description || "",
      price,
      condition,
      size,
      quantity: quantity || 1,
      status: "pending",
      coverImage: productImage,
      sellerId: userId,
      categoryId: categoryId || null,
    });

    const populated = await Product.findById(product._id)
      .populate({ path: "sellerId", select: "name email sellerProfile" })
      .populate({ path: "categoryId", select: "name slug" })
      .lean();

    res.status(201).json({ product: mapProduct(populated) });
  } catch (err) {
    console.error("[products] createProduct error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── PATCH /api/products/:id ───────────────────────────────────────────────────
// Seller updates their own product. Only editable when status is pending or active.
export const updateProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const product = await Product.findById(id);
    if (!product) {
      res.status(404).json({ error: "Sản phẩm không tồn tại" });
      return;
    }

    if (product.sellerId.toString() !== userId) {
      res.status(403).json({ error: "Bạn không phải chủ sản phẩm này" });
      return;
    }

    if (product.status !== "pending" && product.status !== "active") {
      res.status(400).json({
        error: `Không thể chỉnh sửa sản phẩm đang ở trạng thái "${product.status}"`,
      });
      return;
    }

    // Whitelist editable fields
    const allowedFields = [
      "title", "name", "description", "price", "condition",
      "size", "quantity", "coverImage", "image", "categoryId", "location",
    ] as const;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (field === "name") {
          (product as any).title = req.body[field];
        } else if (field === "image") {
          (product as any).coverImage = req.body[field];
        } else {
          (product as any)[field] = req.body[field];
        }
      }
    }

    await product.save();

    const populated = await Product.findById(product._id)
      .populate({ path: "sellerId", select: "name email sellerProfile" })
      .populate({ path: "categoryId", select: "name slug" })
      .lean();

    res.json({ product: mapProduct(populated) });
  } catch (err) {
    console.error("[products] updateProduct error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── PATCH /api/products/:id/archive ───────────────────────────────────────────
// Seller hides/archives their own product. Only allowed when pending or active.
export const archiveProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const product = await Product.findById(id);
    if (!product) {
      res.status(404).json({ error: "Sản phẩm không tồn tại" });
      return;
    }

    if (product.sellerId.toString() !== userId) {
      res.status(403).json({ error: "Bạn không phải chủ sản phẩm này" });
      return;
    }

    if (product.status === "sold") {
      res.status(400).json({ error: "Không thể ẩn sản phẩm đã bán" });
      return;
    }

    if (product.status === "reserved") {
      res.status(400).json({ error: "Không thể ẩn sản phẩm đang được đặt hàng" });
      return;
    }

    product.status = "archived";
    await product.save();

    res.json({ product: mapProduct(product) });
  } catch (err) {
    console.error("[products] archiveProduct error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};
