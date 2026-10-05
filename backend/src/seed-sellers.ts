/**
 * Seed script — creates 3 new sellers, each with 10 products.
 * Idempotent: only inserts if the seller email does not already exist.
 *
 * Usage:  npm run seed:sellers
 */
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "./models/User";
import { Category } from "./models/Category";
import { Product } from "./models/Product";

const MONGODB_URI_RAW = process.env.MONGODB_URI || "";

// Force the database name to "thriftit" so the seed writes to the same
// cluster/database the production backend uses. Mongoose would otherwise
// fall back to the default "test" db when the URI omits a db name.
function ensureDbName(uri: string, dbName: string): string {
  return uri.replace(/^(\w+:\/\/[^/]+)\/[^/?]*/, `$1/${dbName}`);
}
const MONGODB_URI = ensureDbName(MONGODB_URI_RAW, "thriftit");

// ── 3 seller profiles ────────────────────────────────────────────────────────
const newSellers = [
  {
    name: "Phương Linh Retro",
    email: "shop.phuonglinh@thriftit.vn",
    handle: "phuonglinh.retro",
    shopName: "Phương Linh Retro",
    avatarUrl: "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=100&h=100&fit=crop&auto=format",
    coverImages: [
      "https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?w=90&h=90&fit=crop",
      "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=90&h=90&fit=crop",
      "https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?w=90&h=90&fit=crop",
    ],
    description: "Đồ second-hand phong cách Pháp, tuyển chọn kỹ từ chợ đồ cũ Sài Gòn.",
    rating: 4.8,
    totalTransactions: 142,
  },
  {
    name: "Đà Lạt Vintage",
    email: "shop.dalat@thriftit.vn",
    handle: "dalat.vintage",
    shopName: "Đà Lạt Vintage",
    avatarUrl: "https://images.unsplash.com/photo-1502685104226-ee32379fefbe?w=100&h=100&fit=crop&auto=format",
    coverImages: [
      "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=90&h=90&fit=crop",
      "https://images.unsplash.com/photo-1506634064465-7dab4de896ed?w=90&h=90&fit=crop",
      "https://images.unsplash.com/photo-1495121605193-b116b5b9c5fe?w=90&h=90&fit=crop",
    ],
    description: "Vintage len dạ, áo khoác mùa đông từ các thương hiệu Âu–Mỹ thập niên 70–90.",
    rating: 4.9,
    totalTransactions: 268,
  },
  {
    name: "Huế Secondhand",
    email: "shop.hue@thriftit.vn",
    handle: "hue.secondhand",
    shopName: "Huế Secondhand",
    avatarUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&h=100&fit=crop&auto=format",
    coverImages: [
      "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=90&h=90&fit=crop",
      "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=90&h=90&fit=crop",
      "https://images.unsplash.com/photo-1559563458-527698bf5295?w=90&h=90&fit=crop",
    ],
    description: "Đồ cổ Huế, áo dài cách tân và phụ kiện handmade từ làng nghề truyền thống.",
    rating: 4.7,
    totalTransactions: 98,
  },
];

// ── 10 products per seller (3 sellers × 10 = 30) ────────────────────────────
const productCatalog: Record<string, Array<{
  title: string;
  price: number;
  condition: number;
  size: string;
  category: string;
  image: string;
  description: string;
}>> = {
  "phuonglinh.retro": [
    { title: "Váy midi hoa nhí vintage Pháp", price: 245000, condition: 88, size: "S", category: "Váy", image: "https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?w=400&h=520&fit=crop&auto=format", description: "Chất liệu cotton mềm, họa tiết hoa nhí đặc trưng phong cách Pháp thập niên 70." },
    { title: "Áo blouse cổ Peter Pan trắng", price: 175000, condition: 90, size: "M", category: "Áo", image: "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=400&h=520&fit=crop&auto=format", description: "Áo blouse cổ tròn Peter Pan, form rộng dễ phối với quần jean hoặc chân váy." },
    { title: "Quần ống loe denim nhạt", price: 285000, condition: 82, size: "M", category: "Quần", image: "https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?w=400&h=520&fit=crop&auto=format", description: "Quần denim ống loe cắt cao, wash nhạt vintage, tôn dáng." },
    { title: "Đầm suông vintage họa tiết hoa", price: 320000, condition: 85, size: "M", category: "Váy", image: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=400&h=520&fit=crop&auto=format", description: "Đầm suông dài ngang gối, họa tiết hoa tím vintage cực tinh tế." },
    { title: "Áo cardigan len mỏng pastel", price: 195000, condition: 80, size: "M", category: "Áo khoác", image: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=400&h=520&fit=crop&auto=format", description: "Cardigan len mỏng màu pastel, dáng suông dài, phù hợp tiết trời thu." },
    { title: "Áo sơ mi tay bồng vintage", price: 165000, condition: 78, size: "S", category: "Áo", image: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400&h=520&fit=crop&auto=format", description: "Sơ mi tay bồng cổ điển, chất liệu lụa tổng hợp mềm mại." },
    { title: "Chân váy xếp ly dài vintage", price: 210000, condition: 86, size: "S", category: "Váy", image: "https://images.unsplash.com/photo-1583496661160-fb5886a13d44?w=400&h=520&fit=crop&auto=format", description: "Chân váy xếp ly dài qua gối, lưng cao, dễ phối đồ." },
    { title: "Khăn lụa vuông họa tiết hoa", price: 85000, condition: 92, size: "Free", category: "Phụ kiện", image: "https://images.unsplash.com/photo-1601924994987-69e26d50dc26?w=400&h=520&fit=crop&auto=format", description: "Khăn lụa vuông 90×90cm, họa tiết hoa vintage Pháp, có thể thắt cổ hoặc buộc tóc." },
    { title: "Áo len cổ tròn dệt kim", price: 225000, condition: 83, size: "M", category: "Áo", image: "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=400&h=520&fit=crop&auto=format", description: "Áo len dệt kim dày dặn, cổ tròn, phù hợp mùa đông Hà Nội." },
    { title: "Túi xách da vintage nhỏ", price: 295000, condition: 75, size: "Free", category: "Phụ kiện", image: "https://images.unsplash.com/photo-1591561954557-26941169b49e?w=400&h=520&fit=crop&auto=format", description: "Túi xách da bò thật, kiểu dáng vintage, khóa kéo vàng, còn rất đẹp." },
  ],

  "dalat.vintage": [
    { title: "Áo khoác dạ dài cổ điển", price: 580000, condition: 88, size: "L", category: "Áo khoác", image: "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=400&h=520&fit=crop&auto=format", description: "Áo khoác dạ dài qua gối, màu camel cổ điển, lót lụa bên trong." },
    { title: "Áo len cổ lọ dày mùa đông", price: 320000, condition: 90, size: "M", category: "Áo", image: "https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=400&h=520&fit=crop&auto=format", description: "Áo len cổ lọ dệt dày, chất liệu len cừu pha, giữ ấm tốt." },
    { title: "Quần tây vintage ống suông", price: 245000, condition: 85, size: "L", category: "Quần", image: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=400&h=520&fit=crop&auto=format", description: "Quần tây ống suông vintage, lưng cao, chất vải dày dặn đứng form." },
    { title: "Áo blazer nhung nâu", price: 420000, condition: 80, size: "M", category: "Áo khoác", image: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=400&h=520&fit=crop&auto=format", description: "Blazer nhung nâu đất, một hàng khuy, phù hợp đi làm hoặc dạo phố." },
    { title: "Mũ len beanie vintage", price: 95000, condition: 92, size: "Free", category: "Phụ kiện", image: "https://images.unsplash.com/photo-1576871337622-98d48d1cf531?w=400&h=520&fit=crop&auto=format", description: "Mũ len beanie dệt kim, màu nâu đất, giữ ấm tốt cho mùa đông Đà Lạt." },
    { title: "Áo khoác bomber retro", price: 380000, condition: 83, size: "L", category: "Áo khoác", image: "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400&h=520&fit=crop&auto=format", description: "Áo khoác bomber phối túi hai bên, chất liệu polyester dày dặn, phong cách retro." },
    { title: "Quần jean straight vintage Levi", price: 350000, condition: 78, size: "M", category: "Quần", image: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=400&h=520&fit=crop&auto=format", description: "Quần jean straight 501 vintage, wash xanh cổ điển, form chuẩn." },
    { title: "Áo sơ mi flannel kẻ caro", price: 185000, condition: 86, size: "L", category: "Áo", image: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=400&h=520&fit=crop&auto=format", description: "Áo sơ mi flannel kẻ caro đỏ đen, chất liệu cotton dày, ấm áp." },
    { title: "Khăn choàng len dệt thủ công", price: 145000, condition: 88, size: "Free", category: "Phụ kiện", image: "https://images.unsplash.com/photo-1601370552761-d129028bd833?w=400&h=520&fit=crop&auto=format", description: "Khăn choàng len dệt thủ công tại Đà Lạt, kích thước lớn, giữ ấm tốt." },
    { title: "Áo sweater họa tiết Bắc Âu", price: 295000, condition: 82, size: "M", category: "Áo", image: "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=400&h=520&fit=crop&auto=format", description: "Áo sweater len dày, họa tiết Bắc Âu truyền thống, màu be sữa." },
  ],

  "hue.secondhand": [
    { title: "Áo dài cách tân vintage Huế", price: 480000, condition: 88, size: "M", category: "Váy", image: "https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?w=400&h=520&fit=crop&auto=format", description: "Áo dài cách tân, chất liệu lụa Hà Đông, họa tiết hoa sen thêu tay." },
    { title: "Nón bài thơ Huế vintage", price: 125000, condition: 90, size: "Free", category: "Phụ kiện", image: "https://images.unsplash.com/photo-1583394838336-acd977736f90?w=400&h=520&fit=crop&auto=format", description: "Nón bài thơ Huế truyền thống, làm thủ công, còn nguyên vẹn bài thơ bên trong." },
    { title: "Áo bà ba vintage Huế", price: 285000, condition: 80, size: "M", category: "Áo", image: "https://images.unsplash.com/photo-1559563458-527698bf5295?w=400&h=520&fit=crop&auto=format", description: "Áo bà ba truyền thống Huế, chất liệu lụa, thêu tay hoa cúc." },
    { title: "Khăn rằn Huế vintage", price: 75000, condition: 92, size: "Free", category: "Phụ kiện", image: "https://images.unsplash.com/photo-1583292650898-7d22cd27ca6f?w=400&h=520&fit=crop&auto=format", description: "Khăn rằn truyền thống Huế, dệt thủ công, màu nâu đất đặc trưng." },
    { title: "Đầm maxi hoa văn cung đình", price: 380000, condition: 85, size: "M", category: "Váy", image: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=400&h=520&fit=crop&auto=format", description: "Đầm maxi dài, họa tiết cung đình Huế, chất liệu lụa mềm mại." },
    { title: "Áo sơ mi lụa Hà Đông", price: 220000, condition: 87, size: "M", category: "Áo", image: "https://images.unsplash.com/photo-1520975916090-3105956dac38?w=400&h=520&fit=crop&auto=format", description: "Áo sơ mi lụa Hà Đông nguyên chất, cổ tàu truyền thống, màu vàng nhạt." },
    { title: "Quần lụa ống rộng Huế", price: 195000, condition: 83, size: "L", category: "Quần", image: "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=400&h=520&fit=crop&auto=format", description: "Quần lụa ống rộng, form suông rộng, màu be sữa, dệt thủ công." },
    { title: "Túi cói thủ công Huế", price: 165000, condition: 90, size: "Free", category: "Phụ kiện", image: "https://images.unsplash.com/photo-1564222576401-2c1c8b9c92b6?w=400&h=520&fit=crop&auto=format", description: "Túi cói đan thủ công tại làng nghề Huế, kích thước vừa, quai da." },
    { title: "Áo khoác lụa thêu hoa", price: 420000, condition: 82, size: "M", category: "Áo khoác", image: "https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?w=400&h=520&fit=crop&auto=format", description: "Áo khoác lụa mỏng, thêu tay họa tiết hoa cúc, lý tưởng cho mùa thu." },
    { title: "Trâm cài tóc ngọc trai", price: 65000, condition: 95, size: "Free", category: "Phụ kiện", image: "https://images.unsplash.com/photo-1535632787350-4e68ef0ac584?w=400&h=520&fit=crop&auto=format", description: "Trâm cài tóc ngọc trai nhân tạo, kiểu dáng truyền thống Huế." },
  ],
};

async function seedSellers() {
  if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI is not set in .env");
    process.exit(1);
  }

  console.log("⏳ Connecting to MongoDB Atlas...");
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected");

  console.log("📁 Loading categories...");
  const categories = await Category.find({});
  const catMap = new Map(categories.map((c) => [c.name, c._id]));
  if (catMap.size === 0) {
    console.error("❌ No categories found. Run `npm run seed` first.");
    process.exit(1);
  }

  const hash = (pw: string) => bcrypt.hashSync(pw, 10);

  let totalUsersCreated = 0;
  let totalProductsCreated = 0;

  for (const seller of newSellers) {
    // ── Idempotent: skip if email already exists ────────────────────────────
    const existing = await User.findOne({ email: seller.email });
    if (existing) {
      console.log(`⏭  Skipping ${seller.email} (already exists)`);
      continue;
    }

    console.log(`👤 Creating seller ${seller.shopName}...`);
    const user = await User.create({
      name: seller.name,
      email: seller.email,
      passwordHash: hash("shop123"),
      roles: ["buyer", "seller"],
      sellerProfile: {
        handle: seller.handle,
        shopName: seller.shopName,
        description: seller.description,
        avatarUrl: seller.avatarUrl,
        coverImages: seller.coverImages,
        rating: seller.rating,
        totalTransactions: seller.totalTransactions,
        totalRevenue: 0,
        commissionRate: 0.1,
        status: "active",
      },
    });
    totalUsersCreated++;

    // ── Seed 10 products for this seller ────────────────────────────────────
    const products = productCatalog[seller.handle];
    if (!products) {
      console.warn(`⚠️  No product catalog defined for ${seller.handle}`);
      continue;
    }

    const productDocs = products.map((p) => ({
      title: p.title,
      description: p.description,
      price: p.price,
      condition: p.condition,
      size: p.size,
      quantity: 1,
      status: "active" as const,
      coverImage: p.image,
      views: Math.floor(Math.random() * 250) + 50,
      likes: Math.floor(Math.random() * 40),
      sellerId: user._id,
      categoryId: catMap.get(p.category) ?? null,
    }));

    const inserted = await Product.insertMany(productDocs);
    totalProductsCreated += inserted.length;
    console.log(`   ✅ ${inserted.length} products created for ${seller.shopName}`);
  }

  console.log("");
  console.log("✅ Seed sellers completed!");
  console.log(`   • ${totalUsersCreated} new sellers`);
  console.log(`   • ${totalProductsCreated} new products`);
  console.log("");
  console.log("🔑 New test accounts (password: shop123):");
  newSellers.forEach((s) => console.log(`   • ${s.email}`));

  await mongoose.disconnect();
  process.exit(0);
}

seedSellers().catch((err) => {
  console.error("❌ Seed sellers failed:", err);
  process.exit(1);
});
