import { Router } from "express";
import {
  getPendingListings,
  approveListing,
  rejectListing,
  getPendingSellers,
  approveSeller,
  rejectSeller,
  getAdminStats,
  getAllUsers,
  updateUserStatus,
  getUserDetails,
} from "../controllers/adminController";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

// ── Listing moderation ────────────────────────────────────────────────────────
router.get("/pending-listings", requireAuth, requireAdmin, getPendingListings);
router.patch("/listings/:id/approve", requireAuth, requireAdmin, approveListing);
router.patch("/listings/:id/reject", requireAuth, requireAdmin, rejectListing);

// ── Platform stats (Admin Dashboard) ─────────────────────────────────────────
// FE AdminScreen calls `GET /api/admin/stats` → reads `res.stats`.
router.get("/stats", requireAuth, requireAdmin, getAdminStats);

// ── User Management ────────────────────────────────────────────────────────────
router.get("/users", requireAuth, requireAdmin, getAllUsers);
router.patch("/users/:id/status", requireAuth, requireAdmin, updateUserStatus);
router.get("/users/:id/details", requireAuth, requireAdmin, getUserDetails);

// ── Seller application moderation — canonical paths ──────────────────────────
// FE AdminScreen calls:
//   GET   /admin/pending-sellers                → reads `res.users`
//   PATCH /admin/sellers/:id/approve            → approve seller
//   PATCH /admin/sellers/:id/reject             → reject seller
//
// Legacy paths (`/admin/users/:id/{approve,reject}-seller`) are kept below as
// deprecated aliases so older clients keep working.
router.get("/pending-sellers", requireAuth, requireAdmin, getPendingSellers);
router.patch("/sellers/:id/approve", requireAuth, requireAdmin, approveSeller);
router.patch("/sellers/:id/reject", requireAuth, requireAdmin, rejectSeller);

// ── Deprecated aliases (kept for backward compatibility) ─────────────────────
// TODO: remove after FE team migrates all clients.
router.patch("/users/:id/approve-seller", requireAuth, requireAdmin, (req, res, next) => {
  console.warn(
    "[admin] DEPRECATED /admin/users/:id/approve-seller — use /admin/sellers/:id/approve"
  );
  next();
}, approveSeller);
router.patch("/users/:id/reject-seller", requireAuth, requireAdmin, (req, res, next) => {
  console.warn(
    "[admin] DEPRECATED /admin/users/:id/reject-seller — use /admin/sellers/:id/reject"
  );
  next();
}, rejectSeller);

export default router;
