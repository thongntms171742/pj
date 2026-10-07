import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth";
import {
  listTrees,
  createTree,
  updateTree,
  listStyles,
  createStyle,
  updateStyle,
  listAccessories,
  createAccessory,
  updateAccessory,
  listPresets,
  createPreset,
  updatePreset,
  deletePreset,
  listAllOrders,
  getAdminStats,
  getAllUsers,
  updateUserStatus,
  getUserDetails,
} from "../controllers/adminController";

const router = Router();

router.use(requireAuth, requireAdmin);

// ── Trees ────────────────────────────────────────────────────────────────────
router.get("/trees", listTrees);
router.post("/trees", createTree);
router.patch("/trees/:id", updateTree);

// ── Styles ───────────────────────────────────────────────────────────────────
router.get("/styles", listStyles);
router.post("/styles", createStyle);
router.patch("/styles/:id", updateStyle);

// ── Accessories ─────────────────────────────────────────────────────────────
router.get("/accessories", listAccessories);
router.post("/accessories", createAccessory);
router.patch("/accessories/:id", updateAccessory);

// ── Presets ──────────────────────────────────────────────────────────────────
router.get("/presets", listPresets);
router.post("/presets", createPreset);
router.patch("/presets/:id", updatePreset);
router.delete("/presets/:id", deletePreset);

// ── Orders ───────────────────────────────────────────────────────────────────
router.get("/orders", listAllOrders);

// ── Stats ────────────────────────────────────────────────────────────────────
router.get("/stats", getAdminStats);

// ── Users ────────────────────────────────────────────────────────────────────
router.get("/users", getAllUsers);
router.patch("/users/:id/status", updateUserStatus);
router.get("/users/:id/details", getUserDetails);

export default router;