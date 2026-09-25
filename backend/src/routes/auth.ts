import { Router } from "express";
import { register, login, mergeCart, applySeller } from "../controllers/authController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/cart/merge", requireAuth, mergeCart);
router.post("/seller/apply", requireAuth, applySeller);

export default router;
