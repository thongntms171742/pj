import { Request, Response } from "express";
import { Types } from "mongoose";
import { Design } from "../models/Design";
import { safelyBuildPricedDesign } from "../services/catalogService";
import {
  resolveDesign,
  buildDesignResponse,
  findUniqueSlug,
} from "../services/designService";
import {
  sendError,
  ErrorCode,
  handleInternalError,
} from "../utils/errors";
import { ok, created } from "../utils/respond";
import { generateDesignImage } from "../services/ai/googleImageService";
import type { PricingInput } from "../services/pricingService";

// ── POST /api/designs/quote ──────────────────────────────────────────────────
// Public — preview price trước khi save.
// Body: { variantId, deliveryOption }
export const quoteDesign = async (req: Request, res: Response): Promise<void> => {
  const { variantId, deliveryOption } = req.body as {
    variantId?: string;
    deliveryOption?: string;
  };
  if (!variantId || !deliveryOption) {
    sendError(res, ErrorCode.MISSING_FIELD, "Thiếu `variantId` hoặc `deliveryOption`");
    return;
  }
  try {
    const result = await safelyBuildPricedDesign(res, {
      variantId: String(variantId),
      deliveryOption: deliveryOption as any,
    });
    if (!result) return;
    ok(res, { pricing: result.pricing });
  } catch (err) {
    handleInternalError(res, err, "[designs] quoteDesign error");
  }
};

// ── POST /api/designs ────────────────────────────────────────────────────────
// Tạo 1 Design mới (status=DRAFT) gắn với 1 TreeProduct concept + prompt.
// Body: { name, baseTreeProductId, prompt, deliveryOption, isPublic? }
export const createDesign = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { name, baseTreeProductId, prompt, deliveryOption, isPublic, variantId } = req.body as {
      name?: string;
      baseTreeProductId?: string;
      prompt?: string;
      deliveryOption?: string;
      isPublic?: boolean;
      variantId?: string;
    };

    if (!baseTreeProductId) {
      sendError(res, ErrorCode.MISSING_FIELD, "Thiếu `baseTreeProductId`");
      return;
    }
    const trimmedName = (name || "").trim();
    if (!trimmedName) {
      sendError(res, ErrorCode.DESIGN_NAME_REQUIRED, "Thiếu tên thiết kế");
      return;
    }
    if (!Types.ObjectId.isValid(String(baseTreeProductId))) {
      sendError(res, ErrorCode.INVALID_INPUT, "baseTreeProductId không hợp lệ", 400);
      return;
    }

    const slug = await findUniqueSlug(trimmedName);
    const doc = await Design.create({
      ownerId: new Types.ObjectId(userId),
      name: trimmedName,
      slug,
      year: new Date().getFullYear(),
      baseTreeProductId: new Types.ObjectId(String(baseTreeProductId)),
      prompt: String(prompt || ""),
      deliveryOption: (deliveryOption as any) || "READY_TO_DISPLAY",
      isPublic: isPublic !== false,
      duplicatedFrom: null,
    });

    const resolved = await resolveDesign(doc.toObject(), { variantIdOverride: variantId });
    if (resolved.pricingInput.variantId) {
      doc.pricingSnapshot = {
        treePrice: resolved.pricing.tree.unitPrice,
        decorationFee: resolved.pricing.decorationFee,
        shippingFee: resolved.pricing.shippingFee,
        totalSalePrice: resolved.pricing.unitTotal,
      };
      await doc.save();
    }
    const refreshed = await Design.findById(doc._id).lean();
    const resolvedFinal = await resolveDesign(refreshed as any, { variantIdOverride: variantId });
    created(res, { design: buildDesignResponse(resolvedFinal), shareUrl: buildDesignResponse(resolvedFinal).shareUrl });
  } catch (err) {
    handleInternalError(res, err, "[designs] createDesign error");
  }
};

// ── GET /api/designs/mine ────────────────────────────────────────────────────
export const getMyDesigns = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const docs = await Design.find({ ownerId: userId })
      .sort({ updatedAt: -1 })
      .lean();

    const out = await Promise.all(
      docs.map(async (d) => {
        const resolved = await resolveDesign(d as any);
        return buildDesignResponse(resolved);
      })
    );
    ok(res, { designs: out, total: out.length });
  } catch (err) {
    handleInternalError(res, err, "[designs] getMyDesigns error");
  }
};

// ── GET /api/designs/share/:slug ─────────────────────────────────────────────
export const getSharedDesignBySlug = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { slug } = req.params;
    const design = await Design.findOne({ slug }).lean();
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

    const resolved = await resolveDesign(design as any);
    ok(res, { design: buildDesignResponse(resolved) });
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
    const design = await Design.findById(id).lean();
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
    const resolved = await resolveDesign(design as any);
    ok(res, { design: buildDesignResponse(resolved) });
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
    const design = await Design.findById(id);
    if (!design) {
      sendError(res, ErrorCode.DESIGN_NOT_FOUND, "Không tìm thấy thiết kế");
      return;
    }
    if (!design.ownerId || String(design.ownerId) !== String(req.user!.id)) {
      sendError(res, ErrorCode.FORBIDDEN, "Bạn không phải chủ sở hữu thiết kế này");
      return;
    }

    const { name, prompt, isPublic, deliveryOption, variantId } = req.body as {
      name?: string;
      prompt?: string;
      isPublic?: boolean;
      deliveryOption?: string;
      variantId?: string;
    };

    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) {
        sendError(res, ErrorCode.DESIGN_NAME_REQUIRED, "Tên thiết kế không được trống");
        return;
      }
      design.name = trimmed;
    }
    if (prompt !== undefined) design.prompt = String(prompt);
    if (isPublic !== undefined) design.isPublic = Boolean(isPublic);
    if (deliveryOption !== undefined) design.deliveryOption = deliveryOption as any;

    await design.save();

    const resolved = await resolveDesign(design.toObject() as any, { variantIdOverride: variantId });
    ok(res, { design: buildDesignResponse(resolved) });
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
    const design = await Design.findById(id);
    if (!design) {
      sendError(res, ErrorCode.DESIGN_NOT_FOUND, "Không tìm thấy thiết kế");
      return;
    }
    if (!design.ownerId || String(design.ownerId) !== String(req.user!.id)) {
      sendError(res, ErrorCode.FORBIDDEN, "Bạn không phải chủ sở hữu thiết kế này");
      return;
    }
    await Design.findByIdAndDelete(id);
    ok(res, { success: true });
  } catch (err) {
    handleInternalError(res, err, "[designs] deleteDesign error");
  }
};

// ── POST /api/designs/:id/duplicate ──────────────────────────────────────────
export const duplicateDesign = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const src = await Design.findById(id).lean();
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

    const newName = req.body?.name
      ? String(req.body.name).trim()
      : `${src.name} (copy)`;

    const slug = await findUniqueSlug(newName);
    const duplicated = await Design.create({
      ownerId: new Types.ObjectId(req.user!.id),
      name: newName,
      slug,
      year: new Date().getFullYear(),
      baseTreeProductId: src.baseTreeProductId,
      prompt: src.prompt,
      deliveryOption: src.deliveryOption,
      isPublic: true,
      duplicatedFrom: src._id,
      previewImage: src.previewImage || src.imageUrl || "",
    });

    const resolved = await resolveDesign(duplicated.toObject() as any);
    created(res, {
      design: buildDesignResponse(resolved),
      shareUrl: buildDesignResponse(resolved).shareUrl,
    });
  } catch (err) {
    handleInternalError(res, err, "[designs] duplicateDesign error");
  }
};

// ── POST /api/designs/:id/generate-image ─────────────────────────────────────
// Gọi KIE nano-banana-2 để render ảnh từ TreeProduct.coverImage + prompt.
export const generateImage = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id || "");
    if (!Types.ObjectId.isValid(id)) {
      sendError(res, ErrorCode.INVALID_INPUT, "ID thiết kế không hợp lệ", 400);
      return;
    }
    const isAdmin = Boolean(req.user?.roles?.includes("admin"));
    const result = await generateDesignImage(id, String(req.user?.id || ""), isAdmin);
    ok(res, result);
  } catch (err: any) {
    if (err?.code && err?.status) {
      sendError(res, err.code as any, err.message, err.status);
      return;
    }
    handleInternalError(res, err, "[designs] generateImage error");
  }
};

// ── POST /api/designs/:id/confirm ────────────────────────────────────────────
// Khách chốt design → set status=CONFIRMED + lưu pricingSnapshot.
export const confirmDesign = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const design = await Design.findById(id);
    if (!design) {
      sendError(res, ErrorCode.DESIGN_NOT_FOUND, "Không tìm thấy thiết kế");
      return;
    }
    if (!design.ownerId || String(design.ownerId) !== String(req.user!.id)) {
      sendError(res, ErrorCode.FORBIDDEN, "Bạn không phải chủ sở hữu thiết kế này");
      return;
    }
    if (design.status !== "AI_COMPLETED" && design.status !== "DRAFT") {
      sendError(
        res,
        ErrorCode.DESIGN_NOT_CONFIRMED,
        `Không thể confirm ở trạng thái ${design.status}`,
        400
      );
      return;
    }

    // Tính giá từ variant đầu tiên active của TreeProduct.
    const { variantId } = req.body as { variantId?: string };
    const resolved = await resolveDesign(design.toObject() as any, { variantIdOverride: variantId });
    if (!resolved.pricingInput.variantId) {
      sendError(res, ErrorCode.TREE_NOT_FOUND, "Không tìm thấy variant để tính giá", 404);
      return;
    }

    design.status = "CONFIRMED";
    design.pricingSnapshot = {
      treePrice: resolved.pricing.tree.unitPrice,
      decorationFee: resolved.pricing.decorationFee,
      shippingFee: resolved.pricing.shippingFee,
      totalSalePrice: resolved.pricing.unitTotal,
    };
    await design.save();

    const refreshed = await Design.findById(design._id).lean();
    const final = await resolveDesign(refreshed as any, { variantIdOverride: variantId });
    ok(res, { design: buildDesignResponse(final) });
  } catch (err) {
    handleInternalError(res, err, "[designs] confirmDesign error");
  }
};
