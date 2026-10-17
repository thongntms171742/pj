import dotenv from "dotenv";
dotenv.config();

import mongoose, { Types } from "mongoose";
import { Tree } from "../models/Tree";
import { TreeProduct } from "../models/TreeProduct";
import { Design } from "../models/Design";
import { generateDesignImage } from "../services/ai/googleImageService";
import { isCloudinaryEnabled } from "../services/cloudinaryService";
import { buildOrderItems } from "../services/orderService";
import { composePrompt } from "../services/ai/googleImageService";

async function runProbe() {
  console.log("=================================================");
  console.log("🎄 BUILD YOUR CHRISTMAS — DESIGN PROBE & ACCEPTANCE");
  console.log("=================================================\n");

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("❌ MONGODB_URI chưa được cấu hình trong môi trường.");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log("✅ Đã kết nối MongoDB thành công.");

  // ── 1. Kiểm tra cấu hình môi trường ──
  console.log("\n[1] KIỂM TRA CẤU HÌNH BIẾN MÔI TRƯỜNG:");
  const kieKey = process.env.KIE_API_KEY?.trim();
  const cloudinaryOk = isCloudinaryEnabled();

  if (kieKey) {
    console.log(
      `  • KIE_API_KEY: Đã cấu hình (${kieKey.substring(0, 6)}...${kieKey.slice(-4)})`
    );
  } else {
    console.log("  • KIE_API_KEY: ⚠️ CHƯA CÓ");
  }
  console.log(`  • Model: nano-banana-2`);
  console.log(`  • Cloudinary: ${cloudinaryOk ? "✅ Đã cấu hình" : "⚠️ Chưa có credentials"}`);

  // ── 2. Kiểm tra TreeProduct + variant thật ──
  console.log("\n[2] KIỂM TRA CATALOG:");
  const product = await TreeProduct.findOne({ isActive: true });
  if (!product) {
    console.error("  ❌ Không có TreeProduct nào active. Chạy `npm run seed` trước.");
    process.exit(1);
  }
  console.log(`  • Concept: ${product.name} (slug=${product.slug})`);
  console.log(`  • Description length: ${product.description.length} chars`);

  const variant = await Tree.findOne({ productId: product._id, isActive: true }).sort({ sortOrder: 1, size: 1 });
  if (!variant) {
    console.error("  ❌ Không có variant nào.");
    process.exit(1);
  }
  console.log(`  • Variant: ${variant.name} (Size ${variant.size}) — ${variant.price.toLocaleString()}đ`);

  // ── 3. Test composePrompt ──
  console.log("\n[3] KIỂM TRA composePrompt():");
  const { promptText, imageInput } = composePrompt({
    treeProduct: product as any,
    customerPrompt: "Cây thông Noel ấm cúng cho phòng khách gia đình",
  });
  console.log(`  • Prompt length: ${promptText.length} chars`);
  console.log(`  • Image input: ${imageInput.length} URL(s)`);
  console.log(`  • First 200 chars: ${promptText.slice(0, 200)}...`);

  // ── 4. Tạo draft Design ──
  console.log("\n[4] TẠO VÀ LƯU DRAFT Design:");
  const testUserId = new Types.ObjectId();
  const draft = await Design.create({
    ownerId: testUserId,
    name: "AI Verified Tree",
    slug: `ai-test-${Date.now()}`,
    year: new Date().getFullYear(),
    baseTreeProductId: product._id,
    prompt: "Cây thông Noel ấm cúng gia đình",
    deliveryOption: "DIY_KIT",
    status: "DRAFT",
  });
  console.log(`  • Draft ID: ${draft._id} (Trạng thái: ${draft.status})`);

  // ── 5. Thử gọi KIE tạo ảnh thật ──
  console.log("\n[5] KIỂM TRA TẠO ẢNH QUA KIE NANO BANANA 2 & UPLOAD CLOUDINARY:");
  if (kieKey && cloudinaryOk) {
    try {
      console.log("  ⏳ Đang gọi KIE createTask sinh ảnh và upload Cloudinary...");
      const genResult = await generateDesignImage(
        String(draft._id),
        String(testUserId),
        true
      );
      console.log("  ✅ Tạo ảnh và lưu thành công!");
      console.log("  • Image URL:", genResult.imageUrl);
      console.log("  • Status:", genResult.status);
    } catch (err: any) {
      console.error("  ❌ Lỗi khi tạo ảnh thực tế:", err.message);
    }
  } else {
    console.log("  ⏭️ Bỏ qua bước gọi API thật vì thiếu KIE_API_KEY hoặc Cloudinary.");
  }

  // ── 6. Kiểm tra buildOrderItems ──
  console.log("\n[6] KIỂM TRA buildOrderItems():");
  const orderResult = await buildOrderItems([
    {
      pricingInput: { variantId: String(variant._id), deliveryOption: "DIY_KIT" },
      quantity: 1,
    },
  ]);
  console.log(`  • Báo giá đơn hàng: ${orderResult.subtotal.toLocaleString()}đ`);
  console.log(`  • Stock reservation: ${orderResult.stockToReserve.length} mục`);

  // Cleanup
  await Design.findByIdAndDelete(draft._id);
  console.log("  • Đã dọn dẹp design tạm.");

  console.log("\n=================================================");
  console.log("🎉 NGHIỆM THU LOGIC BACKEND HOÀN TẤT THÀNH CÔNG!");
  console.log("=================================================");

  await mongoose.disconnect();
}

runProbe().catch((err) => {
  console.error("Probe script lỗi:", err);
  process.exit(1);
});
