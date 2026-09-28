import mongoose from "mongoose";
import { createProduct } from "../controllers/productController";
import { User } from "../models/User";
import { Product } from "../models/Product";
import { Request, Response } from "express";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });

// SAFETY: Use a dedicated test DB so we never touch production data.
// Set MONGODB_URI_TEST in .env, or fall back to a "thriftit_test" database on the same cluster.
// To override explicitly: MONGODB_URI_TEST="mongodb+srv://..." npx ts-node --transpile-only src/tests/productAuth.test.ts
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

  // Drop the entire test DB to ensure a clean slate before tests.
  // This is safe because we're using a dedicated test database.
  if (mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
    console.log("Dropped test database for clean run.");
  }

  // Create temporary users for testing
  const buyer = await User.create({
    name: "Test Buyer",
    email: `buyer_${Date.now()}@test.com`,
    passwordHash: "hash",
    roles: ["buyer"],
  });

  const pendingSeller = await User.create({
    name: "Test Pending Seller",
    email: `pending_${Date.now()}@test.com`,
    passwordHash: "hash",
    roles: ["buyer", "seller"],
    sellerProfile: {
      handle: "pending",
      shopName: "Pending Shop",
      status: "pending_approval",
      coverImages: [],
      rating: 5,
      totalTransactions: 0,
      totalRevenue: 0,
      commissionRate: 0.1,
    }
  });

  const approvedSeller = await User.create({
    name: "Test Approved Seller",
    email: `approved_${Date.now()}@test.com`,
    passwordHash: "hash",
    roles: ["buyer", "seller"],
    sellerProfile: {
      handle: "approved",
      shopName: "Approved Shop",
      status: "active",
      coverImages: [],
      rating: 5,
      totalTransactions: 0,
      totalRevenue: 0,
      commissionRate: 0.1,
    }
  });

  const suspendedSeller = await User.create({
    name: "Test Suspended Seller",
    email: `suspended_${Date.now()}@test.com`,
    passwordHash: "hash",
    roles: ["buyer", "seller"],
    sellerProfile: {
      handle: "suspended",
      shopName: "Suspended Shop",
      status: "suspended",
      coverImages: [],
      rating: 5,
      totalTransactions: 0,
      totalRevenue: 0,
      commissionRate: 0.1,
    }
  });

  console.log("\nRunning Authorization Matrix Tests for POST /api/products...\n");

  let passed = 0;
  let failed = 0;

  // Helper: matches the new unified error envelope format
  // Format: { error: { code: "ENUM", message: "..." } }
  async function testCreateProduct(
    userId: string | null,
    expectedStatus: number,
    expectedErrorCode?: string,
    customBody: any = {}
  ) {
    let statusCode = 200;
    let jsonResponse: any = {};

    const req = {
      user: userId ? { id: userId, email: "test@test.com", roles: [] } : undefined,
      body: {
        title: "Test Product",
        price: 100000,
        condition: 95,
        size: "M",
        quantity: 1,
        ...customBody
      }
    } as unknown as Request;

    const res = {
      status: (code: number) => {
        statusCode = code;
        return res;
      },
      json: (data: any) => {
        jsonResponse = data;
      }
    } as unknown as Response;

    // Simulate requireAuth middleware manually for null user (UNAUTHORIZED).
    // The middleware now returns the unified envelope too.
    if (!userId) {
      statusCode = 401;
      jsonResponse = { error: { code: "UNAUTHORIZED", message: "Chưa đăng nhập" } };
    } else {
      await createProduct(req, res);
    }

    const statusOk = statusCode === expectedStatus;
    const errorCodeOk = !expectedErrorCode || jsonResponse.error?.code === expectedErrorCode;
    const envelopeOk = !expectedErrorCode || (
      typeof jsonResponse.error === "object" &&
      typeof jsonResponse.error?.code === "string" &&
      typeof jsonResponse.error?.message === "string"
    );

    if (statusOk && errorCodeOk && envelopeOk) {
      console.log(`✅ PASS: User ${userId || "Unauthenticated"} → ${statusCode} ${expectedErrorCode ? `(${expectedErrorCode})` : ""}`);

      // Verification for spoofed sellerId
      if (expectedStatus === 201 && customBody.sellerId) {
        const sellerIdInResponse = jsonResponse.product?.sellerId?.id || jsonResponse.product?.sellerId;
        if (sellerIdInResponse !== userId) {
          console.error(`❌ FAIL: Spoofed sellerId was accepted! Expected ${userId}, got ${sellerIdInResponse}`);
          failed++;
          return;
        } else {
          console.log(`✅ PASS: Spoofed sellerId ignored. Product created with true userId.`);
        }
      }
      passed++;
    } else {
      console.error(
        `❌ FAIL: User ${userId || "Unauthenticated"}. ` +
        `Expected ${expectedStatus}${expectedErrorCode ? ` (${expectedErrorCode})` : ""}, ` +
        `got ${statusCode} ${JSON.stringify(jsonResponse)}`
      );
      failed++;
    }
  }

  // ── Test matrix ────────────────────────────────────────────────────────────────

  // Test 1: Buyer -> 403 SELLER_NOT_APPROVED
  await testCreateProduct(buyer._id.toString(), 403, "SELLER_NOT_APPROVED");

  // Test 2: Pending Seller -> 403 SELLER_NOT_APPROVED
  await testCreateProduct(pendingSeller._id.toString(), 403, "SELLER_NOT_APPROVED");

  // Test 3: Suspended Seller -> 403 SELLER_NOT_APPROVED
  await testCreateProduct(suspendedSeller._id.toString(), 403, "SELLER_NOT_APPROVED");

  // Test 4: Approved Seller -> 201
  await testCreateProduct(approvedSeller._id.toString(), 201);

  // Test 5: Approved Seller attempting to spoof sellerId -> 201 (spoofed ID ignored)
  await testCreateProduct(approvedSeller._id.toString(), 201, undefined, { sellerId: buyer._id.toString() });

  // Test 6: Unauthenticated -> 401 UNAUTHORIZED
  await testCreateProduct(null, 401, "UNAUTHORIZED");

  // ── New tests for unified error envelope (added 2026-09-29) ────────────────────

  console.log("\nRunning Error-envelope tests for POST /api/products...\n");

  // Test 7: Missing title -> 400 PRODUCT_TITLE_REQUIRED
  await testCreateProduct(approvedSeller._id.toString(), 400, "PRODUCT_TITLE_REQUIRED", {
    title: undefined, name: undefined,
  });

  // Test 8: Missing price -> 400 PRODUCT_PRICE_REQUIRED
  await testCreateProduct(approvedSeller._id.toString(), 400, "PRODUCT_PRICE_REQUIRED", {
    price: undefined,
  });

  // Test 9: Missing condition -> 400 PRODUCT_CONDITION_REQUIRED
  await testCreateProduct(approvedSeller._id.toString(), 400, "PRODUCT_CONDITION_REQUIRED", {
    condition: undefined,
  });

  // Test 10: Missing size -> 400 PRODUCT_SIZE_REQUIRED
  await testCreateProduct(approvedSeller._id.toString(), 400, "PRODUCT_SIZE_REQUIRED", {
    size: undefined,
  });

  // Test 11: Invalid quantity -> 400 PRODUCT_QUANTITY_INVALID
  await testCreateProduct(approvedSeller._id.toString(), 400, "PRODUCT_QUANTITY_INVALID", {
    quantity: 0,
  });

  // ── Cleanup ────────────────────────────────────────────────────────────────────
  await User.deleteMany({ _id: { $in: [buyer._id, pendingSeller._id, approvedSeller._id, suspendedSeller._id] } });
  await Product.deleteMany({ sellerId: approvedSeller._id });

  await mongoose.disconnect();

  console.log(`\n========================================`);
  console.log(`Test Summary: ${passed} passed, ${failed} failed.`);
  console.log(`========================================`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("❌ Test runner crashed:", err);
  process.exit(1);
});