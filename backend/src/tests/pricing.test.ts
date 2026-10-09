// ── Unit tests for pricingService.priceDesign ────────────────────────────────
// Pure pricing tests — no DB required. Each case seeds an in-memory catalog
// snapshot, invokes priceDesign(), and checks the breakdown / thrown codes.
//
// Run with: npm run test:pricing
//
// Uses the same minimal assert pattern as errorContract.test.ts to avoid
// adding a test runner dependency.

import {
  priceDesign,
  DesignValidationError,
  type CatalogSnapshot,
  type TreeLean,
  type StyleLean,
  type AccessoryLean,
} from "../services/pricingService";
import { ErrorCode } from "../utils/errors";
import type { DesignConfig } from "../models/TreeDesign";
import type { Types } from "mongoose";

// ── Fixtures ────────────────────────────────────────────────────────────────
const TREE_S = "tree-s";
const TREE_M = "tree-m";
const TREE_L = "tree-l";
const STYLE_CLASSIC = "style-classic";
const STYLE_GINGER = "style-ginger";

const ACC_LIGHT = "acc-light";
const ACC_BAUBLE = "acc-bauble";
const ACC_BOW = "acc-bow";
const ACC_NAME_TAG = "acc-name-tag";
const ACC_STAR = "acc-star";

function tree(overrides: Partial<TreeLean> = {}): TreeLean {
  return {
    _id: TREE_M,
    productId: "p-1",
    codeId: "c-1",
    size: "M",
    name: "Cây M",
    price: 249_000,
    stockQuantity: 100,
    isActive: true,
    ...overrides,
  };
}

function style(overrides: Partial<StyleLean> = {}): StyleLean {
  return {
    _id: STYLE_CLASSIC,
    code: "CLASSIC",
    name: "Classic",
    isActive: true,
    ...overrides,
  };
}

function accessory(overrides: Partial<AccessoryLean>): AccessoryLean {
  return {
    _id: "acc-x",
    name: "Phụ kiện X",
    type: "BAUBLE",
    group: "ORNAMENT",
    price: 10_000,
    isActive: true,
    styleCodes: [],
    maxQtyBySize: { S: 5, M: 12, L: 30 },
    isPersonalizable: false,
    personalizationMaxLength: 12,
    productionDays: 0,
    ...overrides,
  };
}

function buildCatalog(o: {
  tree?: TreeLean;
  style?: StyleLean;
  accessories?: AccessoryLean[];
} = {}): CatalogSnapshot {
  const accessories = (o.accessories ?? []).reduce((m, a) => {
    m.set(a._id, a);
    return m;
  }, new Map<string, AccessoryLean>());
  return { tree: o.tree ?? tree(), style: o.style ?? style(), accessories };
}

function config(o: Partial<DesignConfig> = {}): DesignConfig {
  return {
    variantId: TREE_M as unknown as Types.ObjectId,
    styleId: STYLE_CLASSIC as unknown as Types.ObjectId,
    accessories: [],
    deliveryOption: "READY_TO_DISPLAY",
    ...o,
  } as DesignConfig;
}

// ── Tiny assert harness (same pattern as errorContract) ───────────────────
let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`PASS: ${msg}`);
  } else {
    failed++;
    console.error(`FAIL: ${msg}`);
  }
}

function expectThrowCode(
  fn: () => unknown,
  expected: keyof typeof ErrorCode
): boolean {
  try {
    fn();
    assert(false, `Expected ${expected} but no error was thrown`);
    return false;
  } catch (err) {
    if (err instanceof DesignValidationError && err.code === ErrorCode[expected]) {
      assert(true, `Threw ${expected}`);
      return true;
    }
    assert(
      false,
      `Expected ${expected} but got ${(err as Error).message ?? "unknown"}`
    );
    return false;
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────
console.log("\n── Concept example: cây M + đèn + 12 baubles + bow + name tag ──\n");
{
  const catalog = buildCatalog({
    accessories: [
      accessory({
        _id: ACC_LIGHT,
        type: "LIGHT_STRING",
        group: "LIGHTS",
        name: "Dây đèn vàng",
        price: 59_000,
        maxQtyBySize: { S: 1, M: 1, L: 1 },
      }),
      accessory({
        _id: ACC_BAUBLE,
        type: "BAUBLE",
        group: "ORNAMENT",
        name: "Quả châu đỏ",
        price: 6_583,
        maxQtyBySize: { S: 5, M: 12, L: 30 },
      }),
      accessory({
        _id: ACC_BOW,
        type: "BOW",
        group: "DECOR",
        name: "Nơ đỏ",
        price: 39_000,
        maxQtyBySize: { S: 1, M: 1, L: 1 },
      }),
      accessory({
        _id: ACC_NAME_TAG,
        type: "NAME_TAG",
        group: "PERSONAL",
        name: "Name tag",
        price: 49_000,
        maxQtyBySize: { S: 1, M: 1, L: 1 },
        isPersonalizable: true,
        personalizationMaxLength: 12,
        productionDays: 2,
      }),
    ],
  });

  const result = priceDesign(
    config({
      accessories: [
        { accessoryId: ACC_LIGHT as unknown as Types.ObjectId, quantity: 1 },
        { accessoryId: ACC_BAUBLE as unknown as Types.ObjectId, quantity: 12 },
        { accessoryId: ACC_BOW as unknown as Types.ObjectId, quantity: 1 },
        {
          accessoryId: ACC_NAME_TAG as unknown as Types.ObjectId,
          quantity: 1,
          personalizationText: "MINH",
        },
      ],
    }),
    catalog
  );

  assert(result.tree.unitPrice === 249_000, "Tree price = 249k");
  assert(result.decorationFee === 80_000, "Decoration fee for M = 80k");
  assert(result.lines.length === 4, "Has 4 accessory lines");
  assert(result.productionDays === 2, "Production days driven by name tag (2)");
  assert(result.hasPersonalization === true, "hasPersonalization = true");
  assert(result.hasService === true, "hasService = true (decoration)");
  // 249k + 59k + 12*6.583 (≈ 79k) + 39k + 49k + 80k = 554.996
  assert(
    result.unitTotal === 554_996,
    `unitTotal = 554.996 (got ${result.unitTotal})`
  );
}

console.log("\n── DIY_KIT and SEPARATE have decorationFee = 0 ──\n");
{
  const catalog = buildCatalog();
  const r1 = priceDesign(config({ deliveryOption: "DIY_KIT" }), catalog);
  assert(r1.decorationFee === 0, "DIY_KIT decorationFee = 0");
  assert(r1.hasService === false, "DIY_KIT hasService = false");

  const r2 = priceDesign(config({ deliveryOption: "SEPARATE" }), catalog);
  assert(r2.decorationFee === 0, "SEPARATE decorationFee = 0");
}

console.log("\n── Decoration fee scales with tree size ──\n");
{
  const s = buildCatalog({ tree: tree({ _id: TREE_S, size: "S" }) });
  const m = buildCatalog({ tree: tree({ _id: TREE_M, size: "M" }) });
  const l = buildCatalog({ tree: tree({ _id: TREE_L, size: "L" }) });
  assert(
    priceDesign(config({ variantId: TREE_S as unknown as Types.ObjectId }), s)
      .decorationFee === 50_000,
    "S = 50k"
  );
  assert(
    priceDesign(config({ variantId: TREE_M as unknown as Types.ObjectId }), m)
      .decorationFee === 80_000,
    "M = 80k"
  );
  assert(
    priceDesign(config({ variantId: TREE_L as unknown as Types.ObjectId }), l)
      .decorationFee === 120_000,
    "L = 120k"
  );
}

console.log("\n── Validation failures ──\n");
{
  // Inactive tree
  const c1 = buildCatalog({ tree: tree({ isActive: false }) });
  expectThrowCode(() => priceDesign(config(), c1), "CATALOG_ITEM_UNAVAILABLE");

  // Quantity above max
  const c2 = buildCatalog({
    accessories: [accessory({ _id: ACC_BAUBLE, maxQtyBySize: { S: 5, M: 12, L: 30 } })],
  });
  expectThrowCode(
    () =>
      priceDesign(
        config({
          accessories: [
            {
              accessoryId: ACC_BAUBLE as unknown as Types.ObjectId,
              quantity: 999,
            },
          ],
        }),
        c2
      ),
    "ACCESSORY_QUANTITY_INVALID"
  );

  // Style mismatch
  const c3 = buildCatalog({
    style: style({ _id: STYLE_GINGER, code: "GINGERBREAD", name: "Gingerbread" }),
    accessories: [accessory({ _id: ACC_BOW, styleCodes: ["CLASSIC", "LUXURY"] })],
  });
  expectThrowCode(
    () =>
      priceDesign(
        config({
          styleId: STYLE_GINGER as unknown as Types.ObjectId,
          accessories: [
            {
              accessoryId: ACC_BOW as unknown as Types.ObjectId,
              quantity: 1,
            },
          ],
        }),
        c3
      ),
    "ACCESSORY_STYLE_MISMATCH"
  );

  // Missing personalization text
  const c4 = buildCatalog({
    accessories: [
      accessory({
        _id: ACC_NAME_TAG,
        isPersonalizable: true,
        personalizationMaxLength: 12,
      }),
    ],
  });
  expectThrowCode(
    () =>
      priceDesign(
        config({
          accessories: [
            {
              accessoryId: ACC_NAME_TAG as unknown as Types.ObjectId,
              quantity: 1,
            },
          ],
        }),
        c4
      ),
    "PERSONALIZATION_REQUIRED"
  );

  // Personalization text too long
  const c5 = buildCatalog({
    accessories: [
      accessory({
        _id: ACC_NAME_TAG,
        isPersonalizable: true,
        personalizationMaxLength: 4,
      }),
    ],
  });
  expectThrowCode(
    () =>
      priceDesign(
        config({
          accessories: [
            {
              accessoryId: ACC_NAME_TAG as unknown as Types.ObjectId,
              quantity: 1,
              personalizationText: "ABCDE",
            },
          ],
        }),
        c5
      ),
    "PERSONALIZATION_INVALID"
  );

  // Personalization text forbidden chars
  const c6 = buildCatalog({
    accessories: [accessory({ _id: ACC_NAME_TAG, isPersonalizable: true })],
  });
  expectThrowCode(
    () =>
      priceDesign(
        config({
          accessories: [
            {
              accessoryId: ACC_NAME_TAG as unknown as Types.ObjectId,
              quantity: 1,
              personalizationText: "<script>",
            },
          ],
        }),
        c6
      ),
    "PERSONALIZATION_INVALID"
  );

  // Personalization on non-personalizable
  const c7 = buildCatalog({
    accessories: [accessory({ _id: ACC_BAUBLE, isPersonalizable: false })],
  });
  expectThrowCode(
    () =>
      priceDesign(
        config({
          accessories: [
            {
              accessoryId: ACC_BAUBLE as unknown as Types.ObjectId,
              quantity: 1,
              personalizationText: "X",
            },
          ],
        }),
        c7
      ),
    "PERSONALIZATION_INVALID"
  );

  // Duplicate accessory
  const c8 = buildCatalog({ accessories: [accessory({ _id: ACC_BAUBLE })] });
  expectThrowCode(
    () =>
      priceDesign(
        config({
          accessories: [
            {
              accessoryId: ACC_BAUBLE as unknown as Types.ObjectId,
              quantity: 1,
            },
            {
              accessoryId: ACC_BAUBLE as unknown as Types.ObjectId,
              quantity: 1,
            },
          ],
        }),
        c8
      ),
    "ACCESSORY_DUPLICATED"
  );

  // Invalid deliveryOption
  const c9 = buildCatalog();
  expectThrowCode(
    () => priceDesign(config({ deliveryOption: "EXPRESS" as never }), c9),
    "DELIVERY_OPTION_INVALID"
  );

  // STAR qty > 1
  const c10 = buildCatalog({
    accessories: [
      accessory({
        _id: ACC_STAR,
        type: "STAR",
        group: "DECOR",
        maxQtyBySize: { S: 1, M: 1, L: 1 },
      }),
    ],
  });
  expectThrowCode(
    () =>
      priceDesign(
        config({
          accessories: [
            {
              accessoryId: ACC_STAR as unknown as Types.ObjectId,
              quantity: 2,
            },
          ],
        }),
        c10
      ),
    "ACCESSORY_QUANTITY_INVALID"
  );

  // Inactive accessory
  const c11 = buildCatalog({
    accessories: [accessory({ _id: ACC_BAUBLE, isActive: false })],
  });
  expectThrowCode(
    () =>
      priceDesign(
        config({
          accessories: [
            {
              accessoryId: ACC_BAUBLE as unknown as Types.ObjectId,
              quantity: 1,
            },
          ],
        }),
        c11
      ),
    "CATALOG_ITEM_UNAVAILABLE"
  );

  // Unknown accessory
  const c12 = buildCatalog();
  expectThrowCode(
    () =>
      priceDesign(
        config({
          accessories: [
            {
              accessoryId: "missing-id" as unknown as Types.ObjectId,
              quantity: 1,
            },
          ],
        }),
        c12
      ),
    "ACCESSORY_NOT_FOUND"
  );
}

console.log(`\n========================================`);
console.log(`Test Summary: ${passed} passed, ${failed} failed.`);
console.log(`========================================`);
if (failed > 0) process.exit(1);