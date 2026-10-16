import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  createReview,
  getReviewsForProduct,
} from "../controllers/reviewController";

const router = Router();

// Public: get product reviews with breakdown stats and pagination
router.get("/:productId/reviews", getReviewsForProduct);

// Buyer: submit review for product
router.post("/:productId/reviews", requireAuth, createReview);

export default router;
