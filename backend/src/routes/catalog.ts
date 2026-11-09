import { Router } from "express";
import {
  getTrees,
  getTreeProducts,
  getVariantsForCode,
  getDeliveryOptions,
  quoteDesign,
  getAccessories,
  getVariantSlotMap,
  getCustomizerBaseTrees,
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

// ── Tree Customizer (Phase 1) ───────────────────────────────────────────────
router.get("/accessories", getAccessories);
router.get("/variants/:variantId/slotmap", getVariantSlotMap);
// Danh sách cây BASE (ảnh trơn, có SlotMap) cho màn hình chọn cây.
router.get("/customizer/base-trees", getCustomizerBaseTrees);

// Sau refactor phụ kiện: bỏ /styles, /accessories, /presets (đã purge).

router.get("/delivery-options", getDeliveryOptions);
router.post("/quote", quoteDesign);

export default router;
