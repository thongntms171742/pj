// One-off: drop the legacy unique indexes from the `trees` collection.
//
// History of indexes on `trees`:
//   1. `size_1` (legacy)                 — size was globally unique
//   2. `productId_1_size_1` (legacy)     — (product, size) was unique
//   3. `productId_1_color_1_size_1`      — (product, color, size) was unique
//                                          ← this is the one currently blocking
//                                            new variant creation on production
//   4. `codeId_1_size_1` (CURRENT)       — (code, size) is the new unique
//
// We only drop (1)(2)(3). Index (4) must stay — it is the active constraint
// that matches the 3-tier refactor.

import mongoose from "mongoose";
import * as dotenv from "dotenv";

dotenv.config();

const LEGACY_INDEXES = [
  "size_1",
  "productId_1_size_1",
  "productId_1_color_1_size_1",
] as const;

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI required");
  if (/thriftit/i.test(uri)) throw new Error("Refusing thriftit*");
  await mongoose.connect(uri);

  const db = mongoose.connection.db!;
  const coll = db.collection("trees");
  const indexes = await coll.indexes();
  console.log("[drop-legacy-tree-indexes] Current indexes on `trees`:");
  for (const idx of indexes) {
    console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)} (unique=${!!idx.unique})`);
  }

  let droppedCount = 0;
  for (const name of LEGACY_INDEXES) {
    if (indexes.find((i) => i.name === name)) {
      try {
        await coll.dropIndex(name);
        console.log(`[drop-legacy-tree-indexes] Dropped legacy index "${name}".`);
        droppedCount++;
      } catch (err) {
        console.error(`[drop-legacy-tree-indexes] Failed to drop "${name}":`, err);
      }
    } else {
      console.log(`[drop-legacy-tree-indexes] No legacy index "${name}" found.`);
    }
  }

  console.log(
    `[drop-legacy-tree-indexes] Done. ${droppedCount} index(es) dropped.`
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[drop-legacy-tree-indexes] Failed:", err);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
