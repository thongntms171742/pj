// ── Unit tests for sepayService ──────────────────────────────────────────────
// Run with: npx ts-node --transpile-only src/tests/sepay.test.ts

import {
  extractOrderCode,
  getStandardTransferContent,
  generateVietQrUrl,
  verifySepayWebhookAuth,
} from "../services/sepayService";

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

async function runTests() {
  console.log("\n── Test 1: extractOrderCode — bóc tách mã đơn hàng linh hoạt ──\n");

  assert(
    extractOrderCode("BYC-12345678") === "BYC-12345678",
    "Chuỗi chuẩn 'BYC-12345678' -> 'BYC-12345678'"
  );

  assert(
    extractOrderCode("BYC12345678") === "BYC-12345678",
    "Chuỗi không dấu gạch 'BYC12345678' -> 'BYC-12345678'"
  );

  assert(
    extractOrderCode("BYC 12345678") === "BYC-12345678",
    "Chuỗi có khoảng trắng 'BYC 12345678' -> 'BYC-12345678'"
  );

  assert(
    extractOrderCode("NGUYEN VAN A chuyen tien don BYC 87654321 mua cay thong") === "BYC-87654321",
    "Nằm trong đoạn văn '...don BYC 87654321 mua...' -> 'BYC-87654321'"
  );

  assert(
    extractOrderCode("thanh toan byc-99887766 ngay 24/12") === "BYC-99887766",
    "Chữ thường 'byc-99887766' -> 'BYC-99887766'"
  );

  assert(
    extractOrderCode(undefined, "BYC12345678") === "BYC-12345678",
    "Trích xuất từ field code 'BYC12345678' -> 'BYC-12345678'"
  );

  assert(
    extractOrderCode("Chuyen tien mua hang khong co ma", null) === null,
    "Nội dung không có mã BYC -> null"
  );

  assert(
    extractOrderCode(null, null) === null,
    "Null / undefined -> null"
  );

  console.log("\n── Test 2: getStandardTransferContent ──\n");

  assert(
    getStandardTransferContent("BYC-12345678") === "BYC 12345678",
    "BYC-12345678 -> 'BYC 12345678'"
  );

  assert(
    getStandardTransferContent("BYC12345678") === "BYC 12345678",
    "BYC12345678 -> 'BYC 12345678'"
  );

  console.log("\n── Test 3: generateVietQrUrl — sinh URL SePay VietQR (vietqr.app) ──\n");

  const qrUrl = generateVietQrUrl({
    accountNumber: "VQRQAMTPI1482",
    bankName: "MBBank",
    amount: 1500000,
    description: "BYC12345678",
    template: "compact",
    holder: "NGUYEN TANG MINH THONG",
    store: "RUNG TRONG PHO",
  });

  const parsedUrl = new URL(qrUrl);
  assert(parsedUrl.origin === "https://vietqr.app", "Origin là https://vietqr.app");
  assert(parsedUrl.pathname === "/img", "Pathname là /img");
  assert(parsedUrl.searchParams.get("acc") === "VQRQAMTPI1482", "Query param acc = VQRQAMTPI1482");
  assert(parsedUrl.searchParams.get("bank") === "MBBank", "Query param bank = MBBank");
  assert(parsedUrl.searchParams.get("amount") === "1500000", "Query param amount = 1500000");
  assert(parsedUrl.searchParams.get("des") === "BYC12345678", "Query param des = BYC12345678");
  assert(parsedUrl.searchParams.get("template") === "compact", "Query param template = compact");
  assert(parsedUrl.searchParams.get("showinfo") === "true", "Query param showinfo = true");
  assert(parsedUrl.searchParams.get("fullacc") === "true", "Query param fullacc = true");
  assert(parsedUrl.searchParams.get("holder") === "NGUYEN TANG MINH THONG", "Query param holder");
  assert(parsedUrl.searchParams.get("store") === "RUNG TRONG PHO", "Query param store");

  console.log("\n── Test 4: verifySepayWebhookAuth ──\n");

  // Thiết lập biến môi trường test
  process.env.SEPAY_API_KEY = "test_secret_key_123";

  assert(
    verifySepayWebhookAuth("Apikey test_secret_key_123") === true,
    "Header 'Apikey test_secret_key_123' -> hợp lệ"
  );

  assert(
    verifySepayWebhookAuth("Bearer test_secret_key_123") === true,
    "Header 'Bearer test_secret_key_123' -> hợp lệ"
  );

  assert(
    verifySepayWebhookAuth("test_secret_key_123") === true,
    "Header trực tiếp 'test_secret_key_123' -> hợp lệ"
  );

  assert(
    verifySepayWebhookAuth("Apikey sai_key") === false,
    "Header sai key -> không hợp lệ"
  );

  assert(
    verifySepayWebhookAuth(undefined) === false,
    "Không có header -> không hợp lệ"
  );

  console.log(`\n── Kết quả: ${passed} passed, ${failed} failed ──\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
