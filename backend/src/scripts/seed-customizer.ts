// ── Build Your Christmas — seed dữ liệu Tree Customizer ─────────────────────
// Run: npm run seed:customizer
//
// Mục đích:
//   1. Tạo `Accessory` từ các nhóm sản phẩm phụ kiện đã có sẵn trong catalog
//      3-tier (ORNAMENT / LIGHTS / DECOR) — mỗi TreeVariant của các nhóm này
//      trở thành 1 phụ kiện gắn được lên cây.
//   2. Publish `SlotMap` v1 cho mỗi TreeVariant thuộc nhóm TREE — định nghĩa
//      các điểm chạm (slot) chuẩn hoá 0–1 theo bounding-box cây.
//
// Script idempotent: chạy lại nhiều lần không tạo bản ghi trùng.
// Phụ kiện upsert theo `sku`; slotmap publish tăng `version` (bản cũ giữ lại
// để Design/Cart/Order còn đối chiếu được version).

import mongoose from "mongoose";
import dotenv from "dotenv";
import { Accessory } from "../models/Accessory";
import { SlotMap, type ISlotDefinition } from "../models/SlotMap";
import { Tree } from "../models/Tree";
import { TreeCode } from "../models/TreeCode";
import { TreeProduct } from "../models/TreeProduct";

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error("MONGODB_URI is not set in .env");
  process.exit(1);
}

if (/\/thriftit(\?|$)/.test(MONGO_URI) || MONGO_URI.endsWith("/thriftit")) {
  console.error(
    "MONGODB_URI points to the legacy `thriftit` database. Refusing to seed."
  );
  process.exit(1);
}

// ── Cấu hình map category → slotTypes ────────────────────────────────────────
// `generic` cho phép phụ kiện này gắn vào mọi loại slot (dùng cho nơ / kẹo).
const CATEGORY_SLOT_TYPES: Record<string, string[]> = {
  ORNAMENT: ["ball"],
  LIGHTS: ["light-string"],
  DECOR: ["ribbon", "gift-box", "generic"],
};

const ACCESSORY_CATEGORIES = Object.keys(CATEGORY_SLOT_TYPES);

// ── Sinh slotmap hình chóp (conifer) ─────────────────────────────────────────
// Toạ độ chuẩn hoá 0–1 theo bounding-box cây trong canvas 3:4.
//   - Đỉnh cây ở y ≈ 0.10, tán rộng dần xuống dưới, gốc ở y ≈ 0.90.
//   - Bán kính `radius` là bán kính snap (đơn vị chuẩn hoá) — người dùng thả
//     phụ kiện gần slot trong bán kính này sẽ được snap vào slot.
interface TierSpec {
  slotType: string;
  y: number;
  /** Nửa chiều rộng tán cây tại tầng này (0–1 theo bề ngang). */
  halfWidth: number;
  count: number;
  radius: number;
}

const TIERS: TierSpec[] = [
  { slotType: "star-top", y: 0.1, halfWidth: 0.05, count: 1, radius: 0.09 },
  { slotType: "light-string", y: 0.28, halfWidth: 0.17, count: 3, radius: 0.07 },
  { slotType: "ball", y: 0.45, halfWidth: 0.27, count: 4, radius: 0.07 },
  { slotType: "ball", y: 0.62, halfWidth: 0.35, count: 5, radius: 0.065 },
  { slotType: "ball", y: 0.78, halfWidth: 0.39, count: 6, radius: 0.06 },
  { slotType: "ribbon", y: 0.9, halfWidth: 0.08, count: 1, radius: 0.09 },
];

function buildSlots(): ISlotDefinition[] {
  const slots: ISlotDefinition[] = [];

  TIERS.forEach((tier, tierIndex) => {
    for (let i = 0; i < tier.count; i++) {
      // Tầng 1 chỉ có 1 slot → đặt đúng giữa. Nhiều slot → chia đều theo tán.
      const offset =
        tier.count === 1
          ? 0
          : (i - (tier.count - 1) / 2) * ((tier.halfWidth * 2) / (tier.count - 1));
      const x = clamp01(0.5 + offset);
      const y = clamp01(tier.y);

      slots.push({
        slotId: `${tier.slotType}-t${tierIndex + 1}-${i + 1}`,
        slotType: tier.slotType,
        x: round4(x),
        y: round4(y),
        radius: tier.radius,
        // z tăng dần từ tầng trên xuống tầng dưới để vẽ đúng thứ tự chồng lớp.
        z: tierIndex * 10 + i,
        allowedAccessoryTypes: [],
      });
    }
  });

  return slots;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

// ── 1. Seed Accessory ─────────────────────────────────────────────────────────
async function seedAccessories(): Promise<number> {
  const products = await TreeProduct.find({
    isActive: true,
    category: { $in: ACCESSORY_CATEGORIES },
  }).lean();

  if (products.length === 0) {
    console.log(
      "[seed:customizer] Không tìm thấy nhóm phụ kiện (ORNAMENT/LIGHTS/DECOR) — bỏ qua."
    );
    return 0;
  }

  let created = 0;
  let updated = 0;

  for (const product of products) {
    const slotTypes = CATEGORY_SLOT_TYPES[product.category] ?? ["generic"];
    const codes = await TreeCode.find({ productId: product._id }).lean();

    for (const code of codes) {
      const variants = await Tree.find({ codeId: code._id }).lean();

      for (const variant of variants) {
        const sku = `ACC-${variant.sku}`.toUpperCase();
        // Ảnh: ưu tiên ảnh riêng của mã cây, fallback ảnh bìa của sản phẩm.
        const image = code.image || product.coverImage || "";

        const existing = await Accessory.findOne({ sku }).lean();
        const doc = {
          sku,
          name: `${variant.name || code.name || product.name}`.trim(),
          description:
            variant.description || code.description || product.description || "",
          image,
          unitPrice: variant.price ?? 0,
          stockQuantity: variant.stockQuantity ?? 0,
          slotTypes,
          isActive: true,
          sortOrder: variant.sortOrder ?? 0,
        };

        if (existing) {
          await Accessory.updateOne({ sku }, { $set: doc });
          updated += 1;
        } else {
          await Accessory.create(doc);
          created += 1;
        }
      }
    }
  }

  console.log(
    `[seed:customizer] Accessory: ${created} tạo mới, ${updated} cập nhật.`
  );
  return created + updated;
}

// ── 2. Seed SlotMap cho các cây TREE ─────────────────────────────────────────
async function seedSlotMaps(): Promise<number> {
  const treeProducts = await TreeProduct.find({
    isActive: true,
    category: "TREE",
  }).lean();

  if (treeProducts.length === 0) {
    console.log("[seed:customizer] Không tìm thấy nhóm cây TREE — bỏ qua slotmap.");
    return 0;
  }

  const productIds = treeProducts.map((p) => p._id);
  const codes = await TreeCode.find({ productId: { $in: productIds } }).lean();
  const codeIds = codes.map((c) => c._id);
  const variants = await Tree.find({ codeId: { $in: codeIds } }).lean();

  const slots = buildSlots();
  let published = 0;

  for (const variant of variants) {
    // Không publish lại nếu đã có bản published với cùng nội dung slot.
    const current = await SlotMap.findOne({
      variantId: variant._id,
      isPublished: true,
    }).lean();

    if (current && sameSlots(current.slots as any, slots)) {
      continue;
    }

    const latest = await SlotMap.findOne({ variantId: variant._id }).sort({
      version: -1,
    });
    const nextVersion = latest ? latest.version + 1 : 1;

    await SlotMap.updateMany(
      { variantId: variant._id },
      { $set: { isPublished: false } }
    );
    await SlotMap.create({
      variantId: variant._id,
      version: nextVersion,
      isPublished: true,
      slots,
    });
    published += 1;
  }

  console.log(
    `[seed:customizer] SlotMap: ${published}/${variants.length} biến thể được publish (${slots.length} slot mỗi cây).`
  );
  return published;
}

function sameSlots(a: any[], b: ISlotDefinition[]): boolean {
  if (!Array.isArray(a) || a.length !== b.length) return false;
  return b.every((slot, i) => {
    const other = a[i];
    return (
      String(other.slotId) === slot.slotId &&
      String(other.slotType) === slot.slotType &&
      Number(other.x) === slot.x &&
      Number(other.y) === slot.y &&
      Number(other.radius) === slot.radius
    );
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("[seed:customizer] Connecting to MongoDB...");
  await mongoose.connect(MONGO_URI as string);
  console.log("[seed:customizer] Connected. Running idempotent seed...");

  await seedAccessories();
  await seedSlotMaps();

  console.log("[seed:customizer] Done!");
  await mongoose.disconnect();
}

main()
  .catch(async (err) => {
    console.error("[seed:customizer] Failed:", err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
