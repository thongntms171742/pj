// ── Test for utils/slug ─────────────────────────────────────────────────────
// Run with: npx ts-node --transpile-only src/tests/slug.test.ts

import { slugify } from "../utils/slug";

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
  console.log("\n── Test 1: slugify basic ──\n");
  assert(slugify("Hello World") === "hello-world", "spaces become hyphens");
  assert(slugify("Cây thông Noel") === "cay-thong-noel", "Vietnamese diacritics stripped");
  assert(slugify("  --foo--BAR--  ") === "foo-bar", "trims and dedupes hyphens");
  assert(slugify("Foo & Bar!") === "foo-bar", "special chars become single hyphen");
  assert(slugify("") === "", "empty string returns empty");
  assert(slugify("---") === "", "all-hyphens returns empty");

  console.log("\n── Test 2: slugify length cap ──\n");
  const long = "a".repeat(200);
  const result = slugify(long, 50);
  assert(result.length === 50, "truncates to maxLen");
  const shorter = slugify(long);
  assert(shorter.length === 80, "default maxLen is 80");

  console.log("\n── Test 3: slugify unicode safety ──\n");
  assert(slugify("Café résumé") === "cafe-resume", "accented latin stripped");
  assert(slugify("日本語") === "", "non-latin (no a-z0-9) returns empty");
  assert(slugify("Item 123") === "item-123", "numbers preserved");

  console.log(`\n── Results: ${passed} passed, ${failed} failed ──\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
