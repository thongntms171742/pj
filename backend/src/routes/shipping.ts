import { Router } from "express";
import {
  getWarehouse,
  updateWarehouse,
  quoteShipping,
} from "../controllers/shippingController";

const router = Router();

// GET / PUT / PATCH /api/shipping/warehouse
router.get("/warehouse", getWarehouse);
router.put("/warehouse", updateWarehouse);
router.patch("/warehouse", updateWarehouse);
router.post("/warehouse", updateWarehouse);

// POST /api/shipping/quote
router.post("/quote", quoteShipping);

export default router;
