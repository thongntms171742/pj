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
  configuration?: unknown;
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
  configuration?: {
    placementMode?: "slots" | "free";
    configVersion: number;
    slotMapVersion: number;
    variantSnapshot: {
      variantId: string;
      sku: string;
      name: string;
      price: number;
    };
    placements: Array<{
      slotId: string;
      accessoryId: string;
      x: number;
      y: number;
      rotation?: number;
      scale?: number;
      /** Snapshot lớp chiều sâu — undefined ⇒ fallback về slot hiện tại. */
      depth?: "behind" | "front";
    }>;
  } | null;
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
    configuration?: {
      configVersion: number;
      slotMapVersion: number;
      variantSnapshot: {
        variantId: unknown;
        sku: string;
        name: string;
        price: number;
      };
      placements: Array<{
        slotId: string;
        accessoryId: unknown;
        x: number;
        y: number;
        rotation?: number;
        scale?: number;
        depth?: "behind" | "front";
      }>;
    } | null;
    createdAt?: Date;
    updatedAt?: Date;
  };

  const cfg = (d as any).configuration as any;
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
    configuration: cfg
      ? {
          placementMode: cfg.placementMode || "slots",
          configVersion: cfg.configVersion,
          slotMapVersion: cfg.slotMapVersion,
          variantSnapshot: {
            variantId: String(cfg.variantSnapshot?.variantId ?? ""),
            sku: cfg.variantSnapshot?.sku ?? "",
            name: cfg.variantSnapshot?.name ?? "",
            price: cfg.variantSnapshot?.price ?? 0,
          },
          placements: (cfg.placements ?? []).map((p: any) => ({
            slotId: String(p.slotId),
            accessoryId: String(p.accessoryId),
            x: Number(p.x),
            y: Number(p.y),
            rotation: p.rotation ?? 0,
            scale: p.scale ?? 1,
            ...(p.depth ? { depth: p.depth } : {}),
          })),
        }
      : null,
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
