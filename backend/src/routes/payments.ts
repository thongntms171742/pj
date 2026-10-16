import { Router } from "express";
import {
  checkout,
  handlePaymentWebhook,
  getSepayInfo,
  handleSepayWebhook,
  checkPaymentStatus,
} from "../controllers/paymentController";
import { requireAuth } from "../middleware/auth";

const router = Router();

// Mock online payment checkout
router.post("/checkout", requireAuth, checkout);

// General payment webhook
router.post("/webhook", handlePaymentWebhook);

// SePay VietQR payment info
router.get("/sepay/info/:orderId", requireAuth, getSepayInfo);

// SePay Webhook
router.post("/sepay/webhook", handleSepayWebhook);

// Check payment status by orderCode
router.get("/sepay/check/:orderCode", checkPaymentStatus);

export default router;

