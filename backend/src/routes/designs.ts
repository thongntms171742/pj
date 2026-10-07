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

export default router;