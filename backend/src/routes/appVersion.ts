import { Router } from "express";
import { checkAppVersion } from "../controllers/appVersionController";

const router = Router();

// Public endpoint cho Mobile App kiểm tra cập nhật khi mở app.
router.get("/check", checkAppVersion);

export default router;
