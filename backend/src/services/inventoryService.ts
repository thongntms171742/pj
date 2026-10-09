import { Types } from "mongoose";
import { Tree } from "../models/Tree";
import { Accessory } from "../models/Accessory";

// ── Stock reservation ────────────────────────────────────────────────────────
// We deduct stock atomically at order creation (both COD and online). If any
// item fails, we roll back all previous decrements in the same call.
//
// Each entry uses `updateOne({ _id, stock: { $gte: qty } }, { $inc: ... })`
// so we never sell an item we don't have. `acknowledged: true` + `matchedCount`
// distinguishes success vs failure without races.

export interface StockReservation {
  refId: Types.ObjectId;
  kind: "TREE" | "ACCESSORY";
  quantity: number;
}

export async function reserveStock(items: StockReservation[]): Promise<void> {
  const decremented: StockReservation[] = [];
  try {
    for (const item of items) {
      const updated =
        item.kind === "TREE"
          ? await Tree.updateOne(
              { _id: item.refId, stockQuantity: { $gte: item.quantity }, isActive: true },
              { $inc: { stockQuantity: -item.quantity } }
            )
          : await Accessory.updateOne(
              { _id: item.refId, stock: { $gte: item.quantity }, isActive: true },
              { $inc: { stock: -item.quantity } }
            );
      if (!updated.acknowledged || updated.matchedCount === 0) {
        throw new Error(`OUT_OF_STOCK: ${item.kind} ${item.refId}`);
      }
      decremented.push(item);
    }
  } catch (err) {
    await rollback(decremented);
    throw err;
  }
}

async function rollback(decremented: StockReservation[]): Promise<void> {
  for (const item of decremented) {
    try {
      if (item.kind === "TREE") {
        await Tree.updateOne({ _id: item.refId }, { $inc: { stockQuantity: item.quantity } });
      } else {
        await Accessory.updateOne(
          { _id: item.refId },
          { $inc: { stock: item.quantity } }
        );
      }
    } catch (rollbackErr) {
      // Swallow rollback errors — the original failure is the surface error.
      console.error(`[inventory] rollback failed for ${item.kind} ${item.refId}:`, rollbackErr);
    }
  }
}

// ── Restore stock when an order is cancelled ──────────────────────────────────
export interface AccessoryRestore {
  refId: Types.ObjectId | string;
  quantity: number;
}

export async function restoreStock(lines: AccessoryRestore[]): Promise<void> {
  for (const line of lines) {
    try {
      if (!line.refId) continue;
      await Accessory.updateOne(
        { _id: line.refId },
        { $inc: { stock: line.quantity } }
      );
    } catch (err) {
      console.error(`[inventory] restoreStock failed for accessory ${line.refId}:`, err);
    }
  }
}

export async function restoreTreeStock(
  treeId: Types.ObjectId,
  quantity: number
): Promise<void> {
  if (!treeId || !quantity) return;
  try {
    await Tree.updateOne({ _id: treeId }, { $inc: { stockQuantity: quantity } });
  } catch (err) {
    console.error(`[inventory] restoreTreeStock failed for ${treeId}:`, err);
  }
}