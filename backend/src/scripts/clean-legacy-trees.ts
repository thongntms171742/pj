import mongoose from "mongoose";
import * as dotenv from "dotenv";
import { TreeProduct } from "../models/TreeProduct";
import { TreeCode } from "../models/TreeCode";
import { Tree } from "../models/Tree";

dotenv.config();

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required in .env");
  if (/thriftit/i.test(uri)) throw new Error("Refusing to operate on legacy thriftit database");

  await mongoose.connect(uri);
  console.log("[clean-trees] Connected to MongoDB.");

  const isResetAll = process.argv.includes("--all");

  if (isResetAll) {
    // Xóa sạch toàn bộ sản phẩm cây ở cả 3 tầng để nạp lại mới
    console.log("[clean-trees] Mode: RESET ALL 3-TIER TREE DATA");
    const delTrees = await Tree.deleteMany({});
    const delCodes = await TreeCode.deleteMany({});
    const delProducts = await TreeProduct.deleteMany({});

    console.log(`  - Đã xóa ${delTrees.deletedCount} biến thể (Tree / Tier 3)`);
    console.log(`  - Đã xóa ${delCodes.deletedCount} mã cây (TreeCode / Tier 2)`);
    console.log(`  - Đã xóa ${delProducts.deletedCount} sản phẩm cha (TreeProduct / Tier 1)`);
    console.log("[clean-trees] Dữ liệu Cây đã được làm sạch hoàn toàn!");
  } else {
    // Mặc định: Chỉ quét và xóa các sản phẩm cũ mồ côi (không thuộc chuẩn 3 tầng)
    console.log("[clean-trees] Mode: PRUNE LEGACY & ORPHANED TREES");

    // 1. Xóa các Tree không có productId hoặc không có codeId (cũ từ đợt flat list)
    const legacyTrees = await Tree.deleteMany({
      $or: [
        { productId: { $exists: false } },
        { productId: null },
        { codeId: { $exists: false } },
        { codeId: null },
      ],
    });
    console.log(`  - Đã xóa ${legacyTrees.deletedCount} cây cũ (không gắn productId / codeId)`);

    // 2. Xóa các Tree trỏ tới productId hoặc codeId không còn tồn tại
    const validProductIds = (await TreeProduct.find({}, "_id")).map((p) => p._id);
    const validCodeIds = (await TreeCode.find({}, "_id")).map((c) => c._id);

    const orphanedTrees = await Tree.deleteMany({
      $or: [
        { productId: { $nin: validProductIds } },
        { codeId: { $nin: validCodeIds } },
      ],
    });
    console.log(`  - Đã xóa ${orphanedTrees.deletedCount} cây mồ côi (productId hoặc codeId không tồn tại)`);

    // 3. Xóa các TreeCode trỏ tới productId không tồn tại
    const orphanedCodes = await TreeCode.deleteMany({
      productId: { $nin: validProductIds },
    });
    console.log(`  - Đã xóa ${orphanedCodes.deletedCount} mã cây mồ côi (productId không tồn tại)`);
  }

  // Thống kê số lượng còn lại
  const countP = await TreeProduct.countDocuments();
  const countC = await TreeCode.countDocuments();
  const countT = await Tree.countDocuments();
  console.log(`\n[clean-trees] Thống kê hiện tại trong DB:`);
  console.log(`  - TreeProduct (Tier 1): ${countP}`);
  console.log(`  - TreeCode    (Tier 2): ${countC}`);
  console.log(`  - Tree/Variant (Tier 3): ${countT}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[clean-trees] Lỗi:", err);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
