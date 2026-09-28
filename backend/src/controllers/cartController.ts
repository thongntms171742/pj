import { Request, Response } from "express";
import { Cart } from "../models/Cart";
import { CartItem } from "../models/CartItem";
import { Product } from "../models/Product";
import { mapCartItem } from "./authController";
import { sendError, ErrorCode, handleInternalError } from "../utils/errors";

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
    handleInternalError(res, err, "[cart] getCart error");
  }
};

// ── POST /api/cart/items ──────────────────────────────────────────────────────
export const addCartItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { productId, quantity = 1 } = req.body;

    if (!productId) {
      sendError(res, ErrorCode.MISSING_FIELD, "productId is required");
      return;
    }

    const addQty = Math.max(1, parseInt(quantity, 10) || 1);

    const product = await Product.findById(productId);
    if (!product) {
      sendError(res, ErrorCode.PRODUCT_NOT_FOUND, "Sản phẩm không tồn tại");
      return;
    }

    // Check if product is available
    if (product.status !== "active") {
      sendError(res, ErrorCode.PRODUCT_NOT_AVAILABLE, "Sản phẩm hiện không mở bán hoặc đã được giữ/bán");
      return;
    }

    // Check stock
    if (product.quantity <= 0) {
      sendError(res, ErrorCode.PRODUCT_OUT_OF_STOCK, "Sản phẩm đã hết hàng");
      return;
    }

    // Prevent buying own product
    if (product.sellerId.toString() === userId) {
      sendError(res, ErrorCode.SELF_PURCHASE_NOT_ALLOWED, "Bạn không thể thêm sản phẩm của chính mình vào giỏ hàng");
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
      sendError(
        res,
        ErrorCode.QUANTITY_EXCEEDS_STOCK,
        `Số lượng yêu cầu (${newQty}) vượt quá số lượng còn lại trong kho (${product.quantity})`
      );
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
    handleInternalError(res, err, "[cart] addCartItem error");
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
      sendError(res, ErrorCode.CART_NOT_FOUND, "Giỏ hàng không tồn tại");
      return;
    }

    const item = await CartItem.findOne({ _id: id, cartId: cart._id });
    if (!item) {
      sendError(res, ErrorCode.CART_ITEM_NOT_FOUND, "Sản phẩm không có trong giỏ hàng");
      return;
    }

    if (quantity !== undefined) {
      const parsedQty = parseInt(quantity, 10);
      if (parsedQty <= 0) {
        // If updated quantity <= 0, remove item
        await CartItem.findByIdAndDelete(item._id);
        res.json({
          deleted: true,
          _id: item._id.toString(),
        });
        return;
      }

      // Check stock
      const product = await Product.findById(item.productId);
      if (product && parsedQty > product.quantity) {
        sendError(
          res,
          ErrorCode.QUANTITY_EXCEEDS_STOCK,
          `Số lượng vượt quá số lượng trong kho (${product.quantity})`
        );
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
    handleInternalError(res, err, "[cart] updateCartItem error");
  }
};

// ── DELETE /api/cart/items/:id ─────────────────────────────────────────────────
export const deleteCartItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      sendError(res, ErrorCode.CART_NOT_FOUND, "Giỏ hàng không tồn tại");
      return;
    }

    const item = await CartItem.findOneAndDelete({ _id: id, cartId: cart._id });
    if (!item) {
      sendError(res, ErrorCode.CART_ITEM_NOT_FOUND, "Sản phẩm không có trong giỏ hàng");
      return;
    }

    res.status(204).send();
  } catch (err) {
    handleInternalError(res, err, "[cart] deleteCartItem error");
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
    handleInternalError(res, err, "[cart] clearCart error");
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
    handleInternalError(res, err, "[cart] mergeCart error");
  }
};