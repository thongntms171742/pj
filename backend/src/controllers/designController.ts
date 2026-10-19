import { Request, Response } from "express";
import { Types } from "mongoose";
import { Design } from "../models/Design";
import { Tree } from "../models/Tree";
import {
  uploadFromBuffer,
  deleteAsset,
  isCloudinaryEnabled,
} from "../services/cloudinaryService";
import { safelyBuildPricedDesign } from "../services/catalogService";
import {
  resolveRoomDesign,
  buildRoomDesignResponse,
} from "../services/designService";
import {
  sendError,
  ErrorCode,
  handleInternalError,
} from "../utils/errors";
import { ok, created } from "../utils/respond";
import { generateRoomDesignImage } from "../services/ai/googleImageService";
import type { PricingInput } from "../services/pricingService";
import type { DeliveryOption } from "../config/business";

const ROOM_IMAGE_MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_ROOM_MIME = ["image/jpeg", "image/png", "image/webp"];

// ── POST /api/designs/quote ──────────────────────────────────────────────────
// Public — preview price trước khi lưu RoomDesign.
// Body: { treeVariantId, deliveryOption }
export const quoteDesign = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { treeVariantId, deliveryOption } = req.body as {
    treeVariantId?: string;
    deliveryOption?: string;
  };
  if (!treeVariantId || !deliveryOption) {
    sendError(
      res,
      ErrorCode.MISSING_FIELD,
      "Thiếu `treeVariantId` hoặc `deliveryOption`"
    );
    return;
  }
  try {
    const result = await safelyBuildPricedDesign(res, {
      variantId: String(treeVariantId),
      deliveryOption: deliveryOption as DeliveryOption,
    });
    if (!result) return;
    ok(res, { pricing: result.pricing });
  } catch (err) {
    handleInternalError(res, err, "[designs] quoteDesign error");
  }
};

// ── POST /api/designs/upload-room ───────────────────────────────────────────
// Multipart upload (field: `roomImage`) → upload Cloudinary → trả URL.
// Required trước khi tạo RoomDesign.
export const uploadRoomImage = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!isCloudinaryEnabled()) {
      sendError(
        res,
        ErrorCode.UPSTREAM_ERROR,
        "Cloudinary chưa được cấu hình. Liên hệ admin."
      );
      return;
    }
    const file = (req as any).file as
      | { buffer: Buffer; mimetype: string; size: number }
      | undefined;
    if (!file || !file.buffer) {
      sendError(
        res,
        ErrorCode.MISSING_FIELD,
        "Thiếu file ảnh phòng (field: `roomImage`)"
      );
      return;
    }
    if (file.size > ROOM_IMAGE_MAX_BYTES) {
      sendError(
        res,
        ErrorCode.FILE_TOO_LARGE,
        "Ảnh phòng vượt quá 8 MB"
      );
      return;
    }
    if (file.mimetype && !ALLOWED_ROOM_MIME.includes(file.mimetype)) {
      sendError(
        res,
        ErrorCode.UNSUPPORTED_MEDIA_TYPE,
        `Định dạng ảnh không hỗ trợ: ${file.mimetype}. Chỉ chấp nhận JPEG/PNG/WebP.`
      );
      return;
    }

    const uploaded = await uploadFromBuffer(file.buffer, {
      folder: "buildyourchristmas/room-designs/uploads",
      resourceType: "image",
    });

    created(res, {
      roomImageUrl: uploaded.url,
      roomImagePublicId: uploaded.publicId,
    });
  } catch (err) {
    handleInternalError(res, err, "[designs] uploadRoomImage error");
  }
};

// ── POST /api/designs ────────────────────────────────────────────────────────
// Tạo 1 RoomDesign mới (status=DRAFT).
// Body: { treeVariantId, roomImageUrl?, roomImagePublicId?, prompt?, name?, deliveryOption? }
// Ảnh phòng là tùy chọn — nếu không upload thì dùng ảnh cây mặc định.
export const createDesign = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const {
      treeVariantId,
      roomImageUrl,
      roomImagePublicId,
      prompt,
      name,
      deliveryOption,
    } = req.body as {
      treeVariantId?: string;
      roomImageUrl?: string;
      roomImagePublicId?: string;
      prompt?: string;
      name?: string;
      deliveryOption?: string;
    };

    if (!treeVariantId) {
      sendError(res, ErrorCode.MISSING_FIELD, "Thiếu `treeVariantId`");
      return;
    }
    if (!Types.ObjectId.isValid(String(treeVariantId))) {
      sendError(
        res,
        ErrorCode.INVALID_INPUT,
        "treeVariantId không hợp lệ",
        400
      );
      return;
    }

    // Check variant tồn tại + active
    const variant = await Tree.findById(treeVariantId)
      .select("_id isActive")
      .lean();
    if (!variant || !variant.isActive) {
      sendError(
        res,
        ErrorCode.TREE_NOT_FOUND,
        "Mẫu cây không tồn tại hoặc đã ngừng bán",
        404
      );
      return;
    }

    // Ảnh phòng là tùy chọn — nếu không upload thì dùng ảnh cây gốc
    const safeRoomImageUrl = roomImageUrl?.trim() || "";
    const safeRoomImagePublicId = roomImagePublicId?.trim() || "";

    const doc = await Design.create({
      ownerId: new Types.ObjectId(userId),
      name: String(name || "").trim() || "My Room",
      treeVariantId: new Types.ObjectId(String(treeVariantId)),
      prompt: String(prompt || "").trim(),
      roomImageUrl: safeRoomImageUrl,
      roomImagePublicId: safeRoomImagePublicId,
      deliveryOption: (deliveryOption as DeliveryOption) || "READY_TO_DISPLAY",
      status: "DRAFT",
    });

    const refreshed = await Design.findById(doc._id).lean();
    const resolved = await resolveRoomDesign(refreshed as any);
    created(res, { design: buildRoomDesignResponse(resolved) });
  } catch (err) {
    handleInternalError(res, err, "[designs] createDesign error");
  }
};

// ── GET /api/designs/mine ────────────────────────────────────────────────────
export const getMyDesigns = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const docs = await Design.find({ ownerId: userId })
      .sort({ updatedAt: -1 })
      .lean();

    const out = await Promise.all(
      docs.map(async (d) => {
        const resolved = await resolveRoomDesign(d as any);
        return buildRoomDesignResponse(resolved);
      })
    );
    ok(res, { designs: out, total: out.length });
  } catch (err) {
    handleInternalError(res, err, "[designs] getMyDesigns error");
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
      sendError(
        res,
        ErrorCode.FORBIDDEN,
        "Bạn không có quyền xem thiết kế này"
      );
      return;
    }
    const resolved = await resolveRoomDesign(design as any);
    ok(res, { design: buildRoomDesignResponse(resolved) });
  } catch (err) {
    handleInternalError(res, err, "[designs] getDesignById error");
  }
};

// ── DELETE /api/designs/:id ──────────────────────────────────────────────────
// Cleanup Cloudinary (roomImage nếu còn + resultImage) + xóa DB.
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
      const isAdmin = req.user?.roles?.includes("admin") ?? false;
      if (!isAdmin) {
        sendError(
          res,
          ErrorCode.FORBIDDEN,
          "Bạn không phải chủ sở hữu thiết kế này"
        );
        return;
      }
    }

    // Cleanup Cloudinary — best-effort, lỗi không block xóa DB.
    const cleanupTasks: Promise<unknown>[] = [];
    if (design.roomImagePublicId) {
      cleanupTasks.push(
        deleteAsset(design.roomImagePublicId, "image").catch((err) =>
          console.warn(
            `[designs] Failed to delete room image ${design.roomImagePublicId}:`,
            err
          )
        )
      );
    }
    if (design.resultImagePublicId) {
      cleanupTasks.push(
        deleteAsset(design.resultImagePublicId, "image").catch((err) =>
          console.warn(
            `[designs] Failed to delete result image ${design.resultImagePublicId}:`,
            err
          )
        )
      );
    }
    await Promise.all(cleanupTasks);

    await Design.findByIdAndDelete(id);
    ok(res, { success: true });
  } catch (err) {
    handleInternalError(res, err, "[designs] deleteDesign error");
  }
};

// ── POST /api/designs/:id/generate-image ─────────────────────────────────────
// Trigger AI ghép cây vào phòng. Gọi KIE → upload Cloudinary → set status.
export const generateImage = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = String(req.params.id || "");
    if (!Types.ObjectId.isValid(id)) {
      sendError(
        res,
        ErrorCode.INVALID_INPUT,
        "ID thiết kế không hợp lệ",
        400
      );
      return;
    }
    const isAdmin = Boolean(req.user?.roles?.includes("admin"));
    const result = await generateRoomDesignImage(
      id,
      String(req.user?.id || ""),
      isAdmin
    );
    ok(res, result);
  } catch (err: any) {
    if (err?.code && err?.status) {
      sendError(res, err.code as any, err.message, err.status);
      return;
    }
    handleInternalError(res, err, "[designs] generateImage error");
  }
};

// ── Backward-compat stub: confirmDesign ──────────────────────────────────────
// Checkout không còn yêu cầu design confirmed. Endpoint giữ để tránh 404
// cho FE cũ, nhưng trả về no-op success.
export const confirmDesign = async (
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
      sendError(
        res,
        ErrorCode.FORBIDDEN,
        "Bạn không phải chủ sở hữu thiết kế này"
      );
      return;
    }
    // No-op: trả về design hiện tại.
    const refreshed = await Design.findById(id).lean();
    const resolved = await resolveRoomDesign(refreshed as any);
    ok(res, { design: buildRoomDesignResponse(resolved) });
  } catch (err) {
    handleInternalError(res, err, "[designs] confirmDesign error");
  }
};
