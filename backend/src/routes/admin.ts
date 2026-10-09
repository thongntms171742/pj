import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth";
import {
  // legacy trees (still available for back-compat reading)
  listTrees,
  createTree,
  updateTree,
  // 3-tier tree products
  listTreeProducts,
  createTreeProduct,
  updateTreeProduct,
  deleteTreeProduct,
  // 3-tier tree codes
  createTreeCode,
  updateTreeCode,
  deleteTreeCode,
  // 3-tier tree variants
  createTreeVariant,
  updateTreeVariant,
  deleteTreeVariant,
  bulkUpdateTreeVariants,
  // styles / accessories / presets / orders / users
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
  getAdminAnalytics,
  getAllUsers,
  updateUserStatus,
  getUserDetails,
} from "../controllers/adminController";

const router = Router();

router.use(requireAuth, requireAdmin);

// ── Legacy trees (kept for back-compat) ─────────────────────────────────────
router.get("/trees", listTrees);
router.post("/trees", createTree);
router.patch("/trees/:id", updateTree);

// ── 3-tier Tree Products (Product → Code → Variant) ─────────────────────────
router.get("/tree-products", listTreeProducts);
router.post("/tree-products", createTreeProduct);
router.patch("/tree-products/:productId", updateTreeProduct);
router.delete("/tree-products/:productId", deleteTreeProduct);

// Tree codes (mã cây — Phân loại 1)
router.post("/tree-products/:productId/codes", createTreeCode);
router.patch("/tree-codes/:codeId", updateTreeCode);
router.delete("/tree-codes/:codeId", deleteTreeCode);

// Tree variants (size × code SKU — Phân loại 2)
router.post("/tree-codes/:codeId/variants", createTreeVariant);
router.patch("/tree-variants/:variantId", updateTreeVariant);
router.delete("/tree-variants/:variantId", deleteTreeVariant);

// Shopee "Áp dụng cho tất cả phân loại" — bulk update variants.
router.patch("/tree-variants/bulk", bulkUpdateTreeVariants);

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

// ── Stats & Analytics ────────────────────────────────────────────────────────
router.get("/stats", getAdminStats);
router.get("/analytics", getAdminAnalytics);

// ── Users ────────────────────────────────────────────────────────────────────
router.get("/users", getAllUsers);
router.patch("/users/:id/status", updateUserStatus);
router.get("/users/:id/details", getUserDetails);

export default router;
