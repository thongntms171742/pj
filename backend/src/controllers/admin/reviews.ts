import { Request, Response } from "express";
import { Types } from "mongoose";
import { Review } from "../../models/Review";
import { Notification } from "../../models/Notification";
import { updateProductReviewStats } from "../../services/reviewService";
import { sendError, ErrorCode, handleInternalError } from "../../utils/errors";
import { ok, noContent } from "../../utils/respond";

/**
 * GET /api/admin/reviews
 * List reviews with filters and pagination
 */
export async function adminListReviews(req: Request, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "20"), 10)));
    const skip = (page - 1) * limit;

    const filter: any = {};

    if (req.query.status) {
      filter.status = req.query.status;
    }

    if (req.query.rating) {
      filter.rating = parseInt(String(req.query.rating), 10);
    }

    if (req.query.productId && Types.ObjectId.isValid(String(req.query.productId))) {
      filter.productId = new Types.ObjectId(String(req.query.productId));
    }

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("buyerId", "name email avatar")
        .populate("productId", "name coverImage slug")
        .populate("variantId", "name size sku bareImage")
        .populate("orderId", "orderCode status totalAmount")
        .populate("adminReply.repliedBy", "name email")
        .lean(),
      Review.countDocuments(filter),
    ]);

    ok(res, {
      reviews,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    handleInternalError(res, err, "[admin:reviews] adminListReviews error");
  }
}

/**
 * POST /api/admin/reviews/:id/reply
 * Admin replies to a buyer's review
 */
export async function adminReplyReview(req: Request, res: Response): Promise<void> {
  try {
    const adminId = req.user?.id;
    const reviewId = String(req.params.id);
    const { comment } = req.body;

    if (!comment || typeof comment !== "string" || !comment.trim()) {
      sendError(res, ErrorCode.MISSING_FIELD, "Nội dung phản hồi không được để trống");
      return;
    }

    if (!Types.ObjectId.isValid(reviewId)) {
      sendError(res, ErrorCode.REVIEW_NOT_FOUND, "Đánh giá không tồn tại");
      return;
    }

    const review = await Review.findById(reviewId);
    if (!review) {
      sendError(res, ErrorCode.REVIEW_NOT_FOUND, "Không tìm thấy đánh giá");
      return;
    }

    review.adminReply = {
      comment: comment.trim(),
      repliedAt: new Date(),
      repliedBy: adminId ? new Types.ObjectId(adminId) : undefined,
    };

    await review.save();

    // Send notification to buyer
    try {
      await Notification.create({
        userId: review.buyerId,
        type: "review",
        title: "Phản hồi đánh giá",
        message: "Người bán đã phản hồi đánh giá của bạn.",
        isRead: false,
      });
    } catch (notifErr) {
      console.error("[admin:reviews] Failed to send notification to buyer:", notifErr);
    }

    ok(res, { review });
  } catch (err) {
    handleInternalError(res, err, "[admin:reviews] adminReplyReview error");
  }
}

/**
 * PATCH /api/admin/reviews/:id/status
 * Moderate review status (APPROVED / HIDDEN)
 */
export async function adminUpdateReviewStatus(req: Request, res: Response): Promise<void> {
  try {
    const reviewId = String(req.params.id);
    const { status } = req.body;

    if (!status || !["APPROVED", "HIDDEN"].includes(status)) {
      sendError(res, ErrorCode.INVALID_INPUT, "Trạng thái phải là APPROVED hoặc HIDDEN");
      return;
    }

    if (!Types.ObjectId.isValid(reviewId)) {
      sendError(res, ErrorCode.REVIEW_NOT_FOUND, "Đánh giá không tồn tại");
      return;
    }

    const review = await Review.findByIdAndUpdate(
      reviewId,
      { status },
      { new: true }
    );

    if (!review) {
      sendError(res, ErrorCode.REVIEW_NOT_FOUND, "Không tìm thấy đánh giá");
      return;
    }

    // Recalculate product rating stats
    await updateProductReviewStats(review.productId);

    ok(res, { review });
  } catch (err) {
    handleInternalError(res, err, "[admin:reviews] adminUpdateReviewStatus error");
  }
}

/**
 * DELETE /api/admin/reviews/:id
 * Delete a review
 */
export async function adminDeleteReview(req: Request, res: Response): Promise<void> {
  try {
    const reviewId = String(req.params.id);

    if (!Types.ObjectId.isValid(reviewId)) {
      sendError(res, ErrorCode.REVIEW_NOT_FOUND, "Đánh giá không tồn tại");
      return;
    }

    const review = await Review.findByIdAndDelete(reviewId);
    if (!review) {
      sendError(res, ErrorCode.REVIEW_NOT_FOUND, "Không tìm thấy đánh giá");
      return;
    }

    // Recalculate product rating stats
    await updateProductReviewStats(review.productId);

    noContent(res);
  } catch (err) {
    handleInternalError(res, err, "[admin:reviews] adminDeleteReview error");
  }
}
