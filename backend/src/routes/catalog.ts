import { Router } from "express";
import {
  getTrees,
  getTreeProducts,
  getVariantsForCode,
  getDeliveryOptions,
  quoteDesign,
} from "../controllers/catalogController";
import { getReviewsForProduct } from "../controllers/reviewController";

const router = Router();

// 3-tier browse
router.get("/tree-products", getTreeProducts);
router.get(
  "/tree-products/:productId/codes/:codeId/variants",
  getVariantsForCode
);
router.get("/tree-products/:productId/reviews", getReviewsForProduct);
router.get("/products/:productId/reviews", getReviewsForProduct);

// Legacy flat list (kept for back-compat)
router.get("/trees", getTrees);

// Sau refactor phụ kiện: bỏ /styles, /accessories, /presets (đã purge).

router.get("/delivery-options", getDeliveryOptions);
router.post("/quote", quoteDesign);

export default router;
