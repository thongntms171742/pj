// ── Build Your Christmas — idempotent seed script ────────────────────────────
// Run: npm run seed -- --confirm-seed
//
// What it does (sau refactor phụ kiện):
//   1. Connects to MONGODB_URI from .env
//   2. Refuses to run if the target DB is still named "thriftit"
//   3. Upserts 1 TreeProduct với 3 codes × 3 sizes = 9 SKUs
//   4. BỎ Style / Accessory / Preset (đã purge)
//   5. Upserts 1 admin + 1 buyer demo account
//
// All operations are idempotent: re-running the script won't duplicate
// rows. Prices are illustrative.

import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { Tree } from "./models/Tree";
import { TreeProduct } from "./models/TreeProduct";
import { TreeCode } from "./models/TreeCode";
import { User } from "./models/User";
import { Cart } from "./models/Cart";

dotenv.config();

if (!process.argv.includes("--confirm-seed")) {
  console.error(
    "\n[!] Seed is destructive. Re-run with --confirm-seed to proceed.\n"
  );
  process.exit(1);
}

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

const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "ChangeMe!Admin#2026";
const SEED_BUYER_PASSWORD = process.env.SEED_BUYER_PASSWORD || "ChangeMe!Buyer#2026";

// ── Seed data (3-tier: Product → Code → Variant) ────────────────────────────
// TreeProduct concept "Yêu Thương" — coverImage + description đã chứa sẵn
// toàn bộ thông tin cây + phụ kiện + style. AI sẽ đọc description để render.
const TREE_PRODUCT = {
  name: "Yêu Thương",
  slug: "yeu-thuong",
  category: "TREE",
  density: "standard",
  description:
    'Cây "Yêu Thương"\n\n' +
    "Dáng cây: Cây tùng lá kim tự nhiên dáng tháp nhọn, tán lá xanh mướt, tán dày và vươn thẳng đầy sức sống.\n\n" +
    "Điểm nhấn ngọn cây: Đỉnh cây nổi bật với chiếc nơ nhung đỏ thắm cùng hai dải ruy băng rủ dài mềm mại; ngay phía dưới điểm xuyết cụm hoa bông gòn trắng muốt tựa như tuyết đầu mùa.\n\n" +
    "Chi tiết trang trí: Trái châu, Kẹo gậy (Candy Cane), Dây chuyền, Phần gốc và chậu: Gốc cây được phủ lớp bông tuyết xốp mịn, bao bọc bên ngoài bằng lớp vải thô đỏ đô (đỏ rượu) sang trọng, thắt nơ nhung đỏ đồng điệu kèm tag quà tặng tinh tế.\n\n" +
    'Tổng thể thiết kế mang gam màu đỏ – trắng ấm áp trên nền lá xanh, đúng như tên gọi "Yêu Thương" – ấm cúng, ngọt ngào và thích hợp để decor bàn làm việc hay làm món quà trao gửi cảm xúc trong mùa lễ hội.',
  coverImage:
    "https://res.cloudinary.com/wxqrg68a/image/upload/v1791827446/buildyourchristmas/84b77602-f10d-4c4e-8f43-84d6c98ee830.jpg",
  images: [],
  aspectRatio: "1:1",
  isActive: true,
  sortOrder: 0,
};

const TREE_CODES = [
  {
    code: "TREE-YEUTHUONG-01",
    name: "01",
    description: "",
    image:
      "https://res.cloudinary.com/wxqrg68a/image/upload/v1791813865/buildyourchristmas/2486f1e3-71f7-4b87-9be5-436964f42aa2.jpg",
    material: "PVC cao cấp",
    sortOrder: 0,
  },
];

const TREE_VARIANTS = [
  {
    code: "TREE-YEUTHUONG-01",
    size: "S",
    sku: "TREE-YEUTHUONG-01-S",
    name: 'Cây "Yêu Thương" — Size S',
    heightCmMin: 30,
    heightCmMax: 50,
    diameterCm: 30,
    price: 499_000,
    stockQuantity: 50,
    bareImage:
      "https://res.cloudinary.com/wxqrg68a/image/upload/v1791827446/buildyourchristmas/84b77602-f10d-4c4e-8f43-84d6c98ee830.jpg",
  },
  {
    code: "TREE-YEUTHUONG-01",
    size: "M",
    sku: "TREE-YEUTHUONG-01-M",
    name: 'Cây "Yêu Thương" — Size M',
    heightCmMin: 50,
    heightCmMax: 80,
    diameterCm: 50,
    price: 799_000,
    stockQuantity: 30,
    bareImage:
      "https://res.cloudinary.com/wxqrg68a/image/upload/v1791827446/buildyourchristmas/84b77602-f10d-4c4e-8f43-84d6c98ee830.jpg",
  },
  {
    code: "TREE-YEUTHUONG-01",
    size: "L",
    sku: "TREE-YEUTHUONG-01-L",
    name: 'Cây "Yêu Thương" — Size L',
    heightCmMin: 80,
    heightCmMax: 120,
    diameterCm: 80,
    price: 1_299_000,
    stockQuantity: 15,
    bareImage:
      "https://res.cloudinary.com/wxqrg68a/image/upload/v1791827446/buildyourchristmas/84b77602-f10d-4c4e-8f43-84d6c98ee830.jpg",
  },
];

async function upsertTreeCatalog() {
  const product = await TreeProduct.findOneAndUpdate(
    { slug: TREE_PRODUCT.slug },
    TREE_PRODUCT,
    { upsert: true, new: true }
  );

  const codeBySlug = new Map<string, InstanceType<typeof TreeCode>>();
  for (const c of TREE_CODES) {
    const code = await TreeCode.findOneAndUpdate(
      { productId: product._id, code: c.code },
      { ...c, productId: product._id, isActive: true },
      { upsert: true, new: true }
    );
    codeBySlug.set(c.code, code);
  }

  for (const v of TREE_VARIANTS) {
    const code = codeBySlug.get(v.code);
    if (!code) continue;
    await Tree.findOneAndUpdate(
      { sku: v.sku },
      {
        productId: product._id,
        codeId: code._id,
        size: v.size,
        sku: v.sku,
        name: v.name,
        heightCmMin: v.heightCmMin,
        heightCmMax: v.heightCmMax,
        diameterCm: v.diameterCm,
        description: product.description,
        bareImage: v.bareImage,
        images: [],
        price: v.price,
        stockQuantity: v.stockQuantity,
        isActive: true,
        sortOrder: TREE_CODES.findIndex((c) => c.code === v.code) * 10 +
          ["S", "M", "L", "XL"].indexOf(v.size),
      },
      { upsert: true, new: true }
    );
  }
  console.log(
    `[seed] Upserted 1 product, ${TREE_CODES.length} codes, ${TREE_VARIANTS.length} variants`
  );
}

async function upsertUsers() {
  const adminPassword = await bcrypt.hash(SEED_ADMIN_PASSWORD, 10);
  const buyerPassword = await bcrypt.hash(SEED_BUYER_PASSWORD, 10);

  const admin = await User.findOneAndUpdate(
    { email: "admin@buildyourchristmas.vn" },
    {
      name: "Build Your Christmas Admin",
      email: "admin@buildyourchristmas.vn",
      passwordHash: adminPassword,
      roles: ["buyer", "admin"],
      accountStatus: "active",
    },
    { upsert: true, new: true }
  );
  await Cart.findOneAndUpdate(
    { userId: admin._id },
    { userId: admin._id },
    { upsert: true }
  );

  const buyer = await User.findOneAndUpdate(
    { email: "buyer@buildyourchristmas.vn" },
    {
      name: "Minh Demo",
      email: "buyer@buildyourchristmas.vn",
      passwordHash: buyerPassword,
      roles: ["buyer"],
      accountStatus: "active",
    },
    { upsert: true, new: true }
  );
  await Cart.findOneAndUpdate(
    { userId: buyer._id },
    { userId: buyer._id },
    { upsert: true }
  );
  console.log(
    `[seed] Upserted admin (admin@buildyourchristmas.vn) and buyer (buyer@buildyourchristmas.vn)`
  );
}

async function main() {
  console.log(`[seed] Connecting to MongoDB...`);
  await mongoose.connect(MONGO_URI!);
  console.log(`[seed] Connected. Running idempotent seed...`);

  await upsertTreeCatalog();
  await upsertUsers();

  console.log(`[seed] Done!`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] Failed:", err);
  process.exit(1);
});
