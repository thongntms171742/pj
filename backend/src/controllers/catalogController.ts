import { Request, Response } from "express";
import { TreeProduct } from "../models/TreeProduct";
import { TreeCode } from "../models/TreeCode";
import { Tree } from "../models/Tree";
import { SlotMap } from "../models/SlotMap";
import { safelyBuildPricedDesign } from "../services/catalogService";
import { loadGroupedTreeCatalog } from "../services/catalogService";
import {
  getPublishedSlotMap,
  listAccessories,
  listDesignAccessories,
} from "../services/customizerService";
import { DELIVERY_OPTIONS, DECORATION_FEE_BY_SIZE, SHIPPING_FEE } from "../config/business";
import { sendError, ErrorCode, handleInternalError } from "../utils/errors";
import { ok } from "../utils/respond";
import type { TreeSize } from "../models/Tree";

// ── GET /api/catalog/tree-products ──────────────────────────────────────────
// Customer browse: returns active tree products with their codes + variants.
export const getTreeProducts = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const groups = await loadGroupedTreeCatalog({
      isActive: true,
      includeEmptyProducts: false,
    });
    const filtered = groups.filter((g) =>
      g.codes.some(
        (c) => c.isActive && c.variants.some((v) => v.isActive)
      )
    );
    ok(res, { treeProducts: filtered });
  } catch (err) {
    handleInternalError(res, err, "[catalog] getTreeProducts error");
  }
};

// ── GET /api/catalog/tree-products/:productId/codes/:codeId/variants ────────
export const getVariantsForCode = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { productId, codeId } = req.params;
    const code = await TreeCode.findOne({
      _id: codeId,
      productId,
      isActive: true,
    }).lean();
    if (!code) {
      sendError(res, ErrorCode.TREE_NOT_FOUND, "Không tìm thấy mã cây");
      return;
    }
    const variants = await Tree.find({ codeId, isActive: true })
      .sort({ sortOrder: 1, size: 1 })
      .lean();
    ok(res, {
      code: {
        _id: String(code._id),
        code: code.code,
        name: code.name,
        description: code.description,
        image: code.image,
        material: code.material,
      },
      variants: variants.map((v) => ({
        _id: String(v._id),
        size: v.size,
        sku: v.sku,
        heightCmMin: v.heightCmMin,
        heightCmMax: v.heightCmMax,
        diameterCm: v.diameterCm,
        description: v.description || "",
        bareImage: v.bareImage,
        // Lớp 4 — cành trước cảnh (optional). Thiếu ⇒ không có lớp che.
        foregroundMask: v.foregroundMask || "",
        price: v.price,
        stockQuantity: v.stockQuantity,
      })),
    });
  } catch (err) {
    handleInternalError(res, err, "[catalog] getVariantsForCode error");
  }
};

// ── GET /api/catalog/accessories — Tree Customizer (Phase 1) ───────────────
// Query: ?slotType=ball (lọc theo loại slot) — chỉ trả phụ kiện đang bán.
export const getAccessories = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const slotType =
      typeof req.query.slotType === "string" && req.query.slotType.trim()
        ? req.query.slotType.trim()
        : undefined;
    const variantId = typeof req.query.variantId === "string" ? req.query.variantId : undefined;
    const accessories = await listAccessories({ slotType, variantId });
    ok(res, { accessories });
  } catch (err) {
    handleInternalError(res, err, "[catalog] getAccessories error");
  }
};

// ── GET /api/design-accessories — Tree Customizer (public) ──────────────────
// Collection phụ kiện riêng cho Customizer: phụ kiện THIẾT KẾ ⇒ không có
// tồn kho, giá tính theo từng slot.
//
// FE fallback: nếu endpoint trả 404/403/405 ⇒ FE tự gọi
// `GET /api/catalog/accessories` (collection cũ). ⇒ Endpoint này KHÔNG bắt
// buộc phải có, nhưng nếu có thì trả đủ field metadata ghép ảnh.
//
// Query: ?slotType=ball (lọc theo loại slot)
export const getDesignAccessories = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const slotType =
      typeof req.query.slotType === "string" && req.query.slotType.trim()
        ? req.query.slotType.trim()
        : undefined;
    const accessories = await listDesignAccessories(slotType);
    ok(res, { accessories });
  } catch (err) {
    handleInternalError(res, err, "[catalog] getDesignAccessories error");
  }
};

// ── GET /api/catalog/variants/:variantId/slotmap ────────────────────────────
// Trả bản SlotMap đang phát hành. Không có ⇒ variant chưa hỗ trợ tùy chỉnh.
export const getVariantSlotMap = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { variantId } = req.params;
    const slotMap = await getPublishedSlotMap(String(variantId));
    if (!slotMap) {
      sendError(
        res,
        ErrorCode.SLOTMAP_NOT_FOUND,
        "Biến thể này chưa có bảng slot tùy chỉnh"
      );
      return;
    }
    ok(res, { slotMap });
  } catch (err) {
    handleInternalError(res, err, "[catalog] getVariantSlotMap error");
  }
};

// ── GET /api/catalog/customizer/base-trees ──────────────────────────────────
// Danh sách cây BASE cho màn hình chọn cây của Tree Customizer.
//
// CHỈ trả cây base (product có `isCustomizerBase = true`) — cây thương mại
// KHÔNG mở điểm chạm (ảnh đã trang trí sẵn, không có cây trơn để gắn).
//
// Mỗi variant kèm:
//   - `slotCount` / `slotMapVersion`: thông tin SlotMap đang phát hành.
//   - `hasSlotMap`: biết ngay variant nào đã sẵn sàng để trang trí.
//   - `bareImage`: ảnh cây TRƠN do admin upload (nền tảng của canvas).
export const getCustomizerBaseTrees = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const products = await TreeProduct.find({
      isActive: true,
      isCustomizerBase: true,
    })
      .sort({ sortOrder: 1, name: 1 })
      .lean();

    if (products.length === 0) {
      ok(res, { baseTrees: [] });
      return;
    }

    const codes = await TreeCode.find({
      productId: { $in: products.map((p) => p._id) },
      isActive: true,
    })
      .sort({ sortOrder: 1, name: 1 })
      .lean();

    const variants = codes.length
      ? await Tree.find({ codeId: { $in: codes.map((c) => c._id) }, isActive: true })
          .sort({ sortOrder: 1, size: 1 })
          .lean()
      : [];

    const codeById = new Map(codes.map((c) => [String(c._id), c]));
    const productById = new Map(products.map((p) => [String(p._id), p]));

    // Lấy SlotMap đang phát hành của tất cả variant trong 1 lần truy vấn.
    const slotMaps = await SlotMap.find({
      variantId: { $in: variants.map((v) => v._id) },
      isPublished: true,
    }).lean();
    const slotByVariant = new Map(
      slotMaps.map((s) => [
        String(s.variantId),
        { version: s.version, count: (s.slots || []).length },
      ])
    );

    const baseTrees = variants.map((v) => {
      const code = codeById.get(String(v.codeId));
      const product = code ? productById.get(String(code.productId)) : undefined;
      const sm = slotByVariant.get(String(v._id));
      return {
        _id: String(v._id),
        sku: v.sku,
        size: v.size,
        name: v.name,
        price: v.price,
        stockQuantity: v.stockQuantity,
        bareImage: v.bareImage || "",
        // Lớp 4 — cành trước cảnh (PNG alpha, cùng pixel size bareImage).
        // Thiếu ⇒ không có lớp che ⇒ mọi phụ kiện nằm trước cây (hành vi cũ).
        foregroundMask: v.foregroundMask || "",
        productId: product ? String(product._id) : "",
        productName: product?.name || "Cây base",
        codeId: code ? String(code._id) : "",
        codeName: code?.name || "",
        hasSlotMap: Boolean(sm),
        slotCount: sm?.count ?? 0,
        slotMapVersion: sm?.version ?? 0,
        customizationMode: v.customizationMode || "slots",
        customizationCatalog: v.customizationCatalog || "",
      };
    });

    ok(res, { baseTrees });
  } catch (err) {
    handleInternalError(res, err, "[catalog] getCustomizerBaseTrees error");
  }
};

// ── GET /api/catalog/trees (LEGACY — flat list, read-only) ──────────────────
export const getTrees = async (_req: Request, res: Response): Promise<void> => {
  try {
    const trees = await Tree.find({ isActive: true })
      .sort({ sortOrder: 1, size: 1 })
      .lean();
    ok(res, {
      trees: trees.map((t) => ({
        _id: String(t._id),
        size: t.size as TreeSize,
        name: t.name,
        heightCmMin: t.heightCmMin,
        heightCmMax: t.heightCmMax,
        diameterCm: t.diameterCm,
        material: "",
        density: "",
        description: t.description,
        images: t.images,
        bareImage: t.bareImage,
        foregroundMask: t.foregroundMask || "",
        price: t.price,
        stock: t.stockQuantity,
        productId: String(t.productId ?? ""),
        codeId: String(t.codeId ?? ""),
        sku: t.sku,
      })),
    });
  } catch (err) {
    handleInternalError(res, err, "[catalog] getTrees error");
  }
};

// ── GET /api/catalog/delivery-options ────────────────────────────────────────
export const getDeliveryOptions = async (
  _req: Request,
  res: Response
): Promise<void> => {
  ok(res, {
    options: DELIVERY_OPTIONS.map((code) => ({
      code,
      shippingFee: SHIPPING_FEE,
      decorationFeeBySize:
        code === "READY_TO_DISPLAY" ? DECORATION_FEE_BY_SIZE : { S: 0, M: 0, L: 0 },
    })),
  });
};

// ── POST /api/catalog/quote ──────────────────────────────────────────────────
// Body: { variantId, deliveryOption, accessories? } — accessories [{ accessoryId, quantity }].
// Không accessories = báo giá cây trơn (tương thích flow cũ).
export const quoteDesign = async (req: Request, res: Response): Promise<void> => {
  const { variantId, deliveryOption, accessories } = req.body as {
    variantId?: string;
    deliveryOption?: string;
    accessories?: Array<{ accessoryId?: string; quantity?: number }>;
  };
  if (!variantId || !deliveryOption) {
    sendError(res, ErrorCode.MISSING_FIELD, "Thiếu `variantId` hoặc `deliveryOption`");
    return;
  }
  try {
    const cleanAccessories = Array.isArray(accessories)
      ? accessories
          .filter((a) => a && typeof a.accessoryId === "string")
          .map((a) => ({
            accessoryId: String(a.accessoryId),
            quantity: Math.max(1, Math.floor(Number(a.quantity) || 1)),
          }))
      : undefined;
    const result = await safelyBuildPricedDesign(res, {
      variantId: String(variantId),
      deliveryOption: deliveryOption as any,
      ...(cleanAccessories && cleanAccessories.length > 0 ? { accessories: cleanAccessories } : {}),
    });
    if (!result) return;
    ok(res, { pricing: result.pricing });
  } catch (err) {
    handleInternalError(res, err, "[catalog] quoteDesign error");
  }
};
