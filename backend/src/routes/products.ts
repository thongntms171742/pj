import { Router } from "express";
import { getProducts, createProduct } from "../controllers/productController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/", getProducts);
router.post("/", requireAuth, createProduct);

export default router;
