import { Request, Response } from "express";
import { TreeProduct, TreeCode, Tree } from "../../models";
import { loadGroupedTreeCatalog } from "../../services/catalogService";
import { sendError, ErrorCode } from "../../utils/errors";
import { ah } from "../../utils/asyncRoute";
import { ok, created } from "../../utils/respond";
import { V, requireField } from "../../utils/validation";
import { slugify, ensureUniqueSlug } from "../../utils/slug";

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
  product.isActive = false;
  product.slug = `${product.slug}-deleted-${Date.now()}`;
  await product.save();
  // Cascade-deactivate child codes + variants (no hard delete — historical
  // orders need to keep resolving their refs).
  await TreeCode.updateMany({ productId }, { isActive: false });
  await Tree.updateMany({ productId }, { isActive: false });
  ok(res, { success: true, productId: String(product._id) });
});
