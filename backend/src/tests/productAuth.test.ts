import mongoose from "mongoose";
import { createProduct } from "../controllers/productController";
import { User } from "../models/User";
import { Request, Response } from "express";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://nguyentangminhthong1_db_user:stone123@cluster0.jkkqqk7.mongodb.net/thriftit?retryWrites=true&w=majority&appName=Cluster0&tlsAllowInvalidCertificates=true";

async function runTests() {
  console.log("Connecting to Database...");
  await mongoose.connect(MONGODB_URI);
  console.log("Connected.");

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

  console.log("Running Authorization Matrix Tests for POST /api/products...");

  let passed = 0;
  let failed = 0;

  async function testCreateProduct(userId: string | null, expectedStatus: number, expectedError?: string, customBody: any = {}) {
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

    // Simulate requireAuth middleware manually for null user
    if (!userId) {
      statusCode = 401;
      jsonResponse = { error: "Chưa đăng nhập" };
    } else {
      await createProduct(req, res);
    }

    if (statusCode === expectedStatus && (!expectedError || jsonResponse.error === expectedError)) {
      console.log(`✅ PASS: User ${userId || "Unauthenticated"} got status ${statusCode}`);
      
      // Verification for spoofed sellerId
      if (expectedStatus === 201 && customBody.sellerId) {
        if (jsonResponse.product?.sellerId?.id !== userId && jsonResponse.product?.sellerId !== userId) {
           console.error(`❌ FAIL: Spoofed sellerId was accepted! Expected ${userId}, got ${jsonResponse.product?.sellerId?.id || jsonResponse.product?.sellerId}`);
           failed++;
           return;
        } else {
           console.log(`✅ PASS: Spoofed sellerId ignored. Product created with true userId.`);
        }
      }
      passed++;
    } else {
      console.error(`❌ FAIL: User ${userId || "Unauthenticated"}. Expected ${expectedStatus} ${expectedError || ""}, got ${statusCode} ${JSON.stringify(jsonResponse)}`);
      failed++;
    }
  }

  // Test 1: Buyer -> 403
  await testCreateProduct(buyer._id.toString(), 403, "SELLER_NOT_APPROVED");

  // Test 2: Pending Seller -> 403
  await testCreateProduct(pendingSeller._id.toString(), 403, "SELLER_NOT_APPROVED");

  // Test 3: Suspended Seller -> 403
  await testCreateProduct(suspendedSeller._id.toString(), 403, "SELLER_NOT_APPROVED");

  // Test 4: Approved Seller -> 201
  await testCreateProduct(approvedSeller._id.toString(), 201);

  // Test 5: Approved Seller attempting to spoof sellerId -> 201 (spoofed ID ignored)
  await testCreateProduct(approvedSeller._id.toString(), 201, undefined, { sellerId: buyer._id.toString() });

  // Test 6: Unauthenticated -> 401
  await testCreateProduct(null, 401, "Chưa đăng nhập");

  // Cleanup
  await User.deleteMany({ _id: { $in: [buyer._id, pendingSeller._id, approvedSeller._id, suspendedSeller._id] } });
  
  // also delete the created product by approvedSeller
  const { Product } = await import("../models/Product");
  await Product.deleteMany({ sellerId: approvedSeller._id });

  await mongoose.disconnect();

  console.log(`\nTest Summary: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(console.error);
