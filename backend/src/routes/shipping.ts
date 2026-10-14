import { Router } from "express";
import {
  getWarehouse,
  quoteShipping,
} from "../controllers/shippingController";

const router = Router();

// GET /api/shipping/warehouse
router.get("/warehouse", getWarehouse);

// POST /api/shipping/quote
router.post("/quote", quoteShipping);

export default router;
