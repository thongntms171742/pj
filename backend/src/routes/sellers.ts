import { Router } from "express";
import {
  getSellers,
  getSellerMe,
  getSellerById,
  getSellerProducts,
  getSellerReviews,
} from "../controllers/sellerController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/", getSellers);
router.get("/me", requireAuth, getSellerMe);
router.get("/:idOrHandle/products", getSellerProducts);
router.get("/:idOrHandle/reviews", getSellerReviews);
router.get("/:idOrHandle", getSellerById);

export default router;
