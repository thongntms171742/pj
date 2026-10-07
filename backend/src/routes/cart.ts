import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  getCart,
  addCartItem,
  updateCartItem,
  deleteCartItem,
  clearCart,
} from "../controllers/cartController";

const router = Router();

router.get("/", requireAuth, getCart);
router.post("/items", requireAuth, addCartItem);
router.patch("/items/:id", requireAuth, updateCartItem);
router.delete("/items/:id", requireAuth, deleteCartItem);
router.delete("/clear", requireAuth, clearCart);
router.delete("/", requireAuth, clearCart);

export default router;