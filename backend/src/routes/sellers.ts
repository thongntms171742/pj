import { Router } from "express";
import {
  getSellers,
  getSellerMe,
  getSellerById,
  getSellerProducts,
} from "../controllers/sellerController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/", getSellers);
router.get("/me", requireAuth, getSellerMe);
router.get("/:idOrHandle/products", getSellerProducts);
router.get("/:idOrHandle", getSellerById);

export default router;
