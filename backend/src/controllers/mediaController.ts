import { Request, Response } from "express";
import { MediaAsset, type MediaPlacement } from "../models/MediaAsset";
import { ah } from "../utils/asyncRoute";
import { ok } from "../utils/respond";
import { getVideoPosterUrl } from "../services/cloudinaryService";

// ── Public media endpoints ───────────────────────────────────────────────────
// FE (web + mobile) đọc media từ đây. Chỉ trả asset `isActive: true`.

const VALID_PLACEMENTS: MediaPlacement[] = [
  "HERO_BACKGROUND",
  "STORY_FEED",
  "MUSIC_TRACK",
  "PROMO",
];

function isValidPlacement(value: string): value is MediaPlacement {
  return (VALID_PLACEMENTS as string[]).includes(value);
}

/**
 * Bổ sung posterUrl cho asset VIDEO còn thiếu (asset upload trước khi có
 * tính năng auto-poster). Cloudinary trích frame đầu tiên on-the-fly nên
 * không cần lưu ảnh riêng — chỉ cần trả URL về cho FE/Mobile.
 */
function withPoster<T extends { kind?: string; posterUrl?: string; publicId?: string }>(
  asset: T | null
): (T & { posterUrl: string }) | null {
  if (!asset) return null;
  if (asset.kind === "VIDEO" && !asset.posterUrl && asset.publicId && !asset.publicId.includes("://")) {
    try {
      return { ...asset, posterUrl: getVideoPosterUrl(asset.publicId) };
    } catch {
      return { ...asset, posterUrl: asset.posterUrl ?? "" };
    }
  }
  return { ...asset, posterUrl: asset.posterUrl ?? "" };
}

/**
 * GET /api/media?placement=STORY_FEED&limit=20
 * Trả về danh sách asset active, sắp xếp theo sortOrder.
 */
export const listMedia = ah(async (req: Request, res: Response) => {
  const { placement, limit } = req.query;

  const query: Record<string, unknown> = { isActive: true };

  if (typeof placement === "string" && placement.trim()) {
    if (!isValidPlacement(placement.trim())) {
      // Placement lạ → trả rỗng thay vì 500, FE vẫn render được.
      ok(res, { assets: [] });
      return;
    }
    query.placement = placement.trim();
  }

  const parsedLimit = parseInt(String(limit || "20"), 10);
  const safeLimit = Number.isFinite(parsedLimit)
    ? Math.min(50, Math.max(1, parsedLimit))
    : 20;

  const assets = await MediaAsset.find(query)
    .sort({ sortOrder: 1, createdAt: -1 })
    .limit(safeLimit)
    .lean();

  ok(res, { assets: assets.map((a) => withPoster(a)) });
});

/**
 * GET /api/media/hero
 * Trả asset HERO_BACKGROUND active đầu tiên (kèm fallback về PROMO).
 */
export const getHeroMedia = ah(async (_req: Request, res: Response) => {
  const asset =
    (await MediaAsset.findOne({ isActive: true, placement: "HERO_BACKGROUND" })
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean()) ||
    (await MediaAsset.findOne({ isActive: true, placement: "PROMO" })
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean()) ||
    null;

  ok(res, { asset: withPoster(asset) });
});

/**
 * GET /api/media/background-music
 * Trả nhạc nền active đầu tiên (placement MUSIC_TRACK).
 */
export const getBackgroundMusic = ah(async (_req: Request, res: Response) => {
  const asset = await MediaAsset.findOne({
    isActive: true,
    placement: "MUSIC_TRACK",
    kind: "AUDIO",
  })
    .sort({ sortOrder: 1, createdAt: -1 })
    .lean();

  ok(res, { asset: withPoster(asset || null) });
});
