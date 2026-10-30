import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth";
import {
  // ── Legacy (READ-ONLY, deprecated) ────────────────────────────────────────
  listTrees,
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
  // orders / users
  listAllOrders,
  getAdminStats,
  getAdminAnalytics,
  getAllUsers,
  updateUserStatus,
  getUserDetails,
  listBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  // media assets (hero video / story feed / background music)
  listMediaAssets,
  createMediaAsset,
  updateMediaAsset,
  deleteMediaAsset,
  adminListReviews,
  adminReplyReview,
  adminUpdateReviewStatus,
  adminDeleteReview,
} from "../controllers/admin";

const router = Router();

router.use(requireAuth, requireAdmin);

// ── Legacy (READ-ONLY, deprecated — removal 2026-12-01) ───────────────────
router.get("/trees", listTrees);

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

// Sau refactor phụ kiện: bỏ /styles, /accessories, /presets (đã purge).

// ── Orders ───────────────────────────────────────────────────────────────────
router.get("/orders", listAllOrders);

// ── Stats & Analytics ────────────────────────────────────────────────────────
router.get("/stats", getAdminStats);
router.get("/analytics", getAdminAnalytics);

// ── Users ────────────────────────────────────────────────────────────────────
router.get("/users", getAllUsers);
router.patch("/users/:id/status", updateUserStatus);
router.get("/users/:id/details", getUserDetails);

// ── Banners ──────────────────────────────────────────────────────────────────
router.get("/banners", listBanners);
router.post("/banners", createBanner);
router.patch("/banners/:id", updateBanner);
router.delete("/banners/:id", deleteBanner);

// ── Media Assets (Hero video / Story feed / Background music) ──────────────
router.get("/media", listMediaAssets);
router.post("/media", createMediaAsset);
router.patch("/media/:id", updateMediaAsset);
router.delete("/media/:id", deleteMediaAsset);

// ── Reviews ──────────────────────────────────────────────────────────────────
router.get("/reviews", adminListReviews);
router.post("/reviews/:id/reply", adminReplyReview);
router.patch("/reviews/:id/status", adminUpdateReviewStatus);
router.delete("/reviews/:id", adminDeleteReview);

export default router;
