// ── Test for orderService helpers (pure) ────────────────────────────────────
// Run with: npx ts-node --transpile-only src/tests/orderService.test.ts

import { assertDeliveryArea, applyCoupon } from "../services/orderService";
import { SHIPPING_FEE, SERVICE_PROVINCE_ID } from "../config/business";
import type { IOrderItem } from "../models/Order";

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

function makeItem(deliveryOption: IOrderItem["deliveryOption"]): IOrderItem {
  return {
    designId: null,
    designName: "Test",
    previewImage: "",
    variant: {} as any,
    style: {} as any,
    lines: [],
    deliveryOption,
    unitTotal: 100_000,
    quantity: 1,
    lineTotal: 100_000,
    hasPersonalization: false,
    productionDays: 0,
  };
}

async function runTests() {
  console.log("\n── Test 1: assertDeliveryArea — HCM only for READY_TO_DISPLAY ──\n");
  // READY_TO_DISPLAY + HCM → OK
  try {
    assertDeliveryArea([makeItem("READY_TO_DISPLAY")], SERVICE_PROVINCE_ID);
    assert(true, "READY_TO_DISPLAY + HCM (79) is allowed");
  } catch {
    assert(false, "READY_TO_DISPLAY + HCM (79) should be allowed");
  }

  // READY_TO_DISPLAY + other province → throw
  try {
    assertDeliveryArea([makeItem("READY_TO_DISPLAY")], "01");
    assert(false, "READY_TO_DISPLAY + province 01 should throw");
  } catch (err: any) {
    assert(err.code === "READY_TO_DISPLAY_HCM_ONLY", "throws READY_TO_DISPLAY_HCM_ONLY");
    assert(err.httpCode === 400, "throws with httpCode=400");
  }

  // READY_TO_DISPLAY + no province → allowed (no constraint)
  try {
    assertDeliveryArea([makeItem("READY_TO_DISPLAY")], undefined);
    assert(true, "READY_TO_DISPLAY + no province is allowed");
  } catch {
    assert(false, "READY_TO_DISPLAY + no province should be allowed");
  }

  // DIY_KIT + any province → allowed
  try {
    assertDeliveryArea([makeItem("DIY_KIT")], "01");
    assert(true, "DIY_KIT + any province is allowed");
  } catch {
    assert(false, "DIY_KIT + any province should be allowed");
  }

  // SEPARATE + any province → allowed
  try {
    assertDeliveryArea([makeItem("SEPARATE")], "99");
    assert(true, "SEPARATE + any province is allowed");
  } catch {
    assert(false, "SEPARATE + any province should be allowed");
  }

  // Mixed items: any READY_TO_DISPLAY in HCM is OK
  try {
    assertDeliveryArea(
      [makeItem("DIY_KIT"), makeItem("READY_TO_DISPLAY")],
      SERVICE_PROVINCE_ID
    );
    assert(true, "mixed items + HCM is allowed");
  } catch {
    assert(false, "mixed items + HCM should be allowed");
  }

  // Mixed items with READY_TO_DISPLAY outside HCM → reject
  try {
    assertDeliveryArea(
      [makeItem("DIY_KIT"), makeItem("READY_TO_DISPLAY")],
      "01"
    );
    assert(false, "mixed items with READY_TO_DISPLAY outside HCM should throw");
  } catch (err: any) {
    assert(err.code === "READY_TO_DISPLAY_HCM_ONLY", "mixed-items also throws READY_TO_DISPLAY_HCM_ONLY");
  }

  console.log("\n── Test 2: applyCoupon — graceful degradation ──\n");
  // Empty code → no discount
  const empty = await applyCoupon("", 500_000);
  assert(empty.discount === 0, "empty code → discount 0");
  assert(empty.code === "", "empty code → code ''");

  const undef = await applyCoupon(undefined, 500_000);
  assert(undef.discount === 0, "undefined code → discount 0");

  // Whitespace code → no discount (treated as empty)
  const ws = await applyCoupon("   ", 500_000);
  assert(ws.discount === 0, "whitespace code → discount 0");

  // Nonexistent code → no discount, no throw
  const fake = await applyCoupon("NONEXISTENT-XYZ", 500_000);
  assert(fake.discount === 0, "nonexistent code → discount 0 (no throw)");

  console.log("\n── Test 3: SHIPPING_FEE sanity ──\n");
  assert(SHIPPING_FEE === 30_000, "shipping fee is 30,000 VND");
  assert(SERVICE_PROVINCE_ID === "79", "HCM province id is 79");

  console.log(`\n── Results: ${passed} passed, ${failed} failed ──\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
