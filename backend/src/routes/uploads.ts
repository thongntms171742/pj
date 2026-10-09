import { Router } from "express";
import { uploadMedia } from "../controllers/uploadController";
import { optionalAuth } from "../middleware/auth";

const router = Router();

// POST /api/uploads
router.post("/", optionalAuth, uploadMedia);

export default router;
