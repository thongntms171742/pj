import { Request, Response } from "express";
import { Types } from "mongoose";
import { Tree } from "../models/Tree";
import { TreeProduct } from "../models/TreeProduct";
import { TreeCode } from "../models/TreeCode";
import { Style } from "../models/Style";
import { Accessory } from "../models/Accessory";
import { TreeDesign } from "../models/TreeDesign";
import { Order } from "../models/Order";
import { User } from "../models/User";
import { mapOrder } from "./orderController";
import {
  loadCatalogForDesign,
  buildDesignResponse,
  findUniqueSlug,
} from "../services/designService";
import { loadGroupedTreeCatalog } from "../services/catalogService";
import {
  sendError,
  ErrorCode,
  handleInternalError,
} from "../utils/errors";

// ── Helper: ensure current user is admin ──────────────────────────────────────
function assertAdmin(req: Request, res: Response): boolean {
  if (!req.user?.roles?.includes("admin")) {
    sendError(res, ErrorCode.FORBIDDEN, "Chỉ admin mới có quyền truy cập");
    return false;
  }
  return true;
}

// ════════════════════════════════════════════════════════════════════════════
// Trees CRUD
// ════════════════════════════════════════════════════════════════════════════

export const listTrees = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!assertAdmin(req, res)) return;
    const { isActive } = req.query;
    const query2: any = {};
    if (isActive === "true") query2.isActive = true;
    if (isActive === "false") query2.isActive = false;
    const trees = await Tree.find(query2).sort({ sortOrder: 1, size: 1 }).lean();
    res.json({
      trees: trees.map((t) => ({
        _id: String(t._id),
        size: t.size,
        name: t.name,
        price: t.price,
        stock: (t as { stockQuantity?: number }).stockQuantity ?? 0,
        isActive: t.isActive,
        images: t.images,
        heightCmMin: t.heightCmMin,
        heightCmMax: t.heightCmMax,
      })),
    });
  } catch (err) {
    handleInternalError(res, err, "[admin] listTrees error");
  }
};

export const createTree = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!assertAdmin(req, res)) return;
    const body = req.body as any;
    if (!body.size || !body.name || body.price == null) {
      sendError(res, ErrorCode.MISSING_FIELD, "Thiếu size, name hoặc price");
      return;
    }
    const tree = await Tree.create(body);
    res.status(201).json({ tree });
  } catch (err) {
    handleInternalError(res, err, "[admin] createTree error");
  }
};

export const updateTree = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!assertAdmin(req, res)) return;
    const { id } = req.params;
    const tree = await Tree.findByIdAndUpdate(id, req.body, { new: true });
    if (!tree) {
      sendError(res, ErrorCode.TREE_NOT_FOUND, "Không tìm thấy cây");
      return;
    }
    res.json({ tree });
  } catch (err) {
    handleInternalError(res, err, "[admin] updateTree error");
  }
};

// ════════════════════════════════════════════════════════════════════════════
// Tree Products (Shopee-style 3-tier: Product → Code → Variant) — admin only
// ════════════════════════════════════════════════════════════════════════════

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function ensureUniqueSlug(base: string): Promise<string> {
  const root = base || "tree";
  let slug = root;
  let i = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await TreeProduct.exists({ slug })) {
    slug = `${root}-${i++}`;
  }
  return slug;
}

// ── GET /api/admin/tree-products ─────────────────────────────────────────────
// Returns 3-tier grouped list: [{ product, codes: [{ ..., variants: [] }] }]
export const listTreeProducts = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!assertAdmin(_req, res)) return;
    const groups = await loadGroupedTreeCatalog();
    res.json({ treeProducts: groups });
  } catch (err) {
    handleInternalError(res, err, "[admin] listTreeProducts error");
  }
};

// ── POST /api/admin/tree-products ────────────────────────────────────────────
// Body: { name, slug?, category, density, description, coverImage, images,
//         isActive, sortOrder }
// Creates the parent product only. Codes/variants are managed separately.
export const createTreeProduct = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!assertAdmin(req, res)) return;
    const body = req.body as {
      name?: string;
      slug?: string;
      category?: string;
      density?: string;
      description?: string;
      coverImage?: string;
      images?: string[];
      aspectRatio?: string;
      videoUrl?: string;
      video?: string;
      isActive?: boolean;
      sortOrder?: number;
    };
    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      sendError(res, ErrorCode.MISSING_FIELD, "Thiếu tên sản phẩm");
      return;
    }
    const slug = await ensureUniqueSlug(slugify(body.slug || body.name));
    const product = await TreeProduct.create({
      name: body.name.trim(),
      slug,
      category: body.category ?? "Cây thông Noel",
      density: body.density ?? "standard",
      description: body.description ?? "",
      coverImage: body.coverImage ?? "",
      images: Array.isArray(body.images) ? body.images : [],
      aspectRatio: body.aspectRatio ?? "1:1",
      videoUrl: body.videoUrl ?? body.video ?? "",
      isActive: body.isActive ?? true,
      sortOrder: body.sortOrder ?? 0,
    });
    res.status(201).json({ treeProduct: product });
  } catch (err) {
    handleInternalError(res, err, "[admin] createTreeProduct error");
  }
};

// ── PATCH /api/admin/tree-products/:productId ────────────────────────────────
export const updateTreeProduct = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!assertAdmin(req, res)) return;
    const { productId } = req.params;
    const product = await TreeProduct.findById(productId);
    if (!product) {
      sendError(res, ErrorCode.TREE_NOT_FOUND, "Không tìm thấy tree product");
      return;
    }
    const body = req.body as Partial<{
      name: string;
      slug: string;
      category: string;
      density: string;
      description: string;
      coverImage: string;
      images: string[];
      aspectRatio: string;
      videoUrl: string;
      video: string;
      isActive: boolean;
      sortOrder: number;
    }>;
    if (body.name !== undefined) product.name = body.name.trim();
    if (body.slug !== undefined && body.slug !== product.slug) {
      product.slug = await ensureUniqueSlug(slugify(body.slug));
    }
    if (body.category !== undefined) product.category = body.category;
    if (body.density !== undefined) product.density = body.density;
    if (body.description !== undefined) product.description = body.description;
    if (body.coverImage !== undefined) product.coverImage = body.coverImage;
    if (Array.isArray(body.images)) product.images = body.images;
    if (body.aspectRatio !== undefined) product.aspectRatio = body.aspectRatio;
    if (body.videoUrl !== undefined) product.videoUrl = body.videoUrl;
    else if (body.video !== undefined) product.videoUrl = body.video;
    if (body.isActive !== undefined) product.isActive = body.isActive;
    if (body.sortOrder !== undefined) product.sortOrder = body.sortOrder;
    await product.save();
    res.json({ treeProduct: product });
  } catch (err) {
    handleInternalError(res, err, "[admin] updateTreeProduct error");
  }
};

// ── DELETE /api/admin/tree-products/:productId ───────────────────────────────
// Soft delete: hide product + cascade-deactivate all codes + variants.
export const deleteTreeProduct = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!assertAdmin(req, res)) return;
    const { productId } = req.params;
    const product = await TreeProduct.findById(productId);
    if (!product) {
      sendError(res, ErrorCode.TREE_NOT_FOUND, "Không tìm thấy tree product");
      return;
    }
    product.isActive = false;
    await product.save();
    await TreeCode.updateMany({ productId }, { isActive: false });
    await Tree.updateMany({ productId }, { isActive: false });
    res.json({ success: true, productId: String(product._id) });
  } catch (err) {
    handleInternalError(res, err, "[admin] deleteTreeProduct error");
  }
};

// ── POST /api/admin/tree-products/:productId/codes ──────────────────────────
// Body: { code, name, description, image, material, isActive, sortOrder }
export const createTreeCode = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!assertAdmin(req, res)) return;
    const { productId } = req.params;
    const product = await TreeProduct.findById(productId);
    if (!product) {
      sendError(res, ErrorCode.TREE_NOT_FOUND, "Không tìm thấy tree product");
      return;
    }
    const body = req.body as {
      code?: string;
      name?: string;
      description?: string;
      image?: string;
      material?: string;
      isActive?: boolean;
      sortOrder?: number;
    };
    if (!body.code || !body.name) {
      sendError(res, ErrorCode.MISSING_FIELD, "Thiếu mã hoặc tên mã cây");
      return;
    }
    const treeCode = await TreeCode.create({
      productId: product._id,
      code: body.code.trim(),
      name: body.name.trim(),
      description: body.description ?? "",
      image: body.image ?? "",
      material: body.material ?? "",
      isActive: body.isActive ?? true,
      sortOrder: body.sortOrder ?? 0,
    });
    res.status(201).json({ treeCode });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      sendError(
        res,
        ErrorCode.ACCESSORY_DUPLICATED,
        "Mã cây đã tồn tại trong sản phẩm này"
      );
      return;
    }
    handleInternalError(res, err, "[admin] createTreeCode error");
  }
};

// ── PATCH /api/admin/tree-codes/:codeId ──────────────────────────────────────
export const updateTreeCode = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!assertAdmin(req, res)) return;
    const { codeId } = req.params;
    const treeCode = await TreeCode.findById(codeId);
    if (!treeCode) {
      sendError(res, ErrorCode.TREE_NOT_FOUND, "Không tìm thấy mã cây");
      return;
    }
    const body = req.body as Partial<{
      code: string;
      name: string;
      description: string;
      image: string;
      material: string;
      isActive: boolean;
      sortOrder: number;
    }>;
    if (body.code !== undefined) treeCode.code = body.code.trim();
    if (body.name !== undefined) treeCode.name = body.name.trim();
    if (body.description !== undefined) treeCode.description = body.description;
    if (body.image !== undefined) treeCode.image = body.image;
    if (body.material !== undefined) treeCode.material = body.material;
    if (body.isActive !== undefined) treeCode.isActive = body.isActive;
    if (body.sortOrder !== undefined) treeCode.sortOrder = body.sortOrder;
    await treeCode.save();
    res.json({ treeCode });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      sendError(
        res,
        ErrorCode.ACCESSORY_DUPLICATED,
        "Mã cây đã tồn tại trong sản phẩm này"
      );
      return;
    }
    handleInternalError(res, err, "[admin] updateTreeCode error");
  }
};

// ── DELETE /api/admin/tree-codes/:codeId ─────────────────────────────────────
// Soft delete: hide code + cascade-deactivate its variants.
export const deleteTreeCode = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!assertAdmin(req, res)) return;
    const { codeId } = req.params;
    const treeCode = await TreeCode.findById(codeId);
    if (!treeCode) {
      sendError(res, ErrorCode.TREE_NOT_FOUND, "Không tìm thấy mã cây");
      return;
    }
    treeCode.isActive = false;
    await treeCode.save();
    await Tree.updateMany({ codeId }, { isActive: false });
    res.json({ success: true, codeId: String(treeCode._id) });
  } catch (err) {
    handleInternalError(res, err, "[admin] deleteTreeCode error");
  }
};

// ── POST /api/admin/tree-codes/:codeId/variants ─────────────────────────────
// Body: { size, sku, heightCmMin, heightCmMax, diameterCm, description,
//         bareImage, images, price, stockQuantity, isActive, sortOrder }
// Each request adds ONE variant (1 size). Admin can call repeatedly to add
// S, M, L, XL, etc. No bulk to keep the contract simple & auditable.
export const createTreeVariant = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!assertAdmin(req, res)) return;
    const { codeId } = req.params;
    const treeCode = await TreeCode.findById(codeId);
    if (!treeCode) {
      sendError(res, ErrorCode.TREE_NOT_FOUND, "Không tìm thấy mã cây");
      return;
    }
    const product = await TreeProduct.findById(treeCode.productId);
    if (!product) {
      sendError(res, ErrorCode.TREE_NOT_FOUND, "Không tìm thấy sản phẩm cha");
      return;
    }
    const body = req.body as {
      size?: string;
      sku?: string;
      heightCmMin?: number;
      heightCmMax?: number;
      diameterCm?: number;
      description?: string;
      bareImage?: string;
      images?: string[];
      price?: number;
      stockQuantity?: number;
      isActive?: boolean;
      sortOrder?: number;
    };
    const size = (body.size && body.size.trim()) || "STANDARD";
    let sku = (body.sku && body.sku.trim().toUpperCase()) || `${treeCode.code}-${size}`.toUpperCase();
    if (await Tree.exists({ sku })) {
      sku = `${sku}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    }
    if (typeof body.price !== "number" || body.price < 0) {
      sendError(res, ErrorCode.INVALID_INPUT, "Giá phải là số >= 0");
      return;
    }
    if (typeof body.stockQuantity !== "number" || body.stockQuantity < 0) {
      sendError(
        res,
        ErrorCode.INVALID_INPUT,
        "Tồn kho phải là số >= 0"
      );
      return;
    }
    const variant = await Tree.create({
      productId: product._id,
      codeId: treeCode._id,
      size,
      sku,
      name: `${product.name} — ${treeCode.name} — ${size}`,
      heightCmMin: body.heightCmMin ?? 0,
      heightCmMax: body.heightCmMax ?? 0,
      diameterCm: body.diameterCm ?? 0,
      description: body.description ?? product.description,
      bareImage: body.bareImage ?? "",
      images: Array.isArray(body.images) ? body.images : [],
      price: body.price,
      stockQuantity: body.stockQuantity,
      isActive: body.isActive ?? true,
      sortOrder: body.sortOrder ?? 0,
    });
    res.status(201).json({ variant });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      sendError(
        res,
        ErrorCode.ACCESSORY_DUPLICATED,
        "SKU đã tồn tại hoặc (mã, size) đã tồn tại"
      );
      return;
    }
    handleInternalError(res, err, "[admin] createTreeVariant error");
  }
};

// ── PATCH /api/admin/tree-variants/:variantId ────────────────────────────────
export const updateTreeVariant = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!assertAdmin(req, res)) return;
    const { variantId } = req.params;
    const variant = await Tree.findById(variantId);
    if (!variant) {
      sendError(res, ErrorCode.TREE_NOT_FOUND, "Không tìm thấy biến thể");
      return;
    }
    const body = req.body as Partial<{
      size: string;
      sku: string;
      heightCmMin: number;
      heightCmMax: number;
      diameterCm: number;
      description: string;
      bareImage: string;
      images: string[];
      price: number;
      stockQuantity: number;
      isActive: boolean;
      sortOrder: number;
    }>;
    if (body.size !== undefined) variant.size = body.size.trim();
    if (body.sku !== undefined) variant.sku = body.sku.trim().toUpperCase();
    if (body.heightCmMin !== undefined) variant.heightCmMin = body.heightCmMin;
    if (body.heightCmMax !== undefined) variant.heightCmMax = body.heightCmMax;
    if (body.diameterCm !== undefined) variant.diameterCm = body.diameterCm;
    if (body.description !== undefined) variant.description = body.description;
    if (body.bareImage !== undefined) variant.bareImage = body.bareImage;
    if (Array.isArray(body.images)) variant.images = body.images;
    if (body.price !== undefined) variant.price = body.price;
    if (body.stockQuantity !== undefined)
      variant.stockQuantity = body.stockQuantity;
    if (body.isActive !== undefined) variant.isActive = body.isActive;
    if (body.sortOrder !== undefined) variant.sortOrder = body.sortOrder;
    await variant.save();
    res.json({ variant });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      sendError(
        res,
        ErrorCode.ACCESSORY_DUPLICATED,
        "SKU đã tồn tại hoặc (mã, size) đã tồn tại"
      );
      return;
    }
    handleInternalError(res, err, "[admin] updateTreeVariant error");
  }
};

// ── DELETE /api/admin/tree-variants/:variantId ───────────────────────────────
// Soft delete: just flip isActive=false. Preserves _id so historical orders
// and cart snapshots can still resolve their references.
export const deleteTreeVariant = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!assertAdmin(req, res)) return;
    const { variantId } = req.params;
    const variant = await Tree.findById(variantId);
    if (!variant) {
      sendError(res, ErrorCode.TREE_NOT_FOUND, "Không tìm thấy biến thể");
      return;
    }
    variant.isActive = false;
    await variant.save();
    res.json({ success: true, variantId: String(variant._id) });
  } catch (err) {
    handleInternalError(res, err, "[admin] deleteTreeVariant error");
  }
};

// ── PATCH /api/admin/tree-variants/bulk ──────────────────────────────────────
// Shopee-style "Áp dụng cho tất cả". Updates many variants at once.
export const bulkUpdateTreeVariants = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!assertAdmin(req, res)) return;
    const { field, value, productId, codeId } = req.body as {
      field: string;
      value: unknown;
      productId?: string;
      codeId?: string;
    };
    const allowed = ["price", "stockQuantity", "isActive"];
    if (!allowed.includes(field)) {
      sendError(
        res,
        ErrorCode.INVALID_INPUT,
        `Field không hợp lệ: ${field}. Cho phép: ${allowed.join(", ")}`
      );
      return;
    }
    const update: Record<string, unknown> = {};
    update[field] = value;
    const query: Record<string, unknown> = {};
    if (productId) query.productId = productId;
    if (codeId) query.codeId = codeId;
    const result = await Tree.updateMany(query, update);
    res.json({ matched: result.matchedCount, modified: result.modifiedCount });
  } catch (err) {
    handleInternalError(res, err, "[admin] bulkUpdateTreeVariants error");
  }
};

// ════════════════════════════════════════════════════════════════════════════
// Styles CRUD
// ════════════════════════════════════════════════════════════════════════════

export const listStyles = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!assertAdmin(req, res)) return;
    const styles = await Style.find({}).sort({ sortOrder: 1 }).lean();
    res.json({ styles });
  } catch (err) {
    handleInternalError(res, err, "[admin] listStyles error");
  }
};

export const createStyle = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!assertAdmin(req, res)) return;
    const body = req.body as any;
    if (!body.code || !body.name) {
      sendError(res, ErrorCode.MISSING_FIELD, "Thiếu code hoặc name");
      return;
    }
    const style = await Style.create(body);
    res.status(201).json({ style });
  } catch (err) {
    handleInternalError(res, err, "[admin] createStyle error");
  }
};

export const updateStyle = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!assertAdmin(req, res)) return;
    const { id } = req.params;
    const style = await Style.findByIdAndUpdate(id, req.body, { new: true });
    if (!style) {
      sendError(res, ErrorCode.STYLE_NOT_FOUND, "Không tìm thấy style");
      return;
    }
    res.json({ style });
  } catch (err) {
    handleInternalError(res, err, "[admin] updateStyle error");
  }
};

// ════════════════════════════════════════════════════════════════════════════
// Accessories CRUD
// ════════════════════════════════════════════════════════════════════════════

export const listAccessories = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!assertAdmin(req, res)) return;
    const accs = await Accessory.find({}).sort({ sortOrder: 1, name: 1 }).lean();
    res.json({ accessories: accs });
  } catch (err) {
    handleInternalError(res, err, "[admin] listAccessories error");
  }
};

export const createAccessory = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!assertAdmin(req, res)) return;
    const body = req.body as any;
    if (!body.group || !body.type || !body.name || body.price == null) {
      sendError(
        res,
        ErrorCode.MISSING_FIELD,
        "Thiếu group, type, name hoặc price"
      );
      return;
    }
    const acc = await Accessory.create(body);
    res.status(201).json({ accessory: acc });
  } catch (err) {
    handleInternalError(res, err, "[admin] createAccessory error");
  }
};

export const updateAccessory = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!assertAdmin(req, res)) return;
    const { id } = req.params;
    const acc = await Accessory.findByIdAndUpdate(id, req.body, { new: true });
    if (!acc) {
      sendError(res, ErrorCode.ACCESSORY_NOT_FOUND, "Không tìm thấy phụ kiện");
      return;
    }
    res.json({ accessory: acc });
  } catch (err) {
    handleInternalError(res, err, "[admin] updateAccessory error");
  }
};

// ════════════════════════════════════════════════════════════════════════════
// Presets (TreeDesign with isPreset=true)
// ════════════════════════════════════════════════════════════════════════════

export const listPresets = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!assertAdmin(req, res)) return;
    const docs = await TreeDesign.find({ isPreset: true })
      .sort({ updatedAt: -1 })
      .lean();
    // Use Promise.allSettled to avoid 500 if any preset is orphaned.
    const results = await Promise.allSettled(
      docs.map((d) => loadCatalogForDesign(d))
    );
    const out: ReturnType<typeof buildDesignResponse>[] = [];
    results.forEach((r, idx) => {
      if (r.status === "fulfilled") {
        out.push(buildDesignResponse(r.value.design, r.value.pricing));
      } else {
        console.warn(
          `[admin] Skipping preset "${docs[idx].name}" (id=${docs[idx]._id}) — config invalid:`,
          r.reason instanceof Error ? r.reason.message : r.reason
        );
      }
    });
    res.json({ presets: out });
  } catch (err) {
    handleInternalError(res, err, "[admin] listPresets error");
  }
};

export const createPreset = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!assertAdmin(req, res)) return;
    const { name, config, previewImage } = req.body as any;
    if (!name || !config) {
      sendError(res, ErrorCode.MISSING_FIELD, "Thiếu name hoặc config");
      return;
    }
    const slug = await findUniqueSlug(name);
    const created = await TreeDesign.create({
      ownerId: null,
      name,
      slug,
      year: new Date().getFullYear(),
      config,
      isPublic: true,
      isPreset: true,
      previewImage: previewImage || "",
    });
    const populated = await TreeDesign.findById(created._id).lean();
    if (!populated) {
      sendError(res, ErrorCode.INTERNAL_ERROR, "Không tìm thấy preset sau khi tạo");
      return;
    }
    const { pricing } = await loadCatalogForDesign(populated);
    res.status(201).json({
      preset: buildDesignResponse(populated, pricing),
    });
  } catch (err) {
    handleInternalError(res, err, "[admin] createPreset error");
  }
};

export const updatePreset = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!assertAdmin(req, res)) return;
    const { id } = req.params;
    const design = await TreeDesign.findById(id);
    if (!design || !design.isPreset) {
      sendError(res, ErrorCode.DESIGN_NOT_FOUND, "Không tìm thấy preset");
      return;
    }
    const { name, config, previewImage } = req.body as any;
    if (name) design.name = name;
    if (config) design.config = config;
    if (previewImage !== undefined) design.previewImage = previewImage;
    await design.save();
    const populated = await TreeDesign.findById(design._id).lean();
    if (!populated) {
      sendError(res, ErrorCode.INTERNAL_ERROR, "Không tìm thấy preset sau khi cập nhật");
      return;
    }
    const { pricing } = await loadCatalogForDesign(populated);
    res.json({ preset: buildDesignResponse(populated, pricing) });
  } catch (err) {
    handleInternalError(res, err, "[admin] updatePreset error");
  }
};

export const deletePreset = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!assertAdmin(req, res)) return;
    const { id } = req.params;
    const design = await TreeDesign.findById(id);
    if (!design || !design.isPreset) {
      sendError(res, ErrorCode.DESIGN_NOT_FOUND, "Không tìm thấy preset");
      return;
    }
    await TreeDesign.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (err) {
    handleInternalError(res, err, "[admin] deletePreset error");
  }
};

// ════════════════════════════════════════════════════════════════════════════
// Orders (admin overview)
// ════════════════════════════════════════════════════════════════════════════

export const listAllOrders = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!assertAdmin(req, res)) return;
    const { status } = req.query;
    const filter: any = {};
    if (typeof status === "string") filter.status = status.toUpperCase();
    const orders = await Order.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ orders: orders.map(mapOrder) });
  } catch (err) {
    handleInternalError(res, err, "[admin] listAllOrders error");
  }
};

// ════════════════════════════════════════════════════════════════════════════
// Admin stats
// ════════════════════════════════════════════════════════════════════════════

export const getAdminStats = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const [
      totalOrders,
      pendingOrders,
      completedOrders,
      totalUsers,
      totalDesigns,
      designsShared,
      revenueAgg,
      personalizationAgg,
      lowStockAccs,
      lowStockTrees,
    ] = await Promise.all([
      Order.countDocuments(),
      Order.countDocuments({ status: { $in: ["PENDING_PAYMENT", "PAID", "CONFIRMED", "PACKING", "SHIPPING"] } }),
      Order.countDocuments({ status: "COMPLETED" }),
      User.countDocuments(),
      TreeDesign.countDocuments({ isPreset: false }),
      TreeDesign.countDocuments({ isPreset: false, isPublic: true }),
      Order.aggregate([
        { $match: { status: { $in: ["COMPLETED", "SHIPPING", "DELIVERING", "DELIVERED", "PAID", "CONFIRMED"] } } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      Order.aggregate([
        { $match: { "items.hasPersonalization": true } },
        { $count: "n" },
      ]),
      Accessory.find({ stock: { $lte: 5 }, isActive: true })
        .select("name stock type")
        .limit(20)
        .lean(),
      Tree.find({ stockQuantity: { $lte: 5 }, isActive: true })
        .select("name size stockQuantity sku")
        .limit(20)
        .lean(),
    ]);

    const revenue = revenueAgg.length > 0 ? revenueAgg[0].total : 0;
    const personalizationCount =
      personalizationAgg.length > 0 ? personalizationAgg[0].n : 0;
    const aov = totalOrders > 0 ? revenue / totalOrders : 0;

    res.json({
      stats: {
        totalOrders,
        pendingOrders,
        completedOrders,
        totalUsers,
        totalDesigns,
        designsShared,
        revenue,
        aov,
        personalizationCount,
        ordersByStatus: await Order.aggregate([
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
        lowStock: {
          accessories: lowStockAccs,
          trees: lowStockTrees,
        },
      },
    });
  } catch (err) {
    handleInternalError(res, err, "[admin] getAdminStats error");
  }
};

// ── GET /api/admin/analytics ──────────────────────────────────────────────────
export const getAdminAnalytics = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!assertAdmin(req, res)) return;

    const fromQuery = req.query.from as string | undefined;
    const toQuery = req.query.to as string | undefined;

    const fromDate = fromQuery ? new Date(fromQuery) : new Date(Date.now() - 30 * 86400_000);
    const toDate = toQuery ? new Date(toQuery) : new Date();

    const matchDate: any = {
      createdAt: { $gte: fromDate, $lte: toDate },
    };

    const [
      revenueByDay,
      styleBreakdown,
      deliveryOptionBreakdown,
      allOrdersInPeriod,
    ] = await Promise.all([
      // 1. Revenue & orders by day
      Order.aggregate([
        { $match: { ...matchDate, status: { $ne: "CANCELLED" } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            revenue: { $sum: "$totalAmount" },
            orderCount: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // 2. Style preference breakdown
      Order.aggregate([
        { $match: { ...matchDate, status: { $ne: "CANCELLED" } } },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.style.code",
            name: { $first: "$items.style.name" },
            count: { $sum: "$items.quantity" },
          },
        },
        { $sort: { count: -1 } },
      ]),

      // 3. Delivery option distribution
      Order.aggregate([
        { $match: { ...matchDate, status: { $ne: "CANCELLED" } } },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.deliveryOption",
            count: { $sum: "$items.quantity" },
          },
        },
      ]),

      // 4. Sample items for accessory aggregation
      Order.find({ ...matchDate, status: { $ne: "CANCELLED" } })
        .select("items")
        .lean(),
    ]);

    // Aggregate top accessories across orders
    const accessoryMap: Record<string, { name: string; type: string; totalCount: number }> = {};
    for (const order of allOrdersInPeriod) {
      for (const item of order.items || []) {
        for (const line of item.lines || []) {
          if (line.kind === "ACCESSORY" && line.name) {
            const key = line.name;
            if (!accessoryMap[key]) {
              accessoryMap[key] = {
                name: line.name,
                type: line.type || "ORNAMENT",
                totalCount: 0,
              };
            }
            accessoryMap[key].totalCount += (line.quantity || 1) * (item.quantity || 1);
          }
        }
      }
    }

    const topAccessories = Object.values(accessoryMap)
      .sort((a, b) => b.totalCount - a.totalCount)
      .slice(0, 10);

    res.json({
      analytics: {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        revenueByDay: revenueByDay.map((r) => ({
          date: r._id,
          revenue: r.revenue,
          orderCount: r.orderCount,
        })),
        stylesBreakdown: styleBreakdown.map((s) => ({
          styleCode: s._id || "UNKNOWN",
          name: s.name || s._id || "Khác",
          count: s.count,
        })),
        deliveryOptions: deliveryOptionBreakdown.map((d) => ({
          deliveryOption: d._id || "READY_TO_DISPLAY",
          count: d.count,
        })),
        topAccessories,
      },
    });
  } catch (err) {
    handleInternalError(res, err, "[admin] getAdminAnalytics error");
  }
};

// ════════════════════════════════════════════════════════════════════════════
// User management (kept from legacy)
// ════════════════════════════════════════════════════════════════════════════

export const getAllUsers = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!assertAdmin(req, res)) return;
    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = parseInt((req.query.limit as string) || "20", 10);
    const search = req.query.search as string | undefined;
    const query: any = {};
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: "i" } },
        { name: { $regex: search, $options: "i" } },
      ];
    }
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      User.find(query)
        .select("-passwordHash")
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .lean(),
      User.countDocuments(query),
    ]);
    res.json({
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    handleInternalError(res, err, "[admin] getAllUsers error");
  }
};

export const updateUserStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!assertAdmin(req, res)) return;
    const { id } = req.params;
    const { status, reason } = req.body as {
      status?: "active" | "suspended";
      reason?: string;
    };
    if (!status || !["active", "suspended"].includes(status)) {
      sendError(res, ErrorCode.INVALID_INPUT, "Trạng thái không hợp lệ");
      return;
    }
    const user = await User.findById(id);
    if (!user) {
      sendError(res, ErrorCode.ACCOUNT_NOT_FOUND, "Không tìm thấy người dùng");
      return;
    }
    if (String(user._id) === String(req.user!.id)) {
      sendError(res, ErrorCode.FORBIDDEN, "Không thể khóa tài khoản của chính mình");
      return;
    }
    user.accountStatus = status;
    if (reason !== undefined) user.accountStatusReason = reason;
    await user.save();
    res.json({ success: true, user: {
      _id: user._id,
      accountStatus: user.accountStatus,
      accountStatusReason: user.accountStatusReason,
    } });
  } catch (err) {
    handleInternalError(res, err, "[admin] updateUserStatus error");
  }
};

export const getUserDetails = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!assertAdmin(req, res)) return;
    const { id } = req.params;
    const user = await User.findById(id).select("-passwordHash").lean();
    if (!user) {
      sendError(res, ErrorCode.ACCOUNT_NOT_FOUND, "Không tìm thấy người dùng");
      return;
    }
    const [totalOrders, cancelledOrders, totalSpent] = await Promise.all([
      Order.countDocuments({ buyerId: id }),
      Order.countDocuments({ buyerId: id, status: "CANCELLED" }),
      Order.aggregate([
        {
          $match: {
            buyerId: new Types.ObjectId(String(id)),
            status: "COMPLETED",
          },
        },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
    ]);
    const spent = totalSpent.length > 0 ? totalSpent[0].total : 0;
    res.json({
      user,
      stats: {
        totalOrders,
        cancelledOrders,
        totalSpent: spent,
      },
    });
  } catch (err) {
    handleInternalError(res, err, "[admin] getUserDetails error");
  }
};