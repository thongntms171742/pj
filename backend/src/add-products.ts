/**
 * Add-products script — append 10 products to each of 2 existing sellers.
 * Idempotent per title: skips a product if its (sellerId, title) pair already exists.
 *
 * Usage:  npm run add:products
 *
 * Targets:
 *   - thaoo@gmail.com
 *   - minh@gmail.com
 */
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { User } from "./models/User";
import { Category } from "./models/Category";
import { Product } from "./models/Product";

const MONGODB_URI_RAW = process.env.MONGODB_URI || "";

// Force db name to "thriftit" so the script writes to the same db the
// production backend uses, even when MONGODB_URI omits a database name.
function ensureDbName(uri: string, dbName: string): string {
  return uri.replace(/^(\w+:\/\/[^/]+)\/[^/?]*/, `$1/${dbName}`);
}
const MONGODB_URI = ensureDbName(MONGODB_URI_RAW, "thriftit");

const TARGET_EMAILS = ["thaoo@gmail.com", "minh@gmail.com"];

const productsByEmail: Record<string, Array<{
  title: string;
  price: number;
  condition: number;
  size: string;
  category: string;
  image: string;
  description: string;
}>> = {
  "thaoo@gmail.com": [
    { title: "Áo khoác denim wash vintage", price: 320000, condition: 85, size: "M", category: "Áo khoác", image: "https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?w=400&h=520&fit=crop&auto=format", description: "Áo khoác denim wash nhạt phong cách vintage, chất liệu cotton dày dặn." },
    { title: "Áo sơ mi linen trắng kem", price: 185000, condition: 90, size: "M", category: "Áo", image: "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=400&h=520&fit=crop&auto=format", description: "Áo sơ mi linen màu trắng kem, form regular fit, dễ phối với nhiều trang phục." },
    { title: "Quần jean ống rộng vintage", price: 280000, condition: 82, size: "L", category: "Quần", image: "https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?w=400&h=520&fit=crop&auto=format", description: "Quần jean ống rộng, wash xanh đậm, lưng cao tôn dáng." },
    { title: "Đầm hoa nhí vintage dáng A", price: 245000, condition: 88, size: "S", category: "Váy", image: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=400&h=520&fit=crop&auto=format", description: "Đầm hoa nhí vintage, dáng A ngang gối, chất liệu cotton mềm mại." },
    { title: "Áo len cổ lọ mùa đông", price: 220000, condition: 80, size: "M", category: "Áo", image: "https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=400&h=520&fit=crop&auto=format", description: "Áo len cổ lọ dệt dày, giữ ấm tốt, phù hợp mùa đông miền Bắc." },
    { title: "Áo blazer nhung đen", price: 380000, condition: 85, size: "M", category: "Áo khoác", image: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=400&h=520&fit=crop&auto=format", description: "Blazer nhung đen, form slim fit, phù hợp đi làm hoặc dự tiệc." },
    { title: "Quần kaki túi hộp vintage", price: 195000, condition: 78, size: "L", category: "Quần", image: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=400&h=520&fit=crop&auto=format", description: "Quần kaki túi hộp phong cách quân đội, màu xanh rêu đậm." },
    { title: "Áo phông basic in hình vintage", price: 95000, condition: 75, size: "M", category: "Áo", image: "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=400&h=520&fit=crop&auto=format", description: "Áo phông cotton in hình vintage, form rộng thoải mái." },
    { title: "Túi tote vải canvas", price: 85000, condition: 92, size: "Free", category: "Phụ kiện", image: "https://images.unsplash.com/photo-1564222576401-2c1c8b9c92b6?w=400&h=520&fit=crop&auto=format", description: "Túi tote vải canvas dày, in hình vintage, đựng vừa laptop 14 inch." },
    { title: "Khăn lụa vuông họa tiết", price: 75000, condition: 90, size: "Free", category: "Phụ kiện", image: "https://images.unsplash.com/photo-1601924994987-69e26d50dc26?w=400&h=520&fit=crop&auto=format", description: "Khăn lụa vuông 90×90cm, họa tiết hoa vintage, có thể thắt cổ hoặc buộc tóc." },
  ],

  "minh@gmail.com": [
    { title: "Áo khoác da cừu vintage", price: 650000, condition: 88, size: "L", category: "Áo khoác", image: "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=400&h=520&fit=crop&auto=format", description: "Áo khoác da cừu vintage thập niên 80, màu nâu đậm, lót lụa bên trong." },
    { title: "Quần ống suông vải tweed", price: 285000, condition: 82, size: "M", category: "Quần", image: "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=400&h=520&fit=crop&auto=format", description: "Quần ống suông vải tweed, lưng cao, phù hợp phong cách công sở vintage." },
    { title: "Áo len dệt kim Bắc Âu", price: 320000, condition: 90, size: "M", category: "Áo", image: "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=400&h=520&fit=crop&auto=format", description: "Áo len dệt kim họa tiết Bắc Âu, dày dặn, giữ ấm tốt." },
    { title: "Đầm midi lụa hoa vintage", price: 380000, condition: 86, size: "M", category: "Váy", image: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=400&h=520&fit=crop&auto=format", description: "Đầm midi lụa họa tiết hoa vintage, dáng xòe nhẹ, sang trọng." },
    { title: "Áo sơ mi flannel caro đỏ", price: 175000, condition: 84, size: "L", category: "Áo", image: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=400&h=520&fit=crop&auto=format", description: "Áo sơ mi flannel kẻ caro đỏ đen, chất liệu cotton dày ấm." },
    { title: "Áo cardigan len mỏng pastel", price: 210000, condition: 85, size: "S", category: "Áo khoác", image: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=400&h=520&fit=crop&auto=format", description: "Cardigan len mỏng màu pastel, dáng suông dài, phù hợp tiết trời thu." },
    { title: "Quần jean Levi 501 vintage", price: 380000, condition: 80, size: "M", category: "Quần", image: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=400&h=520&fit=crop&auto=format", description: "Quần jean Levi 501 vintage chính hãng, wash xanh cổ điển, form chuẩn." },
    { title: "Mũ len beanie vintage", price: 95000, condition: 92, size: "Free", category: "Phụ kiện", image: "https://images.unsplash.com/photo-1576871337622-98d48d1cf531?w=400&h=520&fit=crop&auto=format", description: "Mũ len beanie dệt kim, màu nâu đất, giữ ấm tốt cho mùa đông." },
    { title: "Túi xách da vintage nhỏ", price: 295000, condition: 75, size: "Free", category: "Phụ kiện", image: "https://images.unsplash.com/photo-1591561954557-26941169b49e?w=400&h=520&fit=crop&auto=format", description: "Túi xách da bò thật, kiểu dáng vintage, khóa kéo vàng, còn rất đẹp." },
    { title: "Áo polo vintage thêu logo", price: 165000, condition: 88, size: "M", category: "Áo", image: "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=400&h=520&fit=crop&auto=format", description: "Áo polo cotton thêu logo vintage, form regular, phù hợp casual." },
  ],
};

async function addProducts() {
  if (!MONGODB_URI_RAW) {
    console.error("❌ MONGODB_URI is not set in .env");
    process.exit(1);
  }

  console.log("⏳ Connecting to MongoDB Atlas...");
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected");

  const categories = await Category.find({});
  const catMap = new Map(categories.map((c) => [c.name, c._id]));
  if (catMap.size === 0) {
    console.error("❌ No categories found. Run `npm run seed` first.");
    process.exit(1);
  }

  let totalCreated = 0;
  let totalSkipped = 0;

  for (const email of TARGET_EMAILS) {
    const user = await User.findOne({ email });
    if (!user) {
      console.warn(`⚠️  Seller not found: ${email} — skipping`);
      continue;
    }

    const products = productsByEmail[email];
    if (!products) {
      console.warn(`⚠️  No product catalog defined for ${email}`);
      continue;
    }

    console.log(`📦 Adding products to ${user.sellerProfile?.shopName || user.name} (${email})...`);

    // Idempotency: skip if a product with same (sellerId, title) already exists.
    for (const p of products) {
      const exists = await Product.findOne({ sellerId: user._id, title: p.title }).lean();
      if (exists) {
        totalSkipped++;
        continue;
      }
      await Product.create({
        title: p.title,
        description: p.description,
        price: p.price,
        condition: p.condition,
        size: p.size,
        quantity: 1,
        status: "active",
        coverImage: p.image,
        views: Math.floor(Math.random() * 200) + 50,
        likes: Math.floor(Math.random() * 30),
        sellerId: user._id,
        categoryId: catMap.get(p.category) ?? null,
      });
      totalCreated++;
    }
    console.log(`   ✅ ${products.length} products attempted for ${user.sellerProfile?.shopName || user.name}`);
  }

  console.log("");
  console.log("✅ Add-products completed!");
  console.log(`   • ${totalCreated} new products created`);
  console.log(`   • ${totalSkipped} products skipped (already existed)`);

  await mongoose.disconnect();
  process.exit(0);
}

addProducts().catch((err) => {
  console.error("❌ Add-products failed:", err);
  process.exit(1);
});
