// ── Test for Error Code catalog & sendError helper ────────────────────────────
// Verifies that:
//   1. Every error code has a corresponding HTTP status mapping
//   2. sendError produces the exact contract format: { error: { code, message } }
//   3. handleInternalError never leaks internal error messages to the client
//
// Run with: npx ts-node --transpile-only src/tests/errorContract.test.ts
// No DB required — pure unit test.

import { ErrorCode, ErrorStatus, sendError, handleInternalError } from "../utils/errors";

// Mock Express Response
function mockResponse() {
  let statusCode = 0;
  let body: any = {};
  const res: any = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: any) {
      body = data;
      return res;
    },
    get statusCode() { return statusCode; },
    get body() { return body; },
  };
  return res;
}

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

console.log("\n── Test 1: Every ErrorCode has a HTTP status ──\n");

const allCodes = Object.values(ErrorCode);
assert(allCodes.length > 0, `ErrorCode catalog has ${allCodes.length} codes (expected > 0)`);

let missingStatus: string[] = [];
for (const code of allCodes) {
  if (typeof ErrorStatus[code] !== "number") {
    missingStatus.push(code);
  }
}
assert(missingStatus.length === 0, `All ${allCodes.length} ErrorCodes have status mapping${missingStatus.length ? `. Missing: ${missingStatus.join(", ")}` : ""}`);

// ── Test 2: sendError produces the exact contract shape ────────────────────────
console.log("\n── Test 2: sendError contract shape ──\n");

const res1 = mockResponse();
sendError(res1, ErrorCode.PRODUCT_NOT_FOUND, "Không tìm thấy sản phẩm");

assert(res1.statusCode === 404, `Status is 404 (got ${res1.statusCode})`);
assert(res1.body?.error?.code === "PRODUCT_NOT_FOUND", `body.error.code is "PRODUCT_NOT_FOUND" (got ${res1.body?.error?.code})`);
assert(res1.body?.error?.message === "Không tìm thấy sản phẩm", `body.error.message is correct`);
assert(typeof res1.body?.error === "object" && !Array.isArray(res1.body?.error), `body.error is an object`);

// Custom status overrides default
const res2 = mockResponse();
sendError(res2, ErrorCode.INTERNAL_ERROR, "Boom", 500);
assert(res2.statusCode === 500, `Custom status 500 honored (got ${res2.statusCode})`);

// Default status from ErrorStatus is used when no override
const res3 = mockResponse();
sendError(res3, ErrorCode.UNAUTHORIZED, "Login required");
assert(res3.statusCode === 401, `Default status from ErrorStatus map used (got ${res3.statusCode})`);

// ── Test 3: handleInternalError redacts internal message ───────────────────────
console.log("\n── Test 3: handleInternalError redaction ──\n");

// Capture console.error
const originalError = console.error;
const capturedLogs: any[] = [];
console.error = (...args: any[]) => capturedLogs.push(args);

try {
  const res = mockResponse();
  const internalMessage = "DB password leaked: super-secret-password-123";
  const fakeError = new Error(internalMessage);

  handleInternalError(res, fakeError, "[test] context");

  assert(res.statusCode === 500, `Status is 500`);
  assert(res.body?.error?.code === "INTERNAL_ERROR", `Code is INTERNAL_ERROR`);
  assert(res.body?.error?.message === "Lỗi hệ thống", `Message is generic (got "${res.body?.error?.message}")`);
  assert(
    !JSON.stringify(res.body).includes(internalMessage),
    `Internal message NOT leaked to client`
  );
  // capturedLogs items are arrays of args from each console.error call.
  // We need to stringify them safely (Error objects don't JSON.stringify well by default).
  const capturedString = capturedLogs
    .map(args => args.map((a: any) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(" "))
    .join("\n");

  assert(capturedLogs.length > 0, `Error WAS logged server-side (${capturedLogs.length} log entries)`);
  assert(
    capturedString.includes(internalMessage),
    `Internal message IS in server logs for debugging (captured: "${capturedString.slice(0, 100)}")`
  );
} finally {
  console.error = originalError;
}

// ── Test 4: handleInternalError handles non-Error throws ────────────────────────
console.log("\n── Test 4: handleInternalError with non-Error throw ──\n");

const originalError2 = console.error;
console.error = () => {};
try {
  const res = mockResponse();
  handleInternalError(res, "string thrown instead of Error", "[test]");
  assert(res.statusCode === 500, `Status is 500 for non-Error throw`);
  assert(res.body?.error?.code === "INTERNAL_ERROR", `Code is INTERNAL_ERROR for non-Error throw`);
  assert(res.body?.error?.message === "Lỗi hệ thống", `Generic message for non-Error throw`);
} finally {
  console.error = originalError2;
}

// ── Test 5: HTTP status ranges are sane ─────────────────────────────────────────
console.log("\n── Test 5: HTTP status ranges ──\n");

const statusCodes = new Set(Object.values(ErrorStatus));
assert(!statusCodes.has(200), `No 200 (success) codes in error map`);
assert(!statusCodes.has(201), `No 201 (created) codes in error map`);
assert(!statusCodes.has(204), `No 204 (no content) codes in error map`);
assert(statusCodes.has(400), `400 Bad Request is mapped`);
assert(statusCodes.has(401), `401 Unauthorized is mapped`);
assert(statusCodes.has(403), `403 Forbidden is mapped`);
assert(statusCodes.has(404), `404 Not Found is mapped`);
assert(statusCodes.has(500), `500 Internal Server Error is mapped`);

// ── Test 6: Critical codes exist ────────────────────────────────────────────────
console.log("\n── Test 6: Critical ErrorCodes exist ────────────────────────────────────\n");

const mustHaveCodes = [
  "UNAUTHORIZED",
  "TOKEN_INVALID",
  "FORBIDDEN",
  "SELLER_NOT_APPROVED",
  "PRODUCT_NOT_FOUND",
  "ORDER_NOT_FOUND",
  "ORDER_INVALID_TRANSITION",
  "CART_EMPTY",
  "AI_NOT_CONFIGURED",
  "INTERNAL_ERROR",
];

for (const code of mustHaveCodes) {
  assert(
    Object.values(ErrorCode).includes(code as any),
    `ErrorCode.${code} exists`
  );
}

console.log(`\n========================================`);
console.log(`Test Summary: ${passed} passed, ${failed} failed.`);
console.log(`========================================`);
if (failed > 0) process.exit(1);