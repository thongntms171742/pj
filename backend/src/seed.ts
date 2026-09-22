/**
 * Seed script — populates MongoDB with mock data matching the frontend's mock.ts.
 *
 * Usage:  npm run seed
 *
 * This script is idempotent: it drops existing data and re-creates everything.
 */
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "./models/User";
import { Category } from "./models/Category";
import { Product } from "./models/Product";
import { Cart } from "./models/Cart";
import { CartItem } from "./models/CartItem";
import { Order } from "./models/Order";
import { Notification } from "./models/Notification";

const MONGODB_URI = process.env.MONGODB_URI || "";

async function seed() {
  if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI is not set in .env");
    process.exit(1);
  }

  console.log("⏳ Connecting to MongoDB Atlas...");
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected");

  // ── Drop existing data ─────────────────────────────────────────────────────
  console.log("🗑  Clearing existing data...");
  await Promise.all([
    User.deleteMany({}),
    Category.deleteMany({}),
    Product.deleteMany({}),
    Cart.deleteMany({}),
    CartItem.deleteMany({}),
    Order.deleteMany({}),
    Notification.deleteMany({}),
  ]);

  // ── 1. Categories ──────────────────────────────────────────────────────────
  console.log("📁 Seeding categories...");
  const categories = await Category.insertMany([
    { name: "Áo", slug: "ao" },
    { name: "Quần", slug: "quan" },
    { name: "Váy", slug: "vay" },
    { name: "Áo khoác", slug: "ao-khoac" },
    { name: "Phụ kiện", slug: "phu-kien" },
  ]);
  const catMap = new Map(categories.map((c) => [c.name, c._id]));

  // ── 2. Users ───────────────────────────────────────────────────────────────
  console.log("👤 Seeding users...");
  const hash = (pw: string) => bcrypt.hashSync(pw, 10);

  const [buyer, sellerMinhTu, sellerSaigon, sellerHanoi, sellerCorner, admin] = await User.insertMany([
    {
      name: "Nguyễn Thanh Linh",
      email: "linh.nguyen@gmail.com",
      passwordHash: hash("123456"),
      roles: ["buyer"],
    },
    {
      name: "Minh Tú Vintage",
      email: "shop.minhtu@thriftit.vn",
      passwordHash: hash("shop123"),
      roles: ["buyer", "seller"],
      sellerProfile: {
        handle: "minhtu.vintage",
        shopName: "Minh Tú Vintage",
        avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&auto=format",
        coverImages: [
          "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=90&h=90&fit=crop",
          "https://images.unsplash.com/photo-1495105787522-5334e3ffa0ef?w=90&h=90&fit=crop",
          "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=90&h=90&fit=crop",
        ],
        rating: 4.9,
        totalTransactions: 234,
        totalRevenue: 0,
        commissionRate: 0.1,
        status: "active",
      },
    },
    {
      name: "Sài Gòn Thrift",
      email: "shop.saigon@thriftit.vn",
      passwordHash: hash("shop123"),
      roles: ["buyer", "seller"],
      sellerProfile: {
        handle: "saigon.thrift",
        shopName: "Sài Gòn Thrift",
        avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&auto=format",
        coverImages: [
          "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=90&h=90&fit=crop",
          "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=90&h=90&fit=crop",
          "https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=90&h=90&fit=crop",
        ],
        rating: 4.8,
        totalTransactions: 187,
        totalRevenue: 0,
        commissionRate: 0.1,
        status: "active",
      },
    },
    {
      name: "Hà Nội Pre-loved",
      email: "shop.hanoi@thriftit.vn",
      passwordHash: hash("shop123"),
      roles: ["buyer", "seller"],
      sellerProfile: {
        handle: "hanoi.preloved",
        shopName: "Hà Nội Pre-loved",
        avatarUrl: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop&auto=format",
        coverImages: [
          "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=90&h=90&fit=crop",
          "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=90&h=90&fit=crop",
          "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=90&h=90&fit=crop",
        ],
        rating: 4.7,
        totalTransactions: 156,
        totalRevenue: 0,
        commissionRate: 0.1,
        status: "active",
      },
    },
    {
      name: "Vintage Corner HCM",
      email: "shop.corner@thriftit.vn",
      passwordHash: hash("shop123"),
      roles: ["buyer", "seller"],
      sellerProfile: {
        handle: "vintage.corner",
        shopName: "Vintage Corner HCM",
        avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&auto=format",
        coverImages: [
          "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=90&h=90&fit=crop",
          "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=90&h=90&fit=crop",
          "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=90&h=90&fit=crop",
        ],
        rating: 4.9,
        totalTransactions: 312,
        totalRevenue: 0,
        commissionRate: 0.1,
        status: "active",
      },
    },
    {
      name: "Admin",
      email: "admin@thriftit.vn",
      passwordHash: hash("admin"),
      roles: ["buyer", "admin"],
    },
  ]);

  // Demo user (matches frontend mock account)
  await User.create({
    name: "Demo User",
    email: "demo@thriftit.vn",
    passwordHash: hash("demo123"),
    roles: ["buyer"],
  });

  // Seller map for product assignment
  const sellerMap: Record<string, typeof sellerMinhTu> = {
    "minhtu.vintage": sellerMinhTu,
    "saigon.thrift": sellerSaigon,
    "hanoi.preloved": sellerHanoi,
    "vintage.corner": sellerCorner,
  };

  // ── 3. Products ────────────────────────────────────────────────────────────
  console.log("🛍  Seeding products...");
  const productData = [
    { title: "Áo Linen Trắng Cổ Điển 1994", price: 185000, seller: "minhtu.vintage", condition: 85, size: "M", category: "Áo", image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=520&fit=crop&auto=format" },
    { title: "Quần Jean Ống Rộng Thập Niên 90", price: 220000, seller: "saigon.thrift", condition: 90, size: "L", category: "Quần", image: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=400&h=520&fit=crop&auto=format" },
    { title: "Váy Hoa Retro Pastel Dáng A", price: 160000, seller: "hanoi.preloved", condition: 75, size: "S", category: "Váy", image: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=400&h=520&fit=crop&auto=format" },
    { title: "Áo Khoác Denim Rửa Cũ 80s", price: 350000, seller: "minhtu.vintage", condition: 80, size: "M", category: "Áo khoác", image: "https://images.unsplash.com/photo-1495105787522-5334e3ffa0ef?w=400&h=520&fit=crop&auto=format" },
    { title: "Blazer Tweed Cổ Điển", price: 420000, seller: "saigon.thrift", condition: 92, size: "M", category: "Áo khoác", image: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=400&h=520&fit=crop&auto=format" },
    { title: "Áo Sơ Mi Kẻ Sọc Vintage", price: 130000, seller: "hanoi.preloved", condition: 70, size: "L", category: "Áo", image: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400&h=520&fit=crop&auto=format" },
    { title: "Đầm Maxi Bohemian Floral", price: 280000, seller: "vintage.corner", condition: 88, size: "M", category: "Váy", image: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=400&h=520&fit=crop&auto=format" },
    { title: "Áo Phông Band Tee 90s", price: 95000, seller: "minhtu.vintage", condition: 65, size: "L", category: "Áo", image: "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=400&h=520&fit=crop&auto=format" },
    { title: "Quần Culottes Len Vintage", price: 175000, seller: "saigon.thrift", condition: 82, size: "S", category: "Quần", image: "https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=400&h=520&fit=crop&auto=format" },
    { title: "Áo Len Cổ Lọ Cozy", price: 210000, seller: "vintage.corner", condition: 78, size: "M", category: "Áo", image: "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=400&h=520&fit=crop&auto=format" },
  ];

  const products = await Product.insertMany(
    productData.map((p) => ({
      title: p.title,
      price: p.price,
      condition: p.condition,
      size: p.size,
      quantity: 1,
      status: "active",
      coverImage: p.image,
      views: Math.floor(Math.random() * 200) + 50,
      likes: Math.floor(Math.random() * 30),
      sellerId: sellerMap[p.seller]._id,
      categoryId: catMap.get(p.category) ?? null,
    }))
  );

  // ── 4. Cart for buyer ──────────────────────────────────────────────────────
  console.log("🛒 Seeding cart for buyer...");
  const buyerCart = await Cart.create({ userId: buyer._id });

  // Add first 2 products from minhtu.vintage to cart (matches INIT_CART)
  await CartItem.insertMany([
    {
      cartId: buyerCart._id,
      productId: products[0]._id, // Áo Linen Trắng
      quantity: 1,
      priceSnapshot: products[0].price,
      checked: true,
    },
    {
      cartId: buyerCart._id,
      productId: products[3]._id, // Áo Khoác Denim
      quantity: 1,
      priceSnapshot: products[3].price,
      checked: true,
    },
    {
      cartId: buyerCart._id,
      productId: products[1]._id, // Quần Jean
      quantity: 1,
      priceSnapshot: products[1].price,
      checked: true,
    },
    {
      cartId: buyerCart._id,
      productId: products[4]._id, // Blazer Tweed
      quantity: 1,
      priceSnapshot: products[4].price,
      checked: false,
    },
  ]);

  // ── 5. Seed orders for buyer ───────────────────────────────────────────────
  console.log("📦 Seeding orders...");
  const orderSeeds = [
    { code: "ORD-20240876", product: products[1], status: "SHIPPING" as const, paymentMethod: "Vietcombank", date: "2024-08-16" },
    { code: "ORD-20240865", product: products[2], status: "SHIPPING" as const, paymentMethod: "Techcombank", date: "2024-08-15" },
    { code: "ORD-20240855", product: products[0], status: "DELIVERING" as const, paymentMethod: "Vietcombank", date: "2024-08-14" },
    { code: "ORD-20240820", product: products[7], status: "COMPLETED" as const, paymentMethod: "MB Bank", date: "2024-08-10" },
    { code: "ORD-20240810", product: products[9], status: "COMPLETED" as const, paymentMethod: "Vietcombank", date: "2024-08-08" },
    { code: "ORD-20240800", product: products[3], status: "COMPLETED" as const, paymentMethod: "Techcombank", date: "2024-08-05" },
  ];

  await Order.insertMany(
    orderSeeds.map((o) => ({
      orderCode: o.code,
      buyerId: buyer._id,
      items: [
        {
          productId: o.product._id,
          sellerId: o.product.sellerId,
          productName: o.product.title,
          productImageUrl: o.product.coverImage,
          unitPrice: o.product.price,
          quantity: 1,
          conditionSnapshot: o.product.condition,
          sellerAmount: o.product.price * 0.9,
        },
      ],
      subtotal: o.product.price,
      shippingFee: 30000,
      platformFee: Math.round(o.product.price * 0.1),
      discount: 0,
      totalAmount: o.product.price + 30000,
      status: o.status,
      statusHistory: [{ status: o.status, by: "seed", at: new Date(o.date) }],
      paymentMethod: o.paymentMethod,
      paidAt: new Date(o.date),
      idempotencyKey: `seed-${o.code}`,
      createdAt: new Date(o.date),
    }))
  );

  // ── 6. Notifications for buyer ─────────────────────────────────────────────
  console.log("🔔 Seeding notifications...");
  await Notification.insertMany([
    { userId: buyer._id, type: "order", title: "Đơn hàng đã được xác nhận", message: "Đơn hàng #ORD-20240876 đã được shop xác nhận và đang chuẩn bị hàng", isRead: false },
    { userId: buyer._id, type: "chat", title: "Tin nhắn mới từ minhtu.vintage", message: "Bạn có tin nhắn mới: Hàng đã được đóng gói xong rồi bạn nhé!", isRead: false },
    { userId: buyer._id, type: "promo", title: "Mã giảm giá 15% cho đơn hàng đầu tiên", message: "Sử dụng mã NEWMEMBER15 để được giảm 15% cho đơn hàng đầu tiên. Hết hạn sau 7 ngày.", isRead: false },
    { userId: buyer._id, type: "system", title: "Cập nhật ứng dụng", message: "thrift it! vừa cập nhật phiên bản mới với nhiều cải tiến giao diện", isRead: true },
    { userId: buyer._id, type: "order", title: "Đơn hàng đang được giao", message: "Đơn hàng #ORD-20240855 đang được GHN vận chuyển. Dự kiến giao trong 2-3 ngày.", isRead: true },
    { userId: buyer._id, type: "review", title: "Nhắc đánh giá sản phẩm", message: "Cảm ơn bạn đã mua sắm! Hãy đánh giá sản phẩm để giúp người mua khác có thêm thông tin nhé.", isRead: true },
  ]);

  // ── Done ───────────────────────────────────────────────────────────────────
  console.log("");
  console.log("✅ Seed completed successfully!");
  console.log(`   • ${categories.length} categories`);
  console.log(`   • 7 users (1 buyer, 4 sellers, 1 admin, 1 demo)`);
  console.log(`   • ${products.length} products`);
  console.log(`   • 4 cart items for buyer`);
  console.log(`   • ${orderSeeds.length} orders`);
  console.log(`   • 6 notifications`);
  console.log("");
  console.log("🔑 Test accounts:");
  console.log("   Buyer:  linh.nguyen@gmail.com / 123456");
  console.log("   Seller: shop.minhtu@thriftit.vn / shop123");
  console.log("   Demo:   demo@thriftit.vn / demo123");
  console.log("   Admin:  admin@thriftit.vn / admin");

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
