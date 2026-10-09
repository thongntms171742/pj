// One-off cleanup for failed migration runs: reset productId on all Trees
// and drop all TreeProducts. Idempotent.
import mongoose from "mongoose";
import { TreeProduct } from "../models/TreeProduct";
import { Tree } from "../models/Tree";
import * as dotenv from "dotenv";

dotenv.config();

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI required");
  if (/thriftit/i.test(uri)) throw new Error("Refusing thriftit*");
  await mongoose.connect(uri);

  const products = await TreeProduct.find({});
  const ids = products.map((p) => p._id);
  if (ids.length > 0) {
    await Tree.updateMany(
      { productId: { $in: ids } },
      { $set: { productId: null } }
    );
    await TreeProduct.deleteMany({ _id: { $in: ids } });
    console.log(`[cleanup] Reset ${ids.length} products and variants.`);
  } else {
    console.log("[cleanup] No products to reset.");
  }
  const trees = await Tree.find({}).select("size name productId").lean();
  for (const t of trees) {
    console.log(
      `  - size=${t.size} name="${t.name}" productId=${t.productId ?? "null"}`
    );
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[cleanup] Failed:", err);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
