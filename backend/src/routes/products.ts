import { Router } from "express";
import {
  getProducts,
  getMyProducts,
  createProduct,
  createReview,
} from "../controllers/productController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/mine", requireAuth, getMyProducts);
router.get("/seller", requireAuth, getMyProducts);
router.get("/", getProducts);
router.post("/", requireAuth, createProduct);

// IMPORTANT: this must come AFTER `/:id/...` style routes when added later.
// Reviews are a nested resource under a product.
router.post("/:id/reviews", requireAuth, createReview);

export default router;
