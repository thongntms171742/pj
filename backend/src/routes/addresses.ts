import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
} from "../controllers/addressController";

const router = Router();

router.use(requireAuth);

router.get("/", getAddresses);
router.post("/", addAddress);
router.put("/:id", updateAddress);
router.delete("/:id", deleteAddress);

export default router;
