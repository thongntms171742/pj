// ── Build Your Christmas — idempotent seed script ────────────────────────────
// Run: npm run seed -- --confirm-seed
//
// What it does:
//   1. Connects to MONGODB_URI from .env
//   2. Refuses to run if the target DB is still named "thriftit"
//   3. Upserts 1 TreeProduct with 3 codes (Xanh truyền thống / Phủ tuyết /
//      Đèn LED) × 3 sizes (S/M/L) = 9 SKUs, 6 Styles, ~25 Accessories,
//      8 presets
//   4. Upserts 1 admin + 1 buyer demo account (passwords from env)
//
// All operations are idempotent: re-running the script won't duplicate
// rows. Prices are illustrative; replace with supplier quotes later
// via the admin API.

import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { Tree } from "./models/Tree";
import { TreeProduct } from "./models/TreeProduct";
import { TreeCode } from "./models/TreeCode";
import { Style } from "./models/Style";
import { Accessory } from "./models/Accessory";
import { TreeDesign } from "./models/TreeDesign";
import { User } from "./models/User";
import { Cart } from "./models/Cart";
import { loadCatalogForDesign } from "./services/designService";
import { findUniqueSlug } from "./services/designService";
import type { Types } from "mongoose";

dotenv.config();

// ── Safety: require explicit opt-in ──────────────────────────────────────────
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

// Refuse to run against the legacy DB. We never want to overwrite thriftit
// collections — they belong to the deprecated marketplace.
if (/\/thriftit(\?|$)/.test(MONGO_URI) || MONGO_URI.endsWith("/thriftit")) {
  console.error(
    "MONGODB_URI points to the legacy `thriftit` database. Refusing to seed. " +
      "Update .env to use a `buildyourchristmas` database first."
  );
  process.exit(1);
}

const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "ChangeMe!Admin#2026";
const SEED_BUYER_PASSWORD = process.env.SEED_BUYER_PASSWORD || "ChangeMe!Buyer#2026";

// ── Seed data (3-tier: Product → Code → Variant) ────────────────────────────
const TREE_PRODUCT = {
  name: "Cây thông Noel trang trí",
  slug: "cay-thong-noel-trang-tri",
  category: "Cây thông Noel",
  density: "Dày (380-820 cành)",
  description:
    "Cây thông Noel chất lượng cao, nhiều kích thước cho mọi không gian.",
  coverImage: "/images/trees/cover.jpg",
  images: ["/images/trees/cover.jpg"],
  isActive: true,
  sortOrder: 1,
};

// Mã cây (Phân loại 1) — 3 mã cho 3 phong cách khác nhau.
const TREE_CODES = [
  {
    code: "TREE-GREEN",
    name: "Xanh truyền thống",
    description: "Cây thông màu xanh rêu cổ điển, phù hợp mọi phong cách.",
    image: "/images/trees/code-green.jpg",
    material: "PVC cao cấp",
    sortOrder: 1,
  },
  {
    code: "TREE-SNOW",
    name: "Phủ tuyết",
    description: "Cây thông phủ bông tuyết trắng, không khí Bắc Âu.",
    image: "/images/trees/code-snow.jpg",
    material: "PVC + bông tuyết",
    sortOrder: 2,
  },
  {
    code: "TREE-LED",
    name: "Đèn LED đa sắc",
    description: "Cây tích hợp đèn LED đổi màu, sẵn sàng trang trí.",
    image: "/images/trees/code-led.jpg",
    material: "PVC cao cấp + LED RGB",
    sortOrder: 3,
  },
];

// Size × Code → variant. Mỗi mã có 3 size S/M/L.
const TREE_VARIANTS = [
  // TREE-GREEN
  {
    code: "TREE-GREEN",
    size: "S",
    sku: "TREE-GREEN-S",
    name: 'Cây thông Noel 1m2 — "Xanh truyền thống"',
    heightCmMin: 110,
    heightCmMax: 130,
    diameterCm: 70,
    price: 169_000,
    stockQuantity: 100,
    bareImage: "/images/trees/green-s-bare.png",
  },
  {
    code: "TREE-GREEN",
    size: "M",
    sku: "TREE-GREEN-M",
    name: 'Cây thông Noel 1m5 — "Xanh truyền thống"',
    heightCmMin: 140,
    heightCmMax: 160,
    diameterCm: 100,
    price: 249_000,
    stockQuantity: 80,
    bareImage: "/images/trees/green-m-bare.png",
  },
  {
    code: "TREE-GREEN",
    size: "L",
    sku: "TREE-GREEN-L",
    name: 'Cây thông Noel 1m8 — "Xanh truyền thống"',
    heightCmMin: 170,
    heightCmMax: 190,
    diameterCm: 130,
    price: 399_000,
    stockQuantity: 50,
    bareImage: "/images/trees/green-l-bare.png",
  },
  // TREE-SNOW
  {
    code: "TREE-SNOW",
    size: "S",
    sku: "TREE-SNOW-S",
    name: 'Cây thông Noel 1m2 — "Phủ tuyết"',
    heightCmMin: 110,
    heightCmMax: 130,
    diameterCm: 75,
    price: 199_000,
    stockQuantity: 80,
    bareImage: "/images/trees/snow-s-bare.png",
  },
  {
    code: "TREE-SNOW",
    size: "M",
    sku: "TREE-SNOW-M",
    name: 'Cây thông Noel 1m5 — "Phủ tuyết"',
    heightCmMin: 140,
    heightCmMax: 160,
    diameterCm: 105,
    price: 299_000,
    stockQuantity: 60,
    bareImage: "/images/trees/snow-m-bare.png",
  },
  {
    code: "TREE-SNOW",
    size: "L",
    sku: "TREE-SNOW-L",
    name: 'Cây thông Noel 1m8 — "Phủ tuyết"',
    heightCmMin: 170,
    heightCmMax: 190,
    diameterCm: 135,
    price: 459_000,
    stockQuantity: 40,
    bareImage: "/images/trees/snow-l-bare.png",
  },
  // TREE-LED
  {
    code: "TREE-LED",
    size: "S",
    sku: "TREE-LED-S",
    name: 'Cây thông Noel 1m2 — "Đèn LED đa sắc"',
    heightCmMin: 110,
    heightCmMax: 130,
    diameterCm: 70,
    price: 349_000,
    stockQuantity: 50,
    bareImage: "/images/trees/led-s-bare.png",
  },
  {
    code: "TREE-LED",
    size: "M",
    sku: "TREE-LED-M",
    name: 'Cây thông Noel 1m5 — "Đèn LED đa sắc"',
    heightCmMin: 140,
    heightCmMax: 160,
    diameterCm: 100,
    price: 499_000,
    stockQuantity: 40,
    bareImage: "/images/trees/led-m-bare.png",
  },
  {
    code: "TREE-LED",
    size: "L",
    sku: "TREE-LED-L",
    name: 'Cây thông Noel 1m8 — "Đèn LED đa sắc"',
    heightCmMin: 170,
    heightCmMax: 190,
    diameterCm: 130,
    price: 699_000,
    stockQuantity: 25,
    bareImage: "/images/trees/led-l-bare.png",
  },
];

const STYLES = [
  {
    code: "CLASSIC",
    name: "Classic",
    description: "Đỏ + xanh + vàng, phong cách thông truyền thống.",
    palette: ["#C41E3A", "#0F5132", "#FFD700", "#FFFFFF"],
    coverImage: "/images/styles/classic.jpg",
    isActive: true,
    sortOrder: 1,
  },
  {
    code: "MINIMAL",
    name: "Minimal",
    description: "Trắng + gỗ tự nhiên, ít chi tiết, hiện đại.",
    palette: ["#FFFFFF", "#D4A373", "#1A1A1A"],
    coverImage: "/images/styles/minimal.jpg",
    isActive: true,
    sortOrder: 2,
  },
  {
    code: "GINGERBREAD",
    name: "Gingerbread",
    description: "Nâu + trắng + đỏ, mùi gừng ngọt, ấm cúng.",
    palette: ["#A0522D", "#FFF5E1", "#C41E3A"],
    coverImage: "/images/styles/gingerbread.jpg",
    isActive: true,
    sortOrder: 3,
  },
  {
    code: "WINTER",
    name: "Winter Wonderland",
    description: "Bạc + xanh nhạt, cảm giác mùa đông Bắc Âu.",
    palette: ["#E0EAFC", "#5B86E5", "#FFFFFF"],
    coverImage: "/images/styles/winter.jpg",
    isActive: true,
    sortOrder: 4,
  },
  {
    code: "CUTE",
    name: "Cute",
    description: "Hồng pastel + trắng, hình thú ngộ nghĩnh, dễ thương.",
    palette: ["#FFB6C1", "#FFFFFF", "#FFDAB9"],
    coverImage: "/images/styles/cute.jpg",
    isActive: true,
    sortOrder: 5,
  },
  {
    code: "LUXURY",
    name: "Luxury",
    description: "Vàng + đen + đỏ ruby, sang trọng và đẳng cấp.",
    palette: ["#FFD700", "#1A1A1A", "#9B111E"],
    coverImage: "/images/styles/luxury.jpg",
    isActive: true,
    sortOrder: 6,
  },
];

const ACCESSORIES: Array<{
  group: "LIGHTS" | "ORNAMENT" | "DECOR" | "PERSONAL";
  type:
    | "LIGHT_STRING"
    | "BAUBLE"
    | "BELL"
    | "CANDY"
    | "FIGURINE"
    | "BOW"
    | "STOCKING"
    | "STAR"
    | "NAME_TAG"
    | "NAME_ORNAMENT";
  name: string;
  description?: string;
  image: string;
  price: number;
  stock: number;
  styleCodes: string[];
  maxQtyBySize: { S: number; M: number; L: number };
  isPersonalizable?: boolean;
  personalizationMaxLength?: number;
  productionDays?: number;
  isActive?: boolean;
  sortOrder: number;
}> = [
  // ── LIGHTS (chỉ LIGHT_STRING) ───────────────────────────────────────
  {
    group: "LIGHTS",
    type: "LIGHT_STRING",
    name: "Dây đèn LED vàng ấm",
    description: "5m, 50 bóng, chạy bằng pin AA hoặc cổng USB.",
    image: "/images/acc/lights-warm.jpg",
    price: 59_000,
    stock: 200,
    styleCodes: [],
    maxQtyBySize: { S: 1, M: 1, L: 1 },
    productionDays: 0,
    sortOrder: 1,
  },
  {
    group: "LIGHTS",
    type: "LIGHT_STRING",
    name: "Dây đèn LED đa sắc",
    description: "5m, 50 bóng, đổi màu tự động, dùng cổng USB.",
    image: "/images/acc/lights-multi.jpg",
    price: 69_000,
    stock: 150,
    styleCodes: ["CLASSIC", "CUTE"],
    maxQtyBySize: { S: 1, M: 1, L: 1 },
    productionDays: 0,
    sortOrder: 2,
  },

  // ── ORNAMENT: BAUBLE, BELL, CANDY, FIGURINE ──────────────────────────
  {
    group: "ORNAMENT",
    type: "BAUBLE",
    name: "Quả châu đỏ bóng",
    description: "Đường kính 6cm, bóng kim tuyến, có dây treo.",
    image: "/images/acc/bauble-red.jpg",
    price: 6_583,
    stock: 5000,
    styleCodes: ["CLASSIC", "LUXURY"],
    maxQtyBySize: { S: 5, M: 12, L: 30 },
    productionDays: 0,
    sortOrder: 1,
  },
  {
    group: "ORNAMENT",
    type: "BAUBLE",
    name: "Quả châu bạc mờ",
    description: "Đường kính 6cm, nhũ bạc ánh kim.",
    image: "/images/acc/bauble-silver.jpg",
    price: 7_500,
    stock: 4000,
    styleCodes: ["WINTER", "MINIMAL", "LUXURY"],
    maxQtyBySize: { S: 5, M: 12, L: 30 },
    productionDays: 0,
    sortOrder: 2,
  },
  {
    group: "ORNAMENT",
    type: "BAUBLE",
    name: "Quả châu hồng pastel",
    description: "Đường kính 6cm, sơn mờ, phong cách dễ thương.",
    image: "/images/acc/bauble-pink.jpg",
    price: 7_500,
    stock: 3000,
    styleCodes: ["CUTE"],
    maxQtyBySize: { S: 5, M: 12, L: 30 },
    productionDays: 0,
    sortOrder: 3,
  },
  {
    group: "ORNAMENT",
    type: "BELL",
    name: "Chuông vàng nhỏ",
    description: "Chuông kim loại vàng, 4cm, có tiếng kêu leng keng.",
    image: "/images/acc/bell-gold.jpg",
    price: 12_000,
    stock: 1500,
    styleCodes: ["CLASSIC", "LUXURY"],
    maxQtyBySize: { S: 3, M: 6, L: 12 },
    productionDays: 0,
    sortOrder: 1,
  },
  {
    group: "ORNAMENT",
    type: "CANDY",
    name: "Gậy kẹo sọc đỏ trắng",
    description: "12cm, nhựa cứng, kẹo trang trí (không ăn được).",
    image: "/images/acc/candy-cane.jpg",
    price: 9_000,
    stock: 2000,
    styleCodes: ["CLASSIC", "CUTE"],
    maxQtyBySize: { S: 2, M: 4, L: 8 },
    productionDays: 0,
    sortOrder: 1,
  },
  {
    group: "ORNAMENT",
    type: "CANDY",
    name: "Kẹo gừng gingerbread man",
    description: "10cm, gỗ ép sơn nâu, có thể treo hoặc đặt dưới cây.",
    image: "/images/acc/gingerbread.jpg",
    price: 14_000,
    stock: 1500,
    styleCodes: ["GINGERBREAD"],
    maxQtyBySize: { S: 2, M: 4, L: 8 },
    productionDays: 0,
    sortOrder: 2,
  },
  {
    group: "ORNAMENT",
    type: "FIGURINE",
    name: "Tuần lộc nhỏ",
    description: "8cm, nhựa cao cấp, sơn tỉ mỉ.",
    image: "/images/acc/reindeer.jpg",
    price: 18_000,
    stock: 1000,
    styleCodes: ["CLASSIC", "WINTER"],
    maxQtyBySize: { S: 1, M: 2, L: 4 },
    productionDays: 0,
    sortOrder: 1,
  },
  {
    group: "ORNAMENT",
    type: "FIGURINE",
    name: "Người tuyết mini",
    description: "10cm, có mũ đỏ và khăn len, dễ thương.",
    image: "/images/acc/snowman.jpg",
    price: 18_000,
    stock: 1000,
    styleCodes: ["WINTER", "CUTE"],
    maxQtyBySize: { S: 1, M: 2, L: 4 },
    productionDays: 0,
    sortOrder: 2,
  },

  // ── DECOR: BOW, STOCKING, STAR ──────────────────────────────────────
  {
    group: "DECOR",
    type: "BOW",
    name: "Nơ đỏ ruy băng",
    description: "20cm, ruy băng satin, dùng trang trí đỉnh hoặc thân cây.",
    image: "/images/acc/bow-red.jpg",
    price: 39_000,
    stock: 800,
    styleCodes: ["CLASSIC", "LUXURY"],
    maxQtyBySize: { S: 1, M: 1, L: 1 },
    productionDays: 0,
    sortOrder: 1,
  },
  {
    group: "DECOR",
    type: "BOW",
    name: "Nơ vàng kim",
    description: "20cm, ruy băng ánh kim.",
    image: "/images/acc/bow-gold.jpg",
    price: 45_000,
    stock: 700,
    styleCodes: ["LUXURY"],
    maxQtyBySize: { S: 1, M: 1, L: 1 },
    productionDays: 0,
    sortOrder: 2,
  },
  {
    group: "DECOR",
    type: "STOCKING",
    name: "Vớ thông Noel đỏ",
    description: "30cm, vải nỉ đỏ, viền trắng lông cừu.",
    image: "/images/acc/stocking-red.jpg",
    price: 49_000,
    stock: 600,
    styleCodes: ["CLASSIC"],
    maxQtyBySize: { S: 1, M: 1, L: 2 },
    productionDays: 0,
    sortOrder: 1,
  },
  {
    group: "DECOR",
    type: "STOCKING",
    name: "Vớ vải thô trắng",
    description: "30cm, phong cách Scandinavian, tối giản.",
    image: "/images/acc/stocking-white.jpg",
    price: 55_000,
    stock: 400,
    styleCodes: ["MINIMAL", "WINTER"],
    maxQtyBySize: { S: 1, M: 1, L: 2 },
    productionDays: 0,
    sortOrder: 2,
  },
  {
    group: "DECOR",
    type: "STAR",
    name: "Ngôi sao đỉnh cây vàng",
    description: "20cm, nhựa vàng kim tuyến, có đế cắm.",
    image: "/images/acc/star-gold.jpg",
    price: 89_000,
    stock: 500,
    styleCodes: ["CLASSIC", "LUXURY"],
    maxQtyBySize: { S: 1, M: 1, L: 1 },
    productionDays: 0,
    sortOrder: 1,
  },
  {
    group: "DECOR",
    type: "STAR",
    name: "Ngôi sao bạc",
    description: "20cm, ánh bạc, phong cách Bắc Âu.",
    image: "/images/acc/star-silver.jpg",
    price: 89_000,
    stock: 400,
    styleCodes: ["WINTER", "MINIMAL"],
    maxQtyBySize: { S: 1, M: 1, L: 1 },
    productionDays: 0,
    sortOrder: 2,
  },

  // ── PERSONAL: NAME_TAG, NAME_ORNAMENT ────────────────────────────────
  {
    group: "PERSONAL",
    type: "NAME_TAG",
    name: "Thẻ tên gỗ khắc laser",
    description: "Tag gỗ 6×10cm, khắc tên cá nhân.",
    image: "/images/acc/name-tag.jpg",
    price: 49_000,
    stock: 1000,
    styleCodes: ["CLASSIC", "GINGERBREAD", "MINIMAL", "LUXURY", "CUTE", "WINTER"],
    maxQtyBySize: { S: 1, M: 1, L: 1 },
    isPersonalizable: true,
    personalizationMaxLength: 12,
    productionDays: 2,
    sortOrder: 1,
  },
  {
    group: "PERSONAL",
    type: "NAME_ORNAMENT",
    name: "Quả châu khắc tên",
    description: "Quả châu 7cm, khắc tên viết tay lên bề mặt.",
    image: "/images/acc/name-bauble.jpg",
    price: 69_000,
    stock: 800,
    styleCodes: ["CLASSIC", "CUTE", "LUXURY", "WINTER"],
    maxQtyBySize: { S: 1, M: 1, L: 1 },
    isPersonalizable: true,
    personalizationMaxLength: 12,
    productionDays: 2,
    sortOrder: 2,
  },

  // ── Extra BAUBLE (style-specific) ───────────────────────────────────
  {
    group: "ORNAMENT",
    type: "BAUBLE",
    name: "Quả châu gỗ",
    description: "Đường kính 6cm, sơn mờ kiểu mộc.",
    image: "/images/acc/bauble-wood.jpg",
    price: 8_500,
    stock: 2000,
    styleCodes: ["MINIMAL", "GINGERBREAD"],
    maxQtyBySize: { S: 5, M: 12, L: 30 },
    productionDays: 0,
    sortOrder: 4,
  },
  {
    group: "ORNAMENT",
    type: "BAUBLE",
    name: "Quả châu vàng kim",
    description: "Đường kính 6cm, ánh kim sang trọng.",
    image: "/images/acc/bauble-gold.jpg",
    price: 9_000,
    stock: 2500,
    styleCodes: ["LUXURY"],
    maxQtyBySize: { S: 5, M: 12, L: 30 },
    productionDays: 0,
    sortOrder: 5,
  },
  {
    group: "ORNAMENT",
    type: "BAUBLE",
    name: "Quả châu trắng tuyết",
    description: "Đường kính 6cm, sơn lấp lánh tuyết.",
    image: "/images/acc/bauble-white.jpg",
    price: 7_500,
    stock: 3000,
    styleCodes: ["WINTER", "MINIMAL", "CLASSIC"],
    maxQtyBySize: { S: 5, M: 12, L: 30 },
    productionDays: 0,
    sortOrder: 6,
  },
  {
    group: "ORNAMENT",
    type: "BAUBLE",
    name: "Quả châu nâu gừng",
    description: "Đường kính 6cm, tone nâu ấm.",
    image: "/images/acc/bauble-brown.jpg",
    price: 8_000,
    stock: 2000,
    styleCodes: ["GINGERBREAD"],
    maxQtyBySize: { S: 5, M: 12, L: 30 },
    productionDays: 0,
    sortOrder: 7,
  },
  {
    group: "ORNAMENT",
    type: "BELL",
    name: "Chuông bạc",
    description: "Chuông bạc 4cm, ánh kim lạnh.",
    image: "/images/acc/bell-silver.jpg",
    price: 13_000,
    stock: 1200,
    styleCodes: ["WINTER", "MINIMAL"],
    maxQtyBySize: { S: 3, M: 6, L: 12 },
    productionDays: 0,
    sortOrder: 2,
  },
  {
    group: "DECOR",
    type: "BOW",
    name: "Nơ trắng tuyết",
    description: "20cm, ruy băng lụa trắng.",
    image: "/images/acc/bow-white.jpg",
    price: 39_000,
    stock: 500,
    styleCodes: ["WINTER", "MINIMAL"],
    maxQtyBySize: { S: 1, M: 1, L: 1 },
    productionDays: 0,
    sortOrder: 3,
  },
  {
    group: "ORNAMENT",
    type: "FIGURINE",
    name: "Ong tuần lộc nhỏ",
    description: "6cm, hình dáng đáng yêu, thích hợp cho CUTE.",
    image: "/images/acc/reindeer-cute.jpg",
    price: 16_000,
    stock: 600,
    styleCodes: ["CUTE"],
    maxQtyBySize: { S: 1, M: 2, L: 4 },
    productionDays: 0,
    sortOrder: 3,
  },
];

const PRESETS: Array<{
  name: string;
  previewImage: string;
  config: {
    treeSize: "S" | "M" | "L";
    styleCode: "CLASSIC" | "MINIMAL" | "GINGERBREAD" | "WINTER" | "CUTE" | "LUXURY";
    accessories: Array<{ name: string; quantity: number; personalizationText?: string }>;
    deliveryOption: "READY_TO_DISPLAY" | "DIY_KIT" | "SEPARATE";
  };
}> = [
  {
    name: 'Classic Red & Gold',
    previewImage: "/images/presets/classic-red-gold.jpg",
    config: {
      treeSize: "M",
      styleCode: "CLASSIC",
      accessories: [
        { name: "Dây đèn LED vàng ấm", quantity: 1 },
        { name: "Quả châu đỏ bóng", quantity: 12 },
        { name: "Nơ đỏ ruy băng", quantity: 1 },
        { name: "Chuông vàng nhỏ", quantity: 4 },
        { name: "Ngôi sao đỉnh cây vàng", quantity: 1 },
      ],
      deliveryOption: "READY_TO_DISPLAY",
    },
  },
  {
    name: "Winter Wonderland",
    previewImage: "/images/presets/winter-wonderland.jpg",
    config: {
      treeSize: "L",
      styleCode: "WINTER",
      accessories: [
        { name: "Dây đèn LED vàng ấm", quantity: 1 },
        { name: "Quả châu bạc mờ", quantity: 24 },
        { name: "Quả châu trắng tuyết", quantity: 12 },
        { name: "Người tuyết mini", quantity: 2 },
        { name: "Ngôi sao bạc", quantity: 1 },
      ],
      deliveryOption: "READY_TO_DISPLAY",
    },
  },
  {
    name: "Minimal Scandinavian",
    previewImage: "/images/presets/minimal-scandi.jpg",
    config: {
      treeSize: "S",
      styleCode: "MINIMAL",
      accessories: [
        { name: "Dây đèn LED vàng ấm", quantity: 1 },
        { name: "Quả châu gỗ", quantity: 6 },
        { name: "Vớ vải thô trắng", quantity: 1 },
        { name: "Ngôi sao bạc", quantity: 1 },
      ],
      deliveryOption: "DIY_KIT",
    },
  },
  {
    name: "Gingerbread House",
    previewImage: "/images/presets/gingerbread.jpg",
    config: {
      treeSize: "M",
      styleCode: "GINGERBREAD",
      accessories: [
        { name: "Dây đèn LED vàng ấm", quantity: 1 },
        { name: "Kẹo gừng gingerbread man", quantity: 4 },
        { name: "Gậy kẹo sọc đỏ trắng", quantity: 4 },
        { name: "Quả châu nâu gừng", quantity: 10 },
        { name: "Nơ đỏ ruy băng", quantity: 1 },
      ],
      deliveryOption: "READY_TO_DISPLAY",
    },
  },
  {
    name: "Cute Pink Wonderland",
    previewImage: "/images/presets/cute-pink.jpg",
    config: {
      treeSize: "S",
      styleCode: "CUTE",
      accessories: [
        { name: "Dây đèn LED đa sắc", quantity: 1 },
        { name: "Quả châu hồng pastel", quantity: 8 },
        { name: "Gậy kẹo sọc đỏ trắng", quantity: 2 },
        { name: "Ong tuần lộc nhỏ", quantity: 1 },
        { name: "Ngôi sao đỉnh cây vàng", quantity: 1 },
      ],
      deliveryOption: "DIY_KIT",
    },
  },
  {
    name: "Luxury Gold & Black",
    previewImage: "/images/presets/luxury-gold.jpg",
    config: {
      treeSize: "L",
      styleCode: "LUXURY",
      accessories: [
        { name: "Dây đèn LED vàng ấm", quantity: 1 },
        { name: "Quả châu vàng kim", quantity: 24 },
        { name: "Quả châu đỏ bóng", quantity: 12 },
        { name: "Nơ vàng kim", quantity: 1 },
        { name: "Ngôi sao đỉnh cây vàng", quantity: 1 },
      ],
      deliveryOption: "READY_TO_DISPLAY",
    },
  },
  {
    name: "Mình's Family Tree",
    previewImage: "/images/presets/family-tag.jpg",
    config: {
      treeSize: "M",
      styleCode: "CLASSIC",
      accessories: [
        { name: "Dây đèn LED vàng ấm", quantity: 1 },
        { name: "Quả châu đỏ bóng", quantity: 8 },
        { name: "Vớ thông Noel đỏ", quantity: 1 },
        { name: "Thẻ tên gỗ khắc laser", quantity: 1, personalizationText: "MINH'S" },
      ],
      deliveryOption: "READY_TO_DISPLAY",
    },
  },
  {
    name: "Sweet Christmas",
    previewImage: "/images/presets/sweet.jpg",
    config: {
      treeSize: "S",
      styleCode: "CUTE",
      accessories: [
        { name: "Dây đèn LED đa sắc", quantity: 1 },
        { name: "Quả châu khắc tên", quantity: 1, personalizationText: "AN" },
        { name: "Gậy kẹo sọc đỏ trắng", quantity: 2 },
        { name: "Nơ trắng tuyết", quantity: 1 },
      ],
      deliveryOption: "DIY_KIT",
    },
  },
];

// ── Run ─────────────────────────────────────────────────────────────────────
async function upsertTreeCatalog() {
  // 1. Product (parent)
  const product = await TreeProduct.findOneAndUpdate(
    { slug: TREE_PRODUCT.slug },
    TREE_PRODUCT,
    { upsert: true, new: true }
  );

  // 2. Codes
  const codeBySlug = new Map<string, InstanceType<typeof TreeCode>>();
  for (const c of TREE_CODES) {
    const code = await TreeCode.findOneAndUpdate(
      { productId: product._id, code: c.code },
      { ...c, productId: product._id, isActive: true },
      { upsert: true, new: true }
    );
    codeBySlug.set(c.code, code);
  }

  // 3. Variants
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

async function upsertStyles() {
  for (const s of STYLES) {
    await Style.findOneAndUpdate({ code: s.code }, s, { upsert: true, new: true });
  }
  console.log(`[seed] Upserted ${STYLES.length} styles`);
}

async function upsertAccessories() {
  let count = 0;
  for (const a of ACCESSORIES) {
    const result = await Accessory.findOneAndUpdate(
      { name: a.name },
      { ...a, isActive: true },
      { upsert: true, new: true }
    );
    if (result) count++;
  }
  console.log(`[seed] Upserted ${count} accessories`);
}

async function upsertPresets() {
  // Resolve all variant (any size) refs once
  const variants = await Tree.find();
  const styles = await Style.find();
  const accessories = await Accessory.find();

  const variantBySize = new Map<string, (typeof variants)[number]>();
  variants.forEach((v) => variantBySize.set(v.size, v));
  const styleByCode = new Map<string, (typeof styles)[number]>();
  styles.forEach((s) => styleByCode.set(s.code, s));
  const accByName = new Map<string, (typeof accessories)[number]>();
  accessories.forEach((a) => accByName.set(a.name, a));

  for (const preset of PRESETS) {
    const variant = variantBySize.get(preset.config.treeSize);
    const style = styleByCode.get(preset.config.styleCode);
    if (!variant || !style) {
      console.warn(
        `[seed] Skipping preset "${preset.name}" — missing variant or style`
      );
      continue;
    }
    const accessoryEntries = preset.config.accessories
      .map((entry) => {
        const acc = accByName.get(entry.name);
        if (!acc) {
          console.warn(
            `[seed] Preset "${preset.name}" references missing accessory "${entry.name}"`
          );
          return null;
        }
        return {
          accessoryId: acc._id as Types.ObjectId,
          quantity: entry.quantity,
          personalizationText: entry.personalizationText || "",
        };
      })
      .filter(
        (e): e is { accessoryId: Types.ObjectId; quantity: number; personalizationText: string } =>
          e !== null
      );

    const config = {
      variantId: variant._id as Types.ObjectId,
      styleId: style._id as Types.ObjectId,
      accessories: accessoryEntries,
      deliveryOption: preset.config.deliveryOption,
    };

    // Validate before persisting — surfaces catalog/price issues early.
    try {
      // eslint-disable-next-line no-await-in-loop
      await loadCatalogForDesign({ config } as any);
    } catch (e) {
      console.error(
        `[seed] Preset "${preset.name}" has invalid config, skipping:`,
        (e as Error).message
      );
      continue;
    }

    const slug = await findUniqueSlug(preset.name);
    // eslint-disable-next-line no-await-in-loop
    await TreeDesign.findOneAndUpdate(
      { name: preset.name, isPreset: true },
      {
        ownerId: null,
        name: preset.name,
        slug,
        year: new Date().getFullYear(),
        config,
        isPublic: true,
        isPreset: true,
        previewImage: preset.previewImage,
        duplicatedFrom: null,
      },
      { upsert: true, new: true }
    );
  }
  console.log(`[seed] Upserted ${PRESETS.length} presets`);
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
  await upsertStyles();
  await upsertAccessories();
  await upsertPresets();
  await upsertUsers();

  console.log(`[seed] Done!`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] Failed:", err);
  process.exit(1);
});