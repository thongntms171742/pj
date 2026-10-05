import { Request, Response } from "express";
import mongoose from "mongoose";
import "../models";
import { Product } from "../models/Product";
import { User } from "../models/User";
import { Category } from "../models/Category";
import { Order } from "../models/Order";
import { Review } from "../models/Review";
import { sendError, ErrorCode, handleInternalError } from "../utils/errors";

// ── Helpers: per-size stock & price delta normalization ────────────────────────

// Normalize a raw value (potentially coming from JSON body) into a
// Record<string, number>. Returns null when the input is invalid.
function normalizeSizeMap(
  raw: unknown,
  fieldName: string
): Record<string, number> | null {
  if (raw == null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k !== "string" || k.length === 0) return null;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n) || n < 0) return null;
    out[k] = n;
  }
  return out;
}

// Returns true iff the value is a plain object whose values are finite numbers
// (price deltas may be negative).
function isValidPriceDeltaMap(raw: unknown): raw is Record<string, number> {
  if (raw == null) return true;
  if (typeof raw !== "object" || Array.isArray(raw)) return false;
  for (const v of Object.values(raw as Record<string, unknown>)) {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return false;
  }
  return true;
}

// Build the FE-facing `sizeQuantities` view for a product.
//
// - When the DB has an explicit non-empty sizeQuantities map → return it as-is.
// - When the DB only has the legacy single-size+quantity fields → synthesize
//   `{ [p.size]: p.quantity }` so the FE fallback path keeps working but the
//   legacy "all sizes 0 except the single size" behavior is preserved.
//
// We deliberately do NOT zero out other sizes here: that would silently change
// the UX of existing products. Frontend already falls back to "only product.size
// has stock" when sizeQuantities is missing, and existing products keep that
// exact behavior.
function deriveSizeQuantities(p: any): Record<string, number> {
  const stored = p.sizeQuantities;
  if (
    stored &&
    typeof stored === "object" &&
    !Array.isArray(stored) &&
    Object.keys(stored).length > 0
  ) {
    return stored as Record<string, number>;
  }
  const single = String(p.size ?? "").trim();
  const qty = Number(p.quantity ?? 0);
  return single ? { [single]: qty } : {};
}

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
    sizeQuantities: deriveSizeQuantities(p),
    sizePriceDeltas:
      p.sizePriceDeltas && typeof p.sizePriceDeltas === "object" && !Array.isArray(p.sizePriceDeltas)
        ? (p.sizePriceDeltas as Record<string, number>)
        : {},
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

    const { title, name, price, condition, size, quantity, description, coverImage, image, categoryId, sizeQuantities, sizePriceDeltas } = req.body;

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

    // Validate optional per-size stock map. Empty / null is fine and means
    // "derive from single size + quantity". Invalid shapes fail with a
    // dedicated error code so FE can surface a useful message.
    let parsedSizeQuantities: Record<string, number> | undefined;
    if (sizeQuantities != null) {
      const normalized = normalizeSizeMap(sizeQuantities, "sizeQuantities");
      if (normalized === null) {
        sendError(
          res,
          ErrorCode.PRODUCT_SIZE_DATA_INVALID,
          "sizeQuantities không hợp lệ — phải là object {size: stockNumber} với stockNumber >= 0"
        );
        return;
      }
      // Only persist when caller explicitly provided at least one entry.
      if (Object.keys(normalized).length > 0) {
        parsedSizeQuantities = normalized;
      }
    }

    let parsedSizePriceDeltas: Record<string, number> | undefined;
    if (sizePriceDeltas != null) {
      if (!isValidPriceDeltaMap(sizePriceDeltas)) {
        sendError(
          res,
          ErrorCode.PRODUCT_SIZE_DATA_INVALID,
          "sizePriceDeltas không hợp lệ — phải là object {size: number}"
        );
        return;
      }
      if (Object.keys(sizePriceDeltas as Record<string, number>).length > 0) {
        parsedSizePriceDeltas = sizePriceDeltas as Record<string, number>;
      }
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
      sizeQuantities: parsedSizeQuantities,
      sizePriceDeltas: parsedSizePriceDeltas,
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

// ── GET /api/products/:id ───────────────────────────────────────────────────
// Returns a single product detail populated with seller and category info.
export const getProductById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      sendError(res, ErrorCode.PRODUCT_NOT_FOUND, "Sản phẩm không tồn tại");
      return;
    }

    const product = await Product.findById(id)
      .populate({ path: "sellerId", select: "name email sellerProfile" })
      .populate({ path: "categoryId", select: "name slug" })
      .lean();

    if (!product) {
      sendError(res, ErrorCode.PRODUCT_NOT_FOUND, "Sản phẩm không tồn tại");
      return;
    }

    res.json({ product: mapProduct(product) });
  } catch (err) {
    handleInternalError(res, err, "[products] getProductById error");
  }
};

// ── PATCH /api/products/:id/archive ─────────────────────────────────────────
// Archives a product (allowed for product owner or admin).
export const archiveProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      sendError(res, ErrorCode.PRODUCT_NOT_FOUND, "Sản phẩm không tồn tại");
      return;
    }

    const userId = req.user!.id;
    const userRoles = req.user!.roles || [];

    const product = await Product.findById(id);
    if (!product) {
      sendError(res, ErrorCode.PRODUCT_NOT_FOUND, "Sản phẩm không tồn tại");
      return;
    }

    const isOwner = product.sellerId.toString() === userId;
    const isAdmin = userRoles.includes("admin");

    if (!isOwner && !isAdmin) {
      sendError(res, ErrorCode.FORBIDDEN, "Bạn không có quyền lưu trữ sản phẩm này");
      return;
    }

    product.status = "archived";
    await product.save();

    const populated = await Product.findById(product._id)
      .populate({ path: "sellerId", select: "name email sellerProfile" })
      .populate({ path: "categoryId", select: "name slug" })
      .lean();

    res.json({
      message: "Sản phẩm đã được lưu trữ thành công",
      product: mapProduct(populated),
    });
  } catch (err) {
    handleInternalError(res, err, "[products] archiveProduct error");
  }
};

// ── PATCH /api/products/:id ──────────────────────────────────────────────────
// Partial update for a product (owner seller only). Supports updating title,
// description, price, condition, coverImage, location, categoryId, quantity
// and the per-size stock / price delta fields introduced for the size-aware
// product detail UI.
//
// Notes on inventory semantics (intentionally NOT changed):
//   - `quantity` remains the total stock across all sizes. Existing order /
//     cart decrement logic (COD + reservation flows) continues to operate on
//     this aggregate counter, so this endpoint must NOT silently rescale it
//     based on `sizeQuantities`.
//   - If caller sends BOTH `quantity` and `sizeQuantities`, we keep `quantity`
//     as the authoritative aggregate and only persist `sizeQuantities` for
//     display. We do NOT auto-recompute one from the other — that would make
//     the contract surprising. A follow-up migration should derive quantity
//     from sizeQuantities once checkout reduces over a specific size.
//
// Allowed body fields:
//   { title?, name?, description?, price?, condition?, size?, quantity?,
//     coverImage?, image?, location?, categoryId?, category?,
//     sizeQuantities?, sizePriceDeltas? }
export const updateProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      sendError(res, ErrorCode.PRODUCT_NOT_FOUND, "Sản phẩm không tồn tại");
      return;
    }

    const userId = req.user!.id;
    const userRoles = req.user!.roles || [];

    const product = await Product.findById(id);
    if (!product) {
      sendError(res, ErrorCode.PRODUCT_NOT_FOUND, "Sản phẩm không tồn tại");
      return;
    }

    const isOwner = product.sellerId.toString() === userId;
    const isAdmin = userRoles.includes("admin");
    if (!isOwner && !isAdmin) {
      sendError(res, ErrorCode.FORBIDDEN, "Bạn không có quyền chỉnh sửa sản phẩm này");
      return;
    }

    const {
      title,
      name,
      description,
      price,
      condition,
      size,
      quantity,
      coverImage,
      image,
      location,
      categoryId,
      category,
      sizeQuantities,
      sizePriceDeltas,
    } = req.body as Record<string, unknown>;

    if (title !== undefined || name !== undefined) {
      const nextTitle = (title ?? name) as string | undefined;
      if (!nextTitle || !String(nextTitle).trim()) {
        sendError(res, ErrorCode.PRODUCT_TITLE_REQUIRED, "Thiếu tiêu đề sản phẩm (title hoặc name)");
        return;
      }
      product.title = String(nextTitle);
    }
    if (description !== undefined) product.description = String(description ?? "");
    if (price !== undefined) {
      const n = Number(price);
      if (!Number.isFinite(n) || n < 0) {
        sendError(res, ErrorCode.PRODUCT_PRICE_REQUIRED, "Giá sản phẩm không hợp lệ");
        return;
      }
      product.price = n;
    }
    if (condition !== undefined) {
      const n = Number(condition);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        sendError(
          res,
          ErrorCode.PRODUCT_CONDITION_REQUIRED,
          "Tình trạng sản phẩm phải nằm trong khoảng 0–100"
        );
        return;
      }
      product.condition = n;
    }
    if (size !== undefined) {
      if (!size || !String(size).trim()) {
        sendError(res, ErrorCode.PRODUCT_SIZE_REQUIRED, "Thiếu kích thước sản phẩm (size)");
        return;
      }
      product.size = String(size);
    }
    if (quantity !== undefined) {
      const n = Number(quantity);
      if (!Number.isFinite(n) || n < 0) {
        sendError(
          res,
          ErrorCode.PRODUCT_QUANTITY_INVALID,
          "Số lượng sản phẩm phải >= 0"
        );
        return;
      }
      product.quantity = n;
    }
    if (coverImage !== undefined || image !== undefined) {
      product.coverImage = String((coverImage ?? image) ?? "");
    }
    if (location !== undefined) product.location = String(location ?? "");

    if (categoryId !== undefined || category !== undefined) {
      if (categoryId) {
        product.categoryId = new mongoose.Types.ObjectId(String(categoryId));
      } else if (category) {
        const catDoc = await Category.findOne({ name: String(category) });
        if (catDoc) product.categoryId = catDoc._id;
      }
    }

    if (sizeQuantities !== undefined) {
      const normalized = normalizeSizeMap(sizeQuantities, "sizeQuantities");
      if (normalized === null) {
        sendError(
          res,
          ErrorCode.PRODUCT_SIZE_DATA_INVALID,
          "sizeQuantities không hợp lệ — phải là object {size: stockNumber} với stockNumber >= 0"
        );
        return;
      }
      // Persist only when caller provided at least one entry; an empty object
      // means "fall back to derived view on read".
      product.sizeQuantities =
        Object.keys(normalized).length > 0 ? normalized : undefined;
    }
    if (sizePriceDeltas !== undefined) {
      if (!isValidPriceDeltaMap(sizePriceDeltas)) {
        sendError(
          res,
          ErrorCode.PRODUCT_SIZE_DATA_INVALID,
          "sizePriceDeltas không hợp lệ — phải là object {size: number}"
        );
        return;
      }
      product.sizePriceDeltas =
        sizePriceDeltas && Object.keys(sizePriceDeltas as Record<string, number>).length > 0
          ? (sizePriceDeltas as Record<string, number>)
          : undefined;
    }

    await product.save();

    const populated = await Product.findById(product._id)
      .populate({ path: "sellerId", select: "name email sellerProfile" })
      .populate({ path: "categoryId", select: "name slug" })
      .lean();

    res.json({ product: mapProduct(populated) });
  } catch (err) {
    handleInternalError(res, err, "[products] updateProduct error");
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