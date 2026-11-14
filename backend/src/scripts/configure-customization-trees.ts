import dotenv from "dotenv";
dotenv.config();
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { Tree } from "../models/Tree";
import { TreeProduct } from "../models/TreeProduct";
import { getMongoUri } from "../config/env";
import configuration from "../data/customization-trees.json";

// Update the existing M/L variants; keep their IDs, inventory and physical dimensions.
async function main(): Promise<void> {
  await mongoose.connect(getMongoUri());
  try {
    const trees = await Tree.find({ sku: { $in: configuration.variants.map(v => v.sku) } });
    const base = trees.find(tree => tree.sku === "BASE");
    const product = base && await TreeProduct.findById(base.productId);
    if (!base || !product?.isCustomizerBase) throw new Error("Không tìm thấy sản phẩm cây raw hiện có.");
    const changes = configuration.variants.map(variant => {
      const tree = trees.find(item => item.sku === variant.sku);
      if (!tree || !tree.productId.equals(base.productId) || !tree.codeId.equals(base.codeId) || tree.size !== variant.size) {
        throw new Error(`Biến thể ${variant.sku}/${variant.size} không đúng sản phẩm hiện có. Không tạo trùng cây.`);
      }
      if (variant.bareImage && !fs.existsSync(path.resolve(__dirname, "../..", variant.bareImage.slice(1)))) {
        throw new Error(`Thiếu ảnh cây ${variant.sku}: ${variant.bareImage}`);
      }
      return { tree, fields: {
        price: variant.price, size: variant.size, name: `${product.name} — ${variant.size}`,
        customizationMode: "free", customizationCatalog: configuration.catalogKey,
        ...(variant.bareImage ? { bareImage: variant.bareImage } : {}),
      } };
    });
    if (!process.argv.includes("--apply")) {
      console.log(JSON.stringify({ mode: "dry-run", variants: changes.map(({ tree, fields }) => ({ sku: tree.sku, ...fields })) }));
      return;
    }
    const backupDirectory = path.resolve(__dirname, "../../../../.codex-runtime/customization-input");
    fs.mkdirSync(backupDirectory, { recursive: true });
    const backup = path.join(backupDirectory, `raw-tree-variants-${Date.now()}.json`);
    fs.writeFileSync(backup, JSON.stringify(trees.map(tree => tree.toObject()), null, 2));
    for (const { tree, fields } of changes) {
      await Tree.updateOne({ _id: tree._id, sku: tree.sku, size: tree.size }, { $set: fields }, { runValidators: true });
    }
    console.log(JSON.stringify({ updated: changes.map(({ tree, fields }) => ({ id: String(tree._id), sku: tree.sku, ...fields })), backup }));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
