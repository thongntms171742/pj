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
  console.log(`[verify] Products: ${products.length}`);
  for (const p of products) {
    const variants = await Tree.find({ productId: p._id }).lean();
    console.log(
      `  - "${p.name}" (slug=${p.slug}, isActive=${p.isActive}) — ${variants.length} variants`
    );
    for (const v of variants) {
      console.log(
        `      size=${v.size} price=${v.price} stock=${v.stock} isActive=${v.isActive}`
      );
    }
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[verify] Failed:", err);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
