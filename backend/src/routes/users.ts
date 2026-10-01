import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { getAddresses, addAddress, updateAddress, deleteAddress } from "../controllers/userController";

const router = Router();

router.get("/me/addresses", requireAuth, getAddresses);
router.post("/me/addresses", requireAuth, addAddress);
router.patch("/me/addresses/:id", requireAuth, updateAddress);
router.delete("/me/addresses/:id", requireAuth, deleteAddress);

export default router;
