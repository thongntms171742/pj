import mongoose from "mongoose";
import dotenv from "dotenv";
import { User, Product, Order, Review, PlatformFeeConfig } from "./models";
import { createReview } from "./controllers/reviewController";
import { Request, Response } from "express";

dotenv.config();

// ── Mock Express Response ─────────────────────────────────────────────────────
const mockRes = (): any => {
  const res: any = { statusCode: 200 };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data: any) => {
    res.data = data;
    return res;
  };
  return res;
};

let passed = 0;
let failed = 0;

function assert(testName: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`✅ ${testName}`);
    passed++;
  } else {
    console.error(`❌ ${testName}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

async function runTests() {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/thriftit");
  console.log("Connected to DB for Review Tests\n");

  // ── Setup ───────────────────────────────────────────────────────────────────
  // Clean up previous test data
  await Review.deleteMany({});
  await Order.deleteMany({ orderCode: { $regex: /^REVTEST-/ } });

  // Ensure fee config exists
  const feeExists = await PlatformFeeConfig.findOne({ active: true });
  if (!feeExists) {
    await PlatformFeeConfig.create({ rate: 0.05, active: true });
  }

  // Get two distinct users (buyer & seller)
  const users = await User.find().limit(3).lean();
  if (users.length < 2) throw new Error("Need at least 2 users in DB");
  const buyerA = users[0];
  const buyerB = users[1];

  // Get a product not owned by buyerA
  const product = await Product.findOne({ sellerId: { $ne: buyerA._id } }).lean();
  if (!product) throw new Error("Need a product not owned by buyerA");

  // Get another product NOT in the order we'll create
  const otherProduct = await Product.findOne({
    _id: { $ne: product!._id },
  }).lean();

  // Create a COMPLETED order for buyerA with product
  const completedOrder = await Order.create({
    orderCode: `REVTEST-COMP-${Date.now()}`,
    buyerId: buyerA._id,
    items: [
      {
        productId: product!._id,
        sellerId: product!.sellerId,
        productName: product!.title || "Test Product",
        productImageUrl: "",
        unitPrice: product!.price || 100000,
        quantity: 1,
        sellerAmount: (product!.price || 100000) * 0.95,
      },
    ],
    subtotal: product!.price || 100000,
    shippingFee: 30000,
    platformFeeRate: 0.05,
    platformFeeAmount: Math.round((product!.price || 100000) * 0.05),
    sellerAmount: (product!.price || 100000) * 0.95,
    totalAmount: (product!.price || 100000) + 30000,
    status: "COMPLETED",
    statusHistory: [
      { status: "COMPLETED", by: "system", at: new Date(), reason: "Test" },
    ],
    paymentMethod: "ONLINE",
    idempotencyKey: `revtest-comp-${Date.now()}`,
  });

  // Create a DELIVERING order for buyerA (not yet completed)
  const deliveringOrder = await Order.create({
    orderCode: `REVTEST-DLVR-${Date.now()}`,
    buyerId: buyerA._id,
    items: [
      {
        productId: product!._id,
        sellerId: product!.sellerId,
        productName: product!.title || "Test Product",
        productImageUrl: "",
        unitPrice: product!.price || 100000,
        quantity: 1,
        sellerAmount: (product!.price || 100000) * 0.95,
      },
    ],
    subtotal: product!.price || 100000,
    shippingFee: 30000,
    platformFeeRate: 0.05,
    platformFeeAmount: Math.round((product!.price || 100000) * 0.05),
    sellerAmount: (product!.price || 100000) * 0.95,
    totalAmount: (product!.price || 100000) + 30000,
    status: "DELIVERING",
    statusHistory: [
      { status: "DELIVERING", by: "system", at: new Date(), reason: "Test" },
    ],
    paymentMethod: "COD",
    idempotencyKey: `revtest-dlvr-${Date.now()}`,
  });

  console.log("--- Bắt đầu chạy 6 Review test cases ---\n");

  // ── TEST 1: COMPLETED + đúng buyer + đúng product → tạo Review ─────────────
  console.log("TEST 1: COMPLETED + đúng buyer + đúng product → tạo Review");
  const req1 = {
    user: { id: buyerA._id.toString() },
    params: { productId: product!._id.toString() },
    body: {
      orderId: completedOrder._id.toString(),
      rating: 5,
      comment: "Sản phẩm rất đẹp, đúng mô tả!",
    },
  } as unknown as Request;
  const res1 = mockRes();
  await createReview(req1, res1);
  assert(
    "TEST 1 — COMPLETED + đúng buyer + đúng product → 201",
    res1.statusCode === 201 && res1.data.review != null,
    `status=${res1.statusCode}, data=${JSON.stringify(res1.data)}`
  );

  // ── TEST 2: Order chưa COMPLETED → 400 ─────────────────────────────────────
  console.log("\nTEST 2: Order chưa COMPLETED → 400");
  const req2 = {
    user: { id: buyerA._id.toString() },
    params: { productId: product!._id.toString() },
    body: {
      orderId: deliveringOrder._id.toString(),
      rating: 4,
      comment: "Test",
    },
  } as unknown as Request;
  const res2 = mockRes();
  await createReview(req2, res2);
  assert(
    "TEST 2 — Order chưa COMPLETED → 400",
    res2.statusCode === 400 && res2.data.error.includes("hoàn tất"),
    `status=${res2.statusCode}, error=${res2.data.error}`
  );

  // ── TEST 3: User không phải buyer → 403 ─────────────────────────────────────
  console.log("\nTEST 3: User không phải buyer → 403");
  const req3 = {
    user: { id: buyerB._id.toString() },
    params: { productId: product!._id.toString() },
    body: {
      orderId: completedOrder._id.toString(),
      rating: 3,
      comment: "Giả mạo",
    },
  } as unknown as Request;
  const res3 = mockRes();
  await createReview(req3, res3);
  assert(
    "TEST 3 — User không phải buyer → 403",
    res3.statusCode === 403 && res3.data.error.includes("không phải người mua"),
    `status=${res3.statusCode}, error=${res3.data.error}`
  );

  // ── TEST 4: Product không thuộc Order → 400 ─────────────────────────────────
  console.log("\nTEST 4: Product không thuộc Order → 400");
  if (otherProduct) {
    const req4 = {
      user: { id: buyerA._id.toString() },
      params: { productId: otherProduct._id.toString() },
      body: {
        orderId: completedOrder._id.toString(),
        rating: 4,
        comment: "Sản phẩm không liên quan",
      },
    } as unknown as Request;
    const res4 = mockRes();
    await createReview(req4, res4);
    assert(
      "TEST 4 — Product không thuộc Order → 400",
      res4.statusCode === 400 && res4.data.error.includes("không thuộc"),
      `status=${res4.statusCode}, error=${res4.data.error}`
    );
  } else {
    console.log("⚠️  TEST 4 SKIPPED — chỉ có 1 product trong DB");
  }

  // ── TEST 5: Review lần 2 → 409 ─────────────────────────────────────────────
  console.log("\nTEST 5: Review lần 2 → 409");
  const req5 = {
    user: { id: buyerA._id.toString() },
    params: { productId: product!._id.toString() },
    body: {
      orderId: completedOrder._id.toString(),
      rating: 1,
      comment: "Đánh giá lại lần 2",
    },
  } as unknown as Request;
  const res5 = mockRes();
  await createReview(req5, res5);
  assert(
    "TEST 5 — Review lần 2 → 409",
    res5.statusCode === 409 && res5.data.error.includes("đã đánh giá"),
    `status=${res5.statusCode}, error=${res5.data.error}`
  );

  // ── TEST 6: User B không có order → không thể review ───────────────────────
  console.log("\nTEST 6: User B không có COMPLETED order → không thể review");
  // Create a COMPLETED order for buyerB with a DIFFERENT product (if possible),
  // to ensure buyerB's order doesn't contain product X
  const req6 = {
    user: { id: buyerB._id.toString() },
    params: { productId: product!._id.toString() },
    body: {
      orderId: completedOrder._id.toString(),
      rating: 5,
      comment: "Tôi không phải buyer",
    },
  } as unknown as Request;
  const res6 = mockRes();
  await createReview(req6, res6);
  assert(
    "TEST 6 — User B không có order → 403",
    res6.statusCode === 403,
    `status=${res6.statusCode}, error=${res6.data.error}`
  );

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(50)}`);
  console.log(`TỔNG KẾT: ${passed} passed, ${failed} failed`);
  console.log(`${"═".repeat(50)}`);

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
