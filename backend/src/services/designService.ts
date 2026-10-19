import { Tree, type ITree } from "../models/Tree";
import { Design, type IRoomDesign } from "../models/Design";
import { buildPricedDesign } from "./catalogService";
import {
  type PriceBreakdown,
  type PricingInput,
} from "./pricingService";
import type { DeliveryOption } from "../config/business";

// ── roomDesignService ────────────────────────────────────────────────────────
// Resolve RoomDesign → Tree variant + pricing. Output là RoomDesignResponse
// cho FE.

export interface RoomDesignLean {
  _id: unknown;
  ownerId: unknown;
  name: string;
  treeVariantId: unknown;
  prompt: string;
  roomImageUrl: string;
  roomImagePublicId: string;
  resultImageUrl: string;
  resultImagePublicId: string;
  status: string;
  deliveryOption: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ResolvedRoomDesign {
  design: IRoomDesign | RoomDesignLean;
  variant: ITree | null;
  pricing: PriceBreakdown;
  pricingInput: PricingInput;
}

// ── Resolve RoomDesign → Tree variant + pricing ──────────────────────────────
export async function resolveRoomDesign(
  design: IRoomDesign | RoomDesignLean
): Promise<ResolvedRoomDesign> {
  const variant = await Tree.findById(design.treeVariantId).lean();

  const pricingInput: PricingInput = {
    variantId: variant ? String(variant._id) : "",
    deliveryOption:
      (design.deliveryOption as DeliveryOption) || "READY_TO_DISPLAY",
  };

  let pricing: PriceBreakdown = {
    tree: { id: "", name: "", size: "" as never, unitPrice: 0 },
    decorationFee: 0,
    shippingFee: 20_000,
    unitTotal: 20_000,
    productionDays: 0,
    hasPersonalization: false,
    hasService: false,
    warnings: [],
  };

  if (pricingInput.variantId) {
    const built = await buildPricedDesign(pricingInput);
    pricing = built.pricing;
  }

  return {
    design,
    variant: variant as ITree | null,
    pricing,
    pricingInput,
  };
}

// ── Map RoomDesign → FE-facing shape ────────────────────────────────────────
export interface RoomDesignResponse {
  id: string;
  ownerId: string | null;
  name: string;
  treeVariantId: string;
  prompt: string;
  roomImageUrl: string;
  resultImageUrl: string;
  status: string;
  deliveryOption: string;
  pricing: PriceBreakdown;
  variant: {
    _id: string;
    name: string;
    size: string;
    price: number;
    bareImage: string;
    sku: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export function buildRoomDesignResponse(
  resolved: ResolvedRoomDesign
): RoomDesignResponse {
  const d = resolved.design as unknown as Record<string, unknown> & {
    _id: unknown;
    ownerId?: unknown;
    name: string;
    treeVariantId: unknown;
    prompt: string;
    roomImageUrl: string;
    resultImageUrl: string;
    status: string;
    deliveryOption: string;
    createdAt?: Date;
    updatedAt?: Date;
  };

  return {
    id: String(d._id),
    ownerId: d.ownerId ? String(d.ownerId) : null,
    name: d.name,
    treeVariantId: String(d.treeVariantId),
    prompt: d.prompt,
    roomImageUrl: d.roomImageUrl,
    resultImageUrl: d.resultImageUrl,
    status: d.status,
    deliveryOption: d.deliveryOption,
    pricing: resolved.pricing,
    variant: resolved.variant
      ? {
          _id: String(resolved.variant._id),
          name: resolved.variant.name,
          size: resolved.variant.size,
          price: resolved.variant.price,
          bareImage: resolved.variant.bareImage,
          sku: resolved.variant.sku,
        }
      : null,
    createdAt: d.createdAt
      ? new Date(d.createdAt as Date | string).toISOString()
      : new Date().toISOString(),
    updatedAt: d.updatedAt
      ? new Date(d.updatedAt as Date | string).toISOString()
      : new Date().toISOString(),
  };
}
