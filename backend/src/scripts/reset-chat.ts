/**
 * reset-chat.ts
 *
 * Script reset dữ liệu chat cũ (clean, không migration):
 *  - Xóa toàn bộ messages & conversations cũ.
 *  - Tạo lại các indexes chuẩn cho Conversation & Message.
 *  - Seed 1 conversation mẫu channel: "SUPPORT" cho admin nếu chưa có.
 *
 * Usage:
 *   npx ts-node src/scripts/reset-chat.ts [--dry-run]
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { Conversation } from "../models/Conversation";
import { Message } from "../models/Message";
import { User } from "../models/User";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI is not set in .env");
  process.exit(1);
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run");

  console.log(`[reset-chat] Mode: ${isDryRun ? "DRY-RUN (Xem trước, không thay đổi DB)" : "EXECUTE (Xóa và tạo mới)"}`);
  console.log("[reset-chat] Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI as string);
  console.log("[reset-chat] Connected successfully.");

  const msgCount = await Message.countDocuments();
  const convCount = await Conversation.countDocuments();

  console.log(`[reset-chat] Thống kê hiện tại:`);
  console.log(`  - Messages:      ${msgCount} documents`);
  console.log(`  - Conversations: ${convCount} documents`);

  if (isDryRun) {
    console.log(`[reset-chat] [DRY-RUN] Sẽ xóa ${msgCount} tin nhắn và ${convCount} hội thoại.`);
    await mongoose.disconnect();
    console.log("[reset-chat] Kết thúc chế độ dry-run.");
    return;
  }

  // 1. Drop collections
  console.log("[reset-chat] Đang xóa toàn bộ messages & conversations...");
  await Message.deleteMany({});
  await Conversation.deleteMany({});
  console.log("✅ Đã xóa sạch collections messages và conversations.");

  // 2. Re-create indexes
  console.log("[reset-chat] Đang đồng bộ và khởi tạo lại indexes...");
  await Conversation.syncIndexes();
  await Message.syncIndexes();
  console.log("✅ Đồng bộ indexes thành công.");

  // 3. Seed 1 conversation channel "SUPPORT" cho admin nếu có admin
  const admin =
    (await User.findOne({ email: "admin@buildyourchristmas.vn" }).select("_id name").lean()) ||
    (await User.findOne({ roles: "admin" }).select("_id name").lean());

  if (admin) {
    console.log(`[reset-chat] Tìm thấy admin: ${admin.name} (${admin._id})`);
    const seedConv = await Conversation.create({
      channel: "SUPPORT",
      status: "RESOLVED",
      participants: [
        {
          userId: String(admin._id),
          role: "admin",
          lastReadAt: new Date(),
        },
      ],
      customerInfo: {
        name: "Hệ thống hỗ trợ",
        email: "support@buildyourchristmas.vn",
      },
      summary: "Phiên hội thoại hỗ trợ mẫu của hệ thống",
      lastMessage: "Chào mừng bạn đến với kênh hỗ trợ trực tuyến Build Your Christmas!",
      lastMessageSenderType: "SYSTEM",
      lastMessageAt: new Date(),
      tags: ["system_seed"],
    });

    await Message.create({
      conversationId: seedConv._id,
      sender: {
        type: "SYSTEM",
        name: "Hệ thống",
      },
      content: "Chào mừng bạn đến với kênh hỗ trợ trực tuyến Build Your Christmas!",
      metadata: { action: "SEED_INIT" },
    });

    console.log(`✅ Đã seed 1 hội thoại SUPPORT mẫu (ID: ${seedConv._id}).`);
  } else {
    console.log("ℹ️ Chưa có tài khoản admin trong DB, bỏ qua bước seed.");
  }

  await mongoose.disconnect();
  console.log("[reset-chat] Hoàn tất! DB chat đã sẵn sàng cho kiến trúc mới.");
}

main().catch(async (err) => {
  console.error("❌ [reset-chat] Lỗi:", err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
