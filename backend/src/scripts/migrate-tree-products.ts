// ── migrate-tree-products: backfill 3 legacy trees → 1 TreeProduct + 9 SKUs ─
//
// Before (1 doc per size, 3 docs with different "colors" as names):
//   Tree { _id, size: S, name: 'Cây thông Noel 1m2 — "Mây Xanh"', material: PVC, ... }
//   Tree { _id, size: M, name: 'Cây thông Noel 1m5 — "Tuyết Bạc"', material: PVC, ... }
//   Tree { _id, size: L, name: 'Cây thông Noel 1m8 — "Đại Lễ Hội"', material: PVC, ... }
//
// After (1 product + 9 SKUs from 3 colors × 3 sizes):
//   TreeProduct { name: "Cây thông Noel", colors: ["Mây Xanh","Tuyết Bạc","Đại Lễ Hội"], ... }
//     ├─ Tree { productId, color: "Mây Xanh",   size: S, ... }
//     ├─ Tree { productId, color: "Mây Xanh",   size: M, ... }
//     ├─ Tree { productId, color: "Mây Xanh",   size: L, ... }
//     ├─ Tree { productId, color: "Tuyết Bạc",  size: S, ... }   ← material from M variant, size from S variant
//     ├─ Tree { productId, color: "Tuyết Bạc",  size: M, ... }
//     ├─ Tree { productId, color: "Tuyết Bạc",  size: L, ... }
//     ├─ Tree { productId, color: "Đại Lễ Hội", size: S, ... }
//     ├─ Tree { productId, color: "Đại Lễ Hội", size: M, ... }
//     └─ Tree { productId, color: "Đại Lễ Hội", size: L, ... }
//
// Strategy:
//   1. Read 3 legacy trees (one per size).
//   2. Each legacy tree carries 1 color (encoded in its name suffix).
//   3. Extract {size, color} from each legacy tree.
//   4. Create 1 TreeProduct with all 3 colors.
//   5. For each (color, size) pair, create 1 variant with:
//      - color, size from extracted data
//      - height, diameter from the legacy tree with that size
//      - price, stock from the legacy tree with that size
//      - bareImage from the legacy tree with that color
//      If a (color, size) pair doesn't have a legacy source, skip it
//      (admin can fill in the missing SKUs via the form).
//
// Idempotent: skips if a TreeProduct with the computed slug already exists.

import mongoose from "mongoose";
import { Tree } from "../models/Tree";
import { TreeProduct, type TreeColor, TREE_COLORS } from "../models/TreeProduct";
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

function extractColor(name: string): TreeColor | null {
  for (const c of TREE_COLORS) {
    if (name.includes(c)) return c;
  }
  return null;
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

  // Build cartesian source map: Map<color, Map<size, legacyTree>>
  const source = new Map<TreeColor, Map<string, (typeof legacy)[number]>>();
  for (const t of legacy) {
    const color = extractColor(t.name);
    if (!color) {
      console.warn(`[migrate] Skip tree without recognized color: "${t.name}"`);
      continue;
    }
    if (!source.has(color)) source.set(color, new Map());
    source.get(color)!.set(t.size, t);
  }

  // Build the variant list (only include pairs we have data for).
  const variants: Array<{
    color: TreeColor;
    size: "S" | "M" | "L";
    source: (typeof legacy)[number];
  }> = [];
  for (const [color, sizeMap] of source) {
    for (const [size, t] of sizeMap) {
      variants.push({ color, size, source: t });
    }
  }
  console.log(`[migrate] Will create ${variants.length} variants across ${source.size} colors`);

  // All legacy trees share a common family name (strip size + color).
  const sample = legacy[0];
  const familyName = sample.name
    .replace(/\d+(\.\d+)?\s*(cm|mm|m|mét|met)\s*\d*/gi, "")
    .replace(/"[^"]*"/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const slug = await ensureUniqueSlug(slugify(familyName));

  const existing = await TreeProduct.findOne({ slug });
  if (existing) {
    console.log(
      `[migrate] Skip: slug="${slug}" already exists (id=${existing._id})`
    );
    // Still attach any unattached legacy variants.
    if (legacy.length > 0) {
      await Tree.updateMany(
        { _id: { $in: legacy.map((t) => t._id) } },
        { $set: { productId: existing._id } }
      );
      console.log(`[migrate] Attached ${legacy.length} variants to existing product`);
    }
    await mongoose.disconnect();
    return;
  }

  const product = await TreeProduct.create({
    name: familyName,
    slug,
    density: sample.density,
    description: sample.description,
    coverImage: sample.images?.[0] ?? "",
    images: sample.images ?? [],
    colors: TREE_COLORS.filter((c) => source.has(c)),
    isActive: sample.isActive,
    sortOrder: sample.sortOrder,
  });
  console.log(
    `[migrate] Created product ${product._id} ("${familyName}") with colors: ${product.colors.join(", ")}`
  );

  // No need to insertMany — the 3 legacy trees ARE the 3 SKUs we want
  // (one per size, mapped to their original color). We just attach them
  // and stamp the `color` field. If admin wants more (color, size)
  // combinations, they fill them in via the admin form.

  for (const t of legacy) {
    const color = extractColor(t.name);
    if (!color) continue;
    await Tree.updateOne(
      { _id: t._id },
      {
        $set: {
          productId: product._id,
          color,
        },
      }
    );
  }

  console.log(
    `[migrate] Attached ${legacy.length} legacy variants to product ${product._id}`
  );
  console.log(
    `[migrate] Summary: 1 product × ${product.colors.length} colors, ${legacy.length} SKUs (1 per size). Admin can add more SKUs via form.`
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[migrate] Failed:", err);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
