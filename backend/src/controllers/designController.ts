import { Request, Response } from "express";
import { Types } from "mongoose";
import { TreeDesign } from "../models/TreeDesign";
import { safelyBuildPricedDesign } from "../services/catalogService";
import {
  loadCatalogForDesign,
  buildDesignResponse,
  findUniqueSlug,
} from "../services/designService";
import {
  sendError,
  ErrorCode,
  handleInternalError,
} from "../utils/errors";
import { loadConfigByDesignId } from "../services/catalogService";

// ── POST /api/designs/quote ──────────────────────────────────────────────────
// Public — preview price before saving.
export const quoteDesign = async (req: Request, res: Response): Promise<void> => {
  const { config } = req.body as { config?: unknown };
  if (!config) {
    sendError(res, ErrorCode.MISSING_FIELD, "Thiếu `config` trong body");
    return;
  }
  try {
    const result = await safelyBuildPricedDesign(
      res,
      config as Parameters<typeof safelyBuildPricedDesign>[1]
    );
    if (!result) return;
    res.json({ pricing: result.pricing });
  } catch (err) {
    handleInternalError(res, err, "[designs] quoteDesign error");
  }
};

// ── POST /api/designs ────────────────────────────────────────────────────────
// Save a TreeDesign for the authenticated user. Returns { design, shareUrl }.
export const createDesign = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { name, config, previewImage, isPublic } = req.body as {
      name?: string;
      config?: any;
      previewImage?: string;
      isPublic?: boolean;
    };

    if (!config) {
      sendError(res, ErrorCode.MISSING_FIELD, "Thiếu `config` trong body");
      return;
    }
    const trimmedName = (name || "").trim();
    if (!trimmedName) {
      sendError(res, ErrorCode.DESIGN_NAME_REQUIRED, "Thiếu tên thiết kế");
      return;
    }

    // Validate via pricingService (throws DesignValidationError)
    const result = await safelyBuildPricedDesign(
      res,
      config as Parameters<typeof safelyBuildPricedDesign>[1]
    );
    if (!result) return;

    const slug = await findUniqueSlug(trimmedName);
    const doc = await TreeDesign.create({
      ownerId: new Types.ObjectId(userId),
      name: trimmedName,
      slug,
      year: new Date().getFullYear(),
      config,
      isPublic: isPublic !== false,
      isPreset: false,
      duplicatedFrom: null,
      previewImage: previewImage || "",
    });

    const populated = await TreeDesign.findById(doc._id).lean();
    if (!populated) {
      sendError(res, ErrorCode.INTERNAL_ERROR, "Không tìm thấy thiết kế vừa tạo");
      return;
    }
    const response = buildDesignResponse(populated, result.pricing);
    res.status(201).json({ design: response, shareUrl: response.shareUrl });
  } catch (err) {
    handleInternalError(res, err, "[designs] createDesign error");
  }
};

// ── GET /api/designs/mine ────────────────────────────────────────────────────
export const getMyDesigns = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const docs = await TreeDesign.find({ ownerId: userId, isPreset: false })
      .sort({ updatedAt: -1 })
      .lean();

    const out = await Promise.all(
      docs.map(async (d) => {
        const { design, pricing } = await loadCatalogForDesign(d);
        return buildDesignResponse(design, pricing);
      })
    );
    res.json({ designs: out, total: out.length });
  } catch (err) {
    handleInternalError(res, err, "[designs] getMyDesigns error");
  }
};

// ── GET /api/designs/share/:slug ─────────────────────────────────────────────
// Public if isPublic; otherwise requires ownership or admin role.
export const getSharedDesignBySlug = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { slug } = req.params;
    const design = await TreeDesign.findOne({ slug }).lean();
    if (!design) {
      sendError(res, ErrorCode.DESIGN_NOT_FOUND, "Không tìm thấy thiết kế");
      return;
    }

    const isOwner =
      design.ownerId && req.user?.id
        ? String(design.ownerId) === String(req.user.id)
        : false;
    const isAdmin = req.user?.roles?.includes("admin") ?? false;

    if (!design.isPublic && !isOwner && !isAdmin) {
      sendError(res, ErrorCode.FORBIDDEN, "Thiết kế này ở chế độ riêng tư");
      return;
    }

    const { pricing } = await loadCatalogForDesign(design);
    res.json({ design: buildDesignResponse(design, pricing) });
  } catch (err) {
    handleInternalError(res, err, "[designs] getSharedDesignBySlug error");
  }
};

// ── GET /api/designs/:id ─────────────────────────────────────────────────────
export const getDesignById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const design = await TreeDesign.findById(id).lean();
    if (!design) {
      sendError(res, ErrorCode.DESIGN_NOT_FOUND, "Không tìm thấy thiết kế");
      return;
    }
    const isOwner =
      design.ownerId && req.user?.id
        ? String(design.ownerId) === String(req.user.id)
        : false;
    const isAdmin = req.user?.roles?.includes("admin") ?? false;
    if (!isOwner && !isAdmin) {
      sendError(res, ErrorCode.FORBIDDEN, "Bạn không có quyền xem thiết kế này");
      return;
    }
    const { pricing } = await loadCatalogForDesign(design);
    res.json({ design: buildDesignResponse(design, pricing) });
  } catch (err) {
    handleInternalError(res, err, "[designs] getDesignById error");
  }
};

// ── PATCH /api/designs/:id ───────────────────────────────────────────────────
export const updateDesign = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const design = await TreeDesign.findById(id);
    if (!design) {
      sendError(res, ErrorCode.DESIGN_NOT_FOUND, "Không tìm thấy thiết kế");
      return;
    }
    if (design.isPreset) {
      sendError(res, ErrorCode.FORBIDDEN, "Không thể sửa mẫu thiết kế có sẵn");
      return;
    }
    if (!design.ownerId || String(design.ownerId) !== String(req.user!.id)) {
      sendError(res, ErrorCode.FORBIDDEN, "Bạn không phải chủ sở hữu thiết kế này");
      return;
    }

    const { name, config, previewImage, isPublic } = req.body as {
      name?: string;
      config?: any;
      previewImage?: string;
      isPublic?: boolean;
    };

    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) {
        sendError(res, ErrorCode.DESIGN_NAME_REQUIRED, "Tên thiết kế không được trống");
        return;
      }
      design.name = trimmed;
    }
    if (previewImage !== undefined) design.previewImage = String(previewImage);
    if (isPublic !== undefined) design.isPublic = Boolean(isPublic);

    if (config) {
      const result = await safelyBuildPricedDesign(
        res,
        config as Parameters<typeof safelyBuildPricedDesign>[1]
      );
      if (!result) return;
      design.config = config;
      design.year = new Date().getFullYear();
    }

    await design.save();
    const populated = await TreeDesign.findById(design._id).lean();
    if (!populated) {
      sendError(res, ErrorCode.INTERNAL_ERROR, "Không tìm thấy thiết kế sau khi cập nhật");
      return;
    }
    const { pricing } = await loadCatalogForDesign(populated);
    res.json({ design: buildDesignResponse(populated, pricing) });
  } catch (err) {
    handleInternalError(res, err, "[designs] updateDesign error");
  }
};

// ── DELETE /api/designs/:id ──────────────────────────────────────────────────
export const deleteDesign = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const design = await TreeDesign.findById(id);
    if (!design) {
      sendError(res, ErrorCode.DESIGN_NOT_FOUND, "Không tìm thấy thiết kế");
      return;
    }
    if (design.isPreset) {
      sendError(res, ErrorCode.FORBIDDEN, "Không thể xóa mẫu thiết kế có sẵn");
      return;
    }
    if (!design.ownerId || String(design.ownerId) !== String(req.user!.id)) {
      sendError(res, ErrorCode.FORBIDDEN, "Bạn không phải chủ sở hữu thiết kế này");
      return;
    }
    await TreeDesign.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (err) {
    handleInternalError(res, err, "[designs] deleteDesign error");
  }
};

// ── POST /api/designs/:id/duplicate ──────────────────────────────────────────
// User-facing: clone a design (own / public / preset) and return the new doc.
export const duplicateDesign = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const src = await TreeDesign.findById(id).lean();
    if (!src) {
      sendError(res, ErrorCode.DESIGN_NOT_FOUND, "Không tìm thấy thiết kế");
      return;
    }
    const isOwner =
      src.ownerId && req.user?.id
        ? String(src.ownerId) === String(req.user.id)
        : false;
    const isAdmin = req.user?.roles?.includes("admin") ?? false;
    if (!src.isPublic && !isOwner && !isAdmin) {
      sendError(res, ErrorCode.FORBIDDEN, "Không thể nhân bản thiết kế riêng tư");
      return;
    }

    const srcConfig = await loadConfigByDesignId(src._id);
    if (!srcConfig) {
      sendError(res, ErrorCode.DESIGN_CONFIG_INVALID, "Thiết kế nguồn không có config");
      return;
    }

    const newName = req.body?.name
      ? String(req.body.name).trim()
      : `${src.name} (copy)`;

    const slug = await findUniqueSlug(newName);
    const created = await TreeDesign.create({
      ownerId: new Types.ObjectId(req.user!.id),
      name: newName,
      slug,
      year: new Date().getFullYear(),
      config: srcConfig,
      isPublic: true,
      isPreset: false,
      duplicatedFrom: src._id,
      previewImage: src.previewImage || "",
    });

    const populated = await TreeDesign.findById(created._id).lean();
    if (!populated) {
      sendError(res, ErrorCode.INTERNAL_ERROR, "Không tìm thấy thiết kế vừa nhân bản");
      return;
    }
    const { pricing } = await loadCatalogForDesign(populated);
    res.status(201).json({
      design: buildDesignResponse(populated, pricing),
      shareUrl: `/tree/${populated.slug}`,
    });
  } catch (err) {
    handleInternalError(res, err, "[designs] duplicateDesign error");
  }
};