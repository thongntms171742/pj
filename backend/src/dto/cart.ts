import { toStr } from "../utils/ids";
import { buildDesignResponse } from "../services/designService";
import type { PriceBreakdown } from "../services/pricingService";
import type { DesignConfig } from "../models/TreeDesign";

/**
 * Cart item DTO. This is the single source of truth for what a cart item
 * JSON looks like. Previously this lived in cartController.shapeItem and
 * was duplicated in `getCart` and `mergeCart` (and a near-copy in
 * `addCartItem` / `updateCartItem`).
 */
export interface CartItemDto {
  _id: string;
  cartId: string;
  designId: string | null;
  quantity: number;
  priceSnapshot: number;
  currentUnitTotal: number | null;
  priceChanged: boolean;
  checked: boolean;
  config: DesignConfig;
  design: ReturnType<typeof buildDesignResponse> | null;
  warning?: string;
}

export interface CartDto {
  _id: string;
  sessionId?: string;
}

export interface CartResponse {
  cart: CartDto;
  items: CartItemDto[];
}

/**
 * Shape a single cart item into the FE-facing DTO.
 * If `pricing` is null, the item is "stale" — its config no longer matches
 * the current catalog. We still return it but with a warning.
 */
export function cartItemToDto(
  item: any,
  pricing: PriceBreakdown | null,
  design: any = null
): CartItemDto {
  return {
    _id: toStr(item._id),
    cartId: toStr(item.cartId),
    designId: item.designId ? toStr(item.designId) : null,
    quantity: item.quantity,
    priceSnapshot: item.priceSnapshot,
    currentUnitTotal: pricing ? pricing.unitTotal : null,
    priceChanged: pricing ? item.priceSnapshot !== pricing.unitTotal : true,
    checked: item.checked,
    config: item.config,
    design: design ? buildDesignResponse(design, pricing!) : null,
    ...(pricing
      ? {}
      : { warning: "Cấu hình không còn hợp lệ với catalog hiện tại" }),
  };
}

export function cartToDto(cart: any): CartDto {
  return {
    _id: toStr(cart._id),
    sessionId: cart.sessionId || undefined,
  };
}
