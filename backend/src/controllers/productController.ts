import { Request, Response } from "express";
import "../models";
import { Product } from "../models/Product";
import { User } from "../models/User";
import { Category } from "../models/Category";
import { Order } from "../models/Order";
import { Review } from "../models/Review";
import { sendError, ErrorCode, handleInternalError } from "../utils/errors";

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
    handleInternalError(res, err, "[products] getProducts error");
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
    handleInternalError(res, err, "[products] getMyProducts error");
  }
};

// ── POST /api/products ────────────────────────────────────────────────────────
// Create a new product listing (seller only). Defaults to status = "pending".
export const createProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    // Authorization: Check if user is an approved seller
    const user = await User.findById(userId).lean();
    if (!user || !user.roles.includes("seller") || user.sellerProfile?.status !== "active") {
      sendError(res, ErrorCode.SELLER_NOT_APPROVED, "Tài khoản chưa được phê duyệt làm người bán");
      return;
    }

    const { title, name, price, condition, size, quantity, description, coverImage, image, categoryId } = req.body;

    const productTitle = title || name;
    const productImage = coverImage || image || "";

    if (!productTitle) {
      sendError(res, ErrorCode.PRODUCT_TITLE_REQUIRED, "Thiếu tiêu đề sản phẩm (title hoặc name)");
      return;
    }
    if (price == null) {
      sendError(res, ErrorCode.PRODUCT_PRICE_REQUIRED, "Thiếu giá sản phẩm (price)");
      return;
    }
    if (condition == null) {
      sendError(res, ErrorCode.PRODUCT_CONDITION_REQUIRED, "Thiếu tình trạng sản phẩm (condition, 0-100)");
      return;
    }
    if (!size) {
      sendError(res, ErrorCode.PRODUCT_SIZE_REQUIRED, "Thiếu kích thước sản phẩm (size)");
      return;
    }

    const finalQuantity = quantity != null ? Number(quantity) : 1;
    if (isNaN(finalQuantity) || finalQuantity < 1) {
      sendError(res, ErrorCode.PRODUCT_QUANTITY_INVALID, "Số lượng sản phẩm phải lớn hơn hoặc bằng 1");
      return;
    }

    let finalCategoryId = categoryId;
    if (!finalCategoryId && req.body.category) {
      const catDoc = await Category.findOne({ name: req.body.category });
      if (catDoc) finalCategoryId = catDoc._id;
    }

    const product = await Product.create({
      title: productTitle,
      description: description || "",
      price,
      condition,
      size,
      quantity: finalQuantity,
      status: "pending",
      coverImage: productImage,
      sellerId: userId,
      categoryId: finalCategoryId || null,
    });

    const populated = await Product.findById(product._id)
      .populate({ path: "sellerId", select: "name email sellerProfile" })
      .populate({ path: "categoryId", select: "name slug" })
      .lean();

    res.status(201).json({ product: mapProduct(populated) });
  } catch (err) {
    handleInternalError(res, err, "[products] createProduct error");
  }
};

// ── POST /api/products/:id/reviews ───────────────────────────────────────────
// Buyer submits a review for a product purchased via an order.
// Requirements:
//   - Buyer must be authenticated.
//   - Buyer must own the order referenced by `orderId`.
//   - Order must contain the product and be in DELIVERED (or later) state.
//   - Rating must be integer 1..5.
//   - One review per (orderId, productId, buyerId) tuple — duplicate → 409.
//
// Request body:
//   { rating: number, comment?: string, orderId: string }
//
// Response:
//   { review: { _id, productId, buyerId, orderId, rating, comment, createdAt } }
export const createReview = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: productId } = req.params;
    const buyerId = req.user!.id;
    const { rating, comment, orderId } = req.body as {
      rating?: number;
      comment?: string;
      orderId?: string;
    };

    // Validate product exists
    const product = await Product.findById(productId).select("_id").lean();
    if (!product) {
      sendError(res, ErrorCode.PRODUCT_NOT_FOUND, "Sản phẩm không tồn tại");
      return;
    }

    // Validate rating
    if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      sendError(
        res,
        ErrorCode.REVIEW_RATING_INVALID,
        "Đánh giá phải là số nguyên từ 1 đến 5"
      );
      return;
    }

    // Validate orderId
    if (!orderId || typeof orderId !== "string") {
      sendError(
        res,
        ErrorCode.ORDER_ID_REQUIRED,
        "Thiếu orderId của đơn hàng đã mua sản phẩm này"
      );
      return;
    }

    // Fetch order, check ownership + state + product inclusion
    const order = await Order.findById(orderId).lean();
    if (!order) {
      sendError(res, ErrorCode.ORDER_NOT_FOUND, "Đơn hàng không tồn tại");
      return;
    }
    if (order.buyerId.toString() !== buyerId) {
      sendError(
        res,
        ErrorCode.REVIEW_NOT_ALLOWED,
        "Bạn chỉ có thể đánh giá sản phẩm trong đơn hàng của chính mình"
      );
      return;
    }
    // Allow review only after delivery
    const REVIEWABLE_STATUSES: ReadonlyArray<string> = [
      "DELIVERED",
      "COMPLETED",
    ];
    if (!REVIEWABLE_STATUSES.includes(order.status)) {
      sendError(
        res,
        ErrorCode.REVIEW_NOT_ALLOWED,
        "Chỉ có thể đánh giá sau khi đơn hàng được giao thành công"
      );
      return;
    }
    // Ensure product is part of this order
    const item = order.items.find(
      (it) => it.productId.toString() === productId
    );
    if (!item) {
      sendError(
        res,
        ErrorCode.REVIEW_NOT_ALLOWED,
        "Sản phẩm này không nằm trong đơn hàng được cung cấp"
      );
      return;
    }

    // Create review (unique index will catch duplicates and surface 409)
    try {
      const review = await Review.create({
        productId,
        buyerId,
        orderId,
        rating,
        comment: comment ?? "",
      });

      res.status(201).json({
        review: {
          _id: review._id.toString(),
          productId: review.productId.toString(),
          buyerId: review.buyerId.toString(),
          orderId: review.orderId.toString(),
          rating: review.rating,
          comment: review.comment,
          createdAt: review.createdAt,
        },
      });
      return;
    } catch (err: unknown) {
      // Duplicate key error from unique index
      const e = err as { code?: number };
      if (e?.code === 11000) {
        sendError(
          res,
          ErrorCode.REVIEW_ALREADY_EXISTS,
          "Bạn đã đánh giá sản phẩm này cho đơn hàng này rồi"
        );
        return;
      }
      throw err;
    }
  } catch (err) {
    handleInternalError(res, err, "[products] createReview error");
  }
};