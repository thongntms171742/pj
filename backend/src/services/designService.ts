import { TreeProduct, ITreeProduct } from "../models/TreeProduct";
import { TreeCode } from "../models/TreeCode";
import { Tree } from "../models/Tree";
import { Design, IDesign, DesignPricingSnapshot } from "../models/Design";
import { buildPricedDesign, loadCatalogForPricingInput } from "./catalogService";
import {
  type PriceBreakdown,
  type CatalogSnapshot,
  type PricingInput,
} from "./pricingService";

// ── designService ────────────────────────────────────────────────────────────
// Sau refactor: Design gộp TreeDesign + AIDesign cũ, chỉ giữ:
//   - ownerId, name, slug, year
//   - baseTreeProductId (ref TreeProduct concept hoàn chỉnh)
//   - prompt (text khách viết)
//   - imageUrl / imagePublicId / previewImage (output AI)
//   - status (DRAFT / AI_PENDING / AI_COMPLETED / CONFIRMED / FAILED)
//   - deliveryOption
//   - pricingSnapshot (cache giá từ Tree variant)
//   - isPublic, duplicatedFrom
// Không còn styleId, accessories array, isPreset.

export interface DesignLean {
  _id: unknown;
  ownerId: unknown;
  name: string;
  slug: string;
  year: number;
  baseTreeProductId: unknown;
  prompt: string;
  imageUrl: string;
  imagePublicId: string;
  status: string;
  pricingSnapshot: DesignPricingSnapshot;
  deliveryOption: string;
  isPublic: boolean;
  duplicatedFrom: unknown;
  previewImage: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ResolvedDesign {
  design: IDesign | DesignLean;
  product: ITreeProduct | null;
  variant: { _id: string; size: string; name: string; price: number; codeId: string; productId: string } | null;
  pricing: PriceBreakdown;
  pricingInput: PricingInput;
}

// ── Resolve Design → TreeProduct + (optional) variant + pricing ──────────────
export async function resolveDesign(
  design: IDesign | DesignLean,
  opts?: { variantIdOverride?: string }
): Promise<ResolvedDesign> {
  const product = await TreeProduct.findById(design.baseTreeProductId).lean();

  // Nếu FE chỉ định 1 variant cụ thể (Tree SKU), dùng variant đó. Ngược lại
  // lấy variant đầu tiên active của product (để có size/giá).
  let variantDoc = null;
  if (opts?.variantIdOverride && String(opts.variantIdOverride).length > 0) {
    variantDoc = await Tree.findById(opts.variantIdOverride).lean();
  }
  if (!variantDoc && product) {
    const code = await TreeCode.findOne({ productId: product._id, isActive: true })
      .sort({ sortOrder: 1 })
      .lean();
    if (code) {
      variantDoc = await Tree.findOne({ codeId: code._id, isActive: true })
        .sort({ sortOrder: 1, size: 1 })
        .lean();
    }
  }

  const pricingInput: PricingInput = {
    variantId: variantDoc ? String(variantDoc._id) : "",
    deliveryOption: (design.deliveryOption as PricingInput["deliveryOption"]) || "READY_TO_DISPLAY",
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
  let catalog: CatalogSnapshot | null = null;

  if (pricingInput.variantId) {
    const built = await buildPricedDesign(pricingInput);
    catalog = built.catalog;
    pricing = built.pricing;
  }

  return {
    design,
    product: product as ITreeProduct | null,
    variant: variantDoc
      ? {
          _id: String(variantDoc._id),
          size: variantDoc.size,
          name: variantDoc.name,
          price: variantDoc.price,
          codeId: String(variantDoc.codeId),
          productId: String(variantDoc.productId),
        }
      : null,
    pricing,
    pricingInput,
  };
}

// ── Map a Design + Pricing into the FE-facing shape ──────────────────────────
export interface DesignResponse {
  id: string;
  ownerId: string | null;
  name: string;
  slug: string;
  year: number;
  baseTreeProductId: string;
  prompt: string;
  imageUrl: string;
  status: string;
  deliveryOption: string;
  isPublic: boolean;
  duplicatedFrom: string | null;
  shareUrl: string;
  pricing: PriceBreakdown;
  product: {
    _id: string;
    name: string;
    slug: string;
    description: string;
    coverImage: string;
  } | null;
  variant: {
    _id: string;
    size: string;
    name: string;
    price: number;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export function buildDesignResponse(resolved: ResolvedDesign): DesignResponse {
  const d = resolved.design as unknown as Record<string, unknown> & {
    _id: unknown;
    ownerId?: unknown;
    name: string;
    slug: string;
    year: number;
    baseTreeProductId: unknown;
    prompt: string;
    imageUrl: string;
    status: string;
    deliveryOption: string;
    isPublic: boolean;
    duplicatedFrom?: unknown;
    previewImage: string;
    createdAt?: Date;
    updatedAt?: Date;
  };

  return {
    id: String(d._id),
    ownerId: d.ownerId ? String(d.ownerId) : null,
    name: d.name,
    slug: d.slug,
    year: d.year,
    baseTreeProductId: String(d.baseTreeProductId),
    prompt: d.prompt,
    imageUrl: d.imageUrl,
    status: d.status,
    deliveryOption: d.deliveryOption,
    isPublic: d.isPublic,
    duplicatedFrom: d.duplicatedFrom ? String(d.duplicatedFrom) : null,
    shareUrl: `/tree/${d.slug}`,
    pricing: resolved.pricing,
    product: resolved.product
      ? {
          _id: String(resolved.product._id),
          name: resolved.product.name,
          slug: resolved.product.slug,
          description: resolved.product.description,
          coverImage: resolved.product.coverImage,
        }
      : null,
    variant: resolved.variant
      ? {
          _id: resolved.variant._id,
          size: resolved.variant.size,
          name: resolved.variant.name,
          price: resolved.variant.price,
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

// ── Slug generator: human-readable + 4-char random tag ──────────────────────
export function generateDesignSlug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "christmas";
  const tag = Math.random().toString(36).slice(2, 6);
  return `${base}-${tag}`;
}

export async function findUniqueSlug(name: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const candidate = generateDesignSlug(name);
    // eslint-disable-next-line no-await-in-loop
    const exists = await Design.exists({ slug: candidate });
    if (!exists) return candidate;
  }
  return `${generateDesignSlug(name)}-${Date.now().toString().slice(-4)}`;
}
