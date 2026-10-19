// ── Unit tests cho RoomDesign model + composePrompt ─────────────────────────
// Pure tests, không cần DB. Sau refactor: RoomDesign thay cho Design cũ.

import { Types } from "mongoose";
import { Design, type IRoomDesign } from "../models/Design";
import {
  composeRoomPrompt,
  composeCardPrompt,
} from "../services/ai/googleImageService";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`PASS: ${msg}`);
    passed++;
  } else {
    console.error(`FAIL: ${msg}`);
    failed++;
  }
}

async function runTests() {
  console.log("── Test 1: RoomDesign model defaults ──");
  const dummyVariantId = new Types.ObjectId();
  const doc = new Design({
    treeVariantId: dummyVariantId,
    name: "Test Room",
  });

  assert(doc.status === "DRAFT", "Initial status defaults to DRAFT");
  assert(
    doc.deliveryOption === "READY_TO_DISPLAY",
    "Default deliveryOption is READY_TO_DISPLAY"
  );
  assert(doc.prompt === "", "Default prompt is empty string");
  assert(doc.roomImageUrl === "", "Default roomImageUrl is empty string");
  assert(doc.resultImageUrl === "", "Default resultImageUrl is empty string");
  assert(doc.lastError === null, "Default lastError is null");

  console.log("\n── Test 2: Status enum ──");
  const validStatuses = ["DRAFT", "AI_PENDING", "AI_COMPLETED", "FAILED"];
  for (const s of validStatuses) {
    doc.status = s as any;
    assert(doc.status === s, `Can set status=${s}`);
  }

  console.log("\n── Test 3: composeRoomPrompt() ──");
  const composed = composeRoomPrompt({
    treeName: "Cây Yêu Thương",
    treeSize: "M",
    treeDescription: "Cây tùng Noel với nơ nhung đỏ và bông tuyết trắng.",
    customerPrompt: "Ấm cúng cho phòng khách",
    roomImageUrl: "https://res.cloudinary.com/demo/room.jpg",
    treeReferenceUrl: "https://res.cloudinary.com/demo/tree.jpg",
  });
  assert(typeof composed.promptText === "string", "promptText is string");
  assert(
    composed.promptText.length > 100,
    "promptText có độ dài hợp lý"
  );
  assert(
    composed.promptText.includes("Cây Yêu Thương"),
    "prompt chứa tên cây"
  );
  assert(
    composed.promptText.includes("Ấm cúng cho phòng khách"),
    "prompt chứa customer request"
  );
  assert(
    composed.promptText.includes("Cây tùng Noel"),
    "prompt chứa tree description"
  );
  assert(Array.isArray(composed.imageInput), "imageInput là mảng");
  assert(
    composed.imageInput.length === 2,
    "imageInput có 2 ảnh (room + tree reference)"
  );
  assert(
    composed.imageInput[0] === "https://res.cloudinary.com/demo/room.jpg",
    "imageInput[0] = roomImageUrl"
  );

  console.log("\n── Test 4: composeRoomPrompt() không có customerPrompt ──");
  const composed2 = composeRoomPrompt({
    treeName: "Cây Lộc Phúc",
    treeSize: "L",
    treeDescription: "Cây thông cao cấp.",
    roomImageUrl: "https://res.cloudinary.com/demo/room2.jpg",
  });
  assert(
    composed2.promptText.includes("No additional request"),
    "có placeholder khi không có prompt"
  );
  assert(composed2.imageInput.length === 1, "chỉ 1 ảnh (room) khi không có tree reference");

  console.log("\n── Test 5: composeRoomPrompt() thiếu roomImageUrl ──");
  const noImage = composeRoomPrompt({
    treeName: "Cây",
    treeSize: "S",
    treeDescription: "Cây nhỏ",
    roomImageUrl: "",
  });
  assert(noImage.imageInput.length === 0, "imageInput rỗng khi không có room image");

  console.log("\n── Test 6: composeCardPrompt() ──");
  const card = composeCardPrompt({
    title: "Merry Christmas",
    body: "Chúc bạn Giáng Sinh an lành",
    style: "classic",
  });
  assert(typeof card.promptText === "string", "card promptText is string");
  assert(card.promptText.includes("Merry Christmas"), "prompt chứa title");
  assert(
    card.promptText.includes("Chúc bạn Giáng Sinh an lành"),
    "prompt chứa body"
  );
  assert(card.promptText.includes("Traditional"), "classic style hint");
  assert(card.aspectRatio === "3:4", "aspect ratio = 3:4");

  console.log("\n── Test 7: composeCardPrompt() modern style ──");
  const card2 = composeCardPrompt({
    title: "Happy New Year",
    body: "Chúc năm mới",
    style: "modern",
  });
  assert(card2.promptText.includes("Minimalist"), "modern style hint");

  console.log(`\n========================================`);
  console.log(`RoomDesign Test Summary: ${passed} passed, ${failed} failed.`);
  console.log(`========================================`);

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
