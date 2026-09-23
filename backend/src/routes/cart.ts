import { Router } from "express";
import {
  getCart,
  addCartItem,
  updateCartItem,
  deleteCartItem,
  clearCart,
  mergeCart,
} from "../controllers/cartController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, getCart);
router.post("/items", requireAuth, addCartItem);
router.patch("/items/:id", requireAuth, updateCartItem);
router.delete("/items/:id", requireAuth, deleteCartItem);
router.delete("/clear", requireAuth, clearCart);
router.delete("/", requireAuth, clearCart);
router.post("/merge", requireAuth, mergeCart);

export default router;
