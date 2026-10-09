// ── Regression test (pure unit, no DB): loadCatalogForDesign error contract ─
//
// Background (2026-10-08 production incident):
//   GET /api/catalog/presets returned 500 INTERNAL_ERROR because at least one
//   preset in the production DB pointed to a treeId/styleId/accessoryId that
//   no longer exists. The whole gallery failed because `Promise.all`
//   propagated the first rejection. Fix: switch to `Promise.allSettled` in
//   getPresets + listPresets so one orphaned preset is logged-and-skipped,
//   others still render.
//
// These tests stub the Mongoose models (Tree/Style/Accessory) before importing
// the service under test, so no live MongoDB is required.
//
// Run with: npm run test:presets
// No DB required.

import type { Response } from "express";
import type { DesignConfig } from "../models/TreeDesign";
import { ErrorCode } from "../utils/errors";

// ── Test infra ─────────────────────────────────────────────────────────────
let pass = 0;
let fail = 0;
function assert(cond: unknown, label: string): void {
  if (cond) {
    pass++;
    console.log(`PASS: ${label}`);
  } else {
    fail++;
    console.log(`FAIL: ${label}`);
  }
}

function mockRes(): { res: Response; sent: () => { status: number; body: unknown } | null } {
  const state: { sent: { status: number; body: unknown } | null } = { sent: null };
  const res = {
    status(code: number) {
      state.sent = { status: code, body: state.sent?.body ?? null };
      return this;
    },
    json(body: unknown) {
      state.sent = { status: state.sent?.status ?? 200, body };
      return this;
    },
  } as unknown as Response;
  // Return a getter so the caller always sees the CURRENT value of state.sent.
  return { res, sent: () => state.sent };
}

// ── Stubs for Mongoose models ──────────────────────────────────────────────
// We pre-define the stubs, then `require()` the service after stubbing.
//
// Approach: instead of mocking (jest.mock requires jest runner), we directly
// monkey-patch the Tree/Style/Accessory modules' findById/find exports with
// simple stubs. Since catalogService imports these as namespace objects, the
// live bindings allow replacement.

import * as TreeModule from "../models/Tree";
import * as StyleModule from "../models/Style";
import * as AccessoryModule from "../models/Accessory";

const stubTree = TreeModule.Tree as unknown as {
  findById: (id: unknown) => { lean: () => Promise<unknown> };
};
const stubStyle = StyleModule.Style as unknown as {
  findById: (id: unknown) => { lean: () => Promise<unknown> };
};
const stubAccessory = AccessoryModule.Accessory as unknown as {
  find: (filter: unknown) => { lean: () => Promise<unknown[]> };
};

const originalTreeFindById = stubTree.findById;
const originalStyleFindById = stubStyle.findById;
const originalAccessoryFind = stubAccessory.find;

// Now import the service. The imports at the top of the file capture the
// current (stubbed) bindings.
import { buildPricedDesign, safelyBuildPricedDesign } from "../services/catalogService";

// ── Helpers ────────────────────────────────────────────────────────────────
function makeLeanChain(value: unknown) {
  return { lean: () => Promise.resolve(value) };
}

const GHOST_TREE = "000000000000000000000001";
const GHOST_STYLE = "000000000000000000000002";
const GHOST_ACCESSORY = "000000000000000000000003";

// ═══════════════════════════════════════════════════════════════════════════
// Test 1: buildPricedDesign throws CatalogServiceError when variant is missing
// ═══════════════════════════════════════════════════════════════════════════
async function testMissingTree(): Promise<void> {
  stubTree.findById = () => makeLeanChain(null);
  const config: DesignConfig = {
    variantId: GHOST_TREE as unknown as Types_Compatible,
    styleId: GHOST_STYLE as unknown as Types_Compatible,
    accessories: [],
    deliveryOption: "DIY_KIT",
  };
  try {
    await buildPricedDesign(config);
    assert(false, "buildPricedDesign with ghost variantId should throw");
    return;
  } catch (err) {
    const e = err as { code?: string; httpCode?: number };
    assert(
      e?.code === ErrorCode.TREE_NOT_FOUND,
      `error.code === TREE_NOT_FOUND (got ${e?.code})`
    );
    assert(e?.httpCode === 404, `error.httpCode === 404 (got ${e?.httpCode})`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Test 3: safelyBuildPricedDesign converts CatalogServiceError → sendError,
// NOT → handleInternalError (500). This is THE fix that unblocks the FE.
// ═══════════════════════════════════════════════════════════════════════════
async function testSafelyBuildDoesNotProduce500(): Promise<void> {
  stubTree.findById = () => makeLeanChain(null);
  const config: DesignConfig = {
    variantId: GHOST_TREE as unknown as Types_Compatible,
    styleId: GHOST_STYLE as unknown as Types_Compatible,
    accessories: [],
    deliveryOption: "DIY_KIT",
  };
  const { res, sent } = mockRes();
  const result = await safelyBuildPricedDesign(res, config);
  assert(result === null, "safelyBuildPricedDesign returns null when error handled");
  const sentValue = sent();
  assert(sentValue !== null, "res was sent a response");
  assert(
    sentValue?.status === 404,
    `status is 404 (got ${sentValue?.status}) — confirms error is NOT swallowed as 500`
  );
  const body = sentValue?.body as { error?: { code: string; message: string } };
  assert(body?.error?.code !== undefined, "response body has error.code");
  assert(
    body?.error?.code === ErrorCode.TREE_NOT_FOUND,
    `error.code === TREE_NOT_FOUND (got ${body?.error?.code})`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Test 4: Promise.allSettled does not short-circuit on first rejection.
// (This is the controller-level fix: a 1-orphaned-preset DB can no longer
// 500 the whole gallery.)
// ═══════════════════════════════════════════════════════════════════════════
async function testAllSettledDoesNotShortCircuit(): Promise<void> {
  stubTree.findById = () => makeLeanChain(null);
  const badConfig: DesignConfig = {
    variantId: "000000000000000000000010" as unknown as Types_Compatible,
    styleId: "000000000000000000000011" as unknown as Types_Compatible,
    accessories: [],
    deliveryOption: "DIY_KIT",
  };

  const results = await Promise.allSettled([
    buildPricedDesign(badConfig),
    buildPricedDesign(badConfig),
    buildPricedDesign(badConfig),
  ]);

  assert(results.length === 3, "allSettled returns 3 results");
  assert(
    results.every((r) => r.status === "rejected"),
    "all 3 results are rejected (no preset is hydrate-able in this test)"
  );
  const firstReason = (results[0] as PromiseRejectedResult).reason as { code?: string };
  assert(
    firstReason?.code === ErrorCode.TREE_NOT_FOUND,
    `rejection reason has error.code TREE_NOT_FOUND (got ${firstReason?.code})`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Test 5: Preset with valid tree+style but missing accessory also throws
// a NOT_FOUND error (not a silent 200 with empty map).
// ═══════════════════════════════════════════════════════════════════════════
async function testMissingAccessory(): Promise<void> {
  stubTree.findById = () =>
    makeLeanChain({ _id: GHOST_TREE, productId: GHOST_TREE, codeId: GHOST_TREE, size: "M", name: "Cay M", price: 249000, stockQuantity: 10, isActive: true });
  stubStyle.findById = () =>
    makeLeanChain({ _id: GHOST_STYLE, code: "CLASSIC", name: "Classic", isActive: true });
  stubAccessory.find = () => ({ lean: () => Promise.resolve([]) });
  const config: DesignConfig = {
    variantId: GHOST_TREE as unknown as Types_Compatible,
    styleId: GHOST_STYLE as unknown as Types_Compatible,
    accessories: [
      { accessoryId: GHOST_ACCESSORY as unknown as Types_Compatible, quantity: 1 },
    ],
    deliveryOption: "DIY_KIT",
  };
  try {
    await buildPricedDesign(config);
    assert(false, "buildPricedDesign with missing accessory should throw");
    return;
  } catch (err) {
    const e = err as { code?: string; httpCode?: number };
    assert(
      e?.code === ErrorCode.ACCESSORY_NOT_FOUND,
      `error.code === ACCESSORY_NOT_FOUND (got ${e?.code})`
    );
    assert(e?.httpCode === 404, `error.httpCode === 404 (got ${e?.httpCode})`);
  }
}

// Type alias for design config id fields (mongoose ObjectId is structurally
// compatible with any string from the test's POV).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Types_Compatible = any;

// ── Test runner ───────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log("── Preset resilience regression tests (2026-10-08, pure unit) ──\n");
  try {
    await testMissingTree();
    await testMissingAccessory();
    await testSafelyBuildDoesNotProduce500();
    await testAllSettledDoesNotShortCircuit();
  } finally {
    // Restore originals (best-effort cleanup).
    stubTree.findById = originalTreeFindById;
    stubStyle.findById = originalStyleFindById;
    stubAccessory.find = originalAccessoryFind;
  }

  console.log(`\n========================================`);
  console.log(`Test Summary: ${pass} passed, ${fail} failed.`);
  console.log(`========================================`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Test suite crashed:", err);
  process.exit(1);
});
