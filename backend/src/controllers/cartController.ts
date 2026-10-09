import { Request, Response } from "express";
import { Types } from "mongoose";
import { Cart } from "../models/Cart";
import { CartItem } from "../models/CartItem";
import {
  safelyBuildPricedDesign,
  loadConfigByDesignId,
  buildPricedDesign,
} from "../services/catalogService";
import { buildDesignResponse } from "../services/designService";
import { TreeDesign } from "../models/TreeDesign";
import type { DesignConfig } from "../models/TreeDesign";
import type { PriceBreakdown } from "../services/pricingService";
import {
  sendError,
  ErrorCode,
  handleInternalError,
} from "../utils/errors";

// Helper to determine whether request is authenticated or guest
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

async function getOrCreateCart(req: Request) {
  const { userId, sessionId } = extractCartIdentifier(req);
  if (userId) {
    let cart = await Cart.findOne({ userId });
    if (!cart) cart = await Cart.create({ userId });
    return cart;
  }
  const effectiveSessionId =
    sessionId || `guest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  let cart = await Cart.findOne({ sessionId: effectiveSessionId });
  if (!cart) cart = await Cart.create({ sessionId: effectiveSessionId });
  return cart;
}

// ── Helper: shape a cart item response ──────────────────────────────────────
function shapeItem(item: any, pricing: PriceBreakdown | null, design: any = null) {
  return {
    _id: String(item._id),
    cartId: String(item.cartId),
    designId: item.designId ? String(item.designId) : null,
    quantity: item.quantity,
    priceSnapshot: item.priceSnapshot,
    currentUnitTotal: pricing ? pricing.unitTotal : null,
    priceChanged: pricing ? item.priceSnapshot !== pricing.unitTotal : true,
    checked: item.checked,
    config: item.config,
    design: design ? buildDesignResponse(design, pricing!) : null,
    warning: pricing
      ? undefined
      : "Cấu hình không còn hợp lệ với catalog hiện tại",
  };
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
        const { pricing } = await buildPricedDesign(
          item.config as DesignConfig
        );
        let designDoc = null;
        if (item.designId) {
          designDoc = await TreeDesign.findById(item.designId).lean();
        }
        responseItems.push(shapeItem(item, pricing, designDoc));
      } catch {
        responseItems.push(shapeItem(item, null));
      }
    }

    res.json({
      cart: {
        _id: String(cart._id),
        sessionId: cart.sessionId || undefined,
      },
      items: responseItems,
    });
  } catch (err) {
    handleInternalError(res, err, "[cart] getCart error");
  }
};

// ── POST /api/cart/items ──────────────────────────────────────────────────────
export const addCartItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const { config, designId, quantity } = req.body as {
      config?: DesignConfig;
      designId?: string;
      quantity?: number;
    };

    if (!config && !designId) {
      sendError(
        res,
        ErrorCode.MISSING_FIELD,
        "Cần cung cấp `config` hoặc `designId`"
      );
      return;
    }

    let resolvedConfig: DesignConfig | null = config ?? null;
    if (!resolvedConfig && designId) {
      resolvedConfig = await loadConfigByDesignId(designId);
      if (!resolvedConfig) {
        sendError(res, ErrorCode.DESIGN_NOT_FOUND, "Không tìm thấy thiết kế");
        return;
      }
    }
    if (!resolvedConfig) {
      sendError(res, ErrorCode.DESIGN_CONFIG_INVALID, "Không thể phân giải config");
      return;
    }

    const built = await safelyBuildPricedDesign(res, resolvedConfig);
    if (!built) return;
    const pricing = built.pricing;

    let persistedDesignId: Types.ObjectId | null = null;
    if (designId && Types.ObjectId.isValid(designId)) {
      const source = await TreeDesign.findById(designId).lean();
      const isOwner =
        req.user?.id && source?.ownerId && String(source.ownerId) === req.user.id;
      if (source && (source.isPublic || isOwner)) {
        persistedDesignId = source._id;
      }
    }

    const cart = await getOrCreateCart(req);
    const qty = Math.max(1, parseInt(String(quantity ?? 1), 10) || 1);

    const item = await CartItem.create({
      cartId: cart._id,
      designId: persistedDesignId,
      config: resolvedConfig,
      quantity: qty,
      priceSnapshot: pricing.unitTotal,
      checked: false,
    });

    res.status(201).json({
      item: shapeItem(item, pricing),
      cart: {
        _id: String(cart._id),
        sessionId: cart.sessionId || undefined,
      },
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
      sendError(res, ErrorCode.CART_ITEM_NOT_FOUND, "Không tìm thấy sản phẩm trong giỏ");
      return;
    }

    const { quantity, checked, config } = req.body as {
      quantity?: number;
      checked?: boolean;
      config?: DesignConfig;
    };

    if (quantity !== undefined) {
      const n = parseInt(String(quantity), 10);
      if (!Number.isFinite(n) || n < 1) {
        sendError(res, ErrorCode.INVALID_INPUT, "Số lượng phải >= 1");
        return;
      }
      item.quantity = n;
    }

    let pricing: PriceBreakdown | null = null;
    if (config) {
      const built = await safelyBuildPricedDesign(res, config);
      if (!built) return;
      pricing = built.pricing;
      item.config = config;
      item.priceSnapshot = pricing.unitTotal;
    }

    if (checked !== undefined) item.checked = Boolean(checked);

    await item.save();
    res.json({ item: shapeItem(item, pricing) });
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
      sendError(res, ErrorCode.CART_ITEM_NOT_FOUND, "Không tìm thấy sản phẩm trong giỏ");
      return;
    }
    res.status(204).send();
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
    res.json({ success: true });
  } catch (err) {
    handleInternalError(res, err, "[cart] clearCart error");
  }
};

// ── POST /api/cart/merge (Logged-in Buyer) ────────────────────────────────────
// Merge guest session cart into authenticated user cart
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

    if (guestSessionId && typeof guestSessionId === "string" && guestSessionId.trim()) {
      const guestCart = await Cart.findOne({ sessionId: guestSessionId.trim() });
      if (guestCart && String(guestCart._id) !== String(userCart._id)) {
        const guestItems = await CartItem.find({ cartId: guestCart._id });
        for (const gItem of guestItems) {
          // Check matching variant and style
          const existing = await CartItem.findOne({
            cartId: userCart._id,
            "config.variantId": gItem.config.variantId,
            "config.styleId": gItem.config.styleId,
            "config.deliveryOption": gItem.config.deliveryOption,
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

    const items = await CartItem.find({ cartId: userCart._id }).sort({ createdAt: -1 });
    const responseItems: any[] = [];
    for (const item of items) {
      try {
        const { pricing } = await buildPricedDesign(item.config as DesignConfig);
        let designDoc = null;
        if (item.designId) {
          designDoc = await TreeDesign.findById(item.designId).lean();
        }
        responseItems.push(shapeItem(item, pricing, designDoc));
      } catch {
        responseItems.push(shapeItem(item, null));
      }
    }

    res.json({
      cart: { _id: String(userCart._id) },
      items: responseItems,
    });
  } catch (err) {
    handleInternalError(res, err, "[cart] mergeCart error");
  }
};