import { Request, Response } from "express";
import { Banner } from "../../models/Banner";
import { sendError, ErrorCode } from "../../utils/errors";
import { ah } from "../../utils/asyncRoute";
import { ok, created } from "../../utils/respond";

// ── Banners Admin CRUD ───────────────────────────────────────────────────────

export const listBanners = ah(async (_req: Request, res: Response) => {
  const banners = await Banner.find({})
    .sort({ sortOrder: 1, createdAt: -1 })
    .lean();
  ok(res, { banners });
});

export const createBanner = ah(async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;

  if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
    sendError(res, ErrorCode.MISSING_FIELD, "Tiêu đề banner (title) là bắt buộc");
    return;
  }

  if (!body.imageUrl || typeof body.imageUrl !== "string" || !body.imageUrl.trim()) {
    sendError(res, ErrorCode.MISSING_FIELD, "Đường dẫn ảnh banner (imageUrl) là bắt buộc");
    return;
  }

  const banner = await Banner.create({
    title: body.title.trim(),
    subtitle: typeof body.subtitle === "string" ? body.subtitle.trim() : "",
    imageUrl: body.imageUrl.trim(),
    linkUrl: typeof body.linkUrl === "string" ? body.linkUrl.trim() : "",
    position: typeof body.position === "string" ? body.position.trim() : "home_hero",
    isActive: typeof body.isActive === "boolean" ? body.isActive : true,
    sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : 0,
    aspectRatio:
      typeof body.aspectRatio === "string" &&
      ["16:9", "9:16", "1:1"].includes(body.aspectRatio)
        ? body.aspectRatio
        : "16:9",
    placement:
      typeof body.placement === "string" &&
      ["HERO_SLIDER", "SIDE_PROMO"].includes(body.placement)
        ? body.placement
        : "HERO_SLIDER",
    ctaLabel: typeof body.ctaLabel === "string" ? body.ctaLabel.trim() : "",
    ctaLink: typeof body.ctaLink === "string" ? body.ctaLink.trim() : "",
    overlayColor:
      typeof body.overlayColor === "string" ? body.overlayColor.trim() : "",
  });

  created(res, { banner });
});

export const updateBanner = ah(async (req: Request, res: Response) => {
  const { id } = req.params;
  const banner = await Banner.findById(id);

  if (!banner) {
    sendError(res, ErrorCode.BANNER_NOT_FOUND, "Không tìm thấy banner");
    return;
  }

  const body = req.body as Record<string, unknown>;

  if (typeof body.title === "string") banner.title = body.title.trim();
  if (typeof body.subtitle === "string") banner.subtitle = body.subtitle.trim();
  if (typeof body.imageUrl === "string") banner.imageUrl = body.imageUrl.trim();
  if (typeof body.linkUrl === "string") banner.linkUrl = body.linkUrl.trim();
  if (typeof body.position === "string") banner.position = body.position.trim();
  if (typeof body.isActive === "boolean") banner.isActive = body.isActive;
  if (typeof body.sortOrder === "number") banner.sortOrder = body.sortOrder;
  if (
    typeof body.aspectRatio === "string" &&
    ["16:9", "9:16", "1:1"].includes(body.aspectRatio)
  ) {
    banner.aspectRatio = body.aspectRatio as "16:9" | "9:16" | "1:1";
  }
  if (
    typeof body.placement === "string" &&
    ["HERO_SLIDER", "SIDE_PROMO"].includes(body.placement)
  ) {
    banner.placement = body.placement as "HERO_SLIDER" | "SIDE_PROMO";
  }
  if (typeof body.ctaLabel === "string") banner.ctaLabel = body.ctaLabel.trim();
  if (typeof body.ctaLink === "string") banner.ctaLink = body.ctaLink.trim();
  if (typeof body.overlayColor === "string")
    banner.overlayColor = body.overlayColor.trim();

  await banner.save();
  ok(res, { banner });
});

export const deleteBanner = ah(async (req: Request, res: Response) => {
  const { id } = req.params;
  const banner = await Banner.findById(id);

  if (!banner) {
    sendError(res, ErrorCode.BANNER_NOT_FOUND, "Không tìm thấy banner");
    return;
  }

  await Banner.findByIdAndDelete(id);
  ok(res, { success: true, bannerId: id });
});
