// ── 3-tier Migration Script ──────────────────────────────────────────────────
// One-shot script that migrates the existing 2-tier data (TreeProduct +
// Tree variant with `color` field) into the 3-tier structure
// (TreeProduct → TreeCode → Tree variant).
//
// Run: npx ts-node src/scripts/migrate-to-3tier.ts
//
// Behavior:
//   - Read all TreeProduct docs
//   - For each color in TreeProduct.colors:
//       - Create a TreeCode (auto-mapped code: "AUTO-{idx}", name = color)
//   - For each existing Tree variant with productId matching:
//       - If variant.color ∈ TreeProduct.colors:
//           Set variant.codeId = the matching TreeCode._id
//       - Set variant.sku = `{productSlug}-{color}-{size}`
//   - Remove TreeProduct.colors (no longer in schema)
//
// Safe to run multiple times (idempotent on matching code names).

import mongoose from "mongoose";
import dotenv from "dotenv";
import { Tree } from "../models/Tree";
import { TreeProduct } from "../models/TreeProduct";
import { TreeCode } from "../models/TreeCode";

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error("MONGODB_URI is not set in .env");
  process.exit(1);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

async function main() {
  console.log("[migrate] Connecting...");
  await mongoose.connect(MONGO_URI!);

  const products = await TreeProduct.find().lean();
  console.log(`[migrate] Found ${products.length} products.`);

  let codeCount = 0;
  let variantCount = 0;

  for (const p of products) {
    // colors is no longer in schema but may still exist in old docs.
    const oldColors: string[] = (p as unknown as { colors?: string[] }).colors ?? [];
    if (oldColors.length === 0) {
      console.log(`[migrate] Product "${p.name}" has no colors to migrate.`);
      continue;
    }

    // Create codes for each color.
    const codeByColor = new Map<string, string>();
    for (let i = 0; i < oldColors.length; i++) {
      const color = oldColors[i];
      const codeSlug = `AUTO-${i + 1}`;
      const code = await TreeCode.findOneAndUpdate(
        { productId: p._id, code: codeSlug },
        {
          productId: p._id,
          code: codeSlug,
          name: color,
          description: `Auto-migrated from product.colors (${color})`,
          image: "",
          material: "",
          isActive: true,
          sortOrder: i,
        },
        { upsert: true, new: true }
      );
      codeByColor.set(color, String(code._id));
      codeCount++;
    }

    // Update variants: set codeId + sku.
    const variants = await Tree.find({ productId: p._id }).lean();
    for (const v of variants) {
      const color = (v as unknown as { color?: string | null }).color;
      if (!color) continue; // legacy variant without color, skip
      const codeId = codeByColor.get(color);
      if (!codeId) continue;
      const sku = `${slugify(p.name)}-${slugify(color)}-${v.size}`.toUpperCase();
      await Tree.updateOne(
        { _id: v._id },
        { $set: { codeId: new mongoose.Types.ObjectId(codeId), sku } }
      );
      variantCount++;
    }

    // Remove legacy colors field from product (best-effort, no schema enforcement).
    await TreeProduct.updateOne(
      { _id: p._id },
      { $unset: { colors: "" } }
    );
  }

  console.log(
    `[migrate] Done. Created ${codeCount} codes, updated ${variantCount} variants.`
  );
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate] Failed:", err);
  process.exit(1);
});
