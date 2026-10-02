// ── Test for CAS Address Proxy & Validation ──────────────────────────────────
// Run with: npx ts-node --transpile-only src/tests/address.test.ts

import {
  isValidEffectiveDate,
  getProvinces,
  getCommunesByProvince,
  clearAddressCache,
} from "../services/addressService";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`✅ PASS: ${message}`);
  } else {
    failed++;
    console.error(`❌ FAIL: ${message}`);
  }
}

async function runTests() {
  console.log("\n── Test 1: effectiveDate validation ──\n");
  assert(isValidEffectiveDate("latest"), "latest is valid");
  assert(isValidEffectiveDate("2025-07-01"), "2025-07-01 is valid");
  assert(!isValidEffectiveDate("invalid-date"), "invalid-date is rejected");
  assert(!isValidEffectiveDate("2025/07/01"), "2025/07/01 with slashes is rejected");
  assert(!isValidEffectiveDate("2025-7-1"), "Non-padded date is rejected");

  console.log("\n── Test 2: Fetch provinces (live CAS API with fallback/timeout) ──\n");
  try {
    clearAddressCache();
    const res1 = await getProvinces("latest");
    assert(Array.isArray(res1.data), "Provinces data is an array");
    assert(res1.data.length > 0, `Provinces count: ${res1.data.length} > 0`);
    assert(typeof res1.data[0].id === "string" && res1.data[0].id.length > 0, `Province has id: "${res1.data[0].id}"`);
    assert(typeof res1.data[0].name === "string" && res1.data[0].name.length > 0, `Province has name: "${res1.data[0].name}"`);
    assert(res1.effectiveDate === "latest", "effectiveDate matches 'latest'");

    // Test caching
    const startCache = Date.now();
    const res2 = await getProvinces("latest");
    const durationCache = Date.now() - startCache;
    assert(res2.data.length === res1.data.length, "Cached provinces count matches");
    assert(durationCache < 50, `Cache response time: ${durationCache}ms (< 50ms)`);
  } catch (err: any) {
    console.error("Fetch provinces test error:", err);
    assert(false, `Fetch provinces failed: ${err.message}`);
  }

  console.log("\n── Test 3: Fetch communes for province 79 (TP.HCM) ──\n");
  try {
    const commRes = await getCommunesByProvince("79", "latest");
    assert(Array.isArray(commRes.data), "Communes data is an array");
    assert(commRes.data.length > 0, `Communes count for province 79: ${commRes.data.length} > 0`);
    assert(typeof commRes.data[0].id === "string", `Commune has id: "${commRes.data[0].id}"`);
    assert(typeof commRes.data[0].name === "string", `Commune has name: "${commRes.data[0].name}"`);
  } catch (err: any) {
    console.error("Fetch communes test error:", err);
    assert(false, `Fetch communes failed: ${err.message}`);
  }

  console.log(`\n========================================`);
  console.log(`Address Test Summary: ${passed} passed, ${failed} failed.`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error("Fatal error running address tests:", e);
  process.exit(1);
});
