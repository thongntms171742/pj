import { Request, Response } from "express";
import { Product } from "../models/Product";
import { mapProduct } from "./productController";
import { sendError, ErrorCode, handleInternalError } from "../utils/errors";

// ── GET /api/admin/pending-listings ───────────────────────────────────────────
export const getPendingListings = async (_req: Request, res: Response): Promise<void> => {
  try {
    const products = await Product.find({ status: "pending" })
      .populate({ path: "sellerId", select: "name email sellerProfile" })
      .populate({ path: "categoryId", select: "name slug" })
      .sort({ createdAt: -1 })
      .lean();

    // Run through mapProduct to keep response shape consistent with /api/products
    const mapped = products.map((p) => mapProduct(p));

    res.json({ products: mapped });
  } catch (err) {
    handleInternalError(res, err, "[admin] getPendingListings error");
  }
};

// ── PATCH /api/admin/listings/:id/approve ─────────────────────────────────────
export const approveListing = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const product = await Product.findByIdAndUpdate(id, { status: "active" }, { new: true });

    if (!product) {
      sendError(res, ErrorCode.PRODUCT_NOT_FOUND, "Sản phẩm không tồn tại");
      return;
    }

    // Repopulate seller/category and run through mapProduct
    const populated = await Product.findById(product._id)
      .populate({ path: "sellerId", select: "name email sellerProfile" })
      .populate({ path: "categoryId", select: "name slug" })
      .lean();

    res.json({ product: mapProduct(populated) });
  } catch (err) {
    handleInternalError(res, err, "[admin] approveListing error");
  }
};

// ── PATCH /api/admin/listings/:id/reject ──────────────────────────────────────
export const rejectListing = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const product = await Product.findByIdAndUpdate(id, { status: "archived" }, { new: true });

    if (!product) {
      sendError(res, ErrorCode.PRODUCT_NOT_FOUND, "Sản phẩm không tồn tại");
      return;
    }

    // Repopulate seller/category and run through mapProduct
    const populated = await Product.findById(product._id)
      .populate({ path: "sellerId", select: "name email sellerProfile" })
      .populate({ path: "categoryId", select: "name slug" })
      .lean();

    res.json({ product: mapProduct(populated) });
  } catch (err) {
    handleInternalError(res, err, "[admin] rejectListing error");
  }
};