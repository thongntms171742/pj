import { Request, Response } from "express";
import {
  submitReview,
  getProductReviews,
  getUserReviews,
  getOrderReviewableItems,
} from "../services/reviewService";
import { sendError, ErrorCode, handleInternalError } from "../utils/errors";
import { ok, created } from "../utils/respond";

/**
 * POST /api/products/:productId/reviews
 * or POST /api/reviews
 * Buyer submits a review for a purchased product
 */
export async function createReview(req: Request, res: Response): Promise<void> {
  try {
    const buyerId = req.user?.id;
    if (!buyerId) {
      sendError(res, ErrorCode.UNAUTHORIZED, "Chưa đăng nhập");
      return;
    }

    const productId = req.params.productId || req.body.productId;
    const { orderId, rating, comment, images, variantId } = req.body;

    if (!productId) {
      sendError(res, ErrorCode.MISSING_FIELD, "Thiếu mã sản phẩm (productId)");
      return;
    }

    if (!orderId) {
      sendError(res, ErrorCode.MISSING_FIELD, "Thiếu mã đơn hàng (orderId)");
      return;
    }

    if (rating === undefined || rating === null) {
      sendError(res, ErrorCode.REVIEW_RATING_INVALID, "Điểm đánh giá (rating) là bắt buộc");
      return;
    }

    const result = await submitReview({
      buyerId,
      productId: String(productId),
      orderId: String(orderId),
      rating: Number(rating),
      comment: typeof comment === "string" ? comment : "",
      images: Array.isArray(images) ? images : [],
      variantId: variantId ? String(variantId) : undefined,
    });

    if (!result.success) {
      sendError(res, result.errorCode || ErrorCode.INVALID_INPUT, result.message || "Không thể tạo đánh giá");
      return;
    }

    created(res, { review: result.data });
  } catch (err) {
    handleInternalError(res, err, "[reviews] createReview error");
  }
}

/**
 * GET /api/products/:productId/reviews
 * Public endpoint to view reviews of a product with ratings breakdown
 */
export async function getReviewsForProduct(req: Request, res: Response): Promise<void> {
  try {
    const productId = req.params.productId ? String(req.params.productId) : "";
    if (!productId) {
      sendError(res, ErrorCode.MISSING_FIELD, "Thiếu mã sản phẩm");
      return;
    }

    const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 10;
    const rating = req.query.rating ? parseInt(String(req.query.rating), 10) : undefined;
    const hasImages = req.query.hasImages === "true";

    const data = await getProductReviews(productId, { page, limit, rating, hasImages });

    if ("error" in data) {
      sendError(res, data.error as any, "Không tìm thấy sản phẩm");
      return;
    }

    ok(res, data);
  } catch (err) {
    handleInternalError(res, err, "[reviews] getReviewsForProduct error");
  }
}

/**
 * GET /api/reviews/my
 * Logged-in buyer views their submitted reviews
 */
export async function getMyReviews(req: Request, res: Response): Promise<void> {
  try {
    const buyerId = req.user?.id;
    if (!buyerId) {
      sendError(res, ErrorCode.UNAUTHORIZED, "Chưa đăng nhập");
      return;
    }

    const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 10;

    const data = await getUserReviews(buyerId, { page, limit });
    ok(res, data);
  } catch (err) {
    handleInternalError(res, err, "[reviews] getMyReviews error");
  }
}

/**
 * GET /api/orders/:orderId/reviewable-items
 * Check which items in an order are eligible for review or already reviewed
 */
export async function getOrderReviewableItemsHandler(req: Request, res: Response): Promise<void> {
  try {
    const buyerId = req.user?.id;
    if (!buyerId) {
      sendError(res, ErrorCode.UNAUTHORIZED, "Chưa đăng nhập");
      return;
    }

    const orderId = req.params.orderId ? String(req.params.orderId) : "";
    if (!orderId) {
      sendError(res, ErrorCode.MISSING_FIELD, "Thiếu mã đơn hàng");
      return;
    }

    const data = await getOrderReviewableItems(orderId, buyerId);
    if ("error" in data) {
      sendError(res, data.error as any, data.message || "Lỗi truy vấn");
      return;
    }

    ok(res, data);
  } catch (err) {
    handleInternalError(res, err, "[reviews] getOrderReviewableItemsHandler error");
  }
}
