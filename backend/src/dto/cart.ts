import { toStr } from "../utils/ids";
import { buildRoomDesignResponse } from "../services/designService";
import type { PriceBreakdown } from "../services/pricingService";
import type { ResolvedRoomDesign } from "../services/designService";

// Re-export để controller import DTO mappers từ 1 chỗ (`dto/design`).
export { buildRoomDesignResponse } from "../services/designService";
export type { RoomDesignResponse } from "../services/designService";

/**
 * Cart item DTO. Sau refactor RoomDesign: bỏ `designId` và `design` field —
 * cart chỉ lưu variantId + deliveryOption. Không còn reference tới Design.
 */
export interface CartItemConfig {
  variantId: string;
  deliveryOption: "READY_TO_DISPLAY" | "DIY_KIT" | "SEPARATE";
}

export interface CartItemDto {
  _id: string;
  cartId: string;
  quantity: number;
  priceSnapshot: number;
  currentUnitTotal: number | null;
  priceChanged: boolean;
  checked: boolean;
  config: CartItemConfig;
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
  pricing: PriceBreakdown | null
): CartItemDto {
  const cfg = item.config || {};
  return {
    _id: toStr(item._id),
    cartId: toStr(item.cartId),
    quantity: item.quantity,
    priceSnapshot: item.priceSnapshot,
    currentUnitTotal: pricing ? pricing.unitTotal : null,
    priceChanged: pricing ? item.priceSnapshot !== pricing.unitTotal : true,
    checked: item.checked,
    config: {
      variantId: toStr(cfg.variantId),
      deliveryOption: cfg.deliveryOption,
    },
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

// Suppress unused exports warning — giữ type re-exports cho controller.
export type { PriceBreakdown, ResolvedRoomDesign };
