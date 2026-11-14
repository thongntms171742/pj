import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import app from "../app";
import { Accessory, Cart, Design, Order, SlotMap, Tree, TreeCode, TreeProduct, User } from "../models";
import { getMongoUri } from "../config/env";
import manifest from "../data/customization-accessories.json";
import { priceDesign } from "../services/pricingService";

// Uses an isolated, uniquely named database. No application catalogue,
// customer account, stock or order in the configured database is changed.
async function main(): Promise<void> {
  const databaseName = `byc_custom_test_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const checks: string[] = [];
  await mongoose.connect(getMongoUri(), { dbName: databaseName });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not start");
  const base = `http://127.0.0.1:${address.port}/api`;
  async function request(method: string, route: string, body?: unknown, token?: string) {
    const response = await fetch(base + route, { method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    return { status: response.status, data: text ? JSON.parse(text) : null };
  }
  try {
    await Promise.all(mongoose.modelNames().map(name => mongoose.model(name).init()));
    assert.equal(manifest.accessories.length, 24);
    for (const entry of manifest.accessories) {
      const image = fs.readFileSync(path.resolve(__dirname, "../../assets/customization-docx", `figure-${String(entry.source.figure).padStart(2, "0")}.png`));
      assert.equal(createHash("sha256").update(image).digest("hex"), entry.source.imageSha256);
    }
    checks.push("24 source images and prices have their provenance preserved");
    const product = await TreeProduct.create({ name: "Customization test", slug: "customization-test", isCustomizerBase: true });
    const code = await TreeCode.create({ productId: product._id, code: "BASE", name: "BASE" });
    const variant = await Tree.create({ productId: product._id, codeId: code._id, sku: "BASE", size: "M",
      name: "Customization test", heightCmMin: 0, heightCmMax: 0, diameterCm: 0, price: 80000,
      stockQuantity: 10, customizationMode: "free", customizationCatalog: manifest.catalogKey });
    const accessories = await Accessory.insertMany(manifest.accessories.map(a => ({ ...a, catalogKey: manifest.catalogKey, stockQuantity: 0, slotTypes: ["generic"] })));
    const byFigure = new Map(accessories.map(a => [a.source!.figure, a]));
    const register = await request("POST", "/auth/register", { name: "Test Buyer", email: "customization@example.test", password: "TestBuyer!2026" });
    assert.equal(register.status, 201);
    const token = register.data.token;
    const stranger = await request("POST", "/auth/register", { name: "Other Buyer", email: "other@example.test", password: "TestBuyer!2026" });
    const catalogue = await request("GET", `/catalog/accessories?variantId=${variant._id}`);
    assert.equal(catalogue.data.accessories.length, 24);
    assert.equal(catalogue.data.accessories.filter((a: any) => a.priceStatus === "confirmed").length, 24);
    const minimumPrices: Record<number, number> = { 2: 58410, 3: 76450, 4: 88200, 6: 45540, 8: 9800, 9: 9800,
      10: 76450, 12: 76450, 13: 95200, 14: 88200, 15: 5500, 16: 5500, 20: 37000, 21: 37000, 22: 5500, 23: 5500, 24: 5500 };
    for (const [figure, price] of Object.entries(minimumPrices)) assert.equal(byFigure.get(Number(figure))!.unitPrice, price);
    checks.push("Catalogue confirms 24 prices and applies approved minimums with 5,500 VND per bauble");
    // Keep a deliberately unpriced fixture to verify the purchase guard for future incomplete products.
    const unpricedFixture = byFigure.get(15)!;
    unpricedFixture.set("unitPrice", null);
    unpricedFixture.priceStatus = "requires_confirmation";
    await unpricedFixture.save();
    const created = await request("POST", "/designs", { treeVariantId: variant._id, name: "My test tree", deliveryOption: "DIY_KIT" }, token);
    assert.equal(created.status, 201);
    const id = created.data.design.id;
    const placement = (figure: number, index: number) => ({ slotId: `free-${index}`,
      accessoryId: String(byFigure.get(figure)!._id), x: 0.5, y: 0.5, rotation: 35, scale: 1.1,
      mounting: byFigure.get(figure)!.mounting,
      position3d: figure === 17 ? { x: 1.1, y: 0.03, z: 1.1 } : index === 2 ? { x: 0.11, y: 2.25, z: 0.32 } : { x: 0.2, y: 1.5, z: 0.5 },
    });
    const pendingSave = await request("PUT", `/designs/${id}/configuration`, { placementMode: "free", expectedConfigVersion: 0, placements: [placement(15, 1)] }, token);
    assert.equal(pendingSave.status, 200);
    assert.equal((await request("POST", "/cart/items", { variantId: variant._id, deliveryOption: "DIY_KIT", designId: id }, token)).status, 400);
    checks.push("Unpriced ornaments can be saved but cannot be bought");
    const values = [placement(19, 1), placement(19, 2), placement(17, 3)];
    const body = { placementMode: "free", expectedConfigVersion: 1, placements: values, name: "Saved arrangement", deliveryOption: "DIY_KIT" };
    const concurrent = await Promise.all([request("PUT", `/designs/${id}/configuration`, body, token), request("PUT", `/designs/${id}/configuration`, body, token)]);
    assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409]);
    checks.push("Concurrent saves atomically accept one version and reject the stale writer");
    const current = await request("GET", `/designs/${id}`, undefined, token);
    assert.deepEqual(current.data.design.configuration.placements, values);
    assert.equal(current.data.design.configuration.configVersion, 2);
    const invalid = await request("PUT", `/designs/${id}/configuration`, { ...body, expectedConfigVersion: 2,
      placements: [{ ...values[0], position3d: { x: 999, y: 0, z: 0 } }] }, token);
    assert.equal(invalid.status, 400);
    const overlap = await request("PUT", `/designs/${id}/configuration`, { ...body, expectedConfigVersion: 2,
      placements: [values[0], { ...values[1], position3d: values[0].position3d }] }, token);
    assert.equal(overlap.status, 400);
    assert.match(overlap.data.error.message, /quá gần/);
    const invalidScale = await request("PUT", `/designs/${id}/configuration`, { ...body, expectedConfigVersion: 2,
      placements: [{ ...values[0], scale: 2.5 }] }, token);
    assert.equal(invalidScale.status, 400);
    const malformed = await request("PUT", `/designs/${id}/configuration`, { ...body, expectedConfigVersion: 2, placements: [null] }, token);
    assert.equal(malformed.status, 400);
    const afterRejected = await request("GET", `/designs/${id}`, undefined, token);
    assert.deepEqual(afterRejected.data.design.configuration.placements, values);
    checks.push("Overlapping, malformed and oversized placements fail without changing the saved layout");
    checks.push("Positions, mounting, scale and rotation survive save/load and invalid coordinates are rejected");
    const cart = await request("POST", "/cart/items", { variantId: variant._id, deliveryOption: "DIY_KIT", designId: id, quantity: 1 }, token);
    assert.equal(cart.status, 201);
    assert.equal(cart.data.item.currentUnitTotal, 80000 + 2 * 43482 + 69000);
    assert.deepEqual(cart.data.item.config.frozenConfig.placements, values);
    assert.equal(cart.data.item.decorations.find((d: any) => d.modelKind === "stocking").quantity, 2);
    assert.equal((await request("POST", "/cart/items", { variantId: variant._id, deliveryOption: "DIY_KIT", designId: id }, stranger.data.token)).status, 403);
    checks.push("Cart pricing counts each instance and protects design ownership");
    await request("PUT", `/designs/${id}/configuration`, { ...body, expectedConfigVersion: 2, placements: [placement(19, 9)] }, token);
    const cartAfter = await request("GET", "/cart", undefined, token);
    assert.deepEqual(cartAfter.data.items[0].config.frozenConfig.placements, values);
    const order = await request("POST", "/orders", { cartItemIds: [cart.data.item._id], paymentMethod: "ONLINE",
      shippingName: "Test Buyer", shippingPhone: "0900000000", shippingAddress: "Test", shippingProvinceId: "79", shippingFee: 20000 }, token);
    assert.equal(order.status, 201);
    assert.equal(order.data.order.subtotal, 235964);
    assert.equal(order.data.order.totalAmount, 255964);
    assert.deepEqual(order.data.order.items[0].customization.configuration.placements, values);
    assert.equal(order.data.order.items[0].decorations.find((d: any) => d.accessoryId === String(byFigure.get(19)!._id)).quantity, 2);
    assert.equal(order.data.order.items[0].decorations.find((d: any) => d.accessoryId === String(byFigure.get(19)!._id)).modelKind, "stocking");
    assert.equal((await Tree.findById(variant._id))!.stockQuantity, 9);
    assert.equal((await request("PATCH", `/orders/${order.data.order._id}/status`, { status: "CANCELLED" }, token)).status, 200);
    assert.equal((await Tree.findById(variant._id))!.stockQuantity, 10);
    checks.push("Checkout snapshots the frozen 3D arrangement, prices exactly once and cancellation restores stock");
    const large = await Tree.create({ productId: product._id, codeId: code._id, sku: "BASE-L", size: "L",
      name: "Raw L", heightCmMin: 0, heightCmMax: 0, diameterCm: 0, price: 220000,
      stockQuantity: 6, customizationMode: "free", customizationCatalog: manifest.catalogKey });
    const picker = await request("GET", "/catalog/customizer/base-trees");
    const largeEntry = picker.data.baseTrees.find((tree: any) => tree._id === String(large._id));
    assert.equal(largeEntry.customizationMode, "free");
    assert.equal(largeEntry.hasSlotMap, false);
    assert.equal(largeEntry.price, 220000);
    assert.equal((await request("GET", `/catalog/accessories?variantId=${large._id}`)).data.accessories.length, 24);
    const largeDesign = await request("POST", "/designs", { treeVariantId: large._id, name: "Raw L decorated", deliveryOption: "DIY_KIT" }, token);
    assert.equal(largeDesign.status, 201);
    const largeSave = await request("PUT", `/designs/${largeDesign.data.design.id}/configuration`, {
      placementMode: "free", expectedConfigVersion: 0, placements: [values[0]],
    }, token);
    assert.equal(largeSave.status, 200);
    const largeCart = await request("POST", "/cart/items", {
      variantId: large._id, deliveryOption: "DIY_KIT", designId: largeDesign.data.design.id, quantity: 1,
    }, token);
    assert.equal(largeCart.status, 201);
    assert.equal(largeCart.data.item.currentUnitTotal, 220000 + 43482);
    assert.equal(largeCart.data.item.config.variantId, String(large._id));
    checks.push("Raw L works without a slot map, shares 24 accessories and saves/buys with the 220,000 VND base price");
    const legacyDesign = await request("POST", "/designs", { treeVariantId: variant._id, name: "Legacy slots" }, token);
    await SlotMap.create({ variantId: variant._id, version: 1, isPublished: true,
      slots: [{ slotId: "legacy-slot", slotType: "generic", x: 0.5, y: 0.5, radius: 0.1, depth: "behind" }] });
    const legacy = await request("PUT", `/designs/${legacyDesign.data.design.id}/configuration`, {
      placements: [{ slotId: "legacy-slot", accessoryId: String(byFigure.get(19)!._id), x: 0.5, y: 0.5 }],
    }, token);
    assert.equal(legacy.status, 200);
    assert.equal(legacy.data.design.configuration.placements[0].depth, "behind");
    const legacyCart = await request("POST", "/cart/items", {
      variantId: variant._id, deliveryOption: "DIY_KIT", designId: legacyDesign.data.design.id, quantity: 1,
    }, token);
    assert.equal(legacyCart.status, 201);
    assert.equal(legacyCart.data.item.config.frozenConfig.placements[0].depth, "behind");
    checks.push("Existing slot-based configurations remain compatible");
    const historical = await request("POST", "/designs", { treeVariantId: variant._id, name: "Historic free layout" }, token);
    const historicalId = historical.data.design.id;
    const oldPlacements = [values[0], { ...values[0], slotId: "historic-overlap" }];
    await Design.updateOne({ _id: historicalId }, { $set: { configuration: {
      placementMode: "free", configVersion: 1, slotMapVersion: 0,
      variantSnapshot: { variantId: variant._id, sku: variant.sku, name: variant.name, price: variant.price },
      placements: oldPlacements,
    } } });
    const preserved = await request("PUT", `/designs/${historicalId}/configuration`, {
      placementMode: "free", expectedConfigVersion: 1, placements: oldPlacements, name: "Renamed historic layout",
    }, token);
    assert.equal(preserved.status, 200);
    assert.deepEqual(preserved.data.design.configuration.placements, oldPlacements);
    const newCollision = await request("PUT", `/designs/${historicalId}/configuration`, {
      placementMode: "free", expectedConfigVersion: 2, placements: [...oldPlacements, { ...values[0], slotId: "new-overlap" }],
    }, token);
    assert.equal(newCollision.status, 400);
    checks.push("Previously saved layouts keep their instance coordinates while new collisions are rejected");
    const pendingId = String(byFigure.get(15)!._id);
    assert.equal((await request("PATCH", `/admin/accessories/${pendingId}`, { unitPrice: 6000, priceStatus: "confirmed" }, token)).status, 403);
    await User.updateOne({ email: "other@example.test" }, { $set: { roles: ["admin"] } });
    const adminLogin = await request("POST", "/auth/login", { email: "other@example.test", password: "TestBuyer!2026" });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;
    assert.equal((await request("PATCH", `/admin/accessories/${pendingId}`, { priceStatus: "confirmed" }, adminToken)).status, 400);
    // This is an explicit fixture price in the isolated test database, not a source price.
    const confirmation = await request("PATCH", `/admin/accessories/${pendingId}`, { unitPrice: 6000, priceStatus: "confirmed" }, adminToken);
    assert.equal(confirmation.status, 200);
    assert.equal(confirmation.data.accessory.unitPrice, 6000);
    assert.equal(confirmation.data.accessory.source.priceText, byFigure.get(15)!.source!.priceText);
    const revoke = await request("PATCH", `/admin/accessories/${pendingId}`, { priceStatus: "requires_confirmation" }, adminToken);
    assert.equal(revoke.status, 200);
    assert.equal(revoke.data.accessory.unitPrice, null);
    checks.push("Only administrators can confirm an exact price; confirmation preserves source text and can be revoked");
    // Missing prices also fail in the pure pricing entry point.
    assert.throws(() => priceDesign({ variantId: String(variant._id), deliveryOption: "DIY_KIT", accessories: [{ accessoryId: "pending", quantity: 1 }] }, {
      tree: { _id: String(variant._id), productId: String(product._id), codeId: String(code._id), name: variant.name,
        size: "M", price: 80000, stockQuantity: 10, isActive: true },
      accessories: [{ _id: "pending", sku: "pending", name: "Pending", image: "", unitPrice: null, isActive: true }],
    }));
    console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (mongoose.connection.name !== databaseName || !databaseName.startsWith("byc_custom_test_")) {
      throw new Error("Test database identity mismatch, cleanup stopped");
    }
    try { await mongoose.connection.dropDatabase(); }
    finally { await mongoose.disconnect(); }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
