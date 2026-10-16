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

  console.log(`\n========================================`);
  console.log(`AI Designer Test Summary: ${passed} passed, ${failed} failed.`);
  console.log(`========================================`);

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
