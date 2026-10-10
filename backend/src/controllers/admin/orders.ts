import { Request, Response } from "express";
import { Order } from "../../models/Order";
import { orderToDto } from "../../dto/order";
import { ah } from "../../utils/asyncRoute";
import { ok } from "../../utils/respond";

// ── Admin order overview ─────────────────────────────────────────────────────

export const listAllOrders = ah(async (req, res) => {
  const { status } = req.query;
  const filter: Record<string, unknown> = {};
  if (typeof status === "string") filter.status = status.toUpperCase();
  const orders = await Order.find(filter).sort({ createdAt: -1 }).lean();
  ok(res, { orders: orders.map(orderToDto) });
});
