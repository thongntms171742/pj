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
router.get("/items", optionalAuth, getCart);
router.post("/items", optionalAuth, addCartItem);
router.post("/", optionalAuth, addCartItem); // Alias cho POST /cart
router.patch("/items/:id", optionalAuth, updateCartItem);
router.patch("/:id", optionalAuth, updateCartItem); // Alias cho PATCH /cart/:id
router.delete("/items/:id", optionalAuth, deleteCartItem);
router.delete("/:id", optionalAuth, deleteCartItem); // Alias cho DELETE /cart/:id
router.delete("/clear", optionalAuth, clearCart);
router.delete("/", optionalAuth, clearCart);

// Merge guest cart into user cart (Authenticated buyer)
router.post("/merge", requireAuth, mergeCart);

export default router;