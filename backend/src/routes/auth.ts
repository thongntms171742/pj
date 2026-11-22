import { Router } from "express";
import {
  register,
  verifyEmail,
  resendVerificationOtp,
  login,
  googleAuth,
  updateAvatar,
  getMe,
  updateProfile,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
} from "../controllers/authController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.post("/register", register);
router.post("/verify-email", verifyEmail);
router.post("/resend-verification-otp", resendVerificationOtp);
router.post("/login", login);
router.post("/google", googleAuth);
router.post("/forgot-password", forgotPassword);
router.post("/verify-reset-otp", verifyResetOtp);
router.post("/reset-password", resetPassword);
router.get("/me", requireAuth, getMe);
router.patch("/me", requireAuth, updateProfile);
router.put("/me/avatar", requireAuth, updateAvatar);

export default router;