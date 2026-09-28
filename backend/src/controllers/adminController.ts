import { Request, Response } from "express";
import { Product } from "../models/Product";
import { User } from "../models/User";
import { Notification } from "../models/Notification";
import { mapProduct } from "./productController";
import { mapSeller } from "./sellerController";
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

// ── GET /api/admin/pending-sellers ───────────────────────────────────────────
// List all users whose sellerProfile.status === "pending_approval".
export const getPendingSellers = async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = await User.find({ "sellerProfile.status": "pending_approval" })
      .select("name email sellerProfile roles")
      .lean();

    const sellers = users.map(mapSeller);
    res.json({ sellers, total: sellers.length });
  } catch (err) {
    handleInternalError(res, err, "[admin] getPendingSellers error");
  }
};

// ── PATCH /api/admin/users/:id/approve-seller ────────────────────────────────
// Approve a pending seller application: set status = "active".
// Sends notification to the user.
export const approveSeller = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      sendError(res, ErrorCode.ACCOUNT_NOT_FOUND, "Không tìm thấy người dùng");
      return;
    }

    if (!user.sellerProfile) {
      sendError(
        res,
        ErrorCode.INVALID_INPUT,
        "Người dùng chưa đăng ký làm người bán (chưa có sellerProfile)"
      );
      return;
    }

    if (user.sellerProfile.status === "active") {
      // Idempotent: already approved
      res.json({
        seller: mapSeller(user.toObject()),
        alreadyApproved: true,
      });
      return;
    }

    user.sellerProfile.status = "active";
    await user.save();

    // Notify the user
    await Notification.create({
      userId: user._id,
      type: "order",
      title: "Đơn đăng ký bán hàng đã được phê duyệt",
      message: `Chúc mừng! Shop "${user.sellerProfile.shopName}" của bạn đã được phê duyệt. Bạn có thể bắt đầu đăng sản phẩm.`,
    });

    res.json({
      seller: mapSeller(user.toObject()),
      alreadyApproved: false,
    });
  } catch (err) {
    handleInternalError(res, err, "[admin] approveSeller error");
  }
};

// ── PATCH /api/admin/users/:id/reject-seller ─────────────────────────────────
// Reject a pending seller application: set status = "suspended" + remove role.
// Sends notification explaining rejection.
export const rejectSeller = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason } = req.body as { reason?: string };

    const user = await User.findById(id);
    if (!user) {
      sendError(res, ErrorCode.ACCOUNT_NOT_FOUND, "Không tìm thấy người dùng");
      return;
    }

    if (!user.sellerProfile) {
      sendError(
        res,
        ErrorCode.INVALID_INPUT,
        "Người dùng chưa đăng ký làm người bán (chưa có sellerProfile)"
      );
      return;
    }

    user.sellerProfile.status = "suspended";
    // Remove "seller" role to prevent them from creating products
    user.roles = user.roles.filter((r) => r !== "seller");
    await user.save();

    await Notification.create({
      userId: user._id,
      type: "order",
      title: "Đơn đăng ký bán hàng bị từ chối",
      message: `Đơn đăng ký shop "${user.sellerProfile.shopName}" đã bị từ chối${reason ? `. Lý do: ${reason}` : ""}.`,
    });

    res.json({
      seller: mapSeller(user.toObject()),
      rejected: true,
    });
  } catch (err) {
    handleInternalError(res, err, "[admin] rejectSeller error");
  }
};