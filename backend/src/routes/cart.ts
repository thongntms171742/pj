import { Router } from "express";
import { requireAuth, optionalAuth } from "../middleware/auth";
import {
  getCart,
  addCartItem,
  updateCartItem,
  deleteCartItem,
  clearCart,
  mergeCart,
} from "../controllers/cartController";

const router = Router();

// Guest + Authenticated cart access via optionalAuth
router.get("/", optionalAuth, getCart);
router.post("/items", optionalAuth, addCartItem);
router.patch("/items/:id", optionalAuth, updateCartItem);
router.delete("/items/:id", optionalAuth, deleteCartItem);
router.delete("/clear", optionalAuth, clearCart);
router.delete("/", optionalAuth, clearCart);

// Merge guest cart into user cart (Authenticated buyer)
router.post("/merge", requireAuth, mergeCart);

export default router;