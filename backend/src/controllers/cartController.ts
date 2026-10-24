import { Request, Response } from "express";
import { Types, HydratedDocument } from "mongoose";
import { Cart, ICart } from "../models/Cart";
import { CartItem } from "../models/CartItem";
import { safelyBuildPricedDesign, buildPricedDesign } from "../services/catalogService";
import { sendError, ErrorCode, handleInternalError } from "../utils/errors";
import { ok, created, noContent } from "../utils/respond";
import { cartItemToDto, cartToDto } from "../dto/cart";
import type { DeliveryOption } from "../config/business";

export function extractCartIdentifier(req: Request): {
  userId?: string;
  sessionId?: string;
} {
  if (req.user?.id) {
    return { userId: req.user.id };
  }
  const rawSession =
    (req.headers["x-session-id"] as string) ||
    (req.headers["x-guest-session-id"] as string) ||
    (req.query.guestSessionId as string) ||
    (req.body && req.body.guestSessionId);

  if (rawSession && typeof rawSession === "string" && rawSession.trim()) {
    return { sessionId: rawSession.trim() };
  }
  return {};
}

async function getOrCreateCart(req: Request): Promise<HydratedDocument<ICart>> {
  const { userId, sessionId } = extractCartIdentifier(req);

  // ── User cart ───────────────────────────────────────────────────────────
  if (userId) {
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      try {
        cart = await Cart.create({ userId });
      } catch (err: any) {
        // Race: another request created it first → unique-index violation.
        if (err?.code === 11001 || err?.code === 11000) {
          cart = await Cart.findOne({ userId });
        } else throw err;
      }
    }
    if (!cart) throw new Error("CART_NOT_FOUND");
    return cart;
  }

  // ── Guest cart ──────────────────────────────────────────────────────────
  const effectiveSessionId =
    sessionId || `guest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  let cart = await Cart.findOne({ sessionId: effectiveSessionId });
  if (!cart) {
    try {
      cart = await Cart.create({ sessionId: effectiveSessionId });
    } catch (err: any) {
      // Race: another request created it first → unique-index violation.
      if (err?.code === 11001 || err?.code === 11000) {
        cart = await Cart.findOne({ sessionId: effectiveSessionId });
      } else throw err;
    }
  }
  if (!cart) throw new Error("CART_NOT_FOUND");
  return cart;
}

// ── GET /api/cart ─────────────────────────────────────────────────────────────
export const getCart = async (req: Request, res: Response): Promise<void> => {
  try {
    const cart = await getOrCreateCart(req);
    const items = await CartItem.find({ cartId: cart._id }).sort({
      createdAt: -1,
    });

    const responseItems: any[] = [];
    for (const item of items) {
      try {
        const config = item.config as any;
        const { pricing } = await buildPricedDesign({
          variantId: String(config.variantId),
          deliveryOption: config.deliveryOption,
        });
        responseItems.push(cartItemToDto(item, pricing));
      } catch {
        responseItems.push(cartItemToDto(item, null));
      }
    }

    ok(res, {
      cart: cartToDto(cart),
      items: responseItems,
    });
  } catch (err) {
    handleInternalError(res, err, "[cart] getCart error");
  }
};

// ── POST /api/cart/items ──────────────────────────────────────────────────────
// Body: { variantId, deliveryOption, quantity? }
// Sau refactor RoomDesign: bỏ `designId` (cart không tham chiếu Design nữa).
export const addCartItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const { variantId, deliveryOption, quantity } = req.body as {
      variantId?: string;
      deliveryOption?: string;
      quantity?: number;
    };

    if (!variantId || !deliveryOption) {
      sendError(
        res,
        ErrorCode.MISSING_FIELD,
        "Cần cung cấp `variantId` và `deliveryOption`"
      );
      return;
    }

    const built = await safelyBuildPricedDesign(res, {
      variantId: String(variantId),
      deliveryOption: deliveryOption as DeliveryOption,
    });
    if (!built) return;
    const pricing = built.pricing;

    const cart = await getOrCreateCart(req);
    const qty = Math.max(1, parseInt(String(quantity ?? 1), 10) || 1);

    // Tìm cart item cùng variant + delivery
    const existingItems = await CartItem.find({ cartId: cart._id });
    const match = existingItems.find((existing) => {
      const cfg = existing.config as any;
      return (
        String(cfg.variantId) === String(variantId) &&
        cfg.deliveryOption === deliveryOption
      );
    });

    let item;
    if (match) {
      match.quantity += qty;
      match.priceSnapshot = pricing.unitTotal;
      await match.save();
      item = match;
    } else {
      item = await CartItem.create({
        cartId: cart._id,
        config: {
          variantId: new Types.ObjectId(String(variantId)),
          deliveryOption: deliveryOption as DeliveryOption,
        },
        quantity: qty,
        priceSnapshot: pricing.unitTotal,
        checked: false,
      });
    }

    created(res, {
      item: cartItemToDto(item, pricing),
      cart: cartToDto(cart),
    });
  } catch (err) {
    handleInternalError(res, err, "[cart] addCartItem error");
  }
};

// ── PATCH /api/cart/items/:id ─────────────────────────────────────────────────
export const updateCartItem = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const cart = await getOrCreateCart(req);
    const item = await CartItem.findOne({ _id: id, cartId: cart._id });
    if (!item) {
      sendError(
        res,
        ErrorCode.CART_ITEM_NOT_FOUND,
        "Không tìm thấy sản phẩm trong giỏ"
      );
      return;
    }

    const { quantity, checked, variantId, deliveryOption } = req.body as {
      quantity?: number;
      checked?: boolean;
      variantId?: string;
      deliveryOption?: string;
    };

    if (quantity !== undefined) {
      const n = parseInt(String(quantity), 10);
      if (!Number.isFinite(n) || n < 1) {
        sendError(res, ErrorCode.INVALID_INPUT, "Số lượng phải >= 1");
        return;
      }
      item.quantity = n;
    }

    let pricing: any = null;
    if (variantId && deliveryOption) {
      const built = await safelyBuildPricedDesign(res, {
        variantId: String(variantId),
        deliveryOption: deliveryOption as DeliveryOption,
      });
      if (!built) return;
      pricing = built.pricing;
      item.config = {
        variantId: new Types.ObjectId(String(variantId)),
        deliveryOption: deliveryOption as DeliveryOption,
      } as any;
      item.priceSnapshot = pricing.unitTotal;
    }

    if (checked !== undefined) item.checked = Boolean(checked);

    await item.save();
    ok(res, { item: cartItemToDto(item, pricing) });
  } catch (err) {
    handleInternalError(res, err, "[cart] updateCartItem error");
  }
};

// ── DELETE /api/cart/items/:id ────────────────────────────────────────────────
export const deleteCartItem = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const cart = await getOrCreateCart(req);
    const item = await CartItem.findOneAndDelete({ _id: id, cartId: cart._id });
    if (!item) {
      sendError(
        res,
        ErrorCode.CART_ITEM_NOT_FOUND,
        "Không tìm thấy sản phẩm trong giỏ"
      );
      return;
    }
    noContent(res);
  } catch (err) {
    handleInternalError(res, err, "[cart] deleteCartItem error");
  }
};

// ── DELETE /api/cart/clear (and DELETE /api/cart) ─────────────────────────────
export const clearCart = async (req: Request, res: Response): Promise<void> => {
  try {
    const cart = await getOrCreateCart(req);
    if (cart) {
      await CartItem.deleteMany({ cartId: cart._id });
    }
    ok(res, { success: true });
  } catch (err) {
    handleInternalError(res, err, "[cart] clearCart error");
  }
};

// ── POST /api/cart/merge (Logged-in Buyer) ────────────────────────────────────
export const mergeCart = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { guestSessionId } = req.body as {
      guestSessionId?: string;
    };

    let userCart = await Cart.findOne({ userId });
    if (!userCart) {
      userCart = await Cart.create({ userId });
    }

    if (
      guestSessionId &&
      typeof guestSessionId === "string" &&
      guestSessionId.trim()
    ) {
      const guestCart = await Cart.findOne({
        sessionId: guestSessionId.trim(),
      });
      if (guestCart && String(guestCart._id) !== String(userCart._id)) {
        const guestItems = await CartItem.find({ cartId: guestCart._id });
        for (const gItem of guestItems) {
          const cfg = gItem.config as any;
          const existing = await CartItem.findOne({
            cartId: userCart._id,
            "config.variantId": cfg.variantId,
            "config.deliveryOption": cfg.deliveryOption,
          });
          if (existing) {
            existing.quantity += gItem.quantity;
            await existing.save();
          } else {
            gItem.cartId = userCart._id as Types.ObjectId;
            await gItem.save();
          }
        }
        await Cart.deleteOne({ _id: guestCart._id });
      }
    }

    const items = await CartItem.find({ cartId: userCart._id }).sort({
      createdAt: -1,
    });
    const responseItems: any[] = [];
    for (const item of items) {
      try {
        const config = item.config as any;
        const { pricing } = await buildPricedDesign({
          variantId: String(config.variantId),
          deliveryOption: config.deliveryOption,
        });
        responseItems.push(cartItemToDto(item, pricing));
      } catch {
        responseItems.push(cartItemToDto(item, null));
      }
    }

    ok(res, {
      cart: cartToDto(userCart),
      items: responseItems,
    });
  } catch (err) {
    handleInternalError(res, err, "[cart] mergeCart error");
  }
};
