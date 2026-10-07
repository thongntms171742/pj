import { Router } from "express";
import {
  getTrees,
  getStyles,
  getAccessories,
  getPresets,
  getDeliveryOptions,
  quoteDesign,
} from "../controllers/catalogController";

const router = Router();

router.get("/trees", getTrees);
router.get("/styles", getStyles);
router.get("/accessories", getAccessories);
router.get("/presets", getPresets);
router.get("/delivery-options", getDeliveryOptions);
router.post("/quote", quoteDesign);

export default router;