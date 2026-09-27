import { Router } from "express";
import { getPendingListings, approveListing, rejectListing, getPendingSellers, approveSeller, rejectSeller, getStats } from "../controllers/adminController";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

router.get("/stats", requireAuth, requireAdmin, getStats);
router.get("/pending-listings", requireAuth, requireAdmin, getPendingListings);
router.patch("/listings/:id/approve", requireAuth, requireAdmin, approveListing);
router.patch("/listings/:id/reject", requireAuth, requireAdmin, rejectListing);

router.get("/pending-sellers", requireAuth, requireAdmin, getPendingSellers);
router.patch("/sellers/:id/approve", requireAuth, requireAdmin, approveSeller);
router.patch("/sellers/:id/reject", requireAuth, requireAdmin, rejectSeller);

export default router;
