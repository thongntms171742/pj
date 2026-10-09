// NUCLEAR: hard-delete trees + treeProducts + everything tree-related.
// Drops unique indexes too. Use only in dev/staging.
import mongoose from "mongoose";
import * as dotenv from "dotenv";

dotenv.config();

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI required");
  if (/thriftit/i.test(uri)) throw new Error("Refusing thriftit*");
  await mongoose.connect(uri);

  const db = mongoose.connection.db!;
  const collections = await db.listCollections().toArray();
  console.log(`[nuke] Collections in DB:`, collections.map((c) => c.name).join(", "));

  const targets = ["trees", "treeproducts", "treedesigns", "cartitems", "carts", "orders", "notifications"];
  for (const name of targets) {
    if (collections.find((c) => c.name === name)) {
      const r = await db.collection(name).deleteMany({});
      console.log(`[nuke] ${name}: deleted ${r.deletedCount}`);
    }
  }

  // Drop the trees indexes (we'll let Mongoose rebuild them)
  try {
    await db.collection("trees").dropIndexes();
    console.log("[nuke] Dropped all indexes on `trees`");
  } catch (e) {
    console.log("[nuke] No indexes to drop on `trees`");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[nuke] Failed:", err);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
