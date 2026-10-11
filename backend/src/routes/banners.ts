import { Router } from "express";
import { getBanners } from "../controllers/bannerController";

const router = Router();

// GET /api/banners (public)
router.get("/", getBanners);

export default router;
