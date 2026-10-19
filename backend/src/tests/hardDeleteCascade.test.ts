// ── Integration tests cho 3-tier CRUD hard-delete cascade ─────────────────────
// Sau khi chuyển từ soft-delete sang hard-delete:
//   - deleteTreeProduct: cascade xóa Code + Variant + CartItem trỏ tới variant
//   - deleteTreeCode: cascade xóa Variant + CartItem trỏ tới variant
//   - deleteTreeVariant: xóa variant + CartItem trỏ tới nó
//
// Safety: không cho xóa nếu có Review (lịch sử) hoặc Design (room AI) tham chiếu.

import mongoose from "mongoose";
import { Types } from "mongoose";
import { TreeProduct, TreeCode, Tree, Review, Design, CartItem, User, Order } from "../models";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`PASS: ${msg}`);
    passed++;
  } else {
    console.error(`FAIL: ${msg}`);
    failed++;
  }
}

async function connectTestDb() {
  const uri = process.env.MONGO_URI_TEST || process.env.MONGO_URI;
  if (!uri) {
    console.log(
      "SKIP: MONGO_URI / MONGO_URI_TEST not set — hard-delete test cần DB thật. " +
        "Set biến môi trường rồi chạy lại để verify cascade."
    );
    return false;
  }
  await mongoose.connect(uri);
  return true;
}

async function disconnectTestDb() {
  await mongoose.disconnect();
}

// Tạo 1 chain: Product → Code → Variant. Trả 3 ObjectId.
async function createChain() {
  const product = await TreeProduct.create({
    name: "Test Tree Product " + Date.now(),
    slug: "test-tree-" + Date.now(),
    category: "Cây thông Noel",
    density: "standard",
    description: "test",
    coverImage: "",
    images: [],
    isActive: true,
    sortOrder: 0,
  });
  const code = await TreeCode.create({
    productId: product._id,
    code: "TEST-" + Date.now(),
    name: "Test Code",
    description: "",
    image: "",
    material: "",
    isActive: true,
    sortOrder: 0,
  });
  const variant = await Tree.create({
    productId: product._id,
    codeId: code._id,
    size: "M",
    sku: "TEST-SKU-" + Date.now(),
    name: `${product.name} — ${code.name} — M`,
    heightCmMin: 0,
    heightCmMax: 100,
    diameterCm: 30,
    description: "",
    bareImage: "",
    images: [],
    price: 100000,
    stockQuantity: 10,
    isActive: true,
    sortOrder: 0,
  });
  return { product, code, variant };
}

async function createUser() {
  return await User.create({
    email: `test-${Date.now()}@example.com`,
    passwordHash: "$2b$10$dummyhashfor.test.only.does.not.allow.login.000000",
    name: "Test User",
    role: "admin",
    isActive: true,
  });
}

async function createReviewForProduct(userId: string, productId: Types.ObjectId) {
  // Tạo order tối thiểu để vượt qua validation khi insert
  const order = await Order.create({
    orderCode: "TEST-ORD-" + Date.now(),
    buyerId: new Types.ObjectId(userId),
    items: [
      {
        variant: {
          _id: new Types.ObjectId().toString(),
          productId: productId.toString(),
          codeId: new Types.ObjectId().toString(),
          size: "M",
          name: "Test Item",
          unitPrice: 100000,
          price: 100000,
          sku: "TEST-SKU",
          bareImage: "",
        },
        deliveryOption: "READY_TO_DISPLAY",
        unitTotal: 100000,
        quantity: 1,
        lineTotal: 100000,
        productionDays: 1,
      },
    ],
    subtotal: 100000,
    shippingFee: 30000,
    decorationFee: 0,
    discountAmount: 0,
    totalAmount: 130000,
    status: "DELIVERED",
    statusHistory: [],
    paymentMethod: "TEST",
    paymentId: "",
    paidAt: new Date(),
    shippingName: "Test",
    shippingPhone: "0123456789",
    shippingAddress: "Test",
    trackingNumber: "",
    shippingProvider: "",
    trackingUrl: "",
    shippingEvents: [],
    idempotencyKey: "test-" + Date.now(),
  });
  return await Review.create({
    productId,
    variantId: null,
    buyerId: new Types.ObjectId(userId),
    orderId: order._id,
    rating: 5,
    comment: "Test review",
    images: [],
    status: "APPROVED",
  });
}

async function runTests() {
  console.log("── Hard-delete cascade integration tests ──");
  const connected = await connectTestDb();
  if (!connected) {
    console.log(`\n========================================`);
    console.log(`Hard-delete Test Summary: 0 passed, 0 failed (skipped — no DB).`);
    console.log(`========================================`);
    process.exit(0);
    return;
  }

  // ── Test 1: deleteTreeProduct cascade xóa Code + Variant + CartItem ──────
  console.log("\n── Test 1: Cascade delete Product → Code → Variant + CartItem ──");
  {
    const chain = await createChain();
    await CartItem.create({
      cartId: new Types.ObjectId(),
      config: { variantId: chain.variant._id, deliveryOption: "READY_TO_DISPLAY" },
      quantity: 1,
      priceSnapshot: 100000,
      checked: true,
    });
    const { deleteTreeProduct } = await import("../controllers/admin/treeProducts");

    const fakeRes = {
      statusCode: 0,
      body: null as unknown,
      status(c: number) {
        this.statusCode = c;
        return this;
      },
      json(b: unknown) {
        this.body = b;
        return this;
      },
    };
    await deleteTreeProduct(
      { params: { productId: chain.product._id.toString() } } as any,
      fakeRes as any,
      () => {}
    );

    assert(fakeRes.statusCode === 200, "deleteTreeProduct returned 200");
    const p = await TreeProduct.findById(chain.product._id);
    const c = await TreeCode.findById(chain.code._id);
    const v = await Tree.findById(chain.variant._id);
    const ci = await CartItem.findOne({ "config.variantId": chain.variant._id });
    assert(!p, "TreeProduct bị xóa");
    assert(!c, "TreeCode bị xóa cascade");
    assert(!v, "Tree variant bị xóa cascade");
    assert(!ci, "CartItem trỏ tới variant bị xóa cascade");
  }

  // ── Test 2: deleteTreeProduct BỊ CHẶN khi còn Review ────────────────────
  console.log("\n── Test 2: deleteTreeProduct blocked by existing Review ──");
  {
    const chain = await createChain();
    const user = await createUser();
    await createReviewForProduct(String(user._id), chain.product._id);
    const { deleteTreeProduct } = await import("../controllers/admin/treeProducts");

    const fakeRes = {
      statusCode: 0,
      body: null as unknown,
      status(c: number) {
        this.statusCode = c;
        return this;
      },
      json(b: unknown) {
        this.body = b;
        return this;
      },
    };
    await deleteTreeProduct(
      { params: { productId: chain.product._id.toString() } } as any,
      fakeRes as any,
      () => {}
    );

    assert(fakeRes.statusCode === 409, "Returned 409 Conflict khi có Review");
    const p = await TreeProduct.findById(chain.product._id);
    assert(p !== null, "Product KHÔNG bị xóa (safety check hoạt động)");
  }

  // ── Test 3: deleteTreeCode cascade xóa Variant ───────────────────────────
  console.log("\n── Test 3: Cascade delete Code → Variant ──");
  {
    const chain = await createChain();
    const { deleteTreeCode } = await import("../controllers/admin/treeCodes");
    const fakeRes = {
      statusCode: 0,
      body: null as unknown,
      status(c: number) {
        this.statusCode = c;
        return this;
      },
      json(b: unknown) {
        this.body = b;
        return this;
      },
    };
    await deleteTreeCode(
      { params: { codeId: chain.code._id.toString() } } as any,
      fakeRes as any,
      () => {}
    );

    assert(fakeRes.statusCode === 200, "deleteTreeCode returned 200");
    const c = await TreeCode.findById(chain.code._id);
    const v = await Tree.findById(chain.variant._id);
    assert(!c, "TreeCode bị xóa");
    assert(!v, "Tree variant bị xóa cascade");
    // Product CHA vẫn còn — chỉ xóa khi user yêu cầu xóa product
    const p = await TreeProduct.findById(chain.product._id);
    assert(p !== null, "Product CHA vẫn còn (không bị xóa nhầm)");
  }

  // ── Test 4: deleteTreeVariant BỊ CHẶN khi còn Design ────────────────────
  console.log("\n── Test 4: deleteTreeVariant blocked by existing Design ──");
  {
    const chain = await createChain();
    await Design.create({
      ownerId: null,
      name: "Test Design",
      treeVariantId: chain.variant._id,
      prompt: "",
      roomImageUrl: "",
      roomImagePublicId: "",
      resultImageUrl: "",
      resultImagePublicId: "",
      status: "DRAFT",
      lastError: null,
      deliveryOption: "READY_TO_DISPLAY",
    });
    const { deleteTreeVariant } = await import("../controllers/admin/treeVariants");

    const fakeRes = {
      statusCode: 0,
      body: null as unknown,
      status(c: number) {
        this.statusCode = c;
        return this;
      },
      json(b: unknown) {
        this.body = b;
        return this;
      },
    };
    await deleteTreeVariant(
      { params: { variantId: chain.variant._id.toString() } } as any,
      fakeRes as any,
      () => {}
    );

    assert(fakeRes.statusCode === 409, "Returned 409 Conflict khi có Design");
    const v = await Tree.findById(chain.variant._id);
    assert(v !== null, "Variant KHÔNG bị xóa (safety check hoạt động)");
  }

  // ── Test 5: deleteTreeVariant thành công + dọn CartItem ──────────────────
  console.log("\n── Test 5: deleteTreeVariant succeeds + cleans CartItem ──");
  {
    const chain = await createChain();
    await CartItem.create({
      cartId: new Types.ObjectId(),
      config: { variantId: chain.variant._id, deliveryOption: "DIY_KIT" },
      quantity: 2,
      priceSnapshot: 200000,
      checked: true,
    });
    const { deleteTreeVariant } = await import("../controllers/admin/treeVariants");
    const fakeRes = {
      statusCode: 0,
      body: null as unknown,
      status(c: number) {
        this.statusCode = c;
        return this;
      },
      json(b: unknown) {
        this.body = b;
        return this;
      },
    };
    await deleteTreeVariant(
      { params: { variantId: chain.variant._id.toString() } } as any,
      fakeRes as any,
      () => {}
    );

    assert(fakeRes.statusCode === 200, "deleteTreeVariant returned 200");
    const v = await Tree.findById(chain.variant._id);
    const ci = await CartItem.findOne({ "config.variantId": chain.variant._id });
    assert(!v, "Variant bị xóa");
    assert(!ci, "CartItem trỏ tới variant bị xóa");
    // Code và Product CHA vẫn còn
    const c = await TreeCode.findById(chain.code._id);
    const p = await TreeProduct.findById(chain.product._id);
    assert(c !== null, "TreeCode CHA vẫn còn");
    assert(p !== null, "TreeProduct CHA vẫn còn");
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────
  await Review.deleteMany({ comment: "Test review" });
  await Design.deleteMany({ name: "Test Design" });
  await TreeProduct.deleteMany({ name: /^Test Tree Product/ });
  await TreeCode.deleteMany({ code: /^TEST-/ });
  await Tree.deleteMany({ sku: /^TEST-SKU-/ });
  await User.deleteMany({ email: /^test-.*@example\.com$/ });
  await Order.deleteMany({ orderCode: /^TEST-ORD-/ });

  await disconnectTestDb();

  console.log(`\n========================================`);
  console.log(`Hard-delete Test Summary: ${passed} passed, ${failed} failed.`);
  console.log(`========================================`);

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
