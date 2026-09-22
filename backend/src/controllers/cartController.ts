import { Request, Response } from "express";
import { Cart } from "../models/Cart";
import { CartItem } from "../models/CartItem";
import { Product } from "../models/Product";
import { mapCartItem } from "./authController";

// ── GET /api/cart ─────────────────────────────────────────────────────────────
export const getCart = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = await Cart.create({ userId });
    }

    const items = await CartItem.find({ cartId: cart._id }).populate({
      path: "productId",
      populate: [
        { path: "sellerId", select: "name email sellerProfile" },
        { path: "categoryId", select: "name slug" },
      ],
    });

    const mapped = items.map((ci) => mapCartItem(ci));

    res.json({ cart: { _id: cart._id }, items: mapped });
  } catch (err) {
    console.error("[cart] getCart error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── POST /api/cart/items ──────────────────────────────────────────────────────
export const addCartItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { productId, quantity } = req.body;

    if (!productId) {
      res.status(400).json({ error: "productId is required" });
      return;
    }

    const product = await Product.findById(productId);
    if (!product) {
      res.status(404).json({ error: "Sản phẩm không tồn tại" });
      return;
    }

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = await Cart.create({ userId });
    }

    const item = await CartItem.findOneAndUpdate(
      { cartId: cart._id, productId: product._id },
      {
        $inc: { quantity: quantity || 1 },
        $setOnInsert: {
          priceSnapshot: product.price,
          checked: false,
        },
      },
      { upsert: true, new: true }
    );

    // Populate for response
    const populated = await CartItem.findById(item._id).populate({
      path: "productId",
      populate: [
        { path: "sellerId", select: "name email sellerProfile" },
        { path: "categoryId", select: "name slug" },
      ],
    });

    res.status(201).json({ item: mapCartItem(populated) });
  } catch (err) {
    console.error("[cart] addCartItem error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── PATCH /api/cart/items/:id ─────────────────────────────────────────────────
export const updateCartItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { quantity, checked } = req.body;

    const update: any = {};
    if (quantity !== undefined) update.quantity = quantity;
    if (checked !== undefined) update.checked = checked;

    const item = await CartItem.findByIdAndUpdate(id, update, { new: true });
    if (!item) {
      res.status(404).json({ error: "Cart item không tồn tại" });
      return;
    }

    res.json({ item });
  } catch (err) {
    console.error("[cart] updateCartItem error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── DELETE /api/cart/items/:id ─────────────────────────────────────────────────
export const deleteCartItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const item = await CartItem.findByIdAndDelete(id);
    if (!item) {
      res.status(404).json({ error: "Cart item không tồn tại" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    console.error("[cart] deleteCartItem error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};
