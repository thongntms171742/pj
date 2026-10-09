import { Router } from "express";
import { applyCoupon } from "../controllers/couponController";
import { requireAuth } from "../middleware/auth";

const router = Router();

// POST /api/coupons/apply
router.post("/apply", requireAuth, applyCoupon);

export default router;
