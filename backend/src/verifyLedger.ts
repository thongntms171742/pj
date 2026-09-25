import mongoose from "mongoose";
import dotenv from "dotenv";
import { User, Category, Product, PlatformFeeConfig, Order, Ledger } from "./models";
import { createOrder, collectCOD } from "./controllers/orderController";
import { checkout } from "./controllers/paymentController";
import { Request, Response } from "express";

dotenv.config();

const mockRes = (): any => {
  const res: any = {};
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

async function runTests() {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/thriftit");
  console.log("Connected to DB for Ledger Verification");

  // 1. Setup test data
  await Order.deleteMany({ orderCode: { $regex: /^TEST-/ } });
  await Ledger.deleteMany({ orderCode: { $regex: /^TEST-/ } });
  await PlatformFeeConfig.deleteMany({});
  
  const admin = await User.findOne({ roles: "admin" }) || await User.findOne();
  const buyer = await User.findOne({ email: "buyer@example.com" }) || admin;
  const seller = await User.findOne({ email: "seller@example.com" }) || admin;
  
  const p1 = await Product.findOne();
  if (!p1) throw new Error("No products in DB");

  // Reset p1 quantity to 10 and status for testing
  p1.quantity = 10;
  p1.status = "active";
  p1.reservedUntil = null;
  p1.reservedByOrderId = null;
  await p1.save();

  console.log("--- Bắt đầu chạy 5 test cases ---");

  // Set default fee to 5%
  await PlatformFeeConfig.create({ rate: 0.05, active: true, createdBy: admin?._id });

  // TEST 1 — Online SUCCESS
  console.log("\nTEST 1: Online SUCCESS");
  const req1 = {
    user: { id: buyer!._id.toString() },
    body: {
      items: [{ id: p1._id.toString(), quantity: 1 }],
      paymentMethod: "ONLINE"
    }
  } as Request;
  
  const res1 = mockRes();
  await createOrder(req1, res1);
  if (res1.data && res1.data.error) {
    console.error("Lỗi tạo đơn:", res1.data);
    throw new Error("Test 1 Failed: Create Order");
  }
  const order1 = res1.data.order;
  // Update orderCode to TEST- prefix so it's deleted later
  await Order.findByIdAndUpdate(order1._id, { orderCode: `TEST-${order1.orderCode}` });
  order1.orderCode = `TEST-${order1.orderCode}`;

  const payReq1 = {
    user: { id: buyer!._id.toString() },
    body: { orderId: order1._id.toString(), method: "card" }
  } as Request;
  const payRes1 = mockRes();
  await checkout(payReq1, payRes1);
  
  const o1Paid = await Order.findById(order1._id);
  const l1 = await Ledger.findOne({ orderId: order1._id });
  
  if (o1Paid!.status === "CONFIRMED" && l1 && l1.entries.length === 6) {
    const pCash = l1.entries.find(e => e.account === "PLATFORM_CASH" && e.type === "DR");
    const pRev = l1.entries.find(e => e.account === "PLATFORM_REVENUE" && e.type === "CR");
    const sPay = l1.entries.find(e => e.account === "SELLER_PAYABLE" && e.type === "CR");
    
    const expectedPayable = o1Paid!.totalAmount - o1Paid!.platformFeeAmount;
    if (pCash && pRev && sPay && pRev.amount === o1Paid!.platformFeeAmount && sPay.amount === expectedPayable) {
      console.log("✅ TEST 1 PASSED");
    } else {
      console.error("Test 1 Failed: Ledger entries incorrect", l1.entries);
    }
  } else {
    console.error("Test 1 Failed", { status: o1Paid!.status, entries: l1?.entries });
  }

  // TEST 2 — Online webhook gọi 2 lần (Idempotency)
  console.log("\nTEST 2: Online webhook x2");
  const payRes2 = mockRes();
  await checkout(payReq1, payRes2);
  const l1Count = await Ledger.countDocuments({ orderId: order1._id });
  if (l1Count === 1 && payRes2.data.order.status === "CONFIRMED") {
    console.log("✅ TEST 2 PASSED (Idempotent)");
  } else {
    console.error("Test 2 Failed", { l1Count });
  }

  // TEST 3 — COD chưa thu
  console.log("\nTEST 3: COD chưa thu");
  const req3 = {
    user: { id: buyer!._id.toString() },
    body: {
      items: [{ id: p1._id.toString(), quantity: 1 }],
      paymentMethod: "COD"
    }
  } as Request;
  const res3 = mockRes();
  await createOrder(req3, res3);
  if (res3.data && res3.data.error) throw new Error("Test 3 Failed: " + res3.data.error);
  const order3 = res3.data.order;
  await Order.findByIdAndUpdate(order3._id, { orderCode: `TEST-${order3.orderCode}` });
  order3.orderCode = `TEST-${order3.orderCode}`;

  const l3Count = await Ledger.countDocuments({ orderId: order3._id });
  if (l3Count === 0) {
    console.log("✅ TEST 3 PASSED (Không có PLATFORM_CASH)");
  } else {
    console.error("Test 3 Failed", { l3Count });
  }

  // TEST 4 — COD collect gọi 2 lần
  console.log("\nTEST 4: COD collect x2");
  // Set order3 to DELIVERED first so we can collect
  await Order.findByIdAndUpdate(order3._id, { status: "DELIVERED" });
  
  const colReq = { params: { code: order3.orderCode } } as unknown as Request;
  const colRes1 = mockRes();
  await collectCOD(colReq, colRes1);
  const colRes2 = mockRes();
  await collectCOD(colReq, colRes2);

  const l4Count = await Ledger.countDocuments({ orderId: order3._id });
  if (l4Count === 1 && colRes2.data.message === "Đã thu tiền COD cho đơn hàng này trước đó") {
    console.log("✅ TEST 4 PASSED (Idempotent collect)");
  } else {
    console.error("Test 4 Failed", { l4Count, msg: colRes2.data.message });
  }

  // TEST 5 — Admin đổi phí 5% → 10%
  console.log("\nTEST 5: Đổi phí snapshot");
  // Change fee to 10%
  await PlatformFeeConfig.updateMany({ active: true }, { active: false });
  await PlatformFeeConfig.create({ rate: 0.10, active: true, createdBy: admin?._id });

  const req5 = {
    user: { id: buyer!._id.toString() },
    body: {
      items: [{ id: p1._id.toString(), quantity: 1 }],
      paymentMethod: "ONLINE"
    }
  } as Request;
  const res5 = mockRes();
  await createOrder(req5, res5);
  if (res5.data && res5.data.error) throw new Error("Test 5 Failed: " + res5.data.error);
  const order5 = res5.data.order;
  await Order.findByIdAndUpdate(order5._id, { orderCode: `TEST-${order5.orderCode}` });

  const o3Reload = await Order.findById(order3._id);
  const o5Reload = await Order.findById(order5._id);
  
  if (o3Reload!.platformFeeRate === 0.05 && o5Reload!.platformFeeRate === 0.10) {
    console.log("✅ TEST 5 PASSED (Snapshot preserved)");
  } else {
    console.error("Test 5 Failed", { old: o3Reload!.platformFeeRate, new: o5Reload!.platformFeeRate });
  }

  console.log("\n--- HOÀN TẤT ---");
  await mongoose.disconnect();
}

runTests().catch(console.error);
