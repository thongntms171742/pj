/**
 * rebuild-last-messages.ts — khôi phục 1 tin nhắn cho mỗi conversation dựa
 * trên trường `lastMessage` (vẫn còn nguyên trong DB).
 *
 * Bối cảnh: trong lúc dọn dữ liệu test, script cleanup đã xoá nhầm toàn bộ
 * collection `messages`. Mọi conversation vẫn giữ `lastMessage` (nội dung tin
 * cuối) + `lastMessageSenderType` + `lastMessageAt` ⇒ dựng lại đúng 1 tin
 * cho mỗi hội thoại mà KHÔNG bịa thêm nội dung nào.
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import { Conversation } from "../models/Conversation";
import { Message } from "../models/Message";

dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);

  const convs = await Conversation.find({
    lastMessage: { $exists: true, $nin: [null, ""] },
  }).lean();

  console.log(`[rebuild] conversations with lastMessage: ${convs.length}`);

  let created = 0;
  for (const conv of convs) {
    const exists = await Message.findOne({
      conversationId: conv._id,
      content: conv.lastMessage,
    });
    if (exists) continue;

    const type = (conv as any).lastMessageSenderType || "BOT";
    const senderName =
      type === "ADMIN" ? "Tư vấn viên" : type === "SYSTEM" ? "Hệ thống" : "Trợ lý AI";

    await Message.create({
      conversationId: conv._id,
      sender: { type, name: senderName },
      content: conv.lastMessage,
      metadata: { action: "REBUILT_FROM_LAST_MESSAGE" },
      createdAt: (conv as any).lastMessageAt || conv.updatedAt || conv.createdAt,
    });
    created += 1;
  }

  console.log(`[rebuild] created ${created} messages.`);
  console.log(`[rebuild] total messages now: ${await Message.countDocuments()}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
