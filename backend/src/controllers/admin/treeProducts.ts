import { Response } from "express";
import { TreeProduct, TreeCode, Tree, Review, Design, CartItem } from "../../models";
import { loadGroupedTreeCatalog } from "../../services/catalogService";
import { sendError, ErrorCode } from "../../utils/errors";
import { ah } from "../../utils/asyncRoute";
import { ok, created } from "../../utils/respond";
import { V, requireField } from "../../utils/validation";
import { ensureUniqueSlug } from "../../utils/slug";

// ── Tree Products (Shopee-style parent) ──────────────────────────────────────

export const listTreeProducts = ah(async (_req, res) => {
  const groups = await loadGroupedTreeCatalog();
  ok(res, { treeProducts: groups });
});

export const createTreeProduct = ah(async (req, res) => {
  const name = requireField(res, req.body?.name, V.string(200), "name");
  if (!name) return;
  const slug = await ensureUniqueSlug(
    TreeProduct,
    req.body.slug || name,
    "tree-product"
  );
  const product = await TreeProduct.create({
    name,
    slug,
    category: req.body.category ?? "Cây thông Noel",
    density: req.body.density ?? "standard",
    description: req.body.description ?? "",
    coverImage: req.body.coverImage ?? "",
    images: Array.isArray(req.body.images) ? req.body.images : [],
    aspectRatio: req.body.aspectRatio ?? "1:1",
    videoUrl: req.body.videoUrl ?? req.body.video ?? "",
    isActive: req.body.isActive ?? true,
    sortOrder: req.body.sortOrder ?? 0,
  });
  created(res, { treeProduct: product });
});

export const updateTreeProduct = ah(async (req, res) => {
  const { productId } = req.params;
  const product = await TreeProduct.findById(productId);
  if (!product) {
    sendError(res, ErrorCode.TREE_NOT_FOUND, "Không tìm thấy tree product");
    return;
  }
  const body = req.body as Record<string, unknown>;
  if (typeof body.name === "string") product.name = String(body.name).trim();
  if (typeof body.slug === "string" && body.slug !== product.slug) {
    product.slug = await ensureUniqueSlug(TreeProduct, String(body.slug), "tree-product");
  }
  if (typeof body.category === "string") product.category = body.category;
  if (typeof body.density === "string") product.density = body.density;
  if (typeof body.description === "string") product.description = body.description;
  if (typeof body.coverImage === "string") product.coverImage = body.coverImage;
  if (Array.isArray(body.images)) product.images = body.images as string[];
  if (typeof body.aspectRatio === "string") product.aspectRatio = body.aspectRatio;
  if (typeof body.videoUrl === "string") product.videoUrl = body.videoUrl;
  else if (typeof body.video === "string") product.videoUrl = body.video;
  if (typeof body.isActive === "boolean") product.isActive = body.isActive;
  if (typeof body.sortOrder === "number") product.sortOrder = body.sortOrder;
  await product.save();
  ok(res, { treeProduct: product });
});

export const deleteTreeProduct = ah(async (req, res) => {
  const { productId } = req.params;
  const product = await TreeProduct.findById(productId);
  if (!product) {
    sendError(res, ErrorCode.TREE_NOT_FOUND, "Không tìm thấy tree product");
    return;
  }

  // ── Safety check: không cho xóa nếu còn Review tham chiếu tới product
  // Review là dữ liệu đánh giá lịch sử, xóa sẽ làm mất data của khách.
  const reviewCount = await Review.countDocuments({ productId: product._id });
  if (reviewCount > 0) {
    sendError(
      res,
      ErrorCode.CONFLICT,
      `Không thể xóa sản phẩm đã có ${reviewCount} đánh giá. ` +
        `Vui lòng ẩn sản phẩm hoặc xóa các đánh giá trước.`
    );
    return;
  }

  // ── Cascade hard delete: xóa product → tất cả code → tất cả variant
  // - OrderItem.variant là string snapshot, KHÔNG cần clean.
  // - Review đã được chặn ở trên.
  // - CartItem trỏ tới Tree (variant) — xóa cascade sẽ tự dọn.
  const variantIds = await Tree.find({ productId }, { _id: 1 }).distinct("_id");
  if (variantIds.length > 0) {
    await CartItem.deleteMany({
      "config.variantId": { $in: variantIds },
    });
    await Design.deleteMany({ treeVariantId: { $in: variantIds } });
    await Tree.deleteMany({ productId: product._id });
  }
  await TreeCode.deleteMany({ productId: product._id });
  await TreeProduct.deleteOne({ _id: product._id });

  ok(res, {
    success: true,
    productId: String(product._id),
    deleted: {
      variants: variantIds.length,
      codes: "cascade",
      product: 1,
    },
  });
});
