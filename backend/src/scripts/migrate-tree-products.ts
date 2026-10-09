// ── migrate-tree-products: backfill 3 legacy trees → 1 TreeProduct ───────────
//
// Before (1 doc per size):
//   Tree { _id, size: S, name: "Cây thông Noel 1m2 - Mây Xanh", material: "PVC", ... }
//   Tree { _id, size: M, name: "Cây thông Noel 1m5 - Mây Xanh", material: "PVC", ... }
//   Tree { _id, size: L, name: "Cây thông Noel 1m8 - Mây Xanh", material: "PVC", ... }
//
// After (1 product + N variants):
//   TreeProduct { name: "Cây thông Noel Mây Xanh", material: "PVC", ... }
//     ├─ Tree { productId, size: S, ... }   (was legacy S)
//     ├─ Tree { productId, size: M, ... }   (was legacy M)
//     └─ Tree { productId, size: L, ... }   (was legacy L)
//
// Strategy:
//   1. Group legacy trees (productId=null) by (material + name prefix).
//   2. For each group: create TreeProduct, attach variants.
//   3. Variants that don't have a sibling (unique size) still get a
//      TreeProduct but with only 1 variant.
//
// Idempotent: skips products that already exist (by slug).

import mongoose from "mongoose";
import { Tree } from "../models/Tree";
import { TreeProduct } from "../models/TreeProduct";
import * as dotenv from "dotenv";

dotenv.config();

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function stripSizeFromName(name: string): string {
  // "Cây thông Noel 1m2 - Mây Xanh" → "Cây thông Noel - Mây Xanh"
  // Remove height markers: 1m2, 1m5, 1.5m, 100cm, 1 mét, etc.
  return name
    .replace(/\d+(\.\d+)?\s*(cm|mm|m|mét|met)\s*\d*/gi, "")
    .replace(/\b\d+\s*-\s*/g, " ") // standalone "1 - ", "2 - "
    .replace(/\s*-\s*-\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

async function ensureUniqueSlug(base: string): Promise<string> {
  const root = base || "tree";
  let slug = root;
  let i = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await TreeProduct.exists({ slug })) {
    slug = `${root}-${i++}`;
  }
  return slug;
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI required");
  if (/thriftit/i.test(uri)) throw new Error("Refusing thriftit*");
  await mongoose.connect(uri);

  const legacy = await Tree.find({ productId: null }).lean();
  console.log(`[migrate] Found ${legacy.length} legacy trees (productId=null)`);

  if (legacy.length === 0) {
    console.log("[migrate] Nothing to migrate. Done.");
    await mongoose.disconnect();
    return;
  }

  // Group by (material + name-stripped)
  const groups = new Map<
    string,
    { material: string; density: string; description: string; coverImage: string; trees: typeof legacy }
  >();
  for (const t of legacy) {
    const familyName = stripSizeFromName(t.name);
    const key = `${t.material}::${familyName}`;
    const existing = groups.get(key);
    if (existing) {
      existing.trees.push(t);
    } else {
      groups.set(key, {
        material: t.material,
        density: t.density,
        description: t.description,
        coverImage: t.images?.[0] ?? "",
        trees: [t],
      });
    }
  }

  let created = 0;
  let variantsAttached = 0;
  let skipped = 0;

  for (const [key, group] of groups) {
    const sample = group.trees[0];
    const familyName = stripSizeFromName(sample.name);
    const slug = await ensureUniqueSlug(slugify(familyName));

    const existingProduct = await TreeProduct.findOne({ slug });
    if (existingProduct) {
      console.log(`[migrate] Skip: slug="${slug}" already exists (id=${existingProduct._id})`);
      skipped++;
      // Still try to attach any unassigned variants.
      const unassigned = group.trees.filter(
        (t) => !t.productId
      );
      if (unassigned.length > 0) {
        await Tree.updateMany(
          { _id: { $in: unassigned.map((t) => t._id) } },
          { $set: { productId: existingProduct._id } }
        );
        variantsAttached += unassigned.length;
        console.log(
          `[migrate] Attached ${unassigned.length} unattached variants to existing product ${existingProduct._id}`
        );
      }
      continue;
    }

    const product = await TreeProduct.create({
      name: familyName,
      slug,
      material: group.material,
      density: group.density,
      description: group.description,
      coverImage: group.coverImage,
      images: sample.images ?? [],
      isActive: sample.isActive,
      sortOrder: sample.sortOrder,
    });
    created++;

    const variantIds = group.trees.map((t) => t._id);
    await Tree.updateMany(
      { _id: { $in: variantIds } },
      { $set: { productId: product._id } }
    );
    variantsAttached += variantIds.length;
    console.log(
      `[migrate] Created product ${product._id} ("${familyName}") with ${variantIds.length} variants`
    );
  }

  console.log("\n[migrate] === Summary ===");
  console.log(`[migrate] Legacy trees:    ${legacy.length}`);
  console.log(`[migrate] Products created: ${created}`);
  console.log(`[migrate] Skipped (dup):    ${skipped}`);
  console.log(`[migrate] Variants attached: ${variantsAttached}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[migrate] Failed:", err);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
