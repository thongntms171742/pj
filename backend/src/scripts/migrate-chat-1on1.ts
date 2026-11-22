/**
 * migrate-chat-1on1.ts — script migrate dữ liệu chat từ Hybrid AI về 1-1 User ↔ Admin.
 *
 * Dùng:
 *   npm run migrate:chat-1on1 -- --dry-run   # Xem trước số lượng bản ghi bị ảnh hưởng
 *   npm run migrate:chat-1on1               # Thực thi migrate 1 lần (idempotent)
 *
 * Việc cần làm sau khi deploy:
 *   1. Conversation có `supportMode` là "ai" | "ai_assisted"
 *      → `supportMode: "waiting_admin"`, `aiConfig.enabled: false`.
 *      (Conversation `human` giữ nguyên kèm `assignedAdminId`).
 *   2. Message có `senderType: "ai"` → `senderType: "system"`.
 *   3. Gỡ field `aiMetadata` trên tất cả Message.
 *   4. Drop collection `handoffrequests` nếu còn tồn tại.
 */

import mongoose from "mongoose";
import * as dotenv from "dotenv";
import { Conversation } from "../models/Conversation";
import { Message } from "../models/Message";

dotenv.config();

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("MONGODB_URI is required in .env");
  if (/thriftit/i.test(uri)) {
    throw new Error("Refusing to operate on legacy thriftit database");
  }

  const dryRun = process.argv.includes("--dry-run");
  await mongoose.connect(uri);
  console.log(`[migrate-chat-1on1] Connected to MongoDB (${dryRun ? "DRY-RUN" : "LIVE"}).`);

  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB connection db handle unavailable");

  // 1. Conversation: ai / ai_assisted → waiting_admin + aiConfig.enabled = false
  const legacyConvFilter = { supportMode: { $in: ["ai", "ai_assisted"] } };
  const legacyConvCount = await Conversation.collection.countDocuments(legacyConvFilter);
  const activeAiFlagCount = await Conversation.collection.countDocuments({
    "aiConfig.enabled": true,
  });

  // 2. Message: senderType "ai" → "system", và $unset aiMetadata
  const legacyMsgCount = await Message.collection.countDocuments({ senderType: "ai" });
  const msgWithAiMetaCount = await Message.collection.countDocuments({
    aiMetadata: { $exists: true },
  });

  // 3. Kiểm tra collection handoffrequests
  const handoffCollections = await db
    .listCollections({ name: "handoffrequests" })
    .toArray();
  const hasHandoffCollection = handoffCollections.length > 0;
  const handoffDocCount = hasHandoffCollection
    ? await db.collection("handoffrequests").countDocuments()
    : 0;

  if (dryRun) {
    console.log("[migrate-chat-1on1] Dry-run summary (chưa ghi DB):");
    console.log(`  - Conversations (ai / ai_assisted → waiting_admin): ${legacyConvCount}`);
    console.log(`  - Conversations có aiConfig.enabled=true: ${activeAiFlagCount}`);
    console.log(`  - Messages (senderType ai → system): ${legacyMsgCount}`);
    console.log(`  - Messages còn field aiMetadata: ${msgWithAiMetaCount}`);
    console.log(
      `  - Collection handoffrequests: ${hasHandoffCollection ? `tồn tại (${handoffDocCount} docs)` : "không tồn tại"}`
    );
    await mongoose.disconnect();
    return;
  }

  const convRes = await Conversation.collection.updateMany(legacyConvFilter, {
    $set: { supportMode: "waiting_admin", "aiConfig.enabled": false },
  });
  const aiFlagRes = await Conversation.collection.updateMany(
    { "aiConfig.enabled": true },
    { $set: { "aiConfig.enabled": false } }
  );

  const msgSenderRes = await Message.collection.updateMany(
    { senderType: "ai" },
    { $set: { senderType: "system" } }
  );
  const msgMetaRes = await Message.collection.updateMany(
    { aiMetadata: { $exists: true } },
    { $unset: { aiMetadata: "" } }
  );

  let droppedHandoff = false;
  if (hasHandoffCollection) {
    await db.dropCollection("handoffrequests");
    droppedHandoff = true;
  }

  console.log("[migrate-chat-1on1] Migration completed:");
  console.log(`  - Conversations chuyển waiting_admin: ${convRes.modifiedCount}`);
  console.log(`  - Conversations tắt aiConfig.enabled: ${aiFlagRes.modifiedCount}`);
  console.log(`  - Messages ai → system: ${msgSenderRes.modifiedCount}`);
  console.log(`  - Messages gỡ aiMetadata: ${msgMetaRes.modifiedCount}`);
  console.log(
    `  - Collection handoffrequests: ${droppedHandoff ? `đã drop (${handoffDocCount} docs)` : "không tồn tại (bỏ qua)"}`
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[migrate-chat-1on1] Lỗi:", err);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
