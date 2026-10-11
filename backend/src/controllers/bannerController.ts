import { Request, Response } from "express";
import { Banner } from "../models/Banner";
import { ah } from "../utils/asyncRoute";
import { ok } from "../utils/respond";

// ── GET /api/banners ──────────────────────────────────────────────────────────
// Public endpoint for customer-facing web/mobile app to fetch active banners.
export const getBanners = ah(async (req: Request, res: Response) => {
  const { position } = req.query;

  const query: Record<string, unknown> = { isActive: true };
  if (typeof position === "string" && position.trim()) {
    query.position = position.trim();
  }

  const banners = await Banner.find(query)
    .sort({ sortOrder: 1, createdAt: -1 })
    .lean();

  ok(res, { banners });
});
