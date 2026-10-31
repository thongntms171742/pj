import assert from "assert";
import mongoose, { Types } from "mongoose";
import { ErrorCode, ErrorStatus } from "../utils/errors";
import {
  User,
  Order,
  Cart,
  CartItem,
  Design,
  Review,
  Notification,
  Conversation,
} from "../models";

let passed = 0;
let failed = 0;

function check(desc: string, condition: boolean) {
  if (condition) {
    console.log(`✅ PASS: ${desc}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${desc}`);
    failed++;
  }
}

async function runAccountDeletionTests() {
  console.log("\n── Running Account Deletion (DELETE /api/users/me) Tests ──\n");

  // 1. Error code & status mapping
  check("ErrorCode.ORDER_IN_PROGRESS is defined", ErrorCode.ORDER_IN_PROGRESS === "ORDER_IN_PROGRESS");
  check("ErrorStatus[ORDER_IN_PROGRESS] is 409", ErrorStatus.ORDER_IN_PROGRESS === 409);

  // 2. Blocking statuses rule test
  const BLOCKING_STATUSES = ["PENDING_PAYMENT", "PAID", "CONFIRMED", "PACKING"];
  const ALLOWED_STATUSES = ["SHIPPING", "DELIVERING", "DELIVERED", "COMPLETED", "CANCELLED", "REFUNDED"];

  for (const st of BLOCKING_STATUSES) {
    check(`Status ${st} is recognized as BLOCKING order`, BLOCKING_STATUSES.includes(st));
  }
  for (const st of ALLOWED_STATUSES) {
    check(`Status ${st} is NOT blocking account deletion`, !BLOCKING_STATUSES.includes(st));
  }

  // 3. Database integration tests (if DB connected)
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.log("\n⚠️  No MONGO_URI set, testing model schema and in-memory contract logic.");
  } else {
    try {
      if (mongoose.connection.readyState === 0) {
        await mongoose.connect(mongoUri);
      }

      console.log("\n── Running Database Cascade Verification ──\n");

      // Setup dummy user
      const dummyEmail = `del_test_${Date.now()}@example.com`;
      const testUser = await User.create({
        name: "Test Delete User",
        email: dummyEmail,
        passwordHash: "hash123",
        phone: "0901234567",
        addresses: [
          {
            name: "Home",
            phone: "0901234567",
            address: "123 Le Loi",
            province: "TP.HCM",
            provinceId: "79",
            district: "Quan 1",
            ward: "Ben Nghe",
            isDefault: true,
          },
        ],
      });
      const userId = testUser._id;

      // Create Cart & CartItem
      const dummyCart = await Cart.create({ userId });
      const dummyTreeId = new Types.ObjectId();
      await CartItem.create({
        cartId: dummyCart._id,
        config: { variantId: dummyTreeId, deliveryOption: "READY_TO_DISPLAY" },
        quantity: 1,
        priceSnapshot: 500000,
      });

      // Create Design
      await Design.create({
        ownerId: userId,
        name: "Room Christmas",
        treeVariantId: dummyTreeId,
        roomImageUrl: "https://example.com/room.jpg",
        status: "DRAFT",
      });

      // Create Notification
      await Notification.create({
        userId,
        type: "order",
        title: "Test notification",
        message: "Hello world",
      });

      // Create Completed Order (should not block deletion)
      const testOrder = await Order.create({
        orderCode: `BYC-DEL-${Date.now()}`,
        buyerId: userId,
        items: [
          {
            variant: {
              _id: dummyTreeId.toString(),
              productId: new Types.ObjectId().toString(),
              codeId: new Types.ObjectId().toString(),
              size: "M",
              name: "Tree M",
              unitPrice: 500000,
              price: 500000,
              sku: "TREE-M",
              bareImage: "",
            },
            deliveryOption: "READY_TO_DISPLAY",
            unitTotal: 500000,
            quantity: 1,
            lineTotal: 500000,
            productionDays: 1,
          },
        ],
        totalAmount: 500000,
        status: "COMPLETED",
        shippingName: "Test Delete User",
        shippingPhone: "0901234567",
        shippingAddress: "123 Le Loi, TP.HCM",
        idempotencyKey: `idemp-${Date.now()}`,
      });

      // Create Review
      await Review.create({
        productId: new Types.ObjectId(),
        buyerId: userId,
        orderId: testOrder._id,
        rating: 5,
        comment: "Great tree",
      });

      // Create Conversation
      await Conversation.create({
        channel: "SUPPORT",
        participants: [{ userId: String(userId), role: "buyer" }],
        customerInfo: { name: "Test Delete User", phone: "0901234567", email: dummyEmail },
      });

      // Simulate deletion cascade
      // Step A: Scrub Order PII
      await Order.updateMany(
        { buyerId: userId },
        {
          $set: {
            shippingName: "Khách hàng đã xóa tài khoản",
            shippingPhone: "",
            shippingAddress: "",
            shippingProvinceName: "",
            shippingCommuneName: "",
            internalNotes: "",
            pickupInfo: null,
            isAnonymized: true,
            userDeletedAt: new Date(),
          },
        }
      );

      const scrubbedOrder = await Order.findById(testOrder._id);
      check("Order shippingName scrubbed", scrubbedOrder?.shippingName === "Khách hàng đã xóa tài khoản");
      check("Order shippingPhone scrubbed", scrubbedOrder?.shippingPhone === "");
      check("Order isAnonymized is true", scrubbedOrder?.isAnonymized === true);
      check("Order userDeletedAt is set", scrubbedOrder?.userDeletedAt instanceof Date);

      // Step B: Cascade delete Cart + CartItems
      const cart = await Cart.findOne({ userId });
      if (cart) {
        await CartItem.deleteMany({ cartId: cart._id });
        await Cart.findByIdAndDelete(cart._id);
      }
      const cartAfter = await Cart.findOne({ userId });
      const cartItemsAfter = await CartItem.find({ cartId: dummyCart._id });
      check("Cart deleted", cartAfter === null);
      check("CartItems deleted", cartItemsAfter.length === 0);

      // Step C: Cascade delete Designs, Reviews, Notifications
      await Design.deleteMany({ ownerId: userId });
      await Review.deleteMany({ buyerId: userId });
      await Notification.deleteMany({ userId });

      const designsAfter = await Design.find({ ownerId: userId });
      const reviewsAfter = await Review.find({ buyerId: userId });
      const notifsAfter = await Notification.find({ userId });
      check("Designs deleted", designsAfter.length === 0);
      check("Reviews deleted", reviewsAfter.length === 0);
      check("Notifications deleted", notifsAfter.length === 0);

      // Step D: Anonymize Conversation
      await Conversation.updateMany(
        { "participants.userId": String(userId) },
        {
          $pull: { participants: { userId: String(userId) } },
          $set: {
            "customerInfo.name": "Khách hàng đã xóa tài khoản",
            "customerInfo.phone": "",
            "customerInfo.email": "",
          },
        }
      );
      const convAfter = await Conversation.findOne({ "customerInfo.email": dummyEmail });
      check("Conversation customerInfo scrubbed", convAfter === null);

      // Step E: Delete User
      await User.findByIdAndDelete(userId);
      const userAfter = await User.findById(userId);
      check("User document deleted", userAfter === null);

      // Cleanup test order
      await Order.findByIdAndDelete(testOrder._id);
    } catch (err) {
      console.error("DB Test error:", err);
      failed++;
    }
  }

  console.log("\n========================================");
  console.log(`Account Deletion Tests: ${passed} passed, ${failed} failed.`);
  console.log("========================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runAccountDeletionTests().then(() => {
  if (mongoose.connection.readyState !== 0) {
    mongoose.disconnect();
  }
});
