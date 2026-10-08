// ── Unit tests for authController input validation ───────────────────────────
// Verifies that login/register NEVER return 500 INTERNAL_ERROR for malformed
// input. All tests use inputs that are rejected BEFORE the controller
// touches the DB (so no Mongo connection required).
//
// Scenarios tested (all should resolve to 4xx, never 5xx):
//   - body: null          → 400 INVALID_INPUT (from JSON parser wrapper)
//   - body: "text"        → 400 INVALID_INPUT (from JSON parser wrapper)
//   - body: [1,2,3]       → 400 INVALID_INPUT
//   - body: true          → 400 INVALID_INPUT
//   - email: 12345        → 400 MISSING_FIELD (not a string)
//   - email: ""           → 400 MISSING_FIELD (empty after trim)
//   - email: "no-at-sign" → 400 INVALID_INPUT (email regex fails)
//   - password: 123456    → 400 MISSING_FIELD (number not string)
//   - password: ""        → 400 MISSING_FIELD (empty string)
//   - password: "ab1"     → 400 INVALID_INPUT (too short, register only)
//
// Run with: npm test
// No DB required — all inputs are rejected before DB queries.

import { register, login } from "../controllers/authController";
import { ErrorCode } from "../utils/errors";

type MockRes = {
  status: (code: number) => MockRes;
  json: (data: any) => MockRes;
  statusCode: number;
  body: any;
};

function makeRes(): MockRes {
  const res: any = {
    statusCode: 0,
    body: null,
  };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data: any) => {
    res.body = data;
    return res;
  };
  return res as MockRes;
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) { passed++; console.log(`PASS: ${message}`); }
  else { failed++; console.error(`FAIL: ${message}`); }
}

async function callLogin(body: any) {
  const req: any = { body };
  const res = makeRes();
  await login(req, res as any);
  return { status: res.statusCode, body: res.body };
}

async function callRegister(body: any) {
  const req: any = { body };
  const res = makeRes();
  await register(req, res as any);
  return { status: res.statusCode, body: res.body };
}

// Top-level runner — required because tsconfig has module=commonjs.
(async () => {
  await runTests();
})();

async function runTests() {
// ── Test 1: non-object body ──────────────────────────────────────────────────
console.log("\n── Test 1: non-object body (null, text, array, boolean, number) ──\n");

for (const body of [null, "hello", 12345, true, false, [1, 2, 3]]) {
  const r = await callLogin(body);
  assert(r.status !== 500, `login body=${JSON.stringify(body)} does not return 500 (got ${r.status} ${r.body?.error?.code})`);
  assert(r.status >= 400 && r.status < 500, `login body=${JSON.stringify(body)} returns 4xx (got ${r.status})`);
}

for (const body of [null, "hello", 12345, [1, 2, 3]]) {
  const r = await callRegister(body);
  assert(r.status !== 500, `register body=${JSON.stringify(body)} does not return 500 (got ${r.status} ${r.body?.error?.code})`);
}

// ── Test 2: missing or empty string fields ───────────────────────────────────
console.log("\n── Test 2: missing/empty fields ──\n");

for (const body of [{}, { email: "" }, { password: "" }, { email: "", password: "" }]) {
  const r = await callLogin(body);
  assert(r.status === 400, `login ${JSON.stringify(body)} returns 400 (got ${r.status})`);
  assert(r.body?.error?.code === ErrorCode.MISSING_FIELD, `login missing field returns MISSING_FIELD (got ${r.body?.error?.code})`);
}

for (const body of [{}, { email: "x@x.vn" }, { password: "Test@12345" }, { email: "x@x.vn", password: "" }]) {
  const r = await callRegister(body);
  assert(r.status === 400, `register ${JSON.stringify(body)} returns 400 (got ${r.status})`);
  assert(r.status !== 500, `register ${JSON.stringify(body)} does not return 500`);
}

// ── Test 3: wrong-type field values ──────────────────────────────────────────
console.log("\n── Test 3: wrong-type field values ──\n");

for (const email of [12345, true, false, null, undefined, [1], { a: 1 }]) {
  const r = await callLogin({ email, password: "x" });
  assert(r.status === 400, `login email=${JSON.stringify(email)} returns 400 (got ${r.status})`);
  assert(r.status !== 500, `login email=${JSON.stringify(email)} does not return 500`);
}

for (const password of [12345, true, false, null, undefined, [1], { a: 1 }]) {
  const r = await callLogin({ email: "x@x.vn", password });
  assert(r.status === 400, `login password=${JSON.stringify(password)} returns 400 (got ${r.status})`);
  assert(r.status !== 500, `login password=${JSON.stringify(password)} does not return 500`);
}

// ── Test 4: invalid email format ─────────────────────────────────────────────
console.log("\n── Test 4: invalid email format ──\n");

for (const email of ["no-at-sign", "no-domain@", "@no-local", "spaces in@x.vn", "x@.vn", "x@v."]) {
  const r = await callRegister({ name: "X", email, password: "Test@12345" });
  assert(r.status === 400, `register email=${JSON.stringify(email)} returns 400 (got ${r.status})`);
  assert(r.status !== 500, `register email=${JSON.stringify(email)} does not return 500`);
}

// ── Test 5: register password length validation ─────────────────────────────
console.log("\n── Test 5: register password length validation ──\n");

for (const password of ["", "a", "ab1", "1234567"]) {
  const r = await callRegister({ name: "X", email: "x@x.vn", password });
  assert(r.status === 400, `register password=${JSON.stringify(password)} returns 400 (got ${r.status})`);
  assert(r.status !== 500, `register password=${JSON.stringify(password)} does not return 500`);
}

const tooLong = "a".repeat(129);
const r = await callRegister({ name: "X", email: "x@x.vn", password: tooLong });
assert(r.status === 400, `register password=129 chars returns 400 (got ${r.status})`);
assert(r.status !== 500, `register password=129 chars does not return 500`);

// ── Test 6: regression — original 500 cases now return 4xx ──────────────────
console.log("\n── Test 6: regression — original 500 triggers ──\n");

const cases: Array<[string, "login" | "register", any]> = [
  ["login pw=number", "login", { email: "x@x.vn", password: 123456 }],
  ["login body=null", "login", null],
  ["register pw=number", "register", { name: "X", email: "x@x.vn", password: 123456 }],
  ["register name=number", "register", { name: 12345, email: "x@x.vn", password: "Test@12345" }],
  ["register pw=empty", "register", { name: "X", email: "x@x.vn", password: "" }],
];

for (const [name, op, body] of cases) {
  const r = op === "login" ? await callLogin(body) : await callRegister(body);
  assert(r.status !== 500, `${name} does NOT return 500 (got ${r.status} ${r.body?.error?.code})`);
}

// ── Test 7: summary ──────────────────────────────────────────────────────────
console.log(`\n========================================`);
console.log(`Test Summary: ${passed} passed, ${failed} failed.`);
console.log(`========================================`);
if (failed > 0) process.exit(1);
}  // end runTests
