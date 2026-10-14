import {
  calcShippingFee,
  calculateShippingQuote,
} from "../services/shippingService";

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ ${name}`);
    failed++;
  }
}

async function run() {
  console.log("\n── Test 1: calcShippingFee tier calculation ──\n");

  const tierBase = calcShippingFee(4);
  assert(tierBase.fee === 20_000, "0-5km is 20,000 VND");
  assert(tierBase.supported === true, "0-5km is supported");

  const tierBase5 = calcShippingFee(5);
  assert(tierBase5.fee === 20_000, "5km exact is 20,000 VND");

  const tier1 = calcShippingFee(10);
  assert(tier1.fee === 40_000, "10km: 20k + 5*4k = 40,000 VND");
  assert(tier1.supported === true, "10km is supported");

  const tier1Max = calcShippingFee(20);
  assert(tier1Max.fee === 80_000, "20km: 20k + 15*4k = 80,000 VND");

  const tier2 = calcShippingFee(30);
  assert(tier2.fee === 145_000, "30km: 100k + 10*4.5k = 145,000 VND");
  assert(tier2.supported === true, "30km is supported");

  const outOfRange = calcShippingFee(65);
  assert(outOfRange.supported === false, "65km is out of supported area (>60km)");
  assert(outOfRange.fee === 0, "out of area fee is 0");

  console.log("\n── Test 2: calculateShippingQuote with explicit distanceKm ──\n");

  const quoteExplicit = await calculateShippingQuote({
    toAddress: "123 Lê Lợi",
    toCommuneName: "Phường Bến Nghé",
    distanceKm: 8,
  });
  assert(quoteExplicit.distanceKm === 8, "Explicit distanceKm is preserved");
  assert(quoteExplicit.fee === 32_000, "8km fee is 20k + 3*4k = 32,000 VND");
  assert(quoteExplicit.supported === true, "quote is supported");
  assert(quoteExplicit.warehouse.name !== "", "warehouse info returned");

  console.log("\n── Test 3: calculateShippingQuote with custom FE warehouse ──\n");

  const quoteCustomWarehouse = await calculateShippingQuote({
    fromAddress: {
      address: "Kho Quận 1",
      communeName: "Phường Bến Thành",
      lat: 10.7721,
      lng: 106.6983,
    },
    toAddress: "Phường Tân Định",
    toCommuneName: "Phường Tân Định",
    lat: 10.7915,
    lng: 106.6908,
  });
  assert(quoteCustomWarehouse.supported === true, "Custom warehouse quote supported");
  assert(quoteCustomWarehouse.distanceKm > 0, "Distance computed > 0");
  assert(quoteCustomWarehouse.fee >= 20_000, "Fee is valid");

  console.log(`\n── Results: ${passed} passed, ${failed} failed ──\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
