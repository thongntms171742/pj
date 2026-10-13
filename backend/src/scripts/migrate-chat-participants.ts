/**
 * migrate-chat-participants.ts
 *
 * One-time migration to fix existing chat messages that have the
 * literal string "admin" in their `participants` array. After this
 * script runs, admin (the user with role=admin) will be able to
 * auto-join those conversations on socket connect, and the admin
 * inbox (`GET /api/chat/conversations`) will list them.
 *
 * Idempotent: if no docs match, this exits 0.
 *
 * Run with:
 *   npx ts-node src/scripts/migrate-chat-participants.ts
 *   # or
 *   npx tsx src/scripts/migrate-chat-participants.ts
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { User } from "../models/User";
import { Message } from "../models/Message";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI not set in .env");
  process.exit(1);
}

async function main() {
  console.log("[migrate] Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI as string);
  console.log("[migrate] Connected.");

  // Find the admin user's _id
  const admin =
    (await User.findOne({ email: "admin@buildyourchristmas.vn" })
      .select("_id")
      .lean()) ||
    (await User.findOne({ roles: "admin" }).select("_id").lean());
  if (!admin) {
    console.error("[migrate] No admin user found. Aborting.");
    await mongoose.disconnect();
    process.exit(1);
  }
  const adminId = String(admin._id);
  console.log(`[migrate] Admin user _id = ${adminId}`);

  // Count messages that need migrating
  const before = await Message.countDocuments({ participants: "admin" });
  console.log(`[migrate] Found ${before} message(s) with literal "admin" in participants`);

  if (before === 0) {
    console.log("[migrate] Nothing to do. Exiting.");
    await mongoose.disconnect();
    return;
  }

  // Use arrayFilters to swap "admin" → admin ObjectId in the participants array
  const result = await Message.updateMany(
    { participants: "admin" },
    { $set: { "participants.$[elem]": adminId } },
    { arrayFilters: [{ elem: "admin" }] }
  );

  console.log(
    `[migrate] Modified ${result.modifiedCount} document(s). Also fixing conversationId where applicable...`
  );

  // Also fix conversationId that contain literal "admin" (they were built
  // with the legacy constant). Find by conversationId pattern.
  const cBefore = await Message.countDocuments({
    conversationId: { $regex: /^c_[^_]+__admin$/ },
  });
  if (cBefore > 0) {
    // Build the new conversationId by replacing "admin" with the real id
    const convsToFix = await Message.find({
      conversationId: { $regex: /^c_[^_]+__admin$/ },
    })
      .select("_id conversationId")
      .lean();

    for (const m of convsToFix) {
      const newCid = m.conversationId.replace(/__admin$/, `__${adminId}`);
      await Message.updateOne({ _id: m._id }, { $set: { conversationId: newCid } });
    }
    console.log(
      `[migrate] Renamed ${convsToFix.length} conversationId(s) from "..__admin" → "..__<adminId>"`
    );
  }

  // Verify
  const remaining = await Message.countDocuments({ participants: "admin" });
  const oldConv = await Message.countDocuments({
    conversationId: { $regex: /^c_[^_]+__admin$/ },
  });
  console.log(
    `[migrate] Done. Remaining docs with literal 'admin': ${remaining}. Remaining old conversationId format: ${oldConv}.`
  );

  await mongoose.disconnect();
  console.log("[migrate] Disconnected. Exit OK.");
}

main().catch(async (err) => {
  console.error("[migrate] FATAL:", err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
