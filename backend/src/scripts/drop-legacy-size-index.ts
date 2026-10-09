// One-off: drop the legacy `size_1` unique index from the `trees` collection.
// That index came from the pre-refactor schema where size was globally unique.
// After refactor, the unique constraint is on (productId, color, size) only.
import mongoose from "mongoose";
import * as dotenv from "dotenv";

dotenv.config();

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI required");
  if (/thriftit/i.test(uri)) throw new Error("Refusing thriftit*");
  await mongoose.connect(uri);

  const db = mongoose.connection.db!;
  const indexes = await db.collection("trees").indexes();
  console.log("[drop-legacy-size-index] Current indexes on `trees`:");
  for (const idx of indexes) {
    console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)} (unique=${!!idx.unique})`);
  }

  if (indexes.find((i) => i.name === "size_1")) {
    await db.collection("trees").dropIndex("size_1");
    console.log("[drop-legacy-size-index] Dropped legacy `size_1` unique index.");
  } else {
    console.log("[drop-legacy-size-index] No legacy `size_1` index found.");
  }

  // Also drop the 1-dimension (productId, size) index — it's superseded
  // by the 2-dimension (productId, color, size) unique index.
  if (indexes.find((i) => i.name === "productId_1_size_1")) {
    await db.collection("trees").dropIndex("productId_1_size_1");
    console.log(
      "[drop-legacy-size-index] Dropped `productId_1_size_1` unique index."
    );
  } else {
    console.log(
      "[drop-legacy-size-index] No `productId_1_size_1` index found."
    );
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[drop-legacy-size-index] Failed:", err);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
