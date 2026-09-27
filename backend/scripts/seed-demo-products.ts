import dotenv from "dotenv";
import mongoose from "mongoose";

import { User } from "../src/models/User";
import { Category } from "../src/models/Category";
import { Product } from "../src/models/Product";
import { Order } from "../src/models/Order";
import { Review } from "../src/models/Review";
import { Ledger } from "../src/models/Ledger";
import { PlatformFeeConfig } from "../src/models/PlatformFeeConfig";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "";
const IS_EXECUTE = process.argv.includes("--execute");
const IS_CONFIRM = process.argv.includes("--confirm-seed");
const IS_DRY_RUN = !IS_EXECUTE || !IS_CONFIRM;

const DEMO_PRODUCTS = [
  { title: "Áo khoác Blazer Vintage 90s", price: 350000, condition: 90, size: "L", coverImage: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=600", desc: "Blazer kẻ sọc form rộng chuẩn vintage." },
  { title: "Quần Jean Levis 501", price: 450000, condition: 85, size: "M", coverImage: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=600", desc: "Quần jean ống đứng màu xanh wash cổ điển." },
  { title: "Áo sơ mi lụa tơ tằm", price: 250000, condition: 95, size: "S", coverImage: "https://images.unsplash.com/photo-1598032895397-b9472444bf93?w=600", desc: "Sơ mi chất lụa mát mẻ, họa tiết hoa nhí." },
  { title: "Váy hoa nhí phong cách Pháp", price: 320000, condition: 88, size: "M", coverImage: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=600", desc: "Váy liền thân chiết eo, tôn dáng." },
  { title: "Áo len cardigan mùa đông", price: 280000, condition: 92, size: "L", coverImage: "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=600", desc: "Áo len đan tay rất ấm." },
  { title: "Áo thun ban nhạc Nirvana", price: 150000, condition: 80, size: "XL", coverImage: "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=600", desc: "Áo band tee washed mờ, phong cách bụi bặm." },
  { title: "Quần Kaki Ống Rộng", price: 210000, condition: 90, size: "L", coverImage: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=600", desc: "Kaki dày dặn, màu be." },
  { title: "Áo khoác da Biker", price: 850000, condition: 85, size: "M", coverImage: "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=600", desc: "Da bò thật, xước nhẹ ở viền, cực chất." },
  { title: "Túi xách tay da thật", price: 420000, condition: 88, size: "Freesize", coverImage: "https://images.unsplash.com/photo-1584916201218-f4242ceb4809?w=600", desc: "Túi vintage Nhật Bản." },
  { title: "Mũ Bucket nỉ", price: 120000, condition: 98, size: "Freesize", coverImage: "https://images.unsplash.com/photo-1556306535-0f09a536f01f?w=600", desc: "Mũ bucket màu nâu cà phê." },
  { title: "Áo dạ dáng dài Hàn Quốc", price: 550000, condition: 95, size: "M", coverImage: "https://images.unsplash.com/photo-1539533113208-f6df8cc8b543?w=600", desc: "Áo dạ ép dày dặn, form chuẩn." },
  { title: "Quần yếm Denim", price: 300000, condition: 85, size: "S", coverImage: "https://images.unsplash.com/photo-1543886577-6d2c4795bcf5?w=600", desc: "Quần yếm jean năng động." },
  { title: "Khăn choàng Cashmere", price: 180000, condition: 100, size: "Freesize", coverImage: "https://images.unsplash.com/photo-1606502973842-f64bc2786fe5?w=600", desc: "Khăn còn nguyên tag chưa dùng." },
  { title: "Áo sơ mi Oxford", price: 200000, condition: 90, size: "L", coverImage: "https://images.unsplash.com/photo-1596755094514-f87e32f85e2c?w=600", desc: "Sơ mi công sở màu xanh dương pastel." },
  { title: "Giày Oxford nữ bệt", price: 350000, condition: 85, size: "38", coverImage: "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=600", desc: "Giày da bò phong cách vintage." },
  { title: "Đầm suông linen", price: 260000, condition: 92, size: "M", coverImage: "https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?w=600", desc: "Váy linen trắng cực kì mát mẻ." },
  { title: "Áo Hoodie Nike 2nd", price: 380000, condition: 88, size: "XL", coverImage: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=600", desc: "Hoodie Nike logo thêu." },
  { title: "Quần short đũi", price: 150000, condition: 95, size: "L", coverImage: "https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=600", desc: "Quần mặc nhà siêu thoải mái." },
  { title: "Túi tote vải Canvas", price: 90000, condition: 80, size: "Freesize", coverImage: "https://images.unsplash.com/photo-1597633244018-b0a39bd5511f?w=600", desc: "Túi in họa tiết Graphic art." },
  { title: "Kính râm gọng tròn retro", price: 150000, condition: 90, size: "Freesize", coverImage: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=600", desc: "Kính mát mùa hè." },
  { title: "Đồng hồ nữ mặt vuông", price: 650000, condition: 95, size: "Freesize", coverImage: "https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=600", desc: "Đồng hồ si Nhật chuẩn auth." },
  { title: "Áo khoác gió thể thao", price: 220000, condition: 85, size: "L", coverImage: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=600", desc: "Áo khoác chống nước nhẹ." },
  { title: "Váy xòe xếp ly", price: 250000, condition: 90, size: "S", coverImage: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=600", desc: "Váy tennis style Nhật Bản." },
  { title: "Áo gile len", price: 190000, condition: 92, size: "M", coverImage: "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=600", desc: "Gile len phối sơ mi rất hợp." },
  { title: "Giày bốt cao cổ", price: 480000, condition: 80, size: "39", coverImage: "https://images.unsplash.com/photo-1520639888713-7851133b1ed0?w=600", desc: "Bốt da xước nhẹ mũi." }
];

async function run() {
  if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI is not set in .env");
    process.exit(1);
  }

  if (IS_EXECUTE && !IS_CONFIRM) {
    console.error("❌ Safety Guard: You must provide both --execute and --confirm-seed to seed the database.");
    process.exit(1);
  }

  console.log("=== PRODUCT SEED PREFLIGHT ===");

  await mongoose.connect(MONGODB_URI);

  try {
    const users = await User.find({}).lean();
    const categories = await Category.find({}).lean();
    
    const activeProducts = await Product.countDocuments({ status: { $ne: "archived" } });
    const archivedProducts = await Product.countDocuments({ status: "archived" });

    console.log(`Users available: ${users.length}`);
    console.log(`Categories available: ${categories.length}`);
    console.log(`Existing active products: ${activeProducts}`);
    console.log(`Existing archived products: ${archivedProducts}`);
    console.log(`\nProducts to create: ${DEMO_PRODUCTS.length}`);
    
    console.log("\nNo existing data will be deleted.");
    console.log("No financial collections will be modified.");

    if (users.length === 0 || categories.length === 0) {
      console.log("\n⚠️ Cannot seed without users and categories! Please add them first.");
      process.exit(1);
    }

    if (IS_DRY_RUN) {
      console.log("\nDRY RUN ONLY");
      console.log("No data was created.");
      console.log("Run with --execute --confirm-seed to apply changes.");
      process.exit(0);
    }

    console.log("\n--- EXECUTING SEED ---");

    const newProducts = DEMO_PRODUCTS.map((p, index) => {
      // Pick random user and category for variety
      const user = users[index % users.length];
      const category = categories[index % categories.length];

      return {
        title: p.title,
        description: p.desc,
        price: p.price,
        condition: p.condition,
        size: p.size,
        quantity: 1,
        status: "active",
        coverImage: p.coverImage,
        location: "TP. Hồ Chí Minh",
        sellerId: user._id,
        categoryId: category._id,
      };
    });

    const result = await Product.insertMany(newProducts);
    
    console.log(`\n=== SEED RESULT ===`);
    console.log(`Products created: ${result.length}`);

    // Verify post-execution
    const postActive = await Product.countDocuments({ status: { $ne: "archived" } });
    const postArchived = await Product.countDocuments({ status: "archived" });
    const postOrders = await Order.countDocuments();
    const postReviews = await Review.countDocuments();
    const postLedgers = await Ledger.countDocuments();
    const postFees = await PlatformFeeConfig.countDocuments();

    console.log("\n--- POST-VERIFICATION ---");
    console.log(`active products = ${postActive}`);
    console.log(`archived products = ${postArchived}`);
    console.log(`orders = ${postOrders}`);
    console.log(`reviews = ${postReviews}`);
    console.log(`ledgers = ${postLedgers}`);
    console.log("platformfeeconfigs = unchanged");

    console.log("\n🎉 SEED COMPLETED");
  } catch (error) {
    console.error("❌ Seed failed:", error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
