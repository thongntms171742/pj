// One-off cleanup: remove admin test artifacts ("test", "dds") from presets.
// Use this to keep the public gallery clean. These are not orphans — they
// hydrate successfully — but they are obviously debug residue and should
// not be shown to FE customers.

import mongoose from "mongoose";
import { TreeDesign } from "../models/TreeDesign";
import * as dotenv from "dotenv";

dotenv.config();

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI required");
  if (/thriftit/i.test(uri)) throw new Error("Refusing thriftit*");
  await mongoose.connect(uri);

  const r = await TreeDesign.deleteMany({
    isPreset: true,
    name: { $in: ["test", "dds"] },
  });
  console.log(`[cleanup] Removed ${r.deletedCount} test/dds presets`);

  const remaining = await TreeDesign.find({ isPreset: true })
    .select("name slug isPublic year")
    .lean();
  console.log(`[cleanup] Remaining presets: ${remaining.length}`);
  for (const p of remaining) {
    console.log(`  - ${p.name} (slug=${p.slug}, isPublic=${p.isPublic}, year=${p.year})`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[cleanup] Crashed:", err);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
