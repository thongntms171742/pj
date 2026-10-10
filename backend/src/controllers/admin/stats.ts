import { Request, Response } from "express";
import { Order } from "../../models/Order";
import { User } from "../../models/User";
import { TreeDesign } from "../../models/TreeDesign";
import { Tree } from "../../models/Tree";
import { Accessory } from "../../models/Accessory";
import { ah } from "../../utils/asyncRoute";
import { ok } from "../../utils/respond";

// ── Admin stats & analytics ──────────────────────────────────────────────────

export const getAdminStats = ah(async (_req, res) => {
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
    Order.countDocuments({
      status: {
        $in: ["PENDING_PAYMENT", "PAID", "CONFIRMED", "PACKING", "SHIPPING"],
      },
    }),
    Order.countDocuments({ status: "COMPLETED" }),
    User.countDocuments(),
    TreeDesign.countDocuments({ isPreset: false }),
    TreeDesign.countDocuments({ isPreset: false, isPublic: true }),
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
});

export const getAdminAnalytics = ah(async (req, res) => {
  const fromQuery = req.query.from as string | undefined;
  const toQuery = req.query.to as string | undefined;
  const fromDate = fromQuery
    ? new Date(fromQuery)
    : new Date(Date.now() - 30 * 86400_000);
  const toDate = toQuery ? new Date(toQuery) : new Date();
  const matchDate = { createdAt: { $gte: fromDate, $lte: toDate } };

  const [revenueByDay, styleBreakdown, deliveryOptionBreakdown, allOrdersInPeriod] =
    await Promise.all([
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
            _id: "$items.style.code",
            name: { $first: "$items.style.name" },
            count: { $sum: "$items.quantity" },
          },
        },
        { $sort: { count: -1 } },
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
      Order.find({ ...matchDate, status: { $ne: "CANCELLED" } })
        .select("items")
        .lean(),
    ]);

  // Aggregate top accessories across orders
  const accessoryMap: Record<
    string,
    { name: string; type: string; totalCount: number }
  > = {};
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
          accessoryMap[key].totalCount +=
            (line.quantity || 1) * (item.quantity || 1);
        }
      }
    }
  }
  const topAccessories = Object.values(accessoryMap)
    .sort((a, b) => b.totalCount - a.totalCount)
    .slice(0, 10);

  ok(res, {
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
});
