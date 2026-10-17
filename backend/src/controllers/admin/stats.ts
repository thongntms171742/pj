import { Request, Response } from "express";
import { Order } from "../../models/Order";
import { User } from "../../models/User";
import { Design } from "../../models/Design";
import { Tree } from "../../models/Tree";
import { ah } from "../../utils/asyncRoute";
import { ok } from "../../utils/respond";

// ── Admin stats & analytics ──────────────────────────────────────────────────
// Sau refactor: thay Accessory → chỉ Tree; thay TreeDesign.isPreset → Design.

export const getAdminStats = ah(async (_req, res) => {
  const [
    totalOrders,
    pendingOrders,
    completedOrders,
    totalUsers,
    totalDesigns,
    designsShared,
    revenueAgg,
    lowStockTrees,
  ] = await Promise.all([
    Order.countDocuments(),
    Order.countDocuments({
      status: {
        $in: ["PENDING_PAYMENT", "PAID", "CONFIRMED", "PACKING", "SHIPPING"],
      },
    }),
    Order.countDocuments({ status: "COMPLETED" }),
    User.countDocuments(),
    Design.countDocuments(),
    Design.countDocuments({ isPublic: true }),
    Order.aggregate([
      {
        $match: {
          status: {
            $in: [
              "COMPLETED",
              "SHIPPING",
              "DELIVERING",
              "DELIVERED",
              "PAID",
              "CONFIRMED",
            ],
          },
        },
      },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]),
    Tree.find({ stockQuantity: { $lte: 5 }, isActive: true })
      .select("name size stockQuantity sku")
      .limit(20)
      .lean(),
  ]);

  const revenue = revenueAgg.length > 0 ? revenueAgg[0].total : 0;
  const aov = totalOrders > 0 ? revenue / totalOrders : 0;

  ok(res, {
    stats: {
      totalOrders,
      pendingOrders,
      completedOrders,
      totalUsers,
      totalDesigns,
      designsShared,
      revenue,
      aov,
      ordersByStatus: await Order.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      lowStock: {
        trees: lowStockTrees,
      },
    },
  });
});

export const getAdminAnalytics = ah(async (req, res) => {
  const fromQuery = req.query.from as string | undefined;
  const toQuery = req.query.to as string | undefined;
  const fromDate = fromQuery
    ? new Date(fromQuery)
    : new Date(Date.now() - 30 * 86400_000);
  const toDate = toQuery ? new Date(toQuery) : new Date();
  const matchDate = { createdAt: { $gte: fromDate, $lte: toDate } };

  const [revenueByDay, deliveryOptionBreakdown] = await Promise.all([
    Order.aggregate([
      { $match: { ...matchDate, status: { $ne: "CANCELLED" } } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          revenue: { $sum: "$totalAmount" },
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
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
  ]);

  ok(res, {
    analytics: {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      revenueByDay: revenueByDay.map((r) => ({
        date: r._id,
        revenue: r.revenue,
        orderCount: r.orderCount,
      })),
      deliveryOptions: deliveryOptionBreakdown.map((d) => ({
        deliveryOption: d._id || "READY_TO_DISPLAY",
        count: d.count,
      })),
    },
  });
});
