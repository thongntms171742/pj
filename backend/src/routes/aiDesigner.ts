import { Router } from "express";
import { optionalAuth, requireAuth } from "../middleware/auth";
import {
  recommendDesign,
  getAIDesignById,
  quoteAIDesign,
  saveConfirmedDesign,
  generateDesignImage,
} from "../controllers/aiDesignerController";

const router = Router();

// Recommend or create draft design from prompt or manual selection
router.post("/recommend", optionalAuth, recommendDesign);

// Generate preview image (requires authenticated owner or admin)
router.post("/:id/generate-image", requireAuth, generateDesignImage);

// Get saved/draft design by ID
router.get("/:id", optionalAuth, getAIDesignById);

// Re-calculate price and expected profit
router.post("/:id/quote", optionalAuth, quoteAIDesign);

// Save confirmed AI design as an official TreeDesign
router.post("/:id/save", requireAuth, saveConfirmedDesign);

export default router;
