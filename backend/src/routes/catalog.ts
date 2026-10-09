import { Router } from "express";
import {
  getTrees,
  getTreeProducts,
  getVariantsForCode,
  getStyles,
  getAccessories,
  getPresets,
  getDeliveryOptions,
  quoteDesign,
} from "../controllers/catalogController";

const router = Router();

// 3-tier browse (preferred for new FE)
router.get("/tree-products", getTreeProducts);
router.get(
  "/tree-products/:productId/codes/:codeId/variants",
  getVariantsForCode
);

// Legacy flat list (kept for back-compat)
router.get("/trees", getTrees);

router.get("/styles", getStyles);
router.get("/accessories", getAccessories);
router.get("/presets", getPresets);
router.get("/delivery-options", getDeliveryOptions);
router.post("/quote", quoteDesign);

export default router;
