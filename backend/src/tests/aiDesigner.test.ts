// ── Unit tests for AI Designer service & models ──────────────────────────────
import { Types } from "mongoose";
import { AIDesign } from "../models/AIDesign";
import {
  validateAndResolveSelection,
  CatalogValidationError,
} from "../services/ai/aiDesignerService";
import { ErrorCode } from "../utils/errors";

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
  console.log("── Test 1: AIDesign Model Schema defaults ──");
  const dummyVariantId = new Types.ObjectId();
  const doc = new AIDesign({
    variantId: dummyVariantId,
    prompt: "Cây thông Noel ấm cúng",
    preferences: { theme: "Cozy Classic", spaceSize: "M" },
  });

  assert(doc.status === "DRAFT", "Initial status defaults to DRAFT");
  assert(doc.deliveryOption === "DIY_KIT", "Default deliveryOption is DIY_KIT");
  assert(doc.imageUrl === "", "Default imageUrl is empty string");
  assert(doc.convertedToTreeDesignId === null, "convertedToTreeDesignId is null");
  assert(doc.pricingSnapshot.totalSalePrice === 0, "Initial pricing total is 0");

  console.log("\n── Test 2: Validation rejection on invalid variantId ──");
  try {
    await validateAndResolveSelection({
      variantId: "invalid-id",
      accessories: [],
    });
    assert(false, "Should throw for invalid variantId");
  } catch (err: any) {
    assert(err instanceof CatalogValidationError, "Throws CatalogValidationError");
    assert(err.code === ErrorCode.TREE_NOT_FOUND, "Code is TREE_NOT_FOUND");
    assert(err.status === 400, "Status is 400 for bad ObjectId");
  }

  console.log("\n── Test 3: buildTreeImagePrompt generation ──");
  const { buildTreeImagePrompt } = await import(
    "../services/ai/googleImageService"
  );
  const prompt = buildTreeImagePrompt({
    tree: { name: "Cây thông PE Cao Cấp", size: "M" },
    style: { name: "Classic Gold & Red", code: "CLASSIC" },
    accessories: [
      {
        name: "Dây Đèn Led Vàng",
        type: "LIGHT_STRING",
        group: "LIGHTS",
        quantity: 1,
      },
      {
        name: "Bảng Gỗ Khắc Tên",
        type: "NAME_TAG",
        group: "PERSONAL",
        quantity: 1,
        personalizationText: "Gia Đình An",
      },
    ],
    customerPrompt: "Trang trí ấm cúng phong cách gia đình",
  });

  assert(prompt.includes("Cây thông PE Cao Cấp"), "Prompt contains tree name");
  assert(prompt.includes("Size: M"), "Prompt contains tree size");
  assert(prompt.includes("Classic Gold & Red"), "Prompt contains style name");
  assert(prompt.includes("Dây Đèn Led Vàng"), "Prompt contains accessory name");
  assert(
    prompt.includes("Gia Đình An"),
    "Prompt contains personalization text"
  );
  assert(
    prompt.includes("Trang trí ấm cúng phong cách gia đình"),
    "Prompt contains customer prompt notes"
  );

  console.log("\n── Test 4: Pricing snapshot costPrice nullability ──");
  const testDoc = new AIDesign({
    variantId: dummyVariantId,
    pricingSnapshot: {
      treePrice: 500000,
      accessoriesTotal: 200000,
      decorationFee: 0,
      shippingFee: 30000,
      totalSalePrice: 730000,
      totalCostPrice: null,
      expectedGrossProfit: null,
    },
  });

  assert(
    testDoc.pricingSnapshot.totalCostPrice === null,
    "totalCostPrice correctly remains null when cost is missing"
  );
  assert(
    testDoc.pricingSnapshot.expectedGrossProfit === null,
    "expectedGrossProfit correctly remains null when cost is missing"
  );

  console.log(`\n========================================`);
  console.log(`AI Designer Test Summary: ${passed} passed, ${failed} failed.`);
  console.log(`========================================`);

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
