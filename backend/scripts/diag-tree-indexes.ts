// scripts/diag-tree-indexes.ts
// One-off: list all indexes on the `trees` collection.
// Use before running drop-legacy-size-index.ts so we know what's actually
// on the server (Render / production MongoDB).

import mongoose from "mongoose";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set");
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    console.error("No db handle");
    process.exit(1);
  }

  const indexes = await db.collection("trees").indexes();
  console.log(`Found ${indexes.length} indexes on 'trees':`);
  for (const idx of indexes) {
    console.log(`  - name: ${idx.name}`);
    console.log(`    key: ${JSON.stringify(idx.key)}`);
    console.log(`    unique: ${idx.unique ?? false}`);
    if (idx.partialFilterExpression) {
      console.log(`    partial: ${JSON.stringify(idx.partialFilterExpression)}`);
    }
    console.log("");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
