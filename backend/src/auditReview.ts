import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

// Import model to ensure schema + indexes are registered
import "./models/Review";

async function auditIndexes() {
  await mongoose.connect(process.env.MONGODB_URI || "");
  console.log("Connected\n");

  // Ensure indexes are created (Mongoose calls createIndex on connect,
  // but we explicitly call ensureIndexes to be sure)
  await mongoose.model("Review").ensureIndexes();

  const indexes = await mongoose.connection.db!.collection("reviews").indexes();
  console.log("=== REVIEW INDEXES ===");
  for (const idx of indexes) {
    console.log(`  Name: ${idx.name}`);
    console.log(`  Key:  ${JSON.stringify(idx.key)}`);
    console.log(`  Unique: ${idx.unique || false}`);
    console.log();
  }

  // Verify the compound unique index exists
  const compoundIdx = indexes.find(
    (i: any) => i.key?.userId === 1 && i.key?.orderId === 1 && i.key?.productId === 1
  );
  if (compoundIdx && compoundIdx.unique) {
    console.log("✅ AUDIT 1 PASSED — Compound unique index (userId, orderId, productId) exists in MongoDB");
  } else {
    console.error("❌ AUDIT 1 FAILED — Compound unique index NOT found");
    console.log("Found indexes:", indexes.map((i: any) => i.name));
  }

  await mongoose.disconnect();
}

auditIndexes().catch(console.error);
