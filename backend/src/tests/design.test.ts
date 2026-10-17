// ── Unit tests cho Design model + composePrompt ──────────────────────────────
// Pure tests, không cần DB. Sau refactor: Design gộp TreeDesign + AIDesign.

import { Types } from "mongoose";
import { Design, type IDesign } from "../models/Design";
import { composePrompt } from "../services/ai/googleImageService";

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

async function runTests() {
  console.log("── Test 1: Design model defaults ──");
  const dummyProductId = new Types.ObjectId();
  const doc = new Design({
    baseTreeProductId: dummyProductId,
    name: "Test Design",
    slug: "test-design",
  });

  assert(doc.status === "DRAFT", "Initial status defaults to DRAFT");
  assert(doc.deliveryOption === "READY_TO_DISPLAY", "Default deliveryOption is READY_TO_DISPLAY");
  assert(doc.isPublic === true, "Default isPublic = true");
  assert(doc.duplicatedFrom === null, "duplicatedFrom defaults to null");
  assert(doc.prompt === "", "Default prompt is empty string");
  assert(doc.imageUrl === "", "Default imageUrl is empty string");
  assert(doc.lastError === null, "Default lastError is null");
  assert(doc.year > 2025, `year is current year (got ${doc.year})`);

  console.log("\n── Test 2: Status enum ──");
  const validStatuses = ["DRAFT", "AI_PENDING", "AI_COMPLETED", "CONFIRMED", "FAILED"];
  for (const s of validStatuses) {
    doc.status = s as any;
    assert(doc.status === s, `Can set status=${s}`);
  }

  console.log("\n── Test 3: PricingSnapshot shape ──");
  doc.pricingSnapshot = {
    treePrice: 499_000,
    decorationFee: 0,
    shippingFee: 20_000,
    totalSalePrice: 519_000,
  };
  assert(doc.pricingSnapshot.treePrice === 499_000, "treePrice cached");
  assert(doc.pricingSnapshot.totalSalePrice === 519_000, "totalSalePrice cached");

  console.log("\n── Test 4: composePrompt() ──");
  const mockProduct = {
    name: "Yêu Thương",
    slug: "yeu-thuong",
    category: "TREE",
    density: "standard",
    description: "Cây tùng Noel với nơ nhung đỏ và bông tuyết trắng.",
    coverImage: "https://res.cloudinary.com/demo/tree.jpg",
    images: [],
    isActive: true,
    sortOrder: 0,
  } as any;

  const composed = composePrompt({
    treeProduct: mockProduct,
    customerPrompt: "Ấm cúng cho phòng khách",
  });
  assert(typeof composed.promptText === "string", "promptText is string");
  assert(composed.promptText.length > 100, "promptText có độ dài hợp lý");
  assert(composed.promptText.includes("Yêu Thương"), "prompt chứa tên concept");
  assert(composed.promptText.includes("Ấm cúng cho phòng khách"), "prompt chứa customer request");
  assert(composed.promptText.includes("Cây tùng Noel"), "prompt chứa description");
  assert(Array.isArray(composed.imageInput), "imageInput là mảng");
  assert(composed.imageInput.length === 1, "imageInput có 1 ảnh (coverImage)");
  assert(composed.imageInput[0] === "https://res.cloudinary.com/demo/tree.jpg", "imageInput[0] = coverImage");

  console.log("\n── Test 5: composePrompt() không có customerPrompt ──");
  const composed2 = composePrompt({ treeProduct: mockProduct });
  assert(composed2.promptText.includes("No additional request"), "có placeholder khi không có prompt");
  assert(composed2.imageInput.length === 1, "vẫn giữ imageInput");

  console.log("\n── Test 6: composePrompt() không có coverImage ──");
  const noImage = composePrompt({
    treeProduct: { ...mockProduct, coverImage: "" } as any,
  });
  assert(noImage.imageInput.length === 0, "imageInput rỗng khi không có coverImage");

  console.log(`\n========================================`);
  console.log(`Design Test Summary: ${passed} passed, ${failed} failed.`);
  console.log(`========================================`);

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
