import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import { Tree } from "../models/Tree";
import { TreeProduct } from "../models/TreeProduct";
import { Accessory } from "../models/Accessory";
import manifest from "../data/customization-accessories.json";
import { getMongoUri } from "../config/env";

async function main(): Promise<void> {
  await mongoose.connect(getMongoUri());
  try {
    if (process.argv.includes("--prices-only")) {
      let updated = 0;
      for (const accessory of manifest.accessories) {
        if (accessory.priceStatus !== "confirmed" || !Number.isSafeInteger(accessory.unitPrice) || accessory.unitPrice <= 0) {
          throw new Error(`Chưa có đơn giá hợp lệ cho ${accessory.sku}`);
        }
        const result = await Accessory.updateOne({
          sku: accessory.sku, catalogKey: manifest.catalogKey,
          $or: [{ priceStatus: "requires_confirmation" }, { unitPrice: null }],
        }, { $set: { unitPrice: accessory.unitPrice, priceStatus: "confirmed", unitLabel: accessory.unitLabel } }, { runValidators: true });
        updated += result.modifiedCount;
      }
      console.log(JSON.stringify({ mode: "prices-only", updated }));
      return;
    }
    const variant = await Tree.findOne({ sku: manifest.baseSku, isActive: true });
    const product = variant && await TreeProduct.findById(variant.productId);
    if (!variant || !product?.isCustomizerBase) {
      throw new Error("Không tìm thấy cây nền BASE đang sử dụng. Không tạo cây mới.");
    }
    for (const accessory of manifest.accessories) {
      const existing = await Accessory.findOne({ sku: accessory.sku }).lean();
      const preserveConfirmedPrice = existing?.priceStatus === "confirmed" && existing.unitPrice !== null && Number.isSafeInteger(existing.unitPrice);
      await Accessory.findOneAndUpdate({ sku: accessory.sku }, {
        $set: {
          ...accessory,
          ...(preserveConfirmedPrice ? { unitPrice: existing.unitPrice, priceStatus: "confirmed" } : {}),
          description: accessory.source.note,
          catalogKey: manifest.catalogKey,
          slotTypes: ["generic"],
          isActive: true,
          sortOrder: accessory.source.figure,
        },
        $setOnInsert: { stockQuantity: 0 },
      }, { upsert: true, runValidators: true });
    }
    variant.customizationMode = "free";
    variant.customizationCatalog = manifest.catalogKey;
    await variant.save();
    console.log(JSON.stringify({ variantId: String(variant._id), sku: variant.sku,
      imported: manifest.accessories.length,
      confirmedPrices: manifest.accessories.filter(a => a.priceStatus === "confirmed").length }));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
