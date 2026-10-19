import { Types } from "mongoose";
import { Review, IReview } from "../models/Review";
import { TreeProduct } from "../models/TreeProduct";
import { Order } from "../models/Order";
import { Notification } from "../models/Notification";
import { ErrorCode, ErrorCodeValue } from "../utils/errors";
import { findOrderByIdOrCode } from "../utils/ids";

export interface SubmitReviewInput {
  buyerId: string;
  productId: string;
  orderId: string;
  rating: number;
  comment?: string;
  images?: string[];
  variantId?: string;
}

export interface ReviewServiceResult<T> {
  success: boolean;
  data?: T;
  errorCode?: ErrorCodeValue;
  message?: string;
}

/**
 * Recalculate average rating and total review count for a TreeProduct
 */
export async function updateProductReviewStats(productId: Types.ObjectId | string): Promise<void> {
  const pId = new Types.ObjectId(String(productId));
  const stats = await Review.aggregate([
    { $match: { productId: pId, status: "APPROVED" } },
    {
      $group: {
        _id: "$productId",
        avgRating: { $avg: "$rating" },
        count: { $sum: 1 },
      },
    },
  ]);

  if (stats.length > 0) {
    const avg = Math.round(stats[0].avgRating * 10) / 10;
    const count = stats[0].count;
    await TreeProduct.findByIdAndUpdate(pId, {
      ratingAverage: avg,
      reviewCount: count,
    });
  } else {
    await TreeProduct.findByIdAndUpdate(pId, {
      ratingAverage: 5,
      reviewCount: 0,
    });
  }
}

/**
 * Submit a product review for a delivered/completed order
 */
export async function submitReview(
  input: SubmitReviewInput
): Promise<ReviewServiceResult<IReview>> {
  const { buyerId, productId, orderId, rating, comment, images, variantId } = input;

  // 1. Validate rating
  const parsedRating = Number(rating);
  if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
    return {
      success: false,
      errorCode: ErrorCode.REVIEW_RATING_INVALID,
      message: "Đánh giá sao phải là số nguyên từ 1 đến 5",
    };
  }

  // 2. Validate product exists
  if (!Types.ObjectId.isValid(productId)) {
    return {
      success: false,
      errorCode: ErrorCode.TREE_NOT_FOUND,
      message: "Sản phẩm không hợp lệ",
    };
  }
  const product = await TreeProduct.findById(productId);
  if (!product) {
    return {
      success: false,
      errorCode: ErrorCode.TREE_NOT_FOUND,
      message: "Không tìm thấy sản phẩm",
    };
  }

  // 3. Find order and verify ownership
  const order = await Order.findOne(findOrderByIdOrCode(orderId));
  if (!order) {
    return {
      success: false,
      errorCode: ErrorCode.ORDER_NOT_FOUND,
      message: "Không tìm thấy đơn hàng",
    };
  }

  if (order.buyerId.toString() !== buyerId.toString()) {
    return {
      success: false,
      errorCode: ErrorCode.FORBIDDEN,
      message: "Bạn không có quyền đánh giá đơn hàng này",
    };
  }

  // 4. Order must be DELIVERED or COMPLETED
  if (!["DELIVERED", "COMPLETED"].includes(order.status)) {
    return {
      success: false,
      errorCode: ErrorCode.REVIEW_NOT_ALLOWED,
      message: "Chỉ có thể đánh giá sau khi đơn hàng đã được giao hoặc hoàn thành",
    };
  }

  // 5. Verify the order actually contains this product
  const targetProductIdStr = productId.toString();
  const matchingItem = order.items.find((item) => {
    const itemProductId = item.variant?.productId ? String(item.variant.productId) : null;
    return itemProductId === targetProductIdStr;
  });

  if (!matchingItem) {
    return {
      success: false,
      errorCode: ErrorCode.REVIEW_NOT_ALLOWED,
      message: "Đơn hàng này không chứa sản phẩm bạn muốn đánh giá",
    };
  }

  // Determine variant ID (from matchingItem or provided)
  const resolvedVariantId = variantId && Types.ObjectId.isValid(variantId)
    ? new Types.ObjectId(variantId)
    : (matchingItem.variant?._id && Types.ObjectId.isValid(String(matchingItem.variant._id))
        ? new Types.ObjectId(String(matchingItem.variant._id))
        : null);

  // 6. Check for duplicate review
  const existing = await Review.findOne({
    orderId: order._id,
    productId: product._id,
    buyerId: new Types.ObjectId(buyerId),
  });

  if (existing) {
    return {
      success: false,
      errorCode: ErrorCode.REVIEW_ALREADY_EXISTS,
      message: "Bạn đã đánh giá sản phẩm này cho đơn hàng này rồi",
    };
  }

  // 7. Create review
  const review = await Review.create({
    productId: product._id,
    variantId: resolvedVariantId,
    buyerId: new Types.ObjectId(buyerId),
    orderId: order._id,
    rating: parsedRating,
    comment: comment?.trim() || "",
    images: Array.isArray(images) ? images : [],
    status: "APPROVED",
  });

  // 8. Auto-transition order to COMPLETED if it was DELIVERED
  if (order.status === "DELIVERED") {
    order.status = "COMPLETED";
    order.statusHistory.push({
      status: "COMPLETED",
      by: "system:review_submitted",
      at: new Date(),
      reason: "Khách hàng đã gửi đánh giá sản phẩm",
    });
    await order.save();
  }

  // 9. Update aggregate rating on TreeProduct
  await updateProductReviewStats(product._id);

  // 10. Send buyer a notification
  try {
    await Notification.create({
      userId: new Types.ObjectId(buyerId),
      type: "review",
      title: "Đánh giá thành công",
      message: `Cảm ơn bạn đã đánh giá sản phẩm "${product.name}"!`,
      isRead: false,
    });
  } catch (err) {
    console.error("[reviewService] Failed to send review notification:", err);
  }

  return {
    success: true,
    data: review,
  };
}

/**
 * Get reviews for a product with breakdown stats and pagination
 */
export async function getProductReviews(
  productId: string,
  options: {
    page?: number;
    limit?: number;
    rating?: number;
    hasImages?: boolean;
  } = {}
) {
  if (!Types.ObjectId.isValid(productId)) {
    return { error: ErrorCode.TREE_NOT_FOUND };
  }

  const pId = new Types.ObjectId(productId);
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(options.limit) || 10));
  const skip = (page - 1) * limit;

  // Build filter
  const filter: any = {
    productId: pId,
    status: "APPROVED",
  };

  if (options.rating && options.rating >= 1 && options.rating <= 5) {
    filter.rating = Number(options.rating);
  }

  if (options.hasImages) {
    filter["images.0"] = { $exists: true };
  }

  // Parallel fetch: reviews + total count + distribution stats
  const [reviews, totalCount, statsAgg] = await Promise.all([
    Review.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("buyerId", "name avatar")
      .populate("variantId", "name size bareImage")
      .lean(),
    Review.countDocuments(filter),
    Review.aggregate([
      { $match: { productId: pId, status: "APPROVED" } },
      {
        $group: {
          _id: "$rating",
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  // Compute distribution & overall stats
  let totalReviews = 0;
  let totalScore = 0;
  const distribution: Record<string, number> = {
    "1": 0,
    "2": 0,
    "3": 0,
    "4": 0,
    "5": 0,
  };

  for (const s of statsAgg) {
    const star = String(s._id);
    if (distribution[star] !== undefined) {
      distribution[star] = s.count;
    }
    totalReviews += s.count;
    totalScore += s._id * s.count;
  }

  const averageRating = totalReviews > 0 ? Math.round((totalScore / totalReviews) * 10) / 10 : 5;

  return {
    reviews: reviews.map((r: any) => ({
      _id: r._id,
      productId: r.productId,
      variant: r.variantId
        ? {
            _id: r.variantId._id,
            name: r.variantId.name,
            size: r.variantId.size,
            bareImage: r.variantId.bareImage,
          }
        : null,
      buyer: r.buyerId
        ? {
            _id: r.buyerId._id,
            name: r.buyerId.name || "Khách hàng",
            avatar: r.buyerId.avatar || "",
          }
        : { name: "Khách hàng", avatar: "" },
      orderId: r.orderId,
      rating: r.rating,
      comment: r.comment,
      images: r.images,
      adminReply: r.adminReply,
      createdAt: r.createdAt,
    })),
    pagination: {
      page,
      limit,
      total: totalCount,
      totalPages: Math.ceil(totalCount / limit) || 1,
    },
    stats: {
      averageRating,
      totalReviews,
      distribution,
    },
  };
}

/**
 * Get reviews by current logged-in user
 */
export async function getUserReviews(
  buyerId: string,
  options: { page?: number; limit?: number } = {}
) {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(options.limit) || 10));
  const skip = (page - 1) * limit;

  const filter = { buyerId: new Types.ObjectId(buyerId) };

  const [reviews, totalCount] = await Promise.all([
    Review.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("productId", "name coverImage slug")
      .populate("variantId", "name size bareImage")
      .populate("orderId", "orderCode status")
      .lean(),
    Review.countDocuments(filter),
  ]);

  return {
    reviews: reviews.map((r: any) => ({
      _id: r._id,
      product: r.productId
        ? {
            _id: r.productId._id,
            name: r.productId.name,
            coverImage: r.productId.coverImage,
            slug: r.productId.slug,
          }
        : null,
      variant: r.variantId
        ? {
            _id: r.variantId._id,
            name: r.variantId.name,
            size: r.variantId.size,
            bareImage: r.variantId.bareImage,
          }
        : null,
      order: r.orderId
        ? {
            _id: r.orderId._id,
            orderCode: r.orderId.orderCode,
            status: r.orderId.status,
          }
        : null,
      rating: r.rating,
      comment: r.comment,
      images: r.images,
      adminReply: r.adminReply,
      createdAt: r.createdAt,
    })),
    pagination: {
      page,
      limit,
      total: totalCount,
      totalPages: Math.ceil(totalCount / limit) || 1,
    },
  };
}

/**
 * Check reviewable items for an order
 */
export async function getOrderReviewableItems(orderId: string, buyerId: string) {
  const order = await Order.findOne(findOrderByIdOrCode(orderId));
  if (!order) {
    return { error: ErrorCode.ORDER_NOT_FOUND, message: "Không tìm thấy đơn hàng" };
  }

  if (order.buyerId.toString() !== buyerId.toString()) {
    return { error: ErrorCode.FORBIDDEN, message: "Không có quyền truy cập đơn hàng này" };
  }

  const existingReviews = await Review.find({
    orderId: order._id,
    buyerId: order.buyerId,
  }).lean();

  const reviewedProductIds = new Set(existingReviews.map((r) => r.productId.toString()));

  const isEligibleStatus = ["DELIVERED", "COMPLETED"].includes(order.status);

  const items = order.items.map((item) => {
    const pId = item.variant?.productId ? String(item.variant.productId) : null;
    const isReviewed = pId ? reviewedProductIds.has(pId) : false;
    const review = isReviewed
      ? existingReviews.find((r) => r.productId.toString() === pId)
      : null;

    return {
      productId: pId,
      variantName: item.variant?.name,
      variantSize: item.variant?.size,
      canReview: isEligibleStatus && !isReviewed && Boolean(pId),
      isReviewed,
      review: review
        ? {
            _id: review._id,
            rating: review.rating,
            comment: review.comment,
            images: review.images,
            createdAt: review.createdAt,
          }
        : null,
    };
  });

  return {
    orderId: order._id,
    orderCode: order.orderCode,
    orderStatus: order.status,
    isEligibleStatus,
    items,
  };
}
