import { toStr } from "../utils/ids";
import { buildRoomDesignResponse } from "../services/designService";
import type { PriceBreakdown } from "../services/pricingService";
import type { ResolvedRoomDesign } from "../services/designService";

// Re-export để controller import DTO mappers từ 1 chỗ (`dto/design`).
export { buildRoomDesignResponse } from "../services/designService";
export type { RoomDesignResponse } from "../services/designService";

/**
 * Cart item DTO. Phase Customizer: config có thêm designId + frozenConfig
 * (bản đóng băng placements lúc thêm vào giỏ). Sửa Design sau đó không làm
 * đổi item cũ — checkout preview báo DESIGN_UPDATED nếu lệch version.
 */
export interface CartItemConfig {
  variantId: string;
  deliveryOption: "READY_TO_DISPLAY" | "DIY_KIT" | "SEPARATE";
  designId?: string;
  frozenConfig?: {
    configVersion: number;
    slotMapVersion: number;
    placements: Array<{
      slotId: string;
      accessoryId: string;
      x: number;
      y: number;
      rotation?: number;
      scale?: number;
      /** Snapshot lớp chiều sâu. */
      depth?: "behind" | "front";
    }>;
  } | null;
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
  designStale?: boolean;
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
  opts?: { designStale?: boolean }
): CartItemDto {
  const cfg = item.config || {};
  const frozen = cfg.frozenConfig ?? null;
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
      ...(cfg.designId ? { designId: toStr(cfg.designId) } : {}),
      ...(frozen
        ? {
            frozenConfig: {
              configVersion: frozen.configVersion,
              slotMapVersion: frozen.slotMapVersion,
              placements: (frozen.placements ?? []).map((p: any) => ({
                slotId: String(p.slotId),
                accessoryId: toStr(p.accessoryId),
                x: Number(p.x),
                y: Number(p.y),
                rotation: p.rotation ?? 0,
                scale: p.scale ?? 1,
                ...(p.depth ? { depth: p.depth } : {}),
              })),
            },
          }
        : {}),
    },
    ...(opts?.designStale ? { designStale: true } : {}),
    ...(pricing
      ? opts?.designStale
        ? { warning: "Thiết kế đã được cập nhật — giá có thể thay đổi" }
        : {}
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
