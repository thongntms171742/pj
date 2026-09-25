import { Request, Response } from "express";
import { Review } from "../models/Review";
import { Order } from "../models/Order";

// ── POST /api/products/:productId/reviews ─────────────────────────────────────
// Creates a review for a product. Requires:
// 1. Authenticated user is the buyer of the order
// 2. Order status is COMPLETED
// 3. Product exists in the order's items
// 4. User has not already reviewed this product for this order
export const createReview = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { productId } = req.params;
    const { orderId, rating, comment } = req.body;

    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      res.status(400).json({ error: "Rating phải từ 1 đến 5" });
      return;
    }

    if (!orderId) {
      res.status(400).json({ error: "orderId là bắt buộc" });
      return;
    }

    // Find the order
    const order = await Order.findById(orderId);
    if (!order) {
      res.status(404).json({ error: "Không tìm thấy đơn hàng" });
      return;
    }

    // Check: user is the buyer
    if (order.buyerId.toString() !== userId) {
      res.status(403).json({ error: "Bạn không phải người mua của đơn hàng này" });
      return;
    }

    // Check: order is COMPLETED
    if (order.status !== "COMPLETED") {
      res.status(400).json({ error: `Chỉ có thể đánh giá khi đơn hàng đã hoàn tất (hiện tại: ${order.status})` });
      return;
    }

    // Check: product exists in order items
    const orderHasProduct = order.items.some(
      (item) => item.productId.toString() === productId
    );
    if (!orderHasProduct) {
      res.status(400).json({ error: "Sản phẩm này không thuộc đơn hàng" });
      return;
    }

    // Check: duplicate review (unique constraint will also catch this,
    // but we want a friendly error message)
    const existingReview = await Review.findOne({
      userId,
      orderId,
      productId,
    });
    if (existingReview) {
      res.status(409).json({ error: "Bạn đã đánh giá sản phẩm này trong đơn hàng này rồi" });
      return;
    }

    // Create the review
    try {
      const review = await Review.create({
        userId,
        productId,
        orderId,
        rating: Math.round(rating),
        comment: comment || "",
      });

      res.status(201).json({ review });
    } catch (createErr: any) {
      // Race condition: unique index caught a concurrent duplicate insert
      if (createErr.code === 11000) {
        res.status(409).json({ error: "Bạn đã đánh giá sản phẩm này trong đơn hàng này rồi" });
        return;
      }
      throw createErr;
    }
  } catch (err) {
    console.error("[reviews] createReview error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── GET /api/products/:productId/reviews ──────────────────────────────────────
// Public endpoint: returns all reviews for a product with pagination
export const getProductReviews = async (req: Request, res: Response): Promise<void> => {
  try {
    const { productId } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const [reviews, totalRatings] = await Promise.all([
      Review.find({ productId })
        .populate({ path: "userId", select: "name" }) // no email — public endpoint
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Review.countDocuments({ productId }),
    ]);

    const mapped = reviews.map((r: any) => ({
      _id: r._id.toString(),
      userId: r.userId?._id?.toString() || r.userId?.toString() || "",
      userName: r.userId?.name || "Ẩn danh",
      productId: r.productId.toString(),
      orderId: r.orderId.toString(),
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : "",
    }));

    // Calculate average rating across ALL reviews (not just current page)
    const avgResult = await Review.aggregate([
      { $match: { productId: new (require("mongoose").Types.ObjectId)(productId) } },
      { $group: { _id: null, avg: { $avg: "$rating" } } },
    ]);
    const avgRating = avgResult.length > 0 ? Math.round(avgResult[0].avg * 10) / 10 : 0;

    res.json({
      reviews: mapped,
      totalRatings,
      avgRating,
      page,
      totalPages: Math.ceil(totalRatings / limit),
    });
  } catch (err) {
    console.error("[reviews] getProductReviews error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};
