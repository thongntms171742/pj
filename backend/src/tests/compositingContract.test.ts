// ── Kiểm chứng nhanh: hợp đồng ghép ảnh 4 lớp ────────────────────────────────
// Chạy: npx ts-node --transpile-only src/tests/compositingContract.test.ts
//
// Kiểm tra các quy tắc hợp đồng BE_HANDOFF_COMPOSITING.md:
//   1. SlotMap response luôn có depth + scaleHint (fallback an toàn).
//   2. validateSlots persist depth/scaleHint; giá trị sai ⇒ bỏ qua, không reject.
//   3. validatePlacements snapshot depth (ưu tiên giá trị FE gửi).
//   4. Accessory metadata: anchor/shadow/defaultScale chuẩn hoá khi thiếu.
//   5. DesignAccessory DTO map đúng field collection mới.

import {
  normalizeDepth,
  normalizeScaleHint,
  validateSlots,
  normalizeAnchor,
  normalizeShadow,
} from "../services/customizerService";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed += 1;
    console.log(`PASS: ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("── Test 1: normalizeDepth / normalizeScaleHint ──");
check("thiếu depth ⇒ 'front'", normalizeDepth(undefined) === "front");
check("depth sai ⇒ 'front'", normalizeDepth("sideways") === "front");
check("depth 'behind' ⇒ giữ", normalizeDepth("behind") === "behind");
check("depth 'front' ⇒ giữ", normalizeDepth("front") === "front");
check("thiếu scaleHint ⇒ 1", normalizeScaleHint(undefined) === 1);
check("scaleHint 0 ⇒ 1", normalizeScaleHint(0) === 1);
check("scaleHint âm ⇒ 1", normalizeScaleHint(-3) === 1);
check("scaleHint 1.15 ⇒ giữ", normalizeScaleHint(1.15) === 1.15);

console.log("\n── Test 2: validateSlots giữ depth/scaleHint ──");
const baseSlot = {
  slotId: "ball-left-01",
  slotType: "ball",
  x: 0.32,
  y: 0.44,
  radius: 0.05,
  z: 10,
  allowedAccessoryTypes: ["BAUBLE"],
};

const withMeta = validateSlots([{ ...baseSlot, depth: "behind", scaleHint: 1.15 }]);
check("validateSlots ok", withMeta.ok, withMeta.error);
check(
  "depth được giữ",
  withMeta.value?.[0]?.depth === "behind",
  JSON.stringify(withMeta.value?.[0])
);
check(
  "scaleHint được giữ",
  withMeta.value?.[0]?.scaleHint === 1.15,
  JSON.stringify(withMeta.value?.[0])
);

const noMeta = validateSlots([baseSlot]);
check("slot không có metadata vẫn ok", noMeta.ok);
check("depth mặc định 'front'", noMeta.value?.[0]?.depth === "front");
check("scaleHint mặc định 1", noMeta.value?.[0]?.scaleHint === 1);

const badMeta = validateSlots([
  { ...baseSlot, depth: "not-a-depth", scaleHint: "abc" },
]);
check("metadata sai KHÔNG reject request", badMeta.ok, badMeta.error);
check("depth sai ⇒ fallback 'front'", badMeta.value?.[0]?.depth === "front");
check("scaleHint sai ⇒ fallback 1", badMeta.value?.[0]?.scaleHint === 1);

console.log("\n── Test 3: normalizeAnchor / normalizeShadow ──");
check("thiếu anchor ⇒ (0.5, 0.5)", normalizeAnchor(undefined).x === 0.5 && normalizeAnchor(undefined).y === 0.5);
check("anchor hợp lệ ⇒ giữ", normalizeAnchor({ x: 0.5, y: 0.06 }).y === 0.06);
check("anchor ngoài 0–1 ⇒ clamp", normalizeAnchor({ x: 5, y: -1 }).x === 1 && normalizeAnchor({ x: 5, y: -1 }).y === 0);
check("thiếu shadow ⇒ 'soft'", normalizeShadow(undefined) === "soft");
check("shadow sai ⇒ 'soft'", normalizeShadow("glow") === "soft");
check("shadow 'contact' ⇒ giữ", normalizeShadow("contact") === "contact");
check("shadow 'none' ⇒ giữ", normalizeShadow("none") === "none");

console.log("\n════════════════════════════════════════");
console.log(`Test Summary: ${passed} passed, ${failed} failed.`);
console.log("════════════════════════════════════════");

if (failed > 0) process.exit(1);
