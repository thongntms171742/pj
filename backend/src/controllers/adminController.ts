import { Request, Response } from "express";
import { Product } from "../models/Product";
import { User } from "../models/User";
import { Order } from "../models/Order";
import { Notification } from "../models/Notification";
import { mapProduct } from "./productController";
import { mapSeller } from "./sellerController";
import { sendError, ErrorCode, handleInternalError } from "../utils/errors";
import { Types } from "mongoose";

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
//
// NOTE: Response shape is `{ users, total }` so FE AdminScreen
//       can read `res.users` directly. Earlier versions returned
//       `{ sellers, total }` — that alias is kept via /admin/pending-sellers/sellers
//       (deprecated, kept for backward compat — see routes/admin.ts).
export const getPendingSellers = async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = await User.find({ "sellerProfile.status": "pending_approval" })
      .select("name email sellerProfile roles")
      .lean();

    const sellers = users.map(mapSeller);
    // Primary shape: { users } — matches FE AdminScreen (`res.users`).
    res.json({ users: sellers, total: sellers.length });
  } catch (err) {
    handleInternalError(res, err, "[admin] getPendingSellers error");
  }
};

// ── PATCH /api/admin/sellers/:id/approve ─────────────────────────────────────
// Approve a pending seller application: set status = "active".
// This is the canonical path. Legacy path `/admin/users/:id/approve-seller`
// is kept as an alias in routes/admin.ts (deprecated).
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

// ── PATCH /api/admin/sellers/:id/reject ──────────────────────────────────────
// Reject a pending seller application: set status = "suspended" + remove role.
// Canonical path. Legacy `/admin/users/:id/reject-seller` kept as alias.
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

// ── GET /api/admin/stats ─────────────────────────────────────────────────────
// Aggregated platform-wide statistics for the Admin Dashboard.
//
// Returns counts + platform profit (sum of platformFee across all orders).
// Response shape: `{ stats: {...} }` — matches FE AdminScreen usage.
export const getAdminStats = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [
      pendingListings,
      soldProducts,
      totalOrders,
      totalUsers,
      totalSellers,
      platformProfitAgg,
    ] = await Promise.all([
      Product.countDocuments({ status: "pending" }),
      Product.countDocuments({ status: "sold" }),
      Order.countDocuments(),
      User.countDocuments({}),
      User.countDocuments({ roles: "seller" }),
      Order.aggregate([
        {
          $group: {
            _id: null,
            totalPlatformFee: { $sum: { $ifNull: ["$platformFee", 0] } },
          },
        },
      ]),
    ]);

    const platformProfit =
      platformProfitAgg.length > 0 ? platformProfitAgg[0].totalPlatformFee : 0;

    res.json({
      stats: {
        pendingListings,
        soldProducts,
        totalOrders,
        totalUsers,
        totalSellers,
        platformProfit,
      },
    });
  } catch (err) {
    handleInternalError(res, err, "[admin] getAdminStats error");
  }
};

// ── PATCH /api/admin/sellers/:id/commission-rate ─────────────────────────────
// Admin updates the per-seller commission rate. The new rate applies to
// orders created AFTER this change — existing orders keep the rate that was
// stored on their OrderItem at checkout (see OrderItem.commissionRate).
//
// Validation: rate ∈ [0, 1] where 0 = no commission, 1 = seller earns nothing.
// Common values: 0.1 (10% platform fee) or 0.15 (15% platform fee).
export const updateSellerCommission = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { commissionRate } = req.body as { commissionRate?: number };

    const n = Number(commissionRate);
    if (!Number.isFinite(n) || n < 0 || n > 1) {
      sendError(
        res,
        ErrorCode.COMMISSION_RATE_INVALID,
        "commissionRate phải là số trong khoảng [0, 1] (vd: 0.1 = 10% phí sàn)"
      );
      return;
    }

    const user = await User.findById(id);
    if (!user) {
      sendError(res, ErrorCode.SELLER_NOT_FOUND, "Không tìm thấy người bán");
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
    if (!user.roles.includes("seller")) {
      sendError(
        res,
        ErrorCode.INVALID_INPUT,
        "Người dùng không có role seller — không thể đặt commission"
      );
      return;
    }

    const previousRate = user.sellerProfile.commissionRate ?? 0.1;
    user.sellerProfile.commissionRate = n;
    await user.save();

    res.json({
      success: true,
      seller: mapSeller(user.toObject()),
      previousRate,
      newRate: n,
    });
  } catch (err) {
    handleInternalError(res, err, "[admin] updateSellerCommission error");
  }
};

// ── GET /api/admin/users ─────────────────────────────────────────────────────
export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search as string;
    const role = req.query.role as string;

    const query: any = {};
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: "i" } },
        { name: { $regex: search, $options: "i" } },
      ];
    }

    if (role) {
      const rolesArray = role.split(",").map((r) => r.trim());
      query.roles = { $in: rolesArray };
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

// ── PATCH /api/admin/users/:id/status ────────────────────────────────────────
export const updateUserStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body as { status?: "active" | "suspended"; reason?: string };

    if (!status || !["active", "suspended"].includes(status)) {
      sendError(res, ErrorCode.INVALID_INPUT, "Trạng thái không hợp lệ");
      return;
    }

    const user = await User.findById(id);
    if (!user) {
      sendError(res, ErrorCode.ACCOUNT_NOT_FOUND, "Không tìm thấy người dùng");
      return;
    }

    if (user._id.toString() === req.user!.id) {
      sendError(res, ErrorCode.FORBIDDEN, "Không thể khóa tài khoản của chính mình");
      return;
    }

    user.accountStatus = status;
    if (reason !== undefined) {
      user.accountStatusReason = reason;
    }

    await user.save();

    res.json({
      success: true,
      user: {
        _id: user._id,
        accountStatus: user.accountStatus,
        accountStatusReason: user.accountStatusReason,
      },
    });
  } catch (err) {
    handleInternalError(res, err, "[admin] updateUserStatus error");
  }
};

// ── GET /api/admin/users/:id/details ─────────────────────────────────────────
export const getUserDetails = async (req: Request, res: Response): Promise<void> => {
  try {
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
        { $match: { buyerId: new Types.ObjectId(id as string), status: "COMPLETED" } },
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