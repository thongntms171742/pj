import { Request, Response } from "express";
import "../models";
import { Product } from "../models/Product";

// ── GET /api/products ─────────────────────────────────────────────────────────
// Returns all active products (with populated seller & category).
export const getProducts = async (_req: Request, res: Response): Promise<void> => {
  try {
    const products = await Product.find({ status: "active" })
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

    // Map to ApiProduct shape expected by the frontend
    const mapped = products.map((p: any) => {
      const seller = p.sellerId;
      const cat = p.categoryId;
      return {
        _id: p._id.toString(),
        title: p.title,
        description: p.description || "",
        price: p.price,
        condition: p.condition,
        size: p.size,
        quantity: p.quantity,
        status: p.status,
        reservedUntil: p.reservedUntil,
        reservedByOrderId: p.reservedByOrderId,
        coverImage: p.coverImage || "",
        views: p.views || 0,
        likes: p.likes || 0,
        location: p.location || "",
        sellerId:
          seller && typeof seller === "object" && seller._id
            ? {
                _id: seller._id.toString(),
                handle: seller.sellerProfile?.handle ?? seller.email?.split("@")[0] ?? "",
                shopName: seller.sellerProfile?.shopName ?? seller.name ?? "",
                avatarUrl: seller.sellerProfile?.avatarUrl ?? "",
                rating: seller.sellerProfile?.rating ?? 5,
              }
            : { _id: "", handle: "", shopName: "", avatarUrl: "", rating: 5 },
        categoryId:
          cat && typeof cat === "object" && cat._id
            ? { _id: cat._id.toString(), name: cat.name || "", slug: cat.slug || "" }
            : null,
      };
    });

    res.json({ products: mapped });
  } catch (err) {
    console.error("[products] getProducts error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── POST /api/products ────────────────────────────────────────────────────────
// Create a new product listing (seller only). Defaults to status = "pending".
export const createProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { title, price, condition, size, quantity, description, coverImage, categoryId } = req.body;

    if (!title || price == null || condition == null || !size) {
      res.status(400).json({ error: "Thiếu thông tin sản phẩm bắt buộc (title, price, condition, size)" });
      return;
    }

    const product = await Product.create({
      title,
      description: description || "",
      price,
      condition,
      size,
      quantity: quantity || 1,
      status: "pending",
      coverImage: coverImage || "",
      sellerId: userId,
      categoryId: categoryId || null,
    });

    // Populate seller for response
    const populated = await Product.findById(product._id)
      .populate({ path: "sellerId", select: "name email sellerProfile" })
      .populate({ path: "categoryId", select: "name slug" })
      .lean();

    const seller = (populated as any)?.sellerId;
    const result = {
      _id: product._id.toString(),
      title: product.title,
      description: product.description,
      price: product.price,
      condition: product.condition,
      size: product.size,
      quantity: product.quantity,
      status: product.status,
      coverImage: product.coverImage,
      views: 0,
      likes: 0,
      location: "",
      sellerId: seller
        ? {
            _id: seller._id.toString(),
            handle: seller.sellerProfile?.handle ?? seller.email?.split("@")[0] ?? "",
            shopName: seller.sellerProfile?.shopName ?? seller.name ?? "",
            avatarUrl: seller.sellerProfile?.avatarUrl ?? "",
            rating: seller.sellerProfile?.rating ?? 5,
          }
        : { _id: userId, handle: "", shopName: "", avatarUrl: "", rating: 5 },
      categoryId: (populated as any)?.categoryId ?? null,
    };

    res.status(201).json({ product: result });
  } catch (err) {
    console.error("[products] createProduct error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};
