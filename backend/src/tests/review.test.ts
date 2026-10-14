// ── Test for Product Review Flow (Unit & Logic validation) ───────────────────
// Run with: npx ts-node --transpile-only src/tests/review.test.ts

import { Types } from "mongoose";
import { ErrorCode, ErrorStatus } from "../utils/errors";
import { submitReview } from "../services/reviewService";

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
  console.log("\n── Test 1: Review Error Codes & Status Mappings ──\n");
  assert(ErrorCode.REVIEW_NOT_FOUND === "REVIEW_NOT_FOUND", "ErrorCode.REVIEW_NOT_FOUND defined");
  assert(ErrorCode.REVIEW_RATING_INVALID === "REVIEW_RATING_INVALID", "ErrorCode.REVIEW_RATING_INVALID defined");
  assert(ErrorCode.REVIEW_NOT_ALLOWED === "REVIEW_NOT_ALLOWED", "ErrorCode.REVIEW_NOT_ALLOWED defined");
  assert(ErrorCode.REVIEW_ALREADY_EXISTS === "REVIEW_ALREADY_EXISTS", "ErrorCode.REVIEW_ALREADY_EXISTS defined");

  assert(ErrorStatus[ErrorCode.REVIEW_NOT_FOUND] === 404, "REVIEW_NOT_FOUND maps to 404");
  assert(ErrorStatus[ErrorCode.REVIEW_RATING_INVALID] === 400, "REVIEW_RATING_INVALID maps to 400");
  assert(ErrorStatus[ErrorCode.REVIEW_NOT_ALLOWED] === 403, "REVIEW_NOT_ALLOWED maps to 403");
  assert(ErrorStatus[ErrorCode.REVIEW_ALREADY_EXISTS] === 409, "REVIEW_ALREADY_EXISTS maps to 409");

  console.log("\n── Test 2: Rating Validation ──\n");
  const dummyBuyer = new Types.ObjectId().toString();
  const dummyProduct = new Types.ObjectId().toString();
  const dummyOrder = new Types.ObjectId().toString();

  // Test rating < 1
  const res1 = await submitReview({
    buyerId: dummyBuyer,
    productId: dummyProduct,
    orderId: dummyOrder,
    rating: 0,
  });
  assert(!res1.success, "Rating 0 should be rejected");
  assert(res1.errorCode === ErrorCode.REVIEW_RATING_INVALID, "Rating 0 gives REVIEW_RATING_INVALID");

  // Test rating > 5
  const res2 = await submitReview({
    buyerId: dummyBuyer,
    productId: dummyProduct,
    orderId: dummyOrder,
    rating: 6,
  });
  assert(!res2.success, "Rating 6 should be rejected");
  assert(res2.errorCode === ErrorCode.REVIEW_RATING_INVALID, "Rating 6 gives REVIEW_RATING_INVALID");

  // Test float rating (e.g. 4.5)
  const res3 = await submitReview({
    buyerId: dummyBuyer,
    productId: dummyProduct,
    orderId: dummyOrder,
    rating: 4.5,
  });
  assert(!res3.success, "Rating 4.5 should be rejected (must be integer 1-5)");
  assert(res3.errorCode === ErrorCode.REVIEW_RATING_INVALID, "Rating 4.5 gives REVIEW_RATING_INVALID");

  // Test invalid product id
  const res4 = await submitReview({
    buyerId: dummyBuyer,
    productId: "not-an-id",
    orderId: dummyOrder,
    rating: 5,
  });
  assert(!res4.success, "Invalid productId format rejected");
  assert(res4.errorCode === ErrorCode.TREE_NOT_FOUND, "Gives TREE_NOT_FOUND");

  console.log("\n── Test 3: Rating Stats & Distribution Math ──\n");
  const sampleRatings = [5, 5, 4, 3, 5, 5, 4];
  const totalReviews = sampleRatings.length;
  const sum = sampleRatings.reduce((a, b) => a + b, 0);
  const avg = Math.round((sum / totalReviews) * 10) / 10;

  assert(totalReviews === 7, `Total count is 7`);
  assert(sum === 31, `Sum of ratings is 31`);
  assert(avg === 4.4, `Calculated average is 4.4 (got ${avg})`);

  const dist: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  for (const r of sampleRatings) dist[String(r)]++;
  assert(dist["5"] === 4, `5-star count is 4`);
  assert(dist["4"] === 2, `4-star count is 2`);
  assert(dist["3"] === 1, `3-star count is 1`);
  assert(dist["1"] === 0 && dist["2"] === 0, `1-star and 2-star counts are 0`);

  console.log("\n========================================");
  console.log(`Review Tests: ${passed} passed, ${failed} failed.`);
  console.log("========================================\n");

  if (failed > 0) process.exit(1);
}

runTests();
