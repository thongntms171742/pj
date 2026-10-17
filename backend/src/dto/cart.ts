import { toStr } from "../utils/ids";
import { buildDesignResponse } from "../services/designService";
import type { PriceBreakdown } from "../services/pricingService";
import type { DesignLean } from "../services/designService";

/**
 * Cart item DTO. Sau refactor: chỉ còn variantId (Tree) + deliveryOption
 * trong config. Không còn styleId, accessories array.
 */
export interface CartItemConfig {
  variantId: string;
  deliveryOption: "READY_TO_DISPLAY" | "DIY_KIT" | "SEPARATE";
}

export interface CartItemDto {
  _id: string;
  cartId: string;
  designId: string | null;
  quantity: number;
  priceSnapshot: number;
  currentUnitTotal: number | null;
  priceChanged: boolean;
  checked: boolean;
  config: CartItemConfig;
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

export function cartItemToDto(
  item: any,
  pricing: PriceBreakdown | null,
  design: any = null
): CartItemDto {
  const cfg = item.config || {};
  return {
    _id: toStr(item._id),
    cartId: toStr(item.cartId),
    designId: item.designId ? toStr(item.designId) : null,
    quantity: item.quantity,
    priceSnapshot: item.priceSnapshot,
    currentUnitTotal: pricing ? pricing.unitTotal : null,
    priceChanged: pricing ? item.priceSnapshot !== pricing.unitTotal : true,
    checked: item.checked,
    config: {
      variantId: toStr(cfg.variantId),
      deliveryOption: cfg.deliveryOption,
    },
    design: design && pricing ? buildDesignResponse(design as any) : null,
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
