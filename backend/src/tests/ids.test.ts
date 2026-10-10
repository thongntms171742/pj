// ── Test for utils/ids ──────────────────────────────────────────────────────
// Run with: npx ts-node --transpile-only src/tests/ids.test.ts

import { toStr, isObjectIdLike, findOrderByIdOrCode, findOrderByIdOrCodeForUser } from "../utils/ids";
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
  console.log("\n── Test 1: toStr handles every shape ──\n");
  assert(toStr(null) === "", "null → empty string");
  assert(toStr(undefined) === "", "undefined → empty string");
  assert(toStr("abc") === "abc", "string passes through");
  assert(toStr(123) === "123", "number is stringified");
  const oid = new Types.ObjectId();
  assert(toStr(oid) === oid.toString(), "ObjectId → its string form");
  // nested
  assert(toStr({ _id: oid }) === oid.toString(), "object with _id unwraps to _id");

  console.log("\n── Test 2: isObjectIdLike ──\n");
  assert(isObjectIdLike("507f1f77bcf86cd799439011"), "24-char hex is valid");
  assert(!isObjectIdLike("BYC-12345678"), "orderCode is not ObjectId-like");
  assert(!isObjectIdLike("507f1f77bcf86cd79943901"), "23-char hex is rejected");
  assert(!isObjectIdLike("507f1f77bcf86cd799439011z"), "non-hex char is rejected");
  assert(!isObjectIdLike(""), "empty string is rejected");
  assert(!isObjectIdLike(null), "null is rejected");

  console.log("\n── Test 3: findOrderByIdOrCode ──\n");
  const oidFilter = findOrderByIdOrCode("507f1f77bcf86cd799439011");
  assert("$or" in oidFilter, "ObjectId-shaped input uses $or");
  const codeFilter = findOrderByIdOrCode("BYC-12345678");
  assert(!("$or" in codeFilter), "non-ObjectId input does not use $or");
  assert("orderCode" in codeFilter, "non-ObjectId input matches by orderCode");

  console.log("\n── Test 4: findOrderByIdOrCodeForUser ──\n");
  const userFilter = findOrderByIdOrCodeForUser(
    "507f1f77bcf86cd799439011",
    "user123"
  );
  assert("$and" in userFilter, "user filter uses $and");
  assert(JSON.stringify(userFilter).includes("buyerId"), "user filter scopes by buyerId");

  const userCodeFilter = findOrderByIdOrCodeForUser("BYC-99", "user123");
  assert(JSON.stringify(userCodeFilter).includes("buyerId"), "user code filter also scopes by buyerId");

  console.log(`\n── Results: ${passed} passed, ${failed} failed ──\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
