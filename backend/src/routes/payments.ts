import { Router } from "express";
import { checkout, handlePaymentWebhook } from "../controllers/paymentController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.post("/checkout", requireAuth, checkout);
router.post("/webhook", handlePaymentWebhook);

export default router;
