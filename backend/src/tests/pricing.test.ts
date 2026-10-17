// ── Pure pricing tests (no DB) — sau refactor: chỉ test tree + shipping ──

import {
  priceDesign,
  type CatalogSnapshot,
  type TreeLean,
} from "../services/pricingService";
import type { PricingInput } from "../services/pricingService";
import { ErrorCode } from "../utils/errors";
import { DesignValidationError } from "../services/pricingService";

const TREE_M = "tree-m";
const VARIANT_ID = "6acce8f40f4d29c2b79eba05";

function tree(overrides: Partial<TreeLean> = {}): TreeLean {
  return {
    _id: TREE_M,
    productId: "p-1",
    codeId: "c-1",
    size: "M",
    name: "Cây Yêu Thương M",
    price: 499_000,
    stockQuantity: 100,
    isActive: true,
    ...overrides,
  };
}

function buildCatalog(o: { tree?: TreeLean } = {}): CatalogSnapshot {
  return { tree: o.tree ?? tree() };
}

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`PASS: ${msg}`);
  } else {
    failed++;
    console.error(`FAIL: ${msg}`);
  }
}

console.log("\n── Pricing: chỉ tree + shipping (không còn accessories) ──\n");

// 1. Basic pricing
{
  const catalog = buildCatalog();
  const input: PricingInput = { variantId: TREE_M, deliveryOption: "DIY_KIT" };
  const result = priceDesign(input, catalog);
  assert(result.tree.unitPrice === 499_000, "Tree price = 499k");
  assert(result.shippingFee === 20_000, "Shipping fee = 20k");
  assert(result.unitTotal === 519_000, "unitTotal = treePrice + shippingFee (519k)");
  assert(result.decorationFee === 0, "Decoration fee = 0");
  assert(result.productionDays === 0, "Production days = 0");
  assert(result.hasPersonalization === false, "hasPersonalization = false");
}

// 2. READY_TO_DISPLAY
{
  const catalog = buildCatalog();
  const result = priceDesign({ variantId: TREE_M, deliveryOption: "READY_TO_DISPLAY" }, catalog);
  assert(result.unitTotal === 519_000, "READY_TO_DISPLAY cùng giá với DIY_KIT");
}

// 3. SEPARATE
{
  const catalog = buildCatalog();
  const result = priceDesign({ variantId: TREE_M, deliveryOption: "SEPARATE" }, catalog);
  assert(result.unitTotal === 519_000, "SEPARATE cùng giá");
}

console.log("\n── Validation failures ──\n");

// Inactive tree
{
  const catalog = buildCatalog({ tree: tree({ isActive: false }) });
  try {
    priceDesign({ variantId: TREE_M, deliveryOption: "DIY_KIT" }, catalog);
    assert(false, "Should throw for inactive tree");
  } catch (err) {
    assert(
      err instanceof DesignValidationError && err.code === ErrorCode.CATALOG_ITEM_UNAVAILABLE,
      "Throws CATALOG_ITEM_UNAVAILABLE"
    );
  }
}

// Invalid deliveryOption
{
  const catalog = buildCatalog();
  try {
    priceDesign({ variantId: TREE_M, deliveryOption: "EXPRESS" as any }, catalog);
    assert(false, "Should throw for invalid deliveryOption");
  } catch (err) {
    assert(
      err instanceof DesignValidationError && err.code === ErrorCode.DELIVERY_OPTION_INVALID,
      "Throws DELIVERY_OPTION_INVALID"
    );
  }
}

console.log(`\n========================================`);
console.log(`Pricing Test Summary: ${passed} passed, ${failed} failed.`);
console.log(`========================================`);
if (failed > 0) process.exit(1);
