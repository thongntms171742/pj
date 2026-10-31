import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth";
import {
  uploadRoomImage,
  createDesign,
  getMyDesigns,
  getDesignById,
  deleteDesign,
  generateImage,
  confirmDesign,
  uploadCompositeResult,
} from "../controllers/designController";

// ── Multer config cho upload ảnh phòng & ảnh ghép ──────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
});

const router = Router();

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

// Composite upload: Client tự tách nền + ghép cây vào phòng rồi gửi ảnh kết quả.
router.post(
  "/:id/result",
  requireAuth,
  upload.single("compositeImage"),
  uploadCompositeResult
);

// Legacy AI render (feature flag AI_ROOM_DESIGN_ENABLED).
router.post("/:id/generate-image", requireAuth, generateImage);

// Backward-compat: confirmDesign giờ là no-op (checkout không cần confirm).
router.post("/:id/confirm", requireAuth, confirmDesign);

export default router;
