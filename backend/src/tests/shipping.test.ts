import {
  calcShippingFee,
  calculateShippingQuote,
} from "../services/shippingService";
import { SHIPPING_RATES } from "../config/business";

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
  assert(tierBase.fee === SHIPPING_RATES.BASE_FEE, "0-5km is base fee");
  assert(tierBase.supported === true, "0-5km is supported");

  const tierBase5 = calcShippingFee(5);
  assert(tierBase5.fee === SHIPPING_RATES.BASE_FEE, "5km exact is base fee");

  const tier1 = calcShippingFee(10);
  const expected10 = SHIPPING_RATES.BASE_FEE + 5 * SHIPPING_RATES.TIER1_PER_KM;
  assert(tier1.fee === expected10, `10km fee matches rate formula (${expected10}đ)`);
  assert(tier1.supported === true, "10km is supported");

  const tier1Max = calcShippingFee(20);
  const expected20 = SHIPPING_RATES.BASE_FEE + 15 * SHIPPING_RATES.TIER1_PER_KM;
  assert(tier1Max.fee === expected20, `20km fee matches rate formula (${expected20}đ)`);

  const tier2 = calcShippingFee(30);
  const expected30 = SHIPPING_RATES.TIER2_BASE_FEE + 10 * SHIPPING_RATES.TIER2_PER_KM;
  assert(tier2.fee === expected30, `30km fee matches rate formula (${expected30}đ)`);
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
  const expected8 = SHIPPING_RATES.BASE_FEE + 3 * SHIPPING_RATES.TIER1_PER_KM;
  assert(quoteExplicit.fee === expected8, `8km fee matches rate formula (${expected8}đ)`);
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

  console.log("\n── Test 4: 2-level administrative communes lookup (Nghị quyết 1685) ──\n");

  const qNear = await calculateShippingQuote({ toCommuneId: "26842" }); // Phường Tăng Nhơn Phú
  assert(qNear.distanceKm <= 2, `Tăng Nhơn Phú near warehouse (got ${qNear.distanceKm}km)`);
  assert(qNear.fee === 20_000, `Tăng Nhơn Phú base fee 20,000đ (got ${qNear.fee}đ)`);

  const qThuDuc = await calculateShippingQuote({ toCommuneId: "26824" }); // Phường Thủ Đức
  assert(qThuDuc.distanceKm > 4 && qThuDuc.distanceKm < 8, `Thủ Đức distance ~5-7km (got ${qThuDuc.distanceKm}km)`);

  const qSaiGon = await calculateShippingQuote({ toCommuneId: "26740" }); // Phường Sài Gòn
  assert(qSaiGon.distanceKm > 14 && qSaiGon.distanceKm < 18, `Sài Gòn central distance ~15-18km (got ${qSaiGon.distanceKm}km)`);
  assert(qSaiGon.fee > 60_000, `Sài Gòn fee tier 1 (got ${qSaiGon.fee}đ)`);

  const qBinhTan = await calculateShippingQuote({ toCommuneId: "27442" }); // Phường Bình Tân
  assert(qBinhTan.distanceKm > 24, `Bình Tân distance > 24km (got ${qBinhTan.distanceKm}km)`);
  assert(qBinhTan.fee > 100_000, `Bình Tân fee tier 2 (got ${qBinhTan.fee}đ)`);

  console.log(`\n── Results: ${passed} passed, ${failed} failed ──\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
