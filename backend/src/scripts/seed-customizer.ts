// ── Build Your Christmas — seed dữ liệu Tree Customizer ─────────────────────
// Run: npm run seed:customizer
// Run (dry-run, chỉ báo cáo): npm run seed:customizer -- --dry-run
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
//
// CHÍNH SÁCH AN TOÀN (spec §7.3):
//   - KHÔNG ghi đè SlotMap do admin đã chỉnh sửa (chỉ publish khi chưa có
//     bản published, hoặc bản published giống hệt bản seed).
//   - Kiểm tra slotId trùng, toạ độ nằm trong 0–1 trước khi ghi.
//   - Có `--dry-run` để xem báo cáo mà không ghi gì.
//   - Báo cáo số variant thành công / bỏ qua / lỗi.

import mongoose from "mongoose";
import dotenv from "dotenv";
import { Accessory } from "../models/Accessory";
import { SlotMap, type ISlotDefinition } from "../models/SlotMap";
import { Tree } from "../models/Tree";
import { TreeCode } from "../models/TreeCode";
import { TreeProduct } from "../models/TreeProduct";
import {
  normalizeDepth,
  normalizeScaleHint,
} from "../services/customizerService";

dotenv.config();

// Chế độ dry-run: chỉ báo cáo, KHÔNG ghi gì vào DB.
// Dùng: npm run seed:customizer -- --dry-run
const DRY_RUN = process.argv.includes("--dry-run");

// Chế độ chỉ đánh dấu cây base (bỏ qua seed Accessory + SlotMap).
// Dùng khi chỉ cần bật/tắt cờ isCustomizerBase cho các product cây.
// Dùng: npm run seed:customizer -- --base-only
const BASE_ONLY = process.argv.includes("--base-only");

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

// ── Metadata ghép ảnh mặc định theo loại slot ────────────────────────────────
// Giá trị lấy từ `docs_BE write/ASSET_PREPARATION_GUIDE.md`:
//   - Quả châu (ball)      → neo ở MÓC TREO trên (0.5, 0.06), bóng tiếp xúc
//   - Nơ / ruy băng (ribbon) → neo ở NÚT THẮT giữa (0.5, 0.45), bóng tiếp xúc
//   - Đèn (light-string)   → vật phẳng ⇒ không bóng
//   - Còn lại              → neo tâm vật (0.5, 0.5), bóng tiếp xúc
//
// Admin có thể chỉnh lại trong Admin UI — seed KHÔNG ghi đè giá trị đã sửa.
function defaultCompositingMeta(slotTypes: string[]): {
  anchor: { x: number; y: number };
  shadow: "none" | "soft" | "contact";
  defaultScale: number;
} {
  if (slotTypes.includes("ball")) {
    return {
      anchor: { x: 0.5, y: 0.06 },
      shadow: "contact",
      defaultScale: 1,
    };
  }
  if (slotTypes.includes("ribbon")) {
    return {
      anchor: { x: 0.5, y: 0.45 },
      shadow: "contact",
      defaultScale: 1.2,
    };
  }
  if (slotTypes.includes("light-string")) {
    return {
      anchor: { x: 0.5, y: 0.5 },
      shadow: "none",
      defaultScale: 1,
    };
  }
  return {
    anchor: { x: 0.5, y: 0.5 },
    shadow: "contact",
    defaultScale: 1,
  };
}

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
          // Metadata ghép ảnh — mặc định theo loại slot (xem ASSET_PREPARATION_GUIDE).
          // Admin có thể sửa lại trong Admin UI (kéo chéo điểm neo).
          ...defaultCompositingMeta(slotTypes),
        };

        if (DRY_RUN) {
          if (existing) updated += 1;
          else created += 1;
          continue;
        }

        if (existing) {
          // KHÔNG ghi đè metadata ghép ảnh mà admin đã chỉnh (anchor/shadow/
          // defaultScale) — chỉ cập nhật field catalog thuần.
          const { anchor, shadow, defaultScale, ...catalogFields } = doc;
          await Accessory.updateOne({ sku }, { $set: catalogFields });
          updated += 1;
        } else {
          await Accessory.create(doc);
          created += 1;
        }
      }
    }
  }

  const mode = DRY_RUN ? " [DRY-RUN — không ghi]" : "";
  console.log(
    `[seed:customizer] Accessory${mode}: ${created} tạo mới, ${updated} cập nhật.`
  );
  return created + updated;
}

// ── 2. Đánh dấu cây BASE ─────────────────────────────────────────────────────
// Cây base = cây TRƠN dùng làm nền cho Tree Customizer.
//
// Hiện tại cây base được nhận diện bằng slug/name "base" (product cha, có các
// code S/M/L với variant BASE-TIÊU CHUẨN / BASE-M-... / BASE-L-...).
// Tất cả product cây thương mại (đã trang trí sẵn) bị TẮT cờ base.
async function markBaseProducts(): Promise<number> {
  const trees = await TreeProduct.find({ category: "TREE" }).lean();

  // Ưu tiên product có slug "base" — đây là cây trơn của customizer.
  const baseProducts = trees.filter(
    (p) =>
      p.slug?.toLowerCase() === "base" ||
      p.name?.trim().toLowerCase() === "base"
  );

  if (baseProducts.length === 0) {
    console.log(
      "[seed:customizer] Không tìm thấy product 'base' — cây base cần được tạo thủ công trong Admin."
    );
    return 0;
  }

  const baseIds = new Set(baseProducts.map((p) => String(p._id)));
  let marked = 0;

  for (const p of trees) {
    const shouldBeBase = baseIds.has(String(p._id));
    if ((p.isCustomizerBase === true) !== shouldBeBase) {
      marked += 1;
      if (!DRY_RUN) {
        await TreeProduct.updateOne(
          { _id: p._id },
          { $set: { isCustomizerBase: shouldBeBase } }
        );
      }
    }
  }

  const mode = DRY_RUN ? " [DRY-RUN — không ghi]" : "";
  console.log(
    `[seed:customizer] Cây base${mode}: ${baseProducts.length} product được bật (${baseProducts
      .map((p) => p.name)
      .join(", ")}), ${marked} thay đổi cờ.`
  );
  return baseProducts.length;
}

// ── 3. Seed SlotMap cho các cây BASE ─────────────────────────────────────────
// CHỈ publish cho variant thuộc product có cờ `isCustomizerBase` — cây thương
// mại KHÔNG mở điểm chạm (ảnh đã trang trí sẵn, không có cây trơn để gắn).
//
// Variant đã có SlotMap do admin chỉnh sửa (nội dung KHÁC bản seed) sẽ được
// BỎ QUA — không ghi đè.
async function seedSlotMaps(): Promise<number> {
  let treeProducts = await TreeProduct.find({
    isActive: true,
    isCustomizerBase: true,
  }).lean();

  // Chưa đánh dấu base nào → fallback tìm product "base" theo tên.
  if (treeProducts.length === 0) {
    treeProducts = await TreeProduct.find({
      isActive: true,
      $or: [
        { slug: "base" },
        { name: /^base$/i },
      ],
    }).lean();
  }

  if (treeProducts.length === 0) {
    console.log(
      "[seed:customizer] Không tìm thấy cây base — bỏ qua slotmap."
    );
    return 0;
  }

  const productIds = treeProducts.map((p) => p._id);
  const codes = await TreeCode.find({ productId: { $in: productIds } }).lean();
  const codeIds = codes.map((c) => c._id);
  const variants = await Tree.find({ codeId: { $in: codeIds } }).lean();

  const slots = buildSlots();

  // Kiểm tra tính toàn vẹn của bộ slot trước khi ghi bất cứ variant nào.
  const slotError = validateSlotSet(slots);
  if (slotError) {
    console.error(`[seed:customizer] Bộ slot không hợp lệ — dừng: ${slotError}`);
    return 0;
  }

  let published = 0;
  let skipped = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const variant of variants) {
    const current = await SlotMap.findOne({
      variantId: variant._id,
      isPublished: true,
    }).lean();

    // Đã có bản published:
    //   - nội dung GIỐNG bản seed → không cần làm gì (idempotent).
    //   - nội dung KHÁC → admin đã chỉnh sửa → TUYỆT ĐỐI KHÔNG ghi đè.
    if (current) {
      if (sameSlots(current.slots as any, slots)) {
        skipped += 1;
        continue;
      }
      skipped += 1;
      console.log(
        `[seed:customizer] BỎ QUA "${variant.sku}" — đang có slotmap v${current.version} do admin chỉnh sửa.`
      );
      continue;
    }

    try {
      const latest = await SlotMap.findOne({ variantId: variant._id }).sort({
        version: -1,
      });
      const nextVersion = latest ? latest.version + 1 : 1;

      if (!DRY_RUN) {
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
      }
      published += 1;
    } catch (err) {
      failed += 1;
      failures.push(`${variant.sku}: ${(err as Error).message}`);
      console.error(
        `[seed:customizer] LỖI publish slotmap cho "${variant.sku}":`,
        err
      );
    }
  }

  const mode = DRY_RUN ? " [DRY-RUN — không ghi]" : "";
  console.log(
    `[seed:customizer] SlotMap${mode}: ${published}/${variants.length} biến thể được publish, ${skipped} bỏ qua, ${failed} lỗi (${slots.length} slot mỗi cây).`
  );
  if (failures.length > 0) {
    console.error("[seed:customizer] Danh sách lỗi:");
    for (const f of failures) console.error(`  - ${f}`);
  }
  return published;
}

/**
 * Kiểm tra tính toàn vẹn bộ slot: slotId không trùng, toạ độ trong 0–1,
 * radius hợp lệ. Trả về thông báo lỗi hoặc null nếu OK.
 */
function validateSlotSet(slots: ISlotDefinition[]): string | null {
  const seen = new Set<string>();
  for (const s of slots) {
    if (seen.has(s.slotId)) return `slotId trùng: ${s.slotId}`;
    seen.add(s.slotId);
    if (!Number.isFinite(s.x) || s.x < 0 || s.x > 1) {
      return `slot ${s.slotId} có x = ${s.x} ngoài 0–1`;
    }
    if (!Number.isFinite(s.y) || s.y < 0 || s.y > 1) {
      return `slot ${s.slotId} có y = ${s.y} ngoài 0–1`;
    }
    if (!Number.isFinite(s.radius) || s.radius <= 0 || s.radius > 1) {
      return `slot ${s.slotId} có radius = ${s.radius} không hợp lệ`;
    }
  }
  return null;
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
      Number(other.radius) === slot.radius &&
      // `depth` / `scaleHint` là metadata ghép ảnh do admin khai ⇒ nếu admin
      // đã sửa thì bản published KHÁC bản seed ⇒ tuyệt đối không ghi đè.
      normalizeDepth(other.depth) === normalizeDepth(slot.depth) &&
      normalizeScaleHint(other.scaleHint) === normalizeScaleHint(slot.scaleHint)
    );
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("[seed:customizer] Connecting to MongoDB...");
  await mongoose.connect(MONGO_URI as string);
  console.log("[seed:customizer] Connected. Running idempotent seed...");

  if (BASE_ONLY) {
    await markBaseProducts();
    console.log("[seed:customizer] Done (--base-only)!");
    await mongoose.disconnect();
    return;
  }

  await seedAccessories();
  await markBaseProducts();
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
