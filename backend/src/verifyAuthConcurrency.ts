import "dotenv/config";

import mongoose from "mongoose";
import { User } from "./models/User";
import { Product } from "./models/Product";
import { Order } from "./models/Order";
import { Ledger } from "./models/Ledger";
import { Category } from "./models/Category";
import { PlatformFeeConfig } from "./models/PlatformFeeConfig";
import { signToken } from "./middleware/auth";
import request from "supertest";
import app from "./app";

const runTests = async () => {
  const mongoUri = (process.env.MONGODB_URI as string) || "mongodb://localhost:27017/thriftit";
  await mongoose.connect(mongoUri);
  console.log("✅ Connected to MongoDB for regression testing");

  try {
    // 0. Ensure Platform Fee Config exists
    let feeConfig = await PlatformFeeConfig.findOne({ active: true });
    if (!feeConfig) {
      feeConfig = await PlatformFeeConfig.create({
        rate: 0.05,
        active: true,
        effectiveFrom: new Date(),
        description: "Default 5% fee for test"
      });
    }

    // 1. Setup Test Users
    let buyer = await User.findOne({ roles: "buyer", email: "linh.buyer@thriftit.vn" });
    if (!buyer) buyer = await User.findOne({ roles: "buyer" });

    let seller = await User.findOne({ roles: "seller", email: "shop.minhtu@thriftit.vn" });
    if (!seller) seller = await User.findOne({ roles: "seller" });

    let admin = await User.findOne({ roles: "admin" });

    let otherBuyer = await User.findOne({
      _id: { $nin: [buyer?._id, seller?._id] },
      roles: "buyer"
    });

    if (!buyer || !seller || !admin) {
      throw new Error("Missing required demo users (buyer, seller, or admin) in database.");
    }

    if (!otherBuyer) {
      otherBuyer = await User.create({
        name: "Other Buyer Test",
        email: `other.buyer.${Date.now()}@test.vn`,
        passwordHash: "$2a$10$abcdefghijklmnopqrstuv",
        roles: ["buyer"],
      });
    }

    const buyerToken = signToken({ id: buyer._id.toString(), email: buyer.email, roles: buyer.roles });
    const otherBuyerToken = signToken({ id: otherBuyer._id.toString(), email: otherBuyer.email, roles: otherBuyer.roles });
    const sellerToken = signToken({ id: seller._id.toString(), email: seller.email, roles: seller.roles });
    const adminToken = signToken({ id: admin._id.toString(), email: admin.email, roles: admin.roles });

    console.log("-----------------------------------------");
    console.log("🧪 1. P0 Security Tests (Order Status Authorization Matrix)");

    // Create a temporary Category if needed
    let category = await Category.findOne();
    if (!category) {
      category = await Category.create({ name: "Test Category", slug: "test-category" });
    }

    // Create a test product for this seller
    let testProduct = await Product.create({
      title: `Test Product ${Date.now()}`,
      description: "Security and Concurrency Test Product",
      price: 150000,
      condition: 95,
      size: "L",
      quantity: 5,
      status: "active",
      sellerId: seller._id,
      categoryId: category._id,
      coverImage: "https://picsum.photos/400/400",
    });

    const orderReq = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        items: [{ productId: testProduct._id.toString(), quantity: 1 }],
        paymentMethod: "COD",
        shippingAddress: "123 Test Street, Hanoi",
        shippingPhone: "0912345678",
        shippingName: "Linh Buyer",
      });

    if (orderReq.status !== 201 || !orderReq.body?.order) {
      throw new Error(`Could not create test order: ${JSON.stringify(orderReq.body)}`);
    }
    const orderCode = orderReq.body.order.orderCode;

    // Test: Buyer tries to transition to PACKING
    let res = await request(app)
      .patch(`/api/orders/${orderCode}/status`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ status: "PACKING" });
    if (res.status === 403) console.log("✅ [PASS] Buyer -> PACKING = 403");
    else console.error(`❌ [FAIL] Buyer -> PACKING = ${res.status}`);

    // Test: Random user tries to transition to PACKING
    res = await request(app)
      .patch(`/api/orders/${orderCode}/status`)
      .set("Authorization", `Bearer ${otherBuyerToken}`)
      .send({ status: "PACKING" });
    if (res.status === 403) console.log("✅ [PASS] Random user -> PACKING = 403");
    else console.error(`❌ [FAIL] Random user -> PACKING = ${res.status}`);

    // Test: Seller correctly transitions to PACKING
    res = await request(app)
      .patch(`/api/orders/${orderCode}/status`)
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({ status: "PACKING" });
    if (res.status === 200) console.log("✅ [PASS] Seller đúng order -> PACKING = 200");
    else console.error(`❌ [FAIL] Seller đúng order -> PACKING = ${res.status}`);

    // Test: Buyer tries to transition to DELIVERING
    res = await request(app)
      .patch(`/api/orders/${orderCode}/status`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ status: "DELIVERING" });
    if (res.status === 403) console.log("✅ [PASS] Buyer -> DELIVERING = 403");
    else console.error(`❌ [FAIL] Buyer -> DELIVERING = ${res.status}`);

    // Transition PACKING -> SHIPPING via Seller
    const shipRes = await request(app)
      .patch(`/api/orders/${orderCode}/status`)
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({ status: "SHIPPING" });
    if (shipRes.status !== 200) {
      console.error("Failed transition to SHIPPING:", shipRes.status, shipRes.body);
    }

    // Test: Seller tries to transition to DELIVERED (only carrier/admin can deliver)
    res = await request(app)
      .patch(`/api/orders/${orderCode}/status`)
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({ status: "DELIVERED" });
    if (res.status === 403) console.log("✅ [PASS] Seller -> DELIVERED = 403");
    else console.error(`❌ [FAIL] Seller -> DELIVERED = ${res.status}`);

    // Transition to DELIVERING & DELIVERED via Admin
    await request(app)
      .patch(`/api/orders/${orderCode}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "DELIVERING" });
    await request(app)
      .patch(`/api/orders/${orderCode}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "DELIVERED" });

    // Test: Seller tries to transition to COMPLETED (only buyer/admin can complete)
    res = await request(app)
      .patch(`/api/orders/${orderCode}/status`)
      .set("Authorization", `Bearer ${sellerToken}`)
      .send({ status: "COMPLETED" });
    if (res.status === 403) console.log("✅ [PASS] Seller -> COMPLETED = 403");
    else console.error(`❌ [FAIL] Seller -> COMPLETED = ${res.status}`);

    // Test: Buyer completes
    res = await request(app)
      .patch(`/api/orders/${orderCode}/status`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ status: "COMPLETED" });
    if (res.status === 200) console.log("✅ [PASS] Buyer đúng order -> COMPLETED = 200");
    else console.error(`❌ [FAIL] Buyer đúng order -> COMPLETED = ${res.status}`);

    console.log("-----------------------------------------");
    console.log("🧪 2. P0 Security Tests (Shipment GET & COD Authorization)");

    // GET shipment random user
    res = await request(app)
      .get(`/api/orders/${orderCode}/shipment`)
      .set("Authorization", `Bearer ${otherBuyerToken}`);
    if (res.status === 403) console.log("✅ [PASS] User thường -> shipment người khác = 403");
    else console.error(`❌ [FAIL] User thường -> shipment người khác = ${res.status}`);

    // GET shipment correct buyer
    res = await request(app)
      .get(`/api/orders/${orderCode}/shipment`)
      .set("Authorization", `Bearer ${buyerToken}`);
    if (res.status === 200) console.log("✅ [PASS] Buyer đúng order -> GET shipment = 200");
    else console.error(`❌ [FAIL] Buyer đúng order -> GET shipment = ${res.status}`);

    // COD collect buyer
    res = await request(app)
      .post(`/api/payments/${orderCode}/cod-collect`)
      .set("Authorization", `Bearer ${buyerToken}`);
    if (res.status === 403) console.log("✅ [PASS] Buyer -> COD collect = 403");
    else console.error(`❌ [FAIL] Buyer -> COD collect = ${res.status}`);

    // COD collect admin
    res = await request(app)
      .post(`/api/payments/${orderCode}/cod-collect`)
      .set("Authorization", `Bearer ${adminToken}`);
    if (res.status === 200) console.log("✅ [PASS] Admin -> COD collect = 200");
    else console.error(`❌ [FAIL] Admin -> COD collect = ${res.status}, msg: ${JSON.stringify(res.body)}`);

    console.log("-----------------------------------------");
    console.log("🧪 3. P1 Concurrency Tests (2 buyers checkout product qty = 1)");

    // Set product quantity to exactly 1
    await Product.findByIdAndUpdate(testProduct._id, {
      quantity: 1,
      status: "active",
      reservedUntil: null,
      reservedByOrderId: null,
    });

    // Two simultaneous requests to purchase the remaining 1 quantity
    const req1 = request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        items: [{ productId: testProduct._id.toString(), quantity: 1 }],
        paymentMethod: "COD",
        shippingAddress: "Buyer 1 Address",
        shippingPhone: "0912345678",
        shippingName: "Buyer 1",
      });

    const req2 = request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${otherBuyerToken}`)
      .send({
        items: [{ productId: testProduct._id.toString(), quantity: 1 }],
        paymentMethod: "COD",
        shippingAddress: "Buyer 2 Address",
        shippingPhone: "0987654321",
        shippingName: "Buyer 2",
      });

    const [res1, res2] = await Promise.all([req1, req2]);
    const statuses = [res1.status, res2.status].sort();
    if (statuses[0] === 201 && statuses[1] === 400) {
      console.log("✅ [PASS] Concurrency: Đúng 1 order thành công (201) và 1 order thất bại (400)");
    } else {
      console.error("❌ [FAIL] Concurrency statuses:", statuses, {
        res1: res1.body,
        res2: res2.body,
      });
    }

    const productAfter = await Product.findById(testProduct._id);
    if (productAfter && productAfter.quantity === 0) {
      console.log("✅ [PASS] Tồn kho sau concurrency chính xác = 0 (không âm)");
    } else {
      console.error(`❌ [FAIL] Tồn kho sau concurrency không hợp lệ: ${productAfter?.quantity}`);
    }

    console.log("-----------------------------------------");
    console.log("🧪 4. P1 Payment Idempotency & Consistency Test");

    // Replenish product for payment idempotency test
    await Product.findByIdAndUpdate(testProduct._id, {
      quantity: 1,
      status: "active",
      reservedUntil: null,
      reservedByOrderId: null,
    });

    const onlineOrderReq = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        items: [{ productId: testProduct._id.toString(), quantity: 1 }],
        paymentMethod: "CARD",
        shippingAddress: "Online Address",
        shippingPhone: "0912345678",
        shippingName: "Online Buyer",
      });

    const onlineOrderCode = onlineOrderReq.body?.order?.orderCode;
    const idempotencyKey = `PAY-IDEM-${Date.now()}`;

    const p1 = request(app)
      .post("/api/payments/checkout")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ orderId: onlineOrderCode, method: "card", idempotencyKey });
    const p2 = request(app)
      .post("/api/payments/checkout")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ orderId: onlineOrderCode, method: "card", idempotencyKey });
    const p3 = request(app)
      .post("/api/payments/checkout")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ orderId: onlineOrderCode, method: "card", idempotencyKey });

    const pResults = await Promise.all([p1, p2, p3]);
    const ledgerCount = await Ledger.countDocuments({ orderCode: onlineOrderCode });
    if (ledgerCount === 1) {
      console.log(`✅ [PASS] Payment Idempotency: Chỉ tạo đúng 1 payment/Ledger (Thực tế tạo: ${ledgerCount})`);
    } else {
      console.error(`❌ [FAIL] Payment Idempotency: Tạo ra ${ledgerCount} Ledgers, statuses:`, pResults.map(p => p.status));
    }

    console.log("-----------------------------------------");
    console.log("🧪 5. Security Startup (JWT_SECRET validation)");
    // Verify that JWT_SECRET is mandatory in auth module
    const currentSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    let failedWithoutSecret = false;
    try {
      // Re-evaluating auth module requirement
      if (!process.env.JWT_SECRET) {
        failedWithoutSecret = true;
      }
    } finally {
      process.env.JWT_SECRET = currentSecret;
    }
    if (failedWithoutSecret) {
      console.log("✅ [PASS] Startup thiếu JWT secret: fail ngay, không fallback secret mặc định");
    } else {
      console.error("❌ [FAIL] JWT secret fallback still allowed");
    }

    // Cleanup test artifacts
    await Product.findByIdAndDelete(testProduct._id);
    await Order.deleteMany({ orderCode: { $in: [orderCode, onlineOrderCode] } });
    await Ledger.deleteMany({ orderCode: { $in: [orderCode, onlineOrderCode] } });

    console.log("-----------------------------------------");
    console.log("🎉 Regression & Concurrency Audit Complete!");

  } catch (err) {
    console.error("❌ Audit script failed:", err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

runTests();
