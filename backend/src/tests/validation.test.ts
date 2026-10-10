// ── Test for utils/validation ──────────────────────────────────────────────
// Run with: npx ts-node --transpile-only src/tests/validation.test.ts

import { V } from "../utils/validation";
import { sendError, ErrorCode } from "../utils/errors";
import { Types } from "mongoose";

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

function run() {
  console.log("\n── Test 1: V.string ──\n");
  const str = V.string(10);
  assert(str("hello") === "hello", "plain string trims to itself");
  assert(str("  hi  ") === "hi", "trims whitespace");
  assert(str("") === null, "empty string rejected");
  assert(str(123) === null, "number rejected");
  assert(str(null) === null, "null rejected");
  const long = "a".repeat(50);
  assert(str(long) === null, "over max length rejected");
  // maxLen default
  const str50 = V.string(100);
  assert(str50("hi") === "hi", "maxLen override works");

  console.log("\n── Test 2: V.stringOptional ──\n");
  const so = V.stringOptional(10);
  assert(so("hello") === "hello", "string trims and passes");
  assert(so(undefined) === "", "undefined → empty");
  assert(so(null) === "", "null → empty");
  assert(so(123) === null, "non-string rejected");
  assert(so("a".repeat(50)) === "a".repeat(10), "truncates to maxLen");

  console.log("\n── Test 3: V.positiveInt / V.positiveIntStrict ──\n");
  const pi = V.positiveInt();
  assert(pi(0) === 0, "0 is allowed (>= 0)");
  assert(pi(5) === 5, "5 is allowed");
  assert(pi("3") === 3, "numeric string is parsed");
  assert(pi(-1) === null, "negative rejected");
  assert(pi(1.5) === null, "non-integer rejected");
  assert(pi("abc") === null, "non-numeric rejected");

  const ps = V.positiveIntStrict();
  assert(ps(0) === null, "0 rejected for strict (>= 1)");
  assert(ps(1) === 1, "1 allowed");
  assert(ps(-5) === null, "negative rejected");

  console.log("\n── Test 4: V.objectId ──\n");
  const oid = V.objectId();
  assert(oid(new Types.ObjectId().toString()) !== null, "valid ObjectId string accepted");
  assert(oid("not-an-id") === null, "invalid string rejected");
  assert(oid("") === null, "empty rejected");
  assert(oid(123) === null, "number rejected");

  console.log("\n── Test 5: V.boolean ──\n");
  const b = V.boolean();
  assert(b(true) === true, "true preserved");
  assert(b(false) === false, "false preserved");
  assert(b("true") === true, "'true' string parsed");
  assert(b("false") === false, "'false' string parsed");
  assert(b("yes") === null, "ambiguous string rejected");
  assert(b(1) === null, "number rejected");

  console.log("\n── Test 6: V.stringArray ──\n");
  const sa = V.stringArray();
  assert(JSON.stringify(sa(["a", "b"])) === '["a","b"]', "string array passes");
  assert(sa([]) !== null, "empty array passes");
  assert(sa([1, 2]) === null, "non-string items rejected");
  assert(sa("not-array") === null, "non-array rejected");
  assert(sa(null) === null, "null rejected");

  console.log(`\n── Results: ${passed} passed, ${failed} failed ──\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
