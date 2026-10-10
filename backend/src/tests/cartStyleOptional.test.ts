import { priceDesign, CatalogSnapshot } from "../services/pricingService";
import { TreeSize } from "../models/Tree";

function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`✅ PASS: ${msg}`);
  } else {
    console.error(`❌ FAIL: ${msg}`);
    process.exit(1);
  }
}

async function testPricingWithoutStyle() {
  const mockCatalog: CatalogSnapshot = {
    tree: {
      _id: "tree123",
      productId: "prod123",
      codeId: "code123",
      size: "M" as TreeSize,
      name: "Cây thông xanh M",
      price: 250000,
      stockQuantity: 10,
      isActive: true,
    },
    style: null,
    accessories: new Map(),
  };

  const config: any = {
    variantId: "tree123",
    accessories: [],
    deliveryOption: "DIY_KIT",
  };

  const pricing = priceDesign(config, mockCatalog);

  assert(pricing.unitTotal === 250000, "Pricing unitTotal equals tree price");
  assert(pricing.style === null, "Pricing style is null");
  assert(pricing.decorationFee === 0, "Decoration fee is 0 for DIY_KIT");
  console.log("All pricing tests without style passed!");
}

testPricingWithoutStyle();
