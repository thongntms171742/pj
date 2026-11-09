// ── Pure pricing tests (no DB) ───────────────────────────────────────────────
// Bao phủ công thức per-slot pricing (spec §1.2):
//   P_total = P_tree + P_decoration + P_shipping
//   P_decoration = Σ (decorationPrice × số slot dùng)
//
// QUAN TRỌNG: `unitTotal` KHÔNG chứa shipping (tránh tính phí ship 2 lần
// khi Order layer cộng shipping lần nữa). `grandTotal` = unitTotal + shipping.

import {
  priceDesign,
  type AccessoryPricingLean,
  type CatalogSnapshot,
  type TreeLean,
} from "../services/pricingService";
import type { PricingInput } from "../services/pricingService";
import { ErrorCode } from "../utils/errors";
import { DesignValidationError } from "../services/pricingService";

const TREE_M = "tree-m";
const VARIANT_ID = "6acce8f40f4d29c2b79eba05";

function tree(overrides: Partial<TreeLean> = {}): TreeLean {
  return {
    _id: TREE_M,
    productId: "p-1",
    codeId: "c-1",
    size: "M",
    name: "Cây Yêu Thương M",
    price: 499_000,
    stockQuantity: 100,
    isActive: true,
    ...overrides,
  };
}

function acc(
  id: string,
  unitPrice: number,
  overrides: Partial<AccessoryPricingLean> = {}
): AccessoryPricingLean {
  return {
    _id: id,
    sku: `SKU-${id}`,
    name: `Phụ kiện ${id}`,
    image: `/img/${id}.webp`,
    unitPrice,
    isActive: true,
    ...overrides,
  };
}

function buildCatalog(o: {
  tree?: TreeLean;
  accessories?: AccessoryPricingLean[];
} = {}): CatalogSnapshot {
  return { tree: o.tree ?? tree(), accessories: o.accessories ?? [] };
}

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

console.log("\n── Pricing: cây trơn (không phụ kiện) ──\n");

// 1. Basic pricing — cây trơn
{
  const catalog = buildCatalog();
  const input: PricingInput = { variantId: TREE_M, deliveryOption: "DIY_KIT" };
  const result = priceDesign(input, catalog);
  assert(result.tree.unitPrice === 499_000, "Tree price = 499k");
  assert(result.shippingFee === 20_000, "Shipping fee = 20k");
  assert(
    result.unitTotal === 499_000,
    "unitTotal = treePrice (KHÔNG gồm shipping)"
  );
  assert(
    result.grandTotal === 519_000,
    "grandTotal = treePrice + shipping (519k)"
  );
  assert(result.decorationFee === 0, "Decoration fee = 0");
  assert(result.decorations.length === 0, "Không có dòng trang trí");
  assert(result.productionDays === 0, "Production days = 0");
  assert(result.hasPersonalization === false, "hasPersonalization = false");
}

// 2. READY_TO_DISPLAY — cùng giá cây trơn với DIY_KIT
{
  const catalog = buildCatalog();
  const result = priceDesign(
    { variantId: TREE_M, deliveryOption: "READY_TO_DISPLAY" },
    catalog
  );
  assert(result.unitTotal === 499_000, "READY_TO_DISPLAY cùng giá với DIY_KIT");
}

// 3. SEPARATE
{
  const catalog = buildCatalog();
  const result = priceDesign(
    { variantId: TREE_M, deliveryOption: "SEPARATE" },
    catalog
  );
  assert(result.unitTotal === 499_000, "SEPARATE cùng giá");
}

console.log("\n── Pricing: per-slot (mỗi slot 1 lần phí) ──\n");

// 4. 1 phụ kiện dùng 4 slot ⇒ phí = 4 × unitPrice
{
  const catalog = buildCatalog({ accessories: [acc("GOLD_STAR", 25_000)] });
  const result = priceDesign(
    {
      variantId: TREE_M,
      deliveryOption: "DIY_KIT",
      accessories: [{ accessoryId: "GOLD_STAR", quantity: 4 }],
    },
    catalog
  );
  assert(
    result.decorationFee === 100_000,
    "4 slot × 25k = 100k phí trang trí"
  );
  assert(
    result.unitTotal === 499_000 + 100_000,
    "unitTotal = cây + phí trang trí (599k)"
  );
  assert(
    result.grandTotal === 619_000,
    "grandTotal = unitTotal + shipping (619k)"
  );
  assert(result.decorations.length === 1, "1 dòng trang trí");
  assert(
    result.decorations[0].quantity === 4,
    "Dòng trang trí ghi quantity = 4 slot"
  );
  assert(
    result.decorations[0].lineTotal === 100_000,
    "lineTotal = unitPrice × 4"
  );
}

// 5. CÙNG 1 phụ kiện dùng 15 slot ⇒ phí 15 lần (không tính theo id duy nhất)
{
  const catalog = buildCatalog({ accessories: [acc("RED_BALL", 15_000)] });
  const result = priceDesign(
    {
      variantId: TREE_M,
      deliveryOption: "DIY_KIT",
      accessories: [{ accessoryId: "RED_BALL", quantity: 15 }],
    },
    catalog
  );
  assert(
    result.decorationFee === 225_000,
    "15 slot × 15k = 225k (KHÔNG tính 1 lần)"
  );
  assert(
    result.unitTotal === 499_000 + 225_000,
    "unitTotal = cây + 225k"
  );
}

// 6. Nhiều phụ kiện khác nhau — cộng dồn
{
  const catalog = buildCatalog({
    accessories: [acc("GOLD_STAR", 25_000), acc("RED_BALL", 15_000)],
  });
  const result = priceDesign(
    {
      variantId: TREE_M,
      deliveryOption: "DIY_KIT",
      accessories: [
        { accessoryId: "GOLD_STAR", quantity: 1 },
        { accessoryId: "RED_BALL", quantity: 3 },
      ],
    },
    catalog
  );
  assert(
    result.decorationFee === 25_000 + 45_000,
    "Nhiều phụ kiện: 25k + 3×15k = 70k"
  );
  assert(result.decorations.length === 2, "2 dòng trang trí");
}

// 7. Dòng chi tiết giữ đúng tên/ảnh/SKU của phụ kiện (snapshot)
{
  const catalog = buildCatalog({ accessories: [acc("GOLD_STAR", 25_000)] });
  const result = priceDesign(
    {
      variantId: TREE_M,
      deliveryOption: "DIY_KIT",
      accessories: [{ accessoryId: "GOLD_STAR", quantity: 2 }],
    },
    catalog
  );
  const d = result.decorations[0];
  assert(d.accessoryId === "GOLD_STAR", "Dòng trang trí giữ accessoryId");
  assert(d.sku === "SKU-GOLD_STAR", "Dòng trang trí giữ sku");
  assert(d.name === "Phụ kiện GOLD_STAR", "Dòng trang trí giữ name");
  assert(d.image === "/img/GOLD_STAR.webp", "Dòng trang trí giữ image");
  assert(d.unitPrice === 25_000, "Dòng trang trí giữ unitPrice");
}

console.log("\n── Validation failures ──\n");

// 8. Inactive tree
{
  const catalog = buildCatalog({ tree: tree({ isActive: false }) });
  try {
    priceDesign({ variantId: TREE_M, deliveryOption: "DIY_KIT" }, catalog);
    assert(false, "Should throw for inactive tree");
  } catch (err) {
    assert(
      err instanceof DesignValidationError &&
        err.code === ErrorCode.CATALOG_ITEM_UNAVAILABLE,
      "Throws CATALOG_ITEM_UNAVAILABLE"
    );
  }
}

// 9. Invalid deliveryOption
{
  const catalog = buildCatalog();
  try {
    priceDesign(
      { variantId: TREE_M, deliveryOption: "EXPRESS" as any },
      catalog
    );
    assert(false, "Should throw for invalid deliveryOption");
  } catch (err) {
    assert(
      err instanceof DesignValidationError &&
        err.code === ErrorCode.DELIVERY_OPTION_INVALID,
      "Throws DELIVERY_OPTION_INVALID"
    );
  }
}

// 10. Phụ kiện không tồn tại trong catalog
{
  const catalog = buildCatalog({ accessories: [acc("GOLD_STAR", 25_000)] });
  try {
    priceDesign(
      {
        variantId: TREE_M,
        deliveryOption: "DIY_KIT",
        accessories: [{ accessoryId: "NOT_EXIST", quantity: 1 }],
      },
      catalog
    );
    assert(false, "Should throw for unknown accessory");
  } catch (err) {
    assert(
      err instanceof DesignValidationError &&
        err.code === ErrorCode.ACCESSORY_NOT_FOUND,
      "Throws ACCESSORY_NOT_FOUND"
    );
  }
}

// 11. Phụ kiện bị ngừng bán giữa lúc thiết kế và checkout → phải từ chối
{
  const catalog = buildCatalog({
    accessories: [acc("GOLD_STAR", 25_000, { isActive: false })],
  });
  try {
    priceDesign(
      {
        variantId: TREE_M,
        deliveryOption: "DIY_KIT",
        accessories: [{ accessoryId: "GOLD_STAR", quantity: 1 }],
      },
      catalog
    );
    assert(false, "Should throw for inactive accessory");
  } catch (err) {
    assert(
      err instanceof DesignValidationError &&
        err.code === ErrorCode.ACCESSORY_UNAVAILABLE,
      "Throws ACCESSORY_UNAVAILABLE"
    );
  }
}

// 12. Quantity không hợp lệ (0 hoặc âm)
{
  const catalog = buildCatalog({ accessories: [acc("GOLD_STAR", 25_000)] });
  for (const qty of [0, -3]) {
    try {
      priceDesign(
        {
          variantId: TREE_M,
          deliveryOption: "DIY_KIT",
          accessories: [{ accessoryId: "GOLD_STAR", quantity: qty }],
        },
        catalog
      );
      assert(false, `Should throw for quantity = ${qty}`);
    } catch (err) {
      assert(
        err instanceof DesignValidationError &&
          err.code === ErrorCode.INVALID_INPUT,
        `Throws INVALID_INPUT for quantity = ${qty}`
      );
    }
  }
}

console.log(`\n========================================`);
console.log(`Pricing Test Summary: ${passed} passed, ${failed} failed.`);
console.log(`========================================`);
if (failed > 0) process.exit(1);
