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
    imageUrl: body.imageUrl.trim(),
    linkUrl: typeof body.linkUrl === "string" ? body.linkUrl.trim() : "",
    position: typeof body.position === "string" ? body.position.trim() : "home_hero",
    isActive: typeof body.isActive === "boolean" ? body.isActive : true,
    sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : 0,
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
  if (typeof body.imageUrl === "string") banner.imageUrl = body.imageUrl.trim();
  if (typeof body.linkUrl === "string") banner.linkUrl = body.linkUrl.trim();
  if (typeof body.position === "string") banner.position = body.position.trim();
  if (typeof body.isActive === "boolean") banner.isActive = body.isActive;
  if (typeof body.sortOrder === "number") banner.sortOrder = body.sortOrder;

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
