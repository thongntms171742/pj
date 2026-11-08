import { Types } from "mongoose";
import { Accessory } from "../models/Accessory";
import { Tree } from "../models/Tree";

// ── Stock reservation ────────────────────────────────────────────────────────
// Phase Customizer: tồn kho gồm Tree variant + Accessory. Tùy chỉnh / Cart /
// Preview KHÔNG trừ kho — chỉ Checkout/Order mới reserve nguyên tử, rollback
// nếu bất kỳ món nào hết.

export interface StockReservation {
  refId: Types.ObjectId;
  kind: "TREE" | "ACCESSORY";
  quantity: number;
}

export async function reserveStock(items: StockReservation[]): Promise<void> {
  const decremented: StockReservation[] = [];
  try {
    for (const item of items) {
      if (item.kind === "TREE") {
        const updated = await Tree.updateOne(
          { _id: item.refId, stockQuantity: { $gte: item.quantity }, isActive: true },
          { $inc: { stockQuantity: -item.quantity } }
        );
        if (!updated.acknowledged || updated.matchedCount === 0) {
          throw new Error(`OUT_OF_STOCK: TREE ${item.refId}`);
        }
      } else {
        const updated = await Accessory.updateOne(
          { _id: item.refId, stockQuantity: { $gte: item.quantity }, isActive: true },
          { $inc: { stockQuantity: -item.quantity } }
        );
        if (!updated.acknowledged || updated.matchedCount === 0) {
          throw new Error(`ACCESSORY_OUT_OF_STOCK: ACCESSORY ${item.refId}`);
        }
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
        await Accessory.updateOne({ _id: item.refId }, { $inc: { stockQuantity: item.quantity } });
      }
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

// ── Restore accessory stock (gọi kèm restoreTreeStock khi hủy đơn có decor) ──
export async function restoreAccessoryStock(
  accessoryId: Types.ObjectId,
  quantity: number
): Promise<void> {
  if (!accessoryId || !quantity) return;
  try {
    await Accessory.updateOne({ _id: accessoryId }, { $inc: { stockQuantity: quantity } });
  } catch (err) {
    console.error(`[inventory] restoreAccessoryStock failed for ${accessoryId}:`, err);
  }
}
