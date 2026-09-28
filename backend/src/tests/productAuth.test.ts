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

  console.log("Running Authorization Matrix Tests for POST /api/products...");

  let passed = 0;
  let failed = 0;

  async function testCreateProduct(userId: string, expectedStatus: number, expectedError?: string) {
    let statusCode = 200;
    let jsonResponse: any = {};

    const req = {
      user: { id: userId, email: "test@test.com", roles: [] },
      body: {
        title: "Test Product",
        price: 100000,
        condition: 95,
        size: "M",
        quantity: 1,
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

    await createProduct(req, res);

    if (statusCode === expectedStatus && (!expectedError || jsonResponse.error === expectedError)) {
      console.log(`✅ PASS: User ${userId} got status ${statusCode}`);
      passed++;
    } else {
      console.error(`❌ FAIL: User ${userId}. Expected ${expectedStatus} ${expectedError || ""}, got ${statusCode} ${JSON.stringify(jsonResponse)}`);
      failed++;
    }
  }

  // Test 1: Buyer
  await testCreateProduct(buyer._id.toString(), 403, "SELLER_NOT_APPROVED");

  // Test 2: Pending Seller
  await testCreateProduct(pendingSeller._id.toString(), 403, "SELLER_NOT_APPROVED");

  // Test 3: Approved Seller
  await testCreateProduct(approvedSeller._id.toString(), 201);

  // Cleanup
  await User.deleteMany({ _id: { $in: [buyer._id, pendingSeller._id, approvedSeller._id] } });
  
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
