import { Types } from "mongoose";
import { TreeDesign } from "../models/TreeDesign";
import { buildPricedDesign } from "./catalogService";
import { type PriceBreakdown } from "./pricingService";
import type { ITreeDesign, DesignConfig } from "../models/TreeDesign";

// ── designService ────────────────────────────────────────────────────────────
// Service-level helpers for the design resource. Controllers call into these
// instead of inlining Mongoose + pricing logic.

export interface DesignWithPricing {
  design: ITreeDesign | DesignLean;
  pricing: PriceBreakdown;
}

// Lean-friendly shape returned by .lean()
export type DesignLean = {
  _id: unknown;
  ownerId: unknown;
  name: string;
  slug: string;
  year: number;
  config: DesignConfig;
  isPublic: boolean;
  isPreset: boolean;
  previewImage: string;
  duplicatedFrom: unknown;
  createdAt?: Date;
  updatedAt?: Date;
};

// ── Load a design document and recompute its pricing from the live catalog ──
export async function loadCatalogForDesign(
  design: ITreeDesign | DesignLean
): Promise<DesignWithPricing> {
  const { pricing } = await buildPricedDesign(design.config);
  return { design, pricing };
}

// ── Map a Design + Pricing into the FE-facing shape ─────────────────────────
// The shape is shared across /catalog/presets, /designs/mine, /designs/:id,
// /designs/share/:slug, /cart items, /orders items — keep it stable.
export interface DesignResponse {
  id: string;
  ownerId: string | null;
  name: string;
  slug: string;
  year: number;
  config: DesignConfig;
  isPublic: boolean;
  isPreset: boolean;
  previewImage: string;
  duplicatedFrom: string | null;
  shareUrl: string;
  pricing: PriceBreakdown;
  createdAt: string;
  updatedAt: string;
}

export function buildDesignResponse(
  design: ITreeDesign | DesignLean,
  pricing: PriceBreakdown
): DesignResponse {
  const get = (k: string): unknown => (design as unknown as Record<string, unknown>)[k];
  return {
    id: String(design._id),
    ownerId: design.ownerId ? String(design.ownerId) : null,
    name: design.name,
    slug: design.slug,
    year: design.year,
    config: design.config,
    isPublic: design.isPublic,
    isPreset: design.isPreset,
    previewImage: design.previewImage,
    duplicatedFrom: design.duplicatedFrom ? String(design.duplicatedFrom) : null,
    shareUrl: `/tree/${design.slug}`,
    pricing,
    createdAt: get("createdAt")
      ? new Date(get("createdAt") as Date | string).toISOString()
      : new Date().toISOString(),
    updatedAt: get("updatedAt")
      ? new Date(get("updatedAt") as Date | string).toISOString()
      : new Date().toISOString(),
  };
}

// ── Slug generator: human-readable + 4-char random tag for uniqueness ────────
// Example: "minh-christmas-2026-x7k2"
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
    const exists = await TreeDesign.exists({ slug: candidate });
    if (!exists) return candidate;
  }
  return `${generateDesignSlug(name)}-${Date.now().toString().slice(-4)}`;
}