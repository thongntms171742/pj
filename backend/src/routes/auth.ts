import { Router } from "express";
import { register, login, mergeCart, applySeller, updateAvatar } from "../controllers/authController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/cart/merge", requireAuth, mergeCart);
router.post("/seller/apply", requireAuth, applySeller);
router.put("/me/avatar", requireAuth, updateAvatar);

export default router;
