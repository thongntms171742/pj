import { Types } from "mongoose";
import { Tree } from "../models/Tree";

// ── Stock reservation ────────────────────────────────────────────────────────
// Phase Customizer: chỉ CÂY (Tree variant) mới quản lý tồn kho.
// Phụ kiện trang trí là "vật liệu thiết kế" — không có tồn kho, không được
// reserve, không được restore (guardrail: DesignAccessory tách khỏi hàng hoá).
//
// Tùy chỉnh / Save Design / Add Cart / Checkout Preview → KHÔNG trừ kho.
// Chỉ Create Order mới reserve nguyên tử, rollback nếu bất kỳ cây nào hết.

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
        // ACCESSORY không quản lý tồn kho → bỏ qua (không trừ, không rollback).
        continue;
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
      }
    } catch (rollbackErr) {
      console.error(`[inventory] rollback failed for ${item.kind} ${item.refId}:`, rollbackErr);
    }
  }
}

// ── Restore stock when an order is cancelled / refunded ──────────────────────
// Chỉ hoàn kho cây. Idempotency được đảm bảo ở tầng Order (`stockRestored`).
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
