import { Types } from "mongoose";
import { Tree } from "../models/Tree";

// ── Stock reservation ────────────────────────────────────────────────────────
// Sau refactor: chỉ còn Tree variant là có stock. Accessory đã bị purge (mọi
// phụ kiện nằm gọn trong TreeProduct.description). Mỗi order chỉ cần reserve
// stock Tree variant.

export interface StockReservation {
  refId: Types.ObjectId;
  kind: "TREE";
  quantity: number;
}

export async function reserveStock(items: StockReservation[]): Promise<void> {
  const decremented: StockReservation[] = [];
  try {
    for (const item of items) {
      const updated = await Tree.updateOne(
        { _id: item.refId, stockQuantity: { $gte: item.quantity }, isActive: true },
        { $inc: { stockQuantity: -item.quantity } }
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
      await Tree.updateOne({ _id: item.refId }, { $inc: { stockQuantity: item.quantity } });
    } catch (rollbackErr) {
      console.error(`[inventory] rollback failed for ${item.kind} ${item.refId}:`, rollbackErr);
    }
  }
}

// ── Restore stock when an order is cancelled ──────────────────────────────────
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
