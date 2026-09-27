import { Router } from "express";
import {
  getProducts,
  getMyProducts,
  createProduct,
} from "../controllers/productController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/mine", requireAuth, getMyProducts);
router.get("/seller", requireAuth, getMyProducts);
router.get("/", getProducts);
router.post("/", requireAuth, createProduct);

export default router;
