import { Router } from "express";
import {
  register,
  login,
  updateAvatar,
  getMe,
  updateProfile,
} from "../controllers/authController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", requireAuth, getMe);
router.patch("/me", requireAuth, updateProfile);
router.put("/me/avatar", requireAuth, updateAvatar);

export default router;