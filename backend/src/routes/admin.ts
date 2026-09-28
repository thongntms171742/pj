import { Router } from "express";
import {
  getPendingListings,
  approveListing,
  rejectListing,
  getPendingSellers,
  approveSeller,
  rejectSeller,
} from "../controllers/adminController";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

// ── Listing moderation ────────────────────────────────────────────────────────
router.get("/pending-listings", requireAuth, requireAdmin, getPendingListings);
router.patch("/listings/:id/approve", requireAuth, requireAdmin, approveListing);
router.patch("/listings/:id/reject", requireAuth, requireAdmin, rejectListing);

// ── Seller application moderation ─────────────────────────────────────────────
router.get("/pending-sellers", requireAuth, requireAdmin, getPendingSellers);
router.patch("/users/:id/approve-seller", requireAuth, requireAdmin, approveSeller);
router.patch("/users/:id/reject-seller", requireAuth, requireAdmin, rejectSeller);

export default router;
