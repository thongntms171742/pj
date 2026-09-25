import { Router } from "express";
import { getPendingListings, approveListing, rejectListing, getPlatformFee, setPlatformFee } from "../controllers/adminController";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

router.get("/pending-listings", requireAuth, requireAdmin, getPendingListings);
router.patch("/listings/:id/approve", requireAuth, requireAdmin, approveListing);
router.patch("/listings/:id/reject", requireAuth, requireAdmin, rejectListing);

router.get("/platform-fee", requireAuth, requireAdmin, getPlatformFee);
router.post("/platform-fee", requireAuth, requireAdmin, setPlatformFee);

export default router;
