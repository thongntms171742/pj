import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import { User, Product, Order, Review, PlatformFeeConfig, Cart, CartItem } from "./models";
import { createProduct, updateProduct, archiveProduct } from "./controllers/productController";
import { createOrder, updateOrderStatus, createOrderShipment } from "./controllers/orderController";
import { createReview } from "./controllers/reviewController";
import { checkout } from "./controllers/paymentController";
import { Request, Response } from "express";

const mockRes = (): any => {
  const res: any = { statusCode: 200 };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (data: any) => { res.data = data; return res; };
  return res;
};

let passed = 0;
let failed = 0;
function assert(name: string, ok: boolean, detail?: string) {
  if (ok) { console.log(`✅ ${name}`); passed++; }
  else { console.error(`❌ ${name}${detail ? " — " + detail : ""}`); failed++; }
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || "");
  console.log("Connected\n");

  // Cleanup
  await Product.deleteMany({ title: { $regex: /^SELLERTEST/ } });
  await Order.deleteMany({ orderCode: { $regex: /^SELLERTEST/ } });
  await Review.deleteMany({});

  // Ensure fee config
  const fee = await PlatformFeeConfig.findOne({ active: true });
  if (!fee) await PlatformFeeConfig.create({ rate: 0.05, active: true });

  // Get two users: seller and buyer
  const users = await User.find().limit(3).lean();
  if (users.length < 2) throw new Error("Need 2+ users");
  const seller = users[0];
  const buyer = users[1];

  console.log(`Seller: ${seller.email} (${seller._id})`);
  console.log(`Buyer:  ${buyer.email} (${buyer._id})\n`);
  console.log("═══════════════════════════════════════════════════");
  console.log("  SELLER MVP — END-TO-END SCENARIO TEST");
  console.log("═══════════════════════════════════════════════════\n");

  // ── STEP 1: Seller creates product ──────────────────────────────────────────
  console.log("STEP 1: Seller đăng sản phẩm");
  const createReq = {
    user: { id: seller._id.toString() },
    body: {
      title: "SELLERTEST Áo Vintage",
      price: 200000,
      condition: 85,
      size: "M",
      quantity: 3,
      description: "Áo vintage cổ điển",
      coverImage: "https://example.com/ao.jpg",
    },
  } as unknown as Request;
  const createRes = mockRes();
  await createProduct(createReq, createRes);
  assert("1a — Tạo sản phẩm → 201", createRes.statusCode === 201);
  const product = createRes.data.product;
  assert("1b — Status = pending", product.status === "pending");

  // ── STEP 2: Seller updates product ──────────────────────────────────────────
  console.log("\nSTEP 2: Seller sửa sản phẩm");
  const updateReq = {
    user: { id: seller._id.toString() },
    params: { id: product._id },
    body: { price: 180000, description: "Áo vintage cổ điển, đã giặt sạch" },
  } as unknown as Request;
  const updateRes = mockRes();
  await updateProduct(updateReq, updateRes);
  assert("2a — Sửa thành công", updateRes.statusCode === 200);
  assert("2b — Giá cập nhật", updateRes.data.product.price === 180000);

  // ── STEP 3: Wrong seller can't update ───────────────────────────────────────
  console.log("\nSTEP 3: Người khác không sửa được");
  const wrongReq = {
    user: { id: buyer._id.toString() },
    params: { id: product._id },
    body: { price: 1 },
  } as unknown as Request;
  const wrongRes = mockRes();
  await updateProduct(wrongReq, wrongRes);
  assert("3 — 403 cho người không phải chủ", wrongRes.statusCode === 403);

  // ── STEP 4: Admin approves product (simulate) ──────────────────────────────
  console.log("\nSTEP 4: Admin duyệt sản phẩm");
  await Product.findByIdAndUpdate(product._id, { status: "active" });
  const activeP = await Product.findById(product._id).lean();
  assert("4 — Status = active", activeP!.status === "active");

  // ── STEP 5: Buyer creates order ────────────────────────────────────────────
  console.log("\nSTEP 5: Buyer đặt hàng (ONLINE)");
  const orderReq = {
    user: { id: buyer._id.toString() },
    body: {
      items: [{ id: product._id, quantity: 1 }],
      paymentMethod: "ONLINE",
      shippingName: "Nguyễn Văn A",
      shippingPhone: "0901234567",
      shippingAddress: "123 Nguyễn Trãi, TP.HCM",
    },
  } as unknown as Request;
  const orderRes = mockRes();
  await createOrder(orderReq, orderRes);
  if (orderRes.data?.error) { console.error("Order error:", orderRes.data.error); }
  assert("5a — Tạo đơn thành công", !!orderRes.data?.order);
  const order = orderRes.data.order;
  // Rename for cleanup
  await Order.findByIdAndUpdate(order._id, { orderCode: `SELLERTEST-${order.orderCode}` });
  const updatedOrder = await Order.findById(order._id);
  assert("5b — Status = PENDING_PAYMENT", updatedOrder!.status === "PENDING_PAYMENT");

  // ── STEP 6: Buyer pays ─────────────────────────────────────────────────────
  console.log("\nSTEP 6: Buyer thanh toán");
  const payReq = {
    user: { id: buyer._id.toString() },
    body: { orderId: order._id, method: "card" },
  } as unknown as Request;
  const payRes = mockRes();
  await checkout(payReq, payRes);
  const paidOrder = await Order.findById(order._id);
  assert("6 — Status = CONFIRMED (after payment)", paidOrder!.status === "CONFIRMED");

  // ── STEP 7: Seller sees the order ──────────────────────────────────────────
  console.log("\nSTEP 7: Seller thấy đơn hàng");
  const sellerOrders = await Order.find({ "items.sellerId": seller._id }).lean();
  const found = sellerOrders.some((o) => o._id.toString() === order._id);
  assert("7 — Seller thấy Order trong danh sách", found);

  // ── STEP 8: Seller xác nhận → PACKING ──────────────────────────────────────
  console.log("\nSTEP 8: Seller → PACKING");
  const packReq = {
    user: { id: seller._id.toString(), email: seller.email, roles: [] },
    params: { code: updatedOrder!.orderCode },
    body: { status: "PACKING", reason: "Đang đóng gói hàng" },
  } as unknown as Request;
  const packRes = mockRes();
  await updateOrderStatus(packReq, packRes);
  assert("8 — Status = PACKING", packRes.data?.order?.status === "PACKING");

  // ── STEP 9: Seller tạo vận đơn → SHIPPING ─────────────────────────────────
  console.log("\nSTEP 9: Seller tạo vận đơn → SHIPPING");
  const shipReq = {
    user: { id: seller._id.toString(), roles: [] },
    params: { code: updatedOrder!.orderCode },
    body: {
      pickup: {
        name: "Shop Vintage",
        phone: "0909999999",
        address: "456 Lê Lợi, Q1",
        province: "TP.HCM",
      },
    },
  } as unknown as Request;
  const shipRes = mockRes();
  await createOrderShipment(shipReq, shipRes);
  const shippedOrder = await Order.findById(order._id);
  assert("9a — Status = SHIPPING", shippedOrder!.status === "SHIPPING");
  assert("9b — Có tracking number", !!shippedOrder!.trackingNumber);

  // ── STEP 10: DELIVERING ────────────────────────────────────────────────────
  console.log("\nSTEP 10: → DELIVERING");
  const dlvrReq = {
    user: { id: buyer._id.toString(), email: buyer.email, roles: [] },
    params: { code: updatedOrder!.orderCode },
    body: { status: "DELIVERING" },
  } as unknown as Request;
  const dlvrRes = mockRes();
  await updateOrderStatus(dlvrReq, dlvrRes);
  assert("10 — Status = DELIVERING", dlvrRes.data?.order?.status === "DELIVERING");

  // ── STEP 11: DELIVERED ─────────────────────────────────────────────────────
  console.log("\nSTEP 11: → DELIVERED");
  const dvdReq = {
    user: { id: buyer._id.toString(), email: buyer.email, roles: [] },
    params: { code: updatedOrder!.orderCode },
    body: { status: "DELIVERED" },
  } as unknown as Request;
  const dvdRes = mockRes();
  await updateOrderStatus(dvdReq, dvdRes);
  assert("11 — Status = DELIVERED", dvdRes.data?.order?.status === "DELIVERED");

  // ── STEP 12: COMPLETED ─────────────────────────────────────────────────────
  console.log("\nSTEP 12: Buyer xác nhận → COMPLETED");
  const compReq = {
    user: { id: buyer._id.toString(), email: buyer.email, roles: [] },
    params: { code: updatedOrder!.orderCode },
    body: { status: "COMPLETED" },
  } as unknown as Request;
  const compRes = mockRes();
  await updateOrderStatus(compReq, compRes);
  assert("12 — Status = COMPLETED", compRes.data?.order?.status === "COMPLETED");

  // ── STEP 13: Buyer reviews ─────────────────────────────────────────────────
  console.log("\nSTEP 13: Buyer đánh giá sản phẩm");
  const revReq = {
    user: { id: buyer._id.toString() },
    params: { productId: product._id },
    body: { orderId: order._id, rating: 5, comment: "Rất hài lòng!" },
  } as unknown as Request;
  const revRes = mockRes();
  await createReview(revReq, revRes);
  assert("13 — Review tạo thành công → 201", revRes.statusCode === 201);

  // ── STEP 14: Archive test ──────────────────────────────────────────────────
  console.log("\nSTEP 14: Seller archive sản phẩm (sold → bị chặn)");
  // Product was sold during order, so archive should fail
  const soldProduct = await Product.findById(product._id).lean();
  const archReq = {
    user: { id: seller._id.toString() },
    params: { id: product._id },
    body: {},
  } as unknown as Request;
  const archRes = mockRes();
  await archiveProduct(archReq, archRes);
  if (soldProduct!.status === "sold") {
    assert("14 — Không archive được sản phẩm đã bán", archRes.statusCode === 400);
  } else {
    assert("14 — Archive thành công (status was " + soldProduct!.status + ")", archRes.statusCode === 200);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(50)}`);
  console.log(`TỔNG KẾT: ${passed} passed, ${failed} failed`);
  console.log(`${"═".repeat(50)}`);

  if (failed === 0) {
    console.log("\n🎉 SELLER MVP — DEFINITION OF DONE: PASSED");
    console.log("Seller đăng nhập → đăng SP → Buyer mua → Seller thấy Order");
    console.log("→ xác nhận → đóng gói → bàn giao → Buyer nhận → COMPLETED → Review");
  }

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => { console.error("Fatal:", err); process.exit(1); });
