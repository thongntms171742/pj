import { Router } from "express";
import { checkout, codCollect } from "../controllers/paymentController";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

router.post("/checkout", requireAuth, checkout);
router.post("/:code/cod-collect", requireAuth, requireAdmin, codCollect);

export default router;
