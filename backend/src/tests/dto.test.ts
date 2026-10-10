// ── Test for dto mappers (pure, no DB) ──────────────────────────────────────
// Run with: npx ts-node --transpile-only src/tests/dto.test.ts

import { orderToDto } from "../dto/order";
import { cartItemToDto, cartToDto } from "../dto/cart";
import { userToDto } from "../dto/user";
import { Types } from "mongoose";

let passed = 0;
let failed = 0;

function assert(cond: boolean, message: string) {
  if (cond) {
    passed++;
    console.log(`✅ PASS: ${message}`);
  } else {
    failed++;
    console.error(`❌ FAIL: ${message}`);
  }
}

function run() {
  console.log("\n── Test 1: orderToDto flattens everything ──\n");
  const oid = new Types.ObjectId();
  const order = {
    _id: oid,
    orderCode: "BYC-12345678",
    buyerId: oid,
    items: [
      {
        designId: oid,
        designName: "My Design",
        previewImage: "",
        variant: { _id: "v1", size: "M" },
        style: { _id: "s1", code: "GREEN" },
        lines: [
          { kind: "ACCESSORY", refId: oid, type: "BALL", name: "Red ball", unitPrice: 1000, quantity: 2, lineTotal: 2000 },
        ],
        deliveryOption: "DIY_KIT",
        unitTotal: 5000,
        quantity: 1,
        lineTotal: 5000,
        hasPersonalization: false,
        productionDays: 0,
      },
    ],
    subtotal: 5000,
    shippingFee: 30_000,
    decorationFee: 0,
    discount: 0,
    discountAmount: 0,
    totalAmount: 35_000,
    internalNotes: "",
    status: "PENDING_PAYMENT",
    statusHistory: [
      { status: "PENDING_PAYMENT", by: "system", at: new Date("2026-01-01"), reason: "new" },
    ],
    paymentMethod: "COD",
    paymentId: "",
    paidAt: null,
    designConfirmedAt: null,
    designLockedAt: null,
    shippingName: "Test User",
    shippingPhone: "0901",
    shippingAddress: "1 đường 1",
    shippingProvinceId: "79",
    shippingProvinceName: "HCM",
    shippingCommuneId: "",
    shippingCommuneName: "",
    addressEffectiveDate: "latest",
    trackingNumber: "",
    shippingProvider: "",
    trackingUrl: "",
    pickupInfo: null,
    shippedAt: null,
    estimatedDeliveryAt: null,
    deliveredAt: null,
    cancelReason: "",
    cancelRequestedAt: null,
    idempotencyKey: "abc",
    createdAt: new Date("2026-01-01"),
  };
  const dto = orderToDto(order);
  assert(dto._id === oid.toString(), "_id stringified");
  assert(dto.orderCode === "BYC-12345678", "orderCode preserved");
  assert(dto.buyerId === oid.toString(), "buyerId stringified");
  assert(dto.items.length === 1, "1 item");
  assert(dto.items[0].lines[0].refId === oid.toString(), "line refId stringified");
  assert(dto.status === "PENDING_PAYMENT", "status preserved");
  assert(typeof dto.createdAt === "string", "createdAt is ISO string");
  assert(dto.discountAmount === 0, "discountAmount is 0");
  assert(dto.totalAmount === 35_000, "totalAmount preserved");

  console.log("\n── Test 2: orderToDto falls back when discountAmount missing ──\n");
  const noAmount = orderToDto({ ...order, discountAmount: undefined, discount: 1500 });
  assert(noAmount.discount === 1500, "discount falls back to discount field");
  assert(noAmount.discountAmount === 1500, "discountAmount falls back to discount field");

  console.log("\n── Test 3: cartItemToDto shape ──\n");
  const item = {
    _id: oid,
    cartId: oid,
    designId: null,
    quantity: 2,
    priceSnapshot: 5000,
    checked: true,
    config: { variantId: oid, styleId: oid, accessories: [], deliveryOption: "DIY_KIT" },
  };
  const itemDto = cartItemToDto(item, { unitTotal: 5500 } as any, null);
  assert(itemDto._id === oid.toString(), "item _id stringified");
  assert(itemDto.priceChanged === true, "price changed when snapshot != current");
  assert(itemDto.currentUnitTotal === 5500, "current unit total from pricing");
  assert(itemDto.warning === undefined, "no warning when pricing succeeded");

  const stale = cartItemToDto(item, null, null);
  assert(stale.warning !== undefined, "warning set when pricing is null");
  assert(stale.currentUnitTotal === null, "currentUnitTotal is null when stale");

  console.log("\n── Test 4: cartToDto shape ──\n");
  const cartDto = cartToDto({ _id: oid, sessionId: "guest123" });
  assert(cartDto._id === oid.toString(), "cart _id stringified");
  assert(cartDto.sessionId === "guest123", "sessionId preserved");
  const noSess = cartToDto({ _id: oid });
  assert(noSess.sessionId === undefined, "missing sessionId is undefined");

  console.log("\n── Test 5: userToDto shape ──\n");
  const userDto = userToDto({
    _id: oid,
    name: "Minh",
    email: "minh@test.com",
    phone: "0901",
    roles: ["buyer"],
    avatarUrl: "https://x.com/a.jpg",
    accountStatus: "active",
    accountStatusReason: "",
    addresses: [],
    createdAt: new Date("2026-01-01"),
  });
  assert(userDto._id === oid.toString(), "user _id stringified");
  assert(userDto.name === "Minh", "name preserved");
  assert(userDto.roles[0] === "buyer", "roles preserved");
  assert(typeof userDto.createdAt === "string", "createdAt ISO string");
  assert(userDto.phone === "0901", "phone preserved");

  const minimal = userToDto({
    _id: oid,
    name: "No phone",
    email: "x@y.com",
    roles: ["buyer"],
    accountStatus: "active",
  });
  assert(minimal.phone === "", "missing phone is empty string");
  assert(minimal.avatarUrl === "", "missing avatar is empty string");
  assert(minimal.addresses.length === 0, "missing addresses is empty array");

  console.log(`\n── Results: ${passed} passed, ${failed} failed ──\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
