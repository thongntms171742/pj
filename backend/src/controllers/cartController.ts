import { Request, Response } from "express";
import { Types, HydratedDocument } from "mongoose";
import { Cart, ICart } from "../models/Cart";
import { CartItem } from "../models/CartItem";
import { Design } from "../models/Design";
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

// ── Helpers: Customizer frozen snapshot ─────────────────────────────────────
// CartItem lưu bản đóng băng placements + version lúc thêm vào giỏ. Sửa
// Design sau đó không đổi item cũ — GET /cart báo designStale để FE cảnh báo.
async function pricingInputFromConfig(config: any): Promise<{
  variantId: string;
  deliveryOption: DeliveryOption;
  accessories?: Array<{ accessoryId: string; quantity: number }>;
}> {
  const base = {
    variantId: String(config.variantId),
    deliveryOption: config.deliveryOption as DeliveryOption,
  };
  const frozen = config?.frozenConfig;
  if (!frozen || !Array.isArray(frozen.placements) || frozen.placements.length === 0) {
    return base;
  }
  const countByAcc = new Map<string, number>();
  for (const p of frozen.placements) {
    const id = String(p.accessoryId);
    countByAcc.set(id, (countByAcc.get(id) ?? 0) + 1);
  }
  return {
    ...base,
    accessories: [...countByAcc.entries()].map(([accessoryId, quantity]) => ({
      accessoryId,
      quantity,
    })),
  };
}

async function isDesignStale(config: any): Promise<boolean> {
  try {
    if (!config?.designId || !config?.frozenConfig) return false;
    const design = await Design.findById(config.designId).lean();
    if (!design) return true;
    const current = (design as any).configuration;
    if (!current) return true;
    return (
      Number(current.configVersion) !== Number(config.frozenConfig.configVersion) ||
      Number(current.slotMapVersion) !== Number(config.frozenConfig.slotMapVersion)
    );
  } catch {
    return false;
  }
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
        const pricingInput = await pricingInputFromConfig(config);
        const { pricing } = await buildPricedDesign(pricingInput);
        const stale = await isDesignStale(config);
        responseItems.push(cartItemToDto(item, pricing, stale ? { designStale: true } : undefined));
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
// Body: { variantId, deliveryOption, quantity?, designId? }
// - Không designId: cây trơn (flow cũ).
// - Có designId: đóng băng configuration hiện tại của Design vào frozenConfig,
//   tính giá kèm phụ kiện. Mỗi lần thêm là 1 dòng riêng (không gộp).
export const addCartItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const { variantId, deliveryOption, quantity, designId } = req.body as {
      variantId?: string;
      deliveryOption?: string;
      quantity?: number;
      designId?: string;
    };

    if (!variantId || !deliveryOption) {
      sendError(
        res,
        ErrorCode.MISSING_FIELD,
        "Cần cung cấp `variantId` và `deliveryOption`"
      );
      return;
    }

    // ── Nếu có designId: load + đóng băng configuration ──
    let frozenConfig: any = undefined;
    let pricingAccessories: Array<{ accessoryId: string; quantity: number }> | undefined;
    if (designId) {
      if (!Types.ObjectId.isValid(String(designId))) {
        sendError(res, ErrorCode.DESIGN_NOT_FOUND, "Không tìm thấy thiết kế");
        return;
      }
      const design = await Design.findById(designId).lean();
      if (!design) {
        sendError(res, ErrorCode.DESIGN_NOT_FOUND, "Không tìm thấy thiết kế");
        return;
      }
      if (String((design as any).treeVariantId) !== String(variantId)) {
        sendError(res, ErrorCode.INVALID_INPUT, "Thiết kế không thuộc biến thể này");
        return;
      }
      const cfg = (design as any).configuration;
      if (!cfg || !Array.isArray(cfg.placements) || cfg.placements.length === 0) {
        sendError(res, ErrorCode.INVALID_INPUT, "Thiết kế chưa có cấu hình trang trí");
        return;
      }
      frozenConfig = {
        configVersion: cfg.configVersion,
        slotMapVersion: cfg.slotMapVersion,
        placements: cfg.placements.map((p: any) => ({
          slotId: String(p.slotId),
          accessoryId: new Types.ObjectId(String(p.accessoryId)),
          x: Number(p.x),
          y: Number(p.y),
          rotation: p.rotation ?? 0,
          scale: p.scale ?? 1,
        })),
      };
      const countByAcc = new Map<string, number>();
      for (const p of cfg.placements) {
        const id = String(p.accessoryId);
        countByAcc.set(id, (countByAcc.get(id) ?? 0) + 1);
      }
      pricingAccessories = [...countByAcc.entries()].map(([accessoryId, qty]) => ({
        accessoryId,
        quantity: qty,
      }));
    }

    const built = await safelyBuildPricedDesign(res, {
      variantId: String(variantId),
      deliveryOption: deliveryOption as DeliveryOption,
      ...(pricingAccessories ? { accessories: pricingAccessories } : {}),
    });
    if (!built) return;
    const pricing = built.pricing;

    const cart = await getOrCreateCart(req);
    const qty = Math.max(1, parseInt(String(quantity ?? 1), 10) || 1);

    // Hàng tùy chỉnh luôn tách dòng riêng (frozen snapshot bất biến).
    // Hàng trơn vẫn gộp như cũ.
    let item;
    if (frozenConfig) {
      item = await CartItem.create({
        cartId: cart._id,
        config: {
          variantId: new Types.ObjectId(String(variantId)),
          deliveryOption: deliveryOption as DeliveryOption,
          designId: new Types.ObjectId(String(designId)),
          frozenConfig,
        } as any,
        quantity: qty,
        priceSnapshot: pricing.unitTotal,
        checked: false,
      });
    } else {
      const existingItems = await CartItem.find({ cartId: cart._id });
      const match = existingItems.find((existing) => {
        const cfg = existing.config as any;
        return (
          String(cfg.variantId) === String(variantId) &&
          cfg.deliveryOption === deliveryOption &&
          !cfg.designId
        );
      });
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
    let stale = false;
    if (variantId && deliveryOption) {
      const cfg = item.config as any;
      const frozen = cfg?.frozenConfig;
      let accessories: Array<{ accessoryId: string; quantity: number }> | undefined;
      if (frozen && Array.isArray(frozen.placements) && frozen.placements.length > 0) {
        const countByAcc = new Map<string, number>();
        for (const p of frozen.placements) {
          const id = String((p as any).accessoryId);
          countByAcc.set(id, (countByAcc.get(id) ?? 0) + 1);
        }
        accessories = [...countByAcc.entries()].map(([accessoryId, quantity]) => ({
          accessoryId,
          quantity,
        }));
      }
      const built = await safelyBuildPricedDesign(res, {
        variantId: String(variantId),
        deliveryOption: deliveryOption as DeliveryOption,
        ...(accessories ? { accessories } : {}),
      });
      if (!built) return;
      pricing = built.pricing;
      item.config = {
        ...cfg,
        variantId: new Types.ObjectId(String(variantId)),
        deliveryOption: deliveryOption as DeliveryOption,
      } as any;
      item.priceSnapshot = pricing.unitTotal;
    } else {
      const cfg = item.config as any;
      stale = await isDesignStale(cfg);
    }

    if (checked !== undefined) item.checked = Boolean(checked);

    await item.save();
    const cfgAfter = item.config as any;
    const staleAfter = stale || (await isDesignStale(cfgAfter));
    ok(res, { item: cartItemToDto(item, pricing, staleAfter ? { designStale: true } : undefined) });
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
          // Hàng tùy chỉnh (có designId/frozen) luôn tách dòng riêng — không gộp.
          if (cfg?.designId || cfg?.frozenConfig) {
            gItem.cartId = userCart._id as Types.ObjectId;
            await gItem.save();
            continue;
          }
          const existing = await CartItem.findOne({
            cartId: userCart._id,
            "config.variantId": cfg.variantId,
            "config.deliveryOption": cfg.deliveryOption,
            "config.designId": { $exists: false },
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
        const pricingInput = await pricingInputFromConfig(config);
        const { pricing } = await buildPricedDesign(pricingInput);
        const stale = await isDesignStale(config);
        responseItems.push(
          cartItemToDto(item, pricing, stale ? { designStale: true } : undefined)
        );
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
