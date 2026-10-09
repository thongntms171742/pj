import { Request, Response } from "express";
import { Types } from "mongoose";
import { Tree } from "../models/Tree";
import { TreeProduct } from "../models/TreeProduct";
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
        stock: t.stock,
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
// Tree Products (Shopee-style parent + variants) — admin only
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

// GET /api/admin/tree-products
// Returns Shopee-style grouped list: [{ product, variants[] }]
export const listTreeProducts = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!assertAdmin(_req, res)) return;
    const groups = await loadGroupedTreeCatalog({ includeEmptyProducts: true });
    res.json({ treeProducts: groups });
  } catch (err) {
    handleInternalError(res, err, "[admin] listTreeProducts error");
  }
};

// POST /api/admin/tree-products
// Body: { name, material, density, description, coverImage, images, isActive,
//         sortOrder, variants: [{ size, price, stock, heightCmMin, heightCmMax,
//         diameterCm, bareImage, isActive, sortOrder }] }
//
// Behavior (Shopee-style bulk):
//   - Atomic: if any variant invalid → 400, no partial write
//   - Upserts: if productId provided, updates; else creates new
//   - Variants are full-replace: missing size in variants[] = delete that size
//   - All variants must have one of S/M/L (at least 1)
export const upsertTreeProduct = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!assertAdmin(req, res)) return;
    const body = req.body as {
      productId?: string;
      name?: string;
      material?: string;
      density?: string;
      description?: string;
      coverImage?: string;
      images?: string[];
      isActive?: boolean;
      sortOrder?: number;
      variants?: Array<{
        size: "S" | "M" | "L";
        price: number;
        stock: number;
        heightCmMin: number;
        heightCmMax: number;
        diameterCm: number;
        bareImage?: string;
        isActive?: boolean;
        sortOrder?: number;
      }>;
    };

    if (!body.name || typeof body.name !== "string") {
      sendError(res, ErrorCode.MISSING_FIELD, "Thiếu tên sản phẩm");
      return;
    }
    if (!Array.isArray(body.variants) || body.variants.length === 0) {
      sendError(
        res,
        ErrorCode.MISSING_FIELD,
        "Cần ít nhất 1 size variant (S/M/L)"
      );
      return;
    }
    const sizes = new Set<string>();
    for (const v of body.variants) {
      if (!v || !["S", "M", "L"].includes(v.size)) {
        sendError(
          res,
          ErrorCode.INVALID_INPUT,
          `Variant size không hợp lệ: ${v?.size}`
        );
        return;
      }
      if (sizes.has(v.size)) {
        sendError(
          res,
          ErrorCode.ACCESSORY_DUPLICATED,
          `Trùng size ${v.size} trong variants`
        );
        return;
      }
      sizes.add(v.size);
      if (typeof v.price !== "number" || v.price < 0) {
        sendError(
          res,
          ErrorCode.INVALID_INPUT,
          `Giá của size ${v.size} phải là số >= 0`
        );
        return;
      }
      if (typeof v.stock !== "number" || v.stock < 0) {
        sendError(
          res,
          ErrorCode.INVALID_INPUT,
          `Kho của size ${v.size} phải là số >= 0`
        );
        return;
      }
      if (v.heightCmMin < 0 || v.heightCmMax < v.heightCmMin) {
        sendError(
          res,
          ErrorCode.INVALID_INPUT,
          `Chiều cao size ${v.size} không hợp lệ`
        );
        return;
      }
    }

    let product: InstanceType<typeof TreeProduct> | null = null;
    if (body.productId && body.productId !== "new") {
      product = await TreeProduct.findById(body.productId);
      if (!product) {
        sendError(res, ErrorCode.TREE_NOT_FOUND, "Không tìm thấy tree product");
        return;
      }
      product.name = body.name.trim();
      product.material = body.material ?? product.material;
      product.density = body.density ?? product.density;
      product.description = body.description ?? "";
      product.coverImage = body.coverImage ?? "";
      product.images = Array.isArray(body.images) ? body.images : [];
      if (body.isActive !== undefined) product.isActive = body.isActive;
      if (body.sortOrder !== undefined) product.sortOrder = body.sortOrder;
      await product.save();
    } else {
      const slug = await ensureUniqueSlug(slugify(body.name));
      product = await TreeProduct.create({
        name: body.name.trim(),
        slug,
        material: body.material ?? "PVC",
        density: body.density ?? "standard",
        description: body.description ?? "",
        coverImage: body.coverImage ?? "",
        images: Array.isArray(body.images) ? body.images : [],
        isActive: body.isActive ?? true,
        sortOrder: body.sortOrder ?? 0,
      });
    }

    // Full-replace variants (Shopee UX: add/edit/remove sizes).
    await Tree.deleteMany({ productId: product._id });
    const newVariants = await Tree.insertMany(
      body.variants.map((v) => ({
        productId: product!._id,
        size: v.size,
        name: `${body.name!.trim()} - ${v.size}`,
        price: v.price,
        stock: v.stock,
        heightCmMin: v.heightCmMin,
        heightCmMax: v.heightCmMax,
        diameterCm: v.diameterCm,
        bareImage: v.bareImage ?? "",
        material: body.material ?? "PVC",
        density: body.density ?? "standard",
        description: body.description ?? "",
        isActive: v.isActive ?? true,
        sortOrder: v.sortOrder ?? 0,
      }))
    );

    res.status(body.productId && body.productId !== "new" ? 200 : 201).json({
      treeProduct: {
        _id: String(product._id),
        name: product.name,
        slug: product.slug,
        material: product.material,
        density: product.density,
        description: product.description,
        coverImage: product.coverImage,
        images: product.images,
        isActive: product.isActive,
        sortOrder: product.sortOrder,
        variants: newVariants.map((v) => ({
          _id: String(v._id),
          size: v.size,
          price: v.price,
          stock: v.stock,
          heightCmMin: v.heightCmMin,
          heightCmMax: v.heightCmMax,
          diameterCm: v.diameterCm,
          bareImage: v.bareImage,
          isActive: v.isActive,
          sortOrder: v.sortOrder,
        })),
      },
    });
  } catch (err) {
    handleInternalError(res, err, "[admin] upsertTreeProduct error");
  }
};

// DELETE /api/admin/tree-products/:productId
// Soft delete: hide product + cascade-deactivate variants (preserves
// variant _id refs in existing orders/designs).
export const deleteTreeProduct = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!assertAdmin(req, res)) return;
    const { productId } = req.params;
    const productIdStr = Array.isArray(productId) ? productId[0] : productId;
    if (!productIdStr || productIdStr.startsWith("legacy-")) {
      sendError(
        res,
        ErrorCode.INVALID_INPUT,
        "Không thể xóa legacy tree product bằng endpoint này — dùng PATCH /api/admin/trees/:id để soft-delete từng variant"
      );
      return;
    }
    const product = await TreeProduct.findById(productIdStr);
    if (!product) {
      sendError(res, ErrorCode.TREE_NOT_FOUND, "Không tìm thấy tree product");
      return;
    }
    product.isActive = false;
    await product.save();
    await Tree.updateMany({ productId: product._id }, { isActive: false });
    res.json({ success: true, productId: String(product._id) });
  } catch (err) {
    handleInternalError(res, err, "[admin] deleteTreeProduct error");
  }
};

// PATCH /api/admin/trees/:id/bulk
// Shopee-style: "Áp dụng cho tất cả phân loại".
// Body: { field: "price"|"stock"|"isActive", value: number|boolean }
// Updates every variant matching a filter (optionally per product).
export const bulkUpdateTreeVariants = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!assertAdmin(req, res)) return;
    const { field, value, productId } = req.body as {
      field: string;
      value: unknown;
      productId?: string;
    };
    const allowed = ["price", "stock", "isActive"];
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
      Tree.find({ stock: { $lte: 5 }, isActive: true })
        .select("name size stock")
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