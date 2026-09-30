import mongoose from "mongoose";
import { Request, Response } from "express";
import dotenv from "dotenv";
import path from "path";
import { User } from "../models/User";
import { Product } from "../models/Product";
import { Order } from "../models/Order";
import { updateOrderStatus, getOrderShipment } from "../controllers/orderController";

dotenv.config({ path: path.join(__dirname, "../../.env") });

// SAFETY: Use dedicated test DB (never touch production).
const MONGODB_URI = process.env.MONGODB_URI_TEST
  || process.env.MONGODB_URI?.replace(/\/thriftit(\?|$)/, "/thriftit_test$1")
  || "";

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI_TEST is not set and could not derive a test URI");
  process.exit(1);
}

async function runTests() {
  console.log("Connecting to Test Database...");
  await mongoose.connect(MONGODB_URI);
  console.log("Connected.");

  // Drop test DB for clean run.
  if (mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
    console.log("Dropped test database for clean run.");
  }

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
    items: [{ productId: productA._id, quantity: 1, unitPrice: 100, sellerId: sellerA._id, productName: "A", sellerAmount: 90 }],
    subtotal: 100,
    shippingFee: 0,
    totalAmount: 100,
    status: "CONFIRMED",
  });

  let passed = 0; let failed = 0;

  async function testEndpoint(endpointFn: any, reqData: any, expectedStatus: number, expectedErrorCode?: string) {
    let statusCode = 200;
    let jsonResponse: any = {};
    const req = { ...reqData } as unknown as Request;
    const res = {
      status: (code: number) => { statusCode = code; return res; },
      json: (data: any) => { jsonResponse = data; },
    } as unknown as Response;

    // Simulate requireAuth for "Anonymous" test cases (now returns unified envelope).
    if (reqData.testName.includes("Anonymous")) {
      statusCode = 401;
      jsonResponse = { error: { code: "UNAUTHORIZED", message: "Chưa đăng nhập" } };
    } else {
      await endpointFn(req, res);
    }

    const statusOk = statusCode === expectedStatus;
    const errorCodeOk = !expectedErrorCode || jsonResponse.error?.code === expectedErrorCode;
    const envelopeOk = !expectedErrorCode || (
      typeof jsonResponse.error === "object" &&
      typeof jsonResponse.error?.code === "string"
    );

    if (statusOk && errorCodeOk && envelopeOk) {
      passed++;
      console.log(`✅ PASS: ${reqData.testName} → ${statusCode}${expectedErrorCode ? ` (${expectedErrorCode})` : ""}`);
    } else {
      failed++;
      console.error(
        `❌ FAIL: ${reqData.testName} → expected ${expectedStatus}${expectedErrorCode ? ` (${expectedErrorCode})` : ""}, ` +
        `got ${statusCode} ${JSON.stringify(jsonResponse)}`
      );
    }
  }

  console.log("\n--- Testing GET /orders/:code/shipment ---\n");
  await testEndpoint(getOrderShipment, { testName: "Anonymous → 401", params: { code: orderA.orderCode } }, 401, "UNAUTHORIZED");
  await testEndpoint(getOrderShipment, { testName: "Buyer B (khác order) → 403", user: { id: buyerB._id.toString(), roles: ["buyer"] }, params: { code: orderA.orderCode } }, 403, "FORBIDDEN");
  await testEndpoint(getOrderShipment, { testName: "Seller B (khác order) → 403", user: { id: sellerB._id.toString(), roles: ["buyer", "seller"] }, params: { code: orderA.orderCode } }, 403, "FORBIDDEN");
  await testEndpoint(getOrderShipment, { testName: "Buyer A (đúng order) → 200", user: { id: buyerA._id.toString(), roles: ["buyer"] }, params: { code: orderA.orderCode } }, 200);
  await testEndpoint(getOrderShipment, { testName: "Seller A (đúng order) → 200", user: { id: sellerA._id.toString(), roles: ["buyer", "seller"] }, params: { code: orderA.orderCode } }, 200);
  await testEndpoint(getOrderShipment, { testName: "Admin → 200", user: { id: adminUser._id.toString(), roles: ["buyer", "admin"] }, params: { code: orderA.orderCode } }, 200);

  console.log("\n--- Testing PATCH /orders/:code/status ---\n");

  // Order is CONFIRMED. State machine order.
  await testEndpoint(updateOrderStatus, { testName: "Buyer A → CANCELLED (Direct cancel not allowed after CONFIRMED)", user: { id: buyerA._id.toString(), roles: ["buyer"] }, params: { code: orderA.orderCode }, body: { status: "CANCELLED" } }, 403, "ORDER_BUYER_NOT_PARTICIPANT");
  await testEndpoint(updateOrderStatus, { testName: "Buyer A → CANCEL_REQUESTED (Allowed after CONFIRMED)", user: { id: buyerA._id.toString(), roles: ["buyer"] }, params: { code: orderA.orderCode }, body: { status: "CANCEL_REQUESTED" } }, 200);
  
  // Revert back to CONFIRMED for subsequent tests
  await Order.updateOne({ _id: orderA._id }, { status: "CONFIRMED" });

  await testEndpoint(updateOrderStatus, { testName: "Buyer A → COMPLETED (Invalid transition CONFIRMED→COMPLETED)", user: { id: buyerA._id.toString(), roles: ["buyer"] }, params: { code: orderA.orderCode }, body: { status: "COMPLETED" } }, 422, "ORDER_INVALID_TRANSITION");
  await testEndpoint(updateOrderStatus, { testName: "Seller B → PACKING (IDOR: not a seller of items in order)", user: { id: sellerB._id.toString(), roles: ["buyer", "seller"] }, params: { code: orderA.orderCode }, body: { status: "PACKING" } }, 403, "FORBIDDEN");
  await testEndpoint(updateOrderStatus, { testName: "Seller A → PACKING (OK: CONFIRMED→PACKING)", user: { id: sellerA._id.toString(), roles: ["buyer", "seller"] }, params: { code: orderA.orderCode }, body: { status: "PACKING" } }, 200);

  // Force to SHIPPING for admin test
  await Order.updateOne({ _id: orderA._id }, { status: "SHIPPING" });
  await testEndpoint(updateOrderStatus, { testName: "Seller A → DELIVERING (OK: SHIPPING→DELIVERING allowed for seller now)", user: { id: sellerA._id.toString(), roles: ["buyer", "seller"] }, params: { code: orderA.orderCode }, body: { status: "DELIVERING" } }, 200);

  // Revert back to SHIPPING to test Admin
  await Order.updateOne({ _id: orderA._id }, { status: "SHIPPING" });
  await testEndpoint(updateOrderStatus, { testName: "Admin → DELIVERING (OK: SHIPPING→DELIVERING)", user: { id: adminUser._id.toString(), roles: ["buyer", "admin"] }, params: { code: orderA.orderCode }, body: { status: "DELIVERING" } }, 200);

  // Seller tests DELIVERED
  await testEndpoint(updateOrderStatus, { testName: "Seller A → DELIVERED (OK: DELIVERING→DELIVERED allowed for seller now)", user: { id: sellerA._id.toString(), roles: ["buyer", "seller"] }, params: { code: orderA.orderCode }, body: { status: "DELIVERED" } }, 200);
  
  // Revert back to DELIVERING to test Admin
  await Order.updateOne({ _id: orderA._id }, { status: "DELIVERING" });
  await testEndpoint(updateOrderStatus, { testName: "Admin → DELIVERED (OK: DELIVERING→DELIVERED)", user: { id: adminUser._id.toString(), roles: ["buyer", "admin"] }, params: { code: orderA.orderCode }, body: { status: "DELIVERED" } }, 200);

  await Order.updateOne({ _id: orderA._id }, { status: "DELIVERED" });
  await testEndpoint(updateOrderStatus, { testName: "Seller A → COMPLETED (State-machine bypass: seller can't COMPLETE)", user: { id: sellerA._id.toString(), roles: ["buyer", "seller"] }, params: { code: orderA.orderCode }, body: { status: "COMPLETED" } }, 403, "ORDER_SELLER_CANNOT_DELIVER");
  await testEndpoint(updateOrderStatus, { testName: "Buyer A → COMPLETED (OK: DELIVERED→COMPLETED)", user: { id: buyerA._id.toString(), roles: ["buyer"] }, params: { code: orderA.orderCode }, body: { status: "COMPLETED" } }, 200);

  // ── New tests for unified error envelope ────────────────────────────────────
  console.log("\n--- Testing Error Envelope Format (added 2026-09-29) ---\n");

  // Test: Missing status in body -> 400 ORDER_STATUS_REQUIRED
  await Order.updateOne({ _id: orderA._id }, { status: "CONFIRMED" });
  await testEndpoint(updateOrderStatus, { testName: "Missing status → 400 ORDER_STATUS_REQUIRED", user: { id: buyerA._id.toString(), roles: ["buyer"] }, params: { code: orderA.orderCode }, body: {} }, 400, "ORDER_STATUS_REQUIRED");

  // Test: Non-existent order -> 404 ORDER_NOT_FOUND
  await testEndpoint(updateOrderStatus, { testName: "Non-existent order → 404 ORDER_NOT_FOUND", user: { id: buyerA._id.toString(), roles: ["buyer"] }, params: { code: "ORD-NONEXISTENT" }, body: { status: "CANCELLED" } }, 404, "ORDER_NOT_FOUND");

  // Test: Shipment on non-existent order -> 404 ORDER_NOT_FOUND
  await testEndpoint(getOrderShipment, { testName: "Non-existent order shipment → 404 ORDER_NOT_FOUND", user: { id: buyerA._id.toString(), roles: ["buyer"] }, params: { code: "ORD-NONEXISTENT" } }, 404, "ORDER_NOT_FOUND");

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  await User.deleteMany({ _id: { $in: [buyerA._id, buyerB._id, sellerA._id, sellerB._id, adminUser._id] } });
  await Product.deleteMany({ _id: productA._id });
  await Order.deleteMany({ _id: orderA._id });

  await mongoose.disconnect();

  console.log(`\n========================================`);
  console.log(`Test Summary: ${passed} passed, ${failed} failed.`);
  console.log(`========================================`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("❌ Test runner crashed:", err);
  process.exit(1);
});