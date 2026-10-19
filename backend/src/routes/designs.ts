import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth";
import {
  quoteDesign,
  uploadRoomImage,
  createDesign,
  getMyDesigns,
  getDesignById,
  deleteDesign,
  generateImage,
  confirmDesign,
} from "../controllers/designController";

// ── Multer config cho upload ảnh phòng ─────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
});

const router = Router();

// Quote (preview price) — public-style nhưng vẫn yêu cầu auth để chống spam.
router.post("/quote", requireAuth, quoteDesign);

// Upload ảnh phòng lên Cloudinary (multipart) → trả URL + publicId.
router.post(
  "/upload-room",
  requireAuth,
  upload.single("roomImage"),
  uploadRoomImage
);

// CRUD RoomDesign.
router.post("/", requireAuth, createDesign);
router.get("/mine", requireAuth, getMyDesigns);
router.get("/:id", requireAuth, getDesignById);
router.delete("/:id", requireAuth, deleteDesign);

// AI render.
router.post("/:id/generate-image", requireAuth, generateImage);

// Backward-compat: confirmDesign giờ là no-op (checkout không cần confirm).
router.post("/:id/confirm", requireAuth, confirmDesign);

export default router;
