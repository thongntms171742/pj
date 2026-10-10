import { Request, Response } from "express";
import { User } from "../../models/User";
import { sendError, ErrorCode } from "../../utils/errors";
import { ah } from "../../utils/asyncRoute";
import { ok } from "../../utils/respond";

// ── Admin user management ────────────────────────────────────────────────────

export const getAllUsers = ah(async (req, res) => {
  const page = parseInt((req.query.page as string) || "1", 10);
  const limit = parseInt((req.query.limit as string) || "20", 10);
  const search = req.query.search as string | undefined;
  const query: Record<string, unknown> = {};
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
  ok(res, {
    users,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});

export const updateUserStatus = ah(async (req, res) => {
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
  ok(res, {
    success: true,
    user: {
      _id: user._id,
      accountStatus: user.accountStatus,
      accountStatusReason: user.accountStatusReason,
    },
  });
});

export const getUserDetails = ah(async (req, res) => {
  const { id } = req.params;
  const user = await User.findById(id).select("-passwordHash").lean();
  if (!user) {
    sendError(res, ErrorCode.ACCOUNT_NOT_FOUND, "Không tìm thấy người dùng");
    return;
  }
  const { Order } = await import("../../models/Order");
  const orderCount = await Order.countDocuments({ buyerId: user._id });
  const totalSpentAgg = await Order.aggregate([
    { $match: { buyerId: user._id, status: { $in: ["COMPLETED", "DELIVERED"] } } },
    { $group: { _id: null, total: { $sum: "$totalAmount" } } },
  ]);
  const totalSpent = totalSpentAgg.length > 0 ? totalSpentAgg[0].total : 0;
  ok(res, {
    user: {
      ...user,
      orderCount,
      totalSpent,
    },
  });
});
