import { Router } from "express";
import {
  getProducts,
  getMyProducts,
  getProductById,
  createProduct,
  archiveProduct,
  createReview,
} from "../controllers/productController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/mine", requireAuth, getMyProducts);
router.get("/seller", requireAuth, getMyProducts);
router.get("/", getProducts);
router.post("/", requireAuth, createProduct);

// Specific action sub-routes before `/:id` wildcard
router.patch("/:id/archive", requireAuth, archiveProduct);
router.post("/:id/reviews", requireAuth, createReview);

// Product by ID
router.get("/:id", getProductById);

export default router;
