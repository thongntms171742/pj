import { Request, Response } from "express";
import {
  MediaAsset,
  type MediaKind,
  type MediaPlacement,
  type MediaLinkType,
} from "../../models/MediaAsset";
import { sendError, ErrorCode } from "../../utils/errors";
import { ah } from "../../utils/asyncRoute";
import { ok, created } from "../../utils/respond";
import { getVideoPosterUrl } from "../../services/cloudinaryService";

// ── Media assets Admin CRUD ──────────────────────────────────────────────────
// Admin upload video/audio lên Cloudinary qua `POST /api/uploads`, rồi tạo
// bản ghi MediaAsset ở đây để FE (web + mobile) đọc.

const VALID_KINDS = ["VIDEO", "AUDIO", "IMAGE"] as const;
const VALID_PLACEMENTS = [
  "HERO_BACKGROUND",
  "STORY_FEED",
  "MUSIC_TRACK",
  "PROMO",
] as const;
const VALID_LINK_TYPES = ["PRODUCT", "CATEGORY", "NONE"] as const;

export const listMediaAssets = ah(async (_req: Request, res: Response) => {
  const assets = await MediaAsset.find({})
    .sort({ placement: 1, sortOrder: 1, createdAt: -1 })
    .lean();
  ok(res, { assets });
});

export const createMediaAsset = ah(async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;

  if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
    sendError(res, ErrorCode.MISSING_FIELD, "Tiêu đề media (title) là bắt buộc");
    return;
  }

  if (!body.url || typeof body.url !== "string" || !body.url.trim()) {
    sendError(res, ErrorCode.MISSING_FIELD, "Đường dẫn media (url) là bắt buộc");
    return;
  }

  let kind: MediaKind = "VIDEO";
  if (VALID_KINDS.includes(body.kind as any)) {
    kind = body.kind as MediaKind;
  }

  let placement: MediaPlacement = "STORY_FEED";
  if (VALID_PLACEMENTS.includes(body.placement as any)) {
    placement = body.placement as MediaPlacement;
  }

  let linkType: MediaLinkType = "NONE";
  if (VALID_LINK_TYPES.includes(body.linkType as any)) {
    linkType = body.linkType as MediaLinkType;
  }

  const url = body.url.trim();
  const publicId =
    typeof body.publicId === "string" ? body.publicId.trim() : "";

  // Video chưa có poster → tự trích frame đầu tiên từ Cloudinary.
  // Nhờ vậy FE/Mobile luôn có thumbnail, không cần admin upload ảnh riêng.
  let posterUrl = typeof body.posterUrl === "string" ? body.posterUrl.trim() : "";
  if (!posterUrl && kind === "VIDEO" && publicId && !publicId.includes("://")) {
    try {
      posterUrl = getVideoPosterUrl(publicId);
    } catch {
      posterUrl = "";
    }
  }

  const asset = await MediaAsset.create({
    kind,
    placement,
    title: body.title.trim(),
    caption: typeof body.caption === "string" ? body.caption.trim() : "",
    url,
    publicId,
    posterUrl,
    format: typeof body.format === "string" ? body.format.trim() : "",
    size: typeof body.size === "number" ? body.size : 0,
    duration: typeof body.duration === "number" ? body.duration : 0,
    ctaLabel: typeof body.ctaLabel === "string" ? body.ctaLabel.trim() : "",
    ctaLink: typeof body.ctaLink === "string" ? body.ctaLink.trim() : "",
    linkType,
    linkId: typeof body.linkId === "string" ? body.linkId.trim() : "",
    musicArtist: typeof body.musicArtist === "string" ? body.musicArtist.trim() : "",
    isLoop: typeof body.isLoop === "boolean" ? body.isLoop : true,
    volume:
      typeof body.volume === "number"
        ? Math.min(100, Math.max(0, body.volume))
        : 40,
    isActive: typeof body.isActive === "boolean" ? body.isActive : true,
    sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : 0,
  });

  created(res, { asset });
});

export const updateMediaAsset = ah(async (req: Request, res: Response) => {
  const { id } = req.params;
  const asset = await MediaAsset.findById(id);

  if (!asset) {
    sendError(res, ErrorCode.NOT_FOUND, "Không tìm thấy media asset");
    return;
  }

  const body = req.body as Record<string, unknown>;

  if (typeof body.title === "string") asset.title = body.title.trim();
  if (typeof body.caption === "string") asset.caption = body.caption.trim();
  if (typeof body.url === "string" && body.url.trim()) asset.url = body.url.trim();
  if (typeof body.publicId === "string") asset.publicId = body.publicId.trim();
  if (typeof body.posterUrl === "string") asset.posterUrl = body.posterUrl.trim();
  if (typeof body.format === "string") asset.format = body.format.trim();
  if (typeof body.size === "number") asset.size = body.size;
  if (typeof body.duration === "number") asset.duration = body.duration;
  if (typeof body.ctaLabel === "string") asset.ctaLabel = body.ctaLabel.trim();
  if (typeof body.ctaLink === "string") asset.ctaLink = body.ctaLink.trim();
  if (typeof body.linkId === "string") asset.linkId = body.linkId.trim();
  if (typeof body.musicArtist === "string")
    asset.musicArtist = body.musicArtist.trim();
  if (typeof body.isLoop === "boolean") asset.isLoop = body.isLoop;
  if (typeof body.volume === "number")
    asset.volume = Math.min(100, Math.max(0, body.volume));
  if (typeof body.isActive === "boolean") asset.isActive = body.isActive;
  if (typeof body.sortOrder === "number") asset.sortOrder = body.sortOrder;
  if (VALID_KINDS.includes(body.kind as any)) {
    asset.kind = body.kind as MediaKind;
  }
  if (VALID_PLACEMENTS.includes(body.placement as any)) {
    asset.placement = body.placement as MediaPlacement;
  }
  if (VALID_LINK_TYPES.includes(body.linkType as any)) {
    asset.linkType = body.linkType as MediaLinkType;
  }

  // Video chưa có poster → tự trích frame đầu tiên từ Cloudinary.
  if (
    asset.kind === "VIDEO" &&
    !asset.posterUrl &&
    asset.publicId &&
    !asset.publicId.includes("://")
  ) {
    try {
      asset.posterUrl = getVideoPosterUrl(asset.publicId);
    } catch {
      // Giữ posterUrl rỗng — FE sẽ fallback sang ảnh mặc định.
    }
  }

  await asset.save();
  ok(res, { asset });
});

export const deleteMediaAsset = ah(async (req: Request, res: Response) => {
  const { id } = req.params;
  const asset = await MediaAsset.findById(id);

  if (!asset) {
    sendError(res, ErrorCode.NOT_FOUND, "Không tìm thấy media asset");
    return;
  }

  await MediaAsset.findByIdAndDelete(id);
  ok(res, { success: true, assetId: id });
});
