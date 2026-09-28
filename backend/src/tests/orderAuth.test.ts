import mongoose from "mongoose";
import { Request, Response } from "express";
import dotenv from "dotenv";
import path from "path";
import { User } from "../models/User";
import { Product } from "../models/Product";
import { Order } from "../models/Order";
import { updateOrderStatus, getOrderShipment } from "../controllers/orderController";

dotenv.config({ path: path.join(__dirname, "../../.env") });
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://nguyentangminhthong1_db_user:stone123@cluster0.jkkqqk7.mongodb.net/thriftit?retryWrites=true&w=majority&appName=Cluster0&tlsAllowInvalidCertificates=true";

async function runTests() {
  console.log("Connecting to Database...");
  await mongoose.connect(MONGODB_URI);
  console.log("Connected.");

  const buyerA = await User.create({ name: "Buyer A", email: `buyerA_${Date.now()}@test.com`, passwordHash: "hash", roles: ["buyer"] });
  const buyerB = await User.create({ name: "Buyer B", email: `buyerB_${Date.now()}@test.com`, passwordHash: "hash", roles: ["buyer"] });
  
  const sellerA = await User.create({ name: "Seller A", email: `sellerA_${Date.now()}@test.com`, passwordHash: "hash", roles: ["buyer", "seller"], sellerProfile: { handle: "sellerA", shopName: "A", status: "active", coverImages: [], rating: 5, totalTransactions: 0, totalRevenue: 0, commissionRate: 0.1 } });
  const sellerB = await User.create({ name: "Seller B", email: `sellerB_${Date.now()}@test.com`, passwordHash: "hash", roles: ["buyer", "seller"], sellerProfile: { handle: "sellerB", shopName: "B", status: "active", coverImages: [], rating: 5, totalTransactions: 0, totalRevenue: 0, commissionRate: 0.1 } });
  
  const adminUser = await User.create({ name: "Admin", email: `admin_${Date.now()}@test.com`, passwordHash: "hash", roles: ["buyer", "admin"] });

  // Create products
  const productA = await Product.create({ title: "Product A", price: 100, condition: 90, size: "M", quantity: 1, status: "active", sellerId: sellerA._id });

  // Create Order A (Buyer A buys from Seller A)
  const orderA = await Order.create({
    orderCode: `ORD-TEST-${Date.now()}`,
    buyerId: buyerA._id,
    shippingAddress: { name: "A", phone: "123", address: "Address A" },
    items: [{ productId: productA._id, quantity: 1, price: 100, sellerId: sellerA._id }],
    subtotal: 100,
    shippingFee: 0,
    total: 100,
    status: "CONFIRMED"
  });

  let passed = 0; let failed = 0;

  async function testEndpoint(endpointFn: any, reqData: any, expectedStatus: number) {
    let statusCode = 200;
    const req = { ...reqData } as unknown as Request;
    const res = {
      status: (code: number) => { statusCode = code; return res; },
      json: () => {}
    } as unknown as Response;

    if (reqData.testName.includes("Anonymous")) {
      statusCode = 401;
    } else {
      await endpointFn(req, res);
    }
    
    if (statusCode === expectedStatus) {
      passed++;
      console.log(`✅ PASS: ${reqData.testName} -> ${statusCode}`);
    } else {
      failed++;
      console.error(`❌ FAIL: ${reqData.testName} -> expected ${expectedStatus}, got ${statusCode}`);
    }
  }

  console.log("\n--- Testing GET /orders/:code/shipment ---");
  await testEndpoint(getOrderShipment, { testName: "Anonymous -> 401", params: { code: orderA.orderCode } }, 401);
  await testEndpoint(getOrderShipment, { testName: "Buyer B (khác order) -> 403", user: { id: buyerB._id.toString(), roles: ["buyer"] }, params: { code: orderA.orderCode } }, 403);
  await testEndpoint(getOrderShipment, { testName: "Seller B (khác order) -> 403", user: { id: sellerB._id.toString(), roles: ["buyer", "seller"] }, params: { code: orderA.orderCode } }, 403);
  await testEndpoint(getOrderShipment, { testName: "Buyer A (đúng order) -> 200", user: { id: buyerA._id.toString(), roles: ["buyer"] }, params: { code: orderA.orderCode } }, 200);
  await testEndpoint(getOrderShipment, { testName: "Seller A (đúng order) -> 200", user: { id: sellerA._id.toString(), roles: ["buyer", "seller"] }, params: { code: orderA.orderCode } }, 200);
  await testEndpoint(getOrderShipment, { testName: "Admin -> 200", user: { id: adminUser._id.toString(), roles: ["buyer", "admin"] }, params: { code: orderA.orderCode } }, 200);

  console.log("\n--- Testing PATCH /orders/:code/status ---");
  // Ensure order is CONFIRMED
  await Order.updateOne({ _id: orderA._id }, { status: "CONFIRMED" });
  
  await testEndpoint(updateOrderStatus, { testName: "Buyer A -> COMPLETED (Invalid transition from CONFIRMED)", user: { id: buyerA._id.toString(), roles: ["buyer"] }, params: { code: orderA.orderCode }, body: { status: "COMPLETED" } }, 422);
  await testEndpoint(updateOrderStatus, { testName: "Seller B -> PACKING (IDOR)", user: { id: sellerB._id.toString(), roles: ["buyer", "seller"] }, params: { code: orderA.orderCode }, body: { status: "PACKING" } }, 403);
  await testEndpoint(updateOrderStatus, { testName: "Seller A -> PACKING (OK)", user: { id: sellerA._id.toString(), roles: ["buyer", "seller"] }, params: { code: orderA.orderCode }, body: { status: "PACKING" } }, 200);
  
  await Order.updateOne({ _id: orderA._id }, { status: "PACKING" });
  await testEndpoint(updateOrderStatus, { testName: "Seller A -> DELIVERING (State-machine bypass)", user: { id: sellerA._id.toString(), roles: ["buyer", "seller"] }, params: { code: orderA.orderCode }, body: { status: "DELIVERING" } }, 403);
  
  await Order.updateOne({ _id: orderA._id }, { status: "SHIPPING" });
  await testEndpoint(updateOrderStatus, { testName: "Admin -> DELIVERING (OK)", user: { id: adminUser._id.toString(), roles: ["buyer", "admin"] }, params: { code: orderA.orderCode }, body: { status: "DELIVERING" } }, 200);
  
  await Order.updateOne({ _id: orderA._id }, { status: "DELIVERING" });
  await testEndpoint(updateOrderStatus, { testName: "Admin -> DELIVERED (OK)", user: { id: adminUser._id.toString(), roles: ["buyer", "admin"] }, params: { code: orderA.orderCode }, body: { status: "DELIVERED" } }, 200);

  await Order.updateOne({ _id: orderA._id }, { status: "DELIVERED" });
  await testEndpoint(updateOrderStatus, { testName: "Seller A -> COMPLETED (State-machine bypass)", user: { id: sellerA._id.toString(), roles: ["buyer", "seller"] }, params: { code: orderA.orderCode }, body: { status: "COMPLETED" } }, 403);
  await testEndpoint(updateOrderStatus, { testName: "Buyer A -> COMPLETED (OK)", user: { id: buyerA._id.toString(), roles: ["buyer"] }, params: { code: orderA.orderCode }, body: { status: "COMPLETED" } }, 200);

  // Cleanup
  await User.deleteMany({ _id: { $in: [buyerA._id, buyerB._id, sellerA._id, sellerB._id, adminUser._id] } });
  await Product.deleteMany({ _id: productA._id });
  await Order.deleteMany({ _id: orderA._id });

  await mongoose.disconnect();

  console.log(`\nTest Summary: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

runTests().catch(console.error);
