import { Router } from "express";
import { checkout } from "../controllers/paymentController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.post("/checkout", requireAuth, checkout);

export default router;
