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
    const { productId, quantity = 1 } = req.body;

    if (!productId) {
      res.status(400).json({ error: "productId is required" });
      return;
    }

    const addQty = Math.max(1, parseInt(quantity, 10) || 1);

    const product = await Product.findById(productId);
    if (!product) {
      res.status(404).json({ error: "Sản phẩm không tồn tại" });
      return;
    }

    // Check if product is available
    if (product.status !== "active") {
      res.status(400).json({ error: "Sản phẩm hiện không mở bán hoặc đã được giữ/bán" });
      return;
    }

    // Check stock
    if (product.quantity <= 0) {
      res.status(400).json({ error: "Sản phẩm đã hết hàng" });
      return;
    }

    // Prevent buying own product
    if (product.sellerId.toString() === userId) {
      res.status(400).json({ error: "Bạn không thể thêm sản phẩm của chính mình vào giỏ hàng" });
      return;
    }

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = await Cart.create({ userId });
    }

    // Check existing item in cart to prevent exceeding available quantity
    const existingItem = await CartItem.findOne({ cartId: cart._id, productId: product._id });
    const currentQty = existingItem ? existingItem.quantity : 0;
    const newQty = currentQty + addQty;

    if (newQty > product.quantity) {
      res.status(400).json({
        error: `Số lượng yêu cầu (${newQty}) vượt quá số lượng còn lại trong kho (${product.quantity})`,
      });
      return;
    }

    const item = await CartItem.findOneAndUpdate(
      { cartId: cart._id, productId: product._id },
      {
        $set: { quantity: newQty, priceSnapshot: product.price },
        $setOnInsert: { checked: false },
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
    const userId = req.user!.id;
    const { id } = req.params;
    const { quantity, checked } = req.body;

    // Verify user ownership of the cart
    const cart = await Cart.findOne({ userId });
    if (!cart) {
      res.status(404).json({ error: "Giỏ hàng không tồn tại" });
      return;
    }

    const item = await CartItem.findOne({ _id: id, cartId: cart._id });
    if (!item) {
      res.status(404).json({ error: "Sản phẩm không có trong giỏ hàng" });
      return;
    }

    if (quantity !== undefined) {
      const parsedQty = parseInt(quantity, 10);
      if (parsedQty <= 0) {
        // If updated quantity <= 0, remove item
        await CartItem.findByIdAndDelete(item._id);
        res.json({ message: "Đã xóa sản phẩm khỏi giỏ hàng", deleted: true, _id: item._id });
        return;
      }

      // Check stock
      const product = await Product.findById(item.productId);
      if (product && parsedQty > product.quantity) {
        res.status(400).json({
          error: `Số lượng vượt quá số lượng trong kho (${product.quantity})`,
        });
        return;
      }
      item.quantity = parsedQty;
    }

    if (checked !== undefined) {
      item.checked = Boolean(checked);
    }

    await item.save();

    const populated = await CartItem.findById(item._id).populate({
      path: "productId",
      populate: [
        { path: "sellerId", select: "name email sellerProfile" },
        { path: "categoryId", select: "name slug" },
      ],
    });

    res.json({ item: mapCartItem(populated) });
  } catch (err) {
    console.error("[cart] updateCartItem error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── DELETE /api/cart/items/:id ─────────────────────────────────────────────────
export const deleteCartItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      res.status(404).json({ error: "Giỏ hàng không tồn tại" });
      return;
    }

    const item = await CartItem.findOneAndDelete({ _id: id, cartId: cart._id });
    if (!item) {
      res.status(404).json({ error: "Sản phẩm không có trong giỏ hàng" });
      return;
    }

    res.status(204).send();
  } catch (err) {
    console.error("[cart] deleteCartItem error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── DELETE /api/cart/clear ───────────────────────────────────────────────────
export const clearCart = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const cart = await Cart.findOne({ userId });
    if (cart) {
      await CartItem.deleteMany({ cartId: cart._id });
    }
    res.json({ success: true, message: "Đã làm trống giỏ hàng" });
  } catch (err) {
    console.error("[cart] clearCart error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── POST /api/cart/merge ──────────────────────────────────────────────────────
export const mergeCart = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { items = [] } = req.body;

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = await Cart.create({ userId });
    }

    if (Array.isArray(items)) {
      for (const item of items) {
        if (!item.productId) continue;
        const product = await Product.findById(item.productId);
        if (!product || product.status !== "active" || product.quantity <= 0) continue;
        if (product.sellerId.toString() === userId) continue; // Skip own products

        const qty = Math.min(Math.max(1, item.quantity || 1), product.quantity);

        await CartItem.findOneAndUpdate(
          { cartId: cart._id, productId: product._id },
          {
            $inc: { quantity: qty },
            $setOnInsert: {
              priceSnapshot: product.price,
              checked: false,
            },
          },
          { upsert: true, new: true }
        );
      }
    }

    const allItems = await CartItem.find({ cartId: cart._id }).populate({
      path: "productId",
      populate: [
        { path: "sellerId", select: "name email sellerProfile" },
        { path: "categoryId", select: "name slug" },
      ],
    });

    res.json({ items: allItems.map((ci) => mapCartItem(ci)) });
  } catch (err) {
    console.error("[cart] mergeCart error:", err);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};
