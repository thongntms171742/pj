import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  createReview,
  getMyReviews,
  getOrderReviewableItemsHandler,
} from "../controllers/reviewController";

const router = Router();

// Buyer submits a review
router.post("/", requireAuth, createReview);

// Buyer gets all their own reviews
router.get("/my", requireAuth, getMyReviews);

// Check reviewable items in an order
router.get("/order/:orderId", requireAuth, getOrderReviewableItemsHandler);

export default router;
