import { Router } from "express";
import { register, login, updateAvatar } from "../controllers/authController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.put("/me/avatar", requireAuth, updateAvatar);

export default router;