import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  createDesign,
  getMyDesigns,
  getSharedDesignBySlug,
  getDesignById,
  updateDesign,
  deleteDesign,
  duplicateDesign,
  generateImage,
  confirmDesign,
} from "../controllers/designController";

const router = Router();

// Public share endpoint must be registered BEFORE `/:id` so /share/:slug
// doesn't get swallowed by the wildcard.
router.get("/share/:slug", getSharedDesignBySlug);
router.get("/mine", requireAuth, getMyDesigns);

// Authenticated CRUD.
router.post("/", requireAuth, createDesign);
router.get("/:id", requireAuth, getDesignById);
router.patch("/:id", requireAuth, updateDesign);
router.delete("/:id", requireAuth, deleteDesign);
router.post("/:id/duplicate", requireAuth, duplicateDesign);

// AI generate image (gộp từ /api/ai-designer/:id/generate-image cũ).
router.post("/:id/generate-image", requireAuth, generateImage);

// Xác nhận thiết kế → set status=CONFIRMED + cache pricingSnapshot.
router.post("/:id/confirm", requireAuth, confirmDesign);

export default router;
