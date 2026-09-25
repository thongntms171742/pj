import dotenv from "dotenv";
import mongoose from "mongoose";

// Models
import { User } from "../src/models/User";
import { Category } from "../src/models/Category";
import { Product } from "../src/models/Product";
import { Order } from "../src/models/Order";
import { Review } from "../src/models/Review";
import { Ledger } from "../src/models/Ledger";
import { PlatformFeeConfig } from "../src/models/PlatformFeeConfig";
import { Cart } from "../src/models/Cart";
import { CartItem } from "../src/models/CartItem";
import { Notification } from "../src/models/Notification";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "";
const IS_EXECUTE = process.argv.includes("--execute");
const IS_CONFIRM = process.argv.includes("--confirm-reset");

async function run() {
  if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI is not set in .env");
    process.exit(1);
  }

  if (IS_EXECUTE && !IS_CONFIRM) {
    console.error("❌ Safety Guard: You must provide both --execute and --confirm-reset to modify the database.");
    process.exit(1);
  }

  const isDryRun = !IS_EXECUTE || !IS_CONFIRM;

  console.log("=== DEMO DB RESET PREFLIGHT ===");
  console.log(`Mode: ${isDryRun ? "DRY RUN ONLY" : "⚠️ EXECUTE MODE"}\n`);

  await mongoose.connect(MONGODB_URI);

  try {
    // 1. Re-check counts
    let usersCount = await User.countDocuments();
    let categoriesCount = await Category.countDocuments();
    let productsCount = await Product.countDocuments();

    let ordersCount = await Order.countDocuments();
    let reviewsCount = await Review.countDocuments();
    let ledgersCount = await Ledger.countDocuments();
    let feesCount = await PlatformFeeConfig.countDocuments();

    let cartsCount = await Cart.countDocuments();
    let cartitemsCount = await CartItem.countDocuments();
    let notifsCount = await Notification.countDocuments();

    console.log(`users:       ${usersCount}`);
    console.log(`categories:  ${categoriesCount}`);
    console.log(`products:    ${productsCount}`);
    console.log("");
    console.log(`orders:      ${ordersCount}`);
    console.log(`reviews:     ${reviewsCount}`);
    console.log(`ledgers:     ${ledgersCount}`);
    console.log("");
    console.log(`carts:       ${cartsCount}`);
    console.log(`cartitems:   ${cartitemsCount}`);
    console.log(`notifications: ${notifsCount}`);
    console.log("");

    console.log("Financial collections: PROTECTED");

    // 2. Check Dependencies
    console.log("\nProduct & User references:");
    let orderProductDependencies = 0;
    if (ordersCount > 0) {
      const orders = await Order.find({}).lean();
      for (const o of orders) {
        orderProductDependencies += o.items?.length || 0;
      }
    }
    console.log(`  orders -> products: ${orderProductDependencies} references`);

    const reviewProductDependencies = await Review.countDocuments({ productId: { $exists: true } });
    console.log(`  reviews -> products: ${reviewProductDependencies} references`);
    
    // 3. Action Logic
    if (isDryRun) {
      console.log("\nDRY RUN ONLY");
      console.log("No data was modified.");
      console.log("Run with --execute --confirm-reset to apply changes.");
    } else {
      console.log("\n--- EXECUTING RESET ---");
      
      const archiveResult = await Product.updateMany({}, { $set: { status: "archived" } });
      const cartItemsResult = await CartItem.deleteMany({});
      const cartsResult = await Cart.deleteMany({});
      const notifsResult = await Notification.deleteMany({});
      
      console.log("\n=== RESET RESULT ===");
      console.log(`Products archived: ${archiveResult.modifiedCount}`);
      console.log(`CartItems deleted: ${cartItemsResult.deletedCount}`);
      console.log(`Carts deleted: ${cartsResult.deletedCount}`);
      console.log(`Notifications deleted: ${notifsResult.deletedCount}`);
      
      console.log("\nProtected:");
      console.log("Users: unchanged");
      console.log("Categories: unchanged");
      console.log("Orders: unchanged");
      console.log("Reviews: unchanged");
      console.log("Ledgers: unchanged");
      console.log("PlatformFeeConfigs: unchanged");
      
      // Verify Post-Execution
      const activeProducts = await Product.countDocuments({ status: { $ne: "archived" } });
      const archivedProducts = await Product.countDocuments({ status: "archived" });
      const postOrders = await Order.countDocuments();
      const postReviews = await Review.countDocuments();
      const postLedgers = await Ledger.countDocuments();
      const postCarts = await Cart.countDocuments();
      const postCartItems = await CartItem.countDocuments();
      const postNotifs = await Notification.countDocuments();
      
      console.log("\n--- POST-VERIFICATION ---");
      console.log("products:");
      console.log(`  active = ${activeProducts}`);
      console.log(`  archived = ${archivedProducts}`);
      console.log("");
      console.log(`orders = ${postOrders}`);
      console.log(`reviews = ${postReviews}`);
      console.log(`ledgers = ${postLedgers}`);
      console.log("");
      console.log(`carts = ${postCarts}`);
      console.log(`cartitems = ${postCartItems}`);
      console.log(`notifications = ${postNotifs}`);
      
      console.log("\n🎉 EXECUTION COMPLETED");
    }

  } catch (error) {
    console.error("❌ Execution failed:", error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
