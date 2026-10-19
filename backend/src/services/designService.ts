import { Tree, type ITree } from "../models/Tree";
import { Design, type IRoomDesign } from "../models/Design";
import type { DeliveryOption } from "../config/business";

// ── roomDesignService ────────────────────────────────────────────────────────
// Resolve RoomDesign → Tree variant. Output là RoomDesignResponse cho FE.
//
// Sau refactor: RoomDesign chỉ để xem preview ảnh AI ghép cây vào phòng —
// KHÔNG còn quote giá ở bước này (giờ /cart đảm nhận). Nên resolve chỉ cần
// load variant, không cần build pricing.

export interface RoomDesignLean {
  _id: unknown;
  ownerId: unknown;
  name: string;
  slug: string;
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
}

// ── Resolve RoomDesign → Tree variant ────────────────────────────────────────
export async function resolveRoomDesign(
  design: IRoomDesign | RoomDesignLean
): Promise<ResolvedRoomDesign> {
  const variant = await Tree.findById(design.treeVariantId).lean();
  return {
    design,
    variant: variant as ITree | null,
  };
}

// ── Map RoomDesign → FE-facing shape ────────────────────────────────────────
export interface RoomDesignResponse {
  id: string;
  ownerId: string | null;
  name: string;
  slug: string;
  treeVariantId: string;
  prompt: string;
  roomImageUrl: string;
  resultImageUrl: string;
  status: string;
  deliveryOption: string;
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
    slug: string;
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
    slug: d.slug,
    treeVariantId: String(d.treeVariantId),
    prompt: d.prompt,
    roomImageUrl: d.roomImageUrl,
    resultImageUrl: d.resultImageUrl,
    status: d.status,
    deliveryOption: d.deliveryOption,
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