import { Router } from "express";
import {
  getProducts,
  getMyProducts,
  createProduct,
  updateProduct,
  archiveProduct,
} from "../controllers/productController";
import { createReview, getProductReviews } from "../controllers/reviewController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/mine", requireAuth, getMyProducts);
router.get("/seller", requireAuth, getMyProducts);
router.get("/", getProducts);
router.post("/", requireAuth, createProduct);
router.patch("/:id/archive", requireAuth, archiveProduct);
router.patch("/:id", requireAuth, updateProduct);

// Review routes nested under product
router.post("/:productId/reviews", requireAuth, createReview);
router.get("/:productId/reviews", getProductReviews);

export default router;
