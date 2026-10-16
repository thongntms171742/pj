import dotenv from "dotenv";
dotenv.config();

import mongoose, { Types } from "mongoose";
import { Tree } from "../models/Tree";
import { Accessory } from "../models/Accessory";
import { AIDesign } from "../models/AIDesign";
import { TreeDesign } from "../models/TreeDesign";
import {
  recommendCatalogSelection,
  createDraftAIDesign,
  hydrateAIDesign,
} from "../services/ai/aiDesignerService";
import {
  generateAIDesignImage,
} from "../services/ai/googleImageService";
import { isCloudinaryEnabled } from "../services/cloudinaryService";
import { buildOrderItems } from "../services/orderService";

async function runProbe() {
  console.log("=================================================");
  console.log("🎄 BUILD YOUR CHRISTMAS — AI DESIGNER PROBE & ACCEPTANCE");
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
    console.log("  • KIE_API_KEY: ⚠️ CHƯA CÓ (Cần điền vào .env hoặc Render để gọi tạo ảnh thật qua KIE Nano Banana 2)");
  }
  console.log(`  • Model: nano-banana-2`);
  console.log(`  • Cloudinary: ${cloudinaryOk ? "✅ Đã cấu hình" : "⚠️ Chưa có credentials"}`);

  // ── 2. Kiểm tra chọn sản phẩm thật từ Catalog ──
  console.log("\n[2] KIỂM TRA RECOMMEND SẢN PHẨM TỪ CATALOG THẬT:");
  const selection = await recommendCatalogSelection({
    prompt: "Cây thông Noel ấm cúng cho phòng khách gia đình",
    preferences: { spaceSize: "M", theme: "Classic" },
  });

  console.log(`  • Cây được chọn: ${selection.variant.name} (Size ${selection.variant.size}) — ${selection.variant.price.toLocaleString()}đ (Tồn kho: ${selection.variant.stockQuantity})`);
  console.log(`  • Concept Style: ${selection.style ? selection.style.name : "Không có"}`);
  console.log(`  • Phụ kiện được chọn: ${selection.accessories.length} loại:`);
  selection.accessories.forEach((a) => {
    console.log(`    - ${a.quantity}x ${a.accessory.name} (${a.accessory.price.toLocaleString()}đ/món)`);
  });
  console.log(`  • Tổng giá bán tạm tính: ${selection.pricing.totalSalePrice.toLocaleString()}đ`);
  console.log(`  • Trạng thái giá vốn: ${selection.pricing.totalCostPrice !== null ? `${selection.pricing.totalCostPrice.toLocaleString()}đ (Lợi nhuận: ${selection.pricing.expectedGrossProfit?.toLocaleString()}đ)` : "Chưa nhập đủ giá vốn (giá trị = null, bảo vệ an toàn)"}`);

  // ── 3. Tạo Draft AIDesign ──
  console.log("\n[3] TẠO VÀ LƯU DRAFT AIDesign:");
  const testUserId = new Types.ObjectId();
  const draft = await createDraftAIDesign({
    ownerId: testUserId,
    prompt: "Cây thông Noel ấm cúng gia đình",
    preferences: { spaceSize: "M" },
    selection,
  });
  console.log(`  • Draft ID: ${draft._id} (Trạng thái: ${draft.status})`);

  // ── 4. Thử nghiệm gọi KIE tạo ảnh thật (nếu có key) ──
  console.log("\n[4] KIỂM TRA TẠO ẢNH QUA KIE NANO BANANA 2 & UPLOAD CLOUDINARY:");
  if (kieKey && cloudinaryOk) {
    try {
      console.log("  ⏳ Đang gọi KIE createTask sinh ảnh và upload Cloudinary...");
      const genResult = await generateAIDesignImage(
        String(draft._id),
        String(testUserId),
        false
      );
      console.log("  ✅ Tạo ảnh và lưu thành công!");
      console.log("  • Image URL:", genResult.imageUrl);
      console.log("  • Status:", genResult.status);
    } catch (err: any) {
      console.error("  ❌ Lỗi khi tạo ảnh thực tế:", err.message);
    }
  } else {
    console.log("  ⏭️ Bỏ qua bước gọi API thật vì thiếu KIE_API_KEY hoặc Cloudinary.");
    console.log("     (Khi thêm KIE_API_KEY vào .env/Render, chạy lại lệnh này sẽ tự động kiểm tra end-to-end)");
  }

  // ── 6. Kiểm tra lưu sang TreeDesign & Tích hợp Mua hàng ──
  console.log("\n[6] KIỂM TRA LƯU THÀNH TreeDesign VÀ CHECKOUT:");
  const slug = `ai-test-${Date.now()}`;
  const treeDesign = await TreeDesign.create({
    ownerId: testUserId,
    name: "AI Verified Tree",
    slug,
    year: new Date().getFullYear(),
    config: {
      variantId: draft.variantId,
      styleId: draft.styleId,
      accessories: draft.accessories,
      deliveryOption: draft.deliveryOption,
    },
    previewImage: draft.imageUrl || "/images/placeholder.jpg",
  });
  console.log(`  • Đã lưu sang TreeDesign: ID ${treeDesign._id} (Slug: ${treeDesign.slug})`);

  // Thử nghiệm luồng buildOrderItems() để xác nhận giá được tính lại từ DB
  const orderResult = await buildOrderItems([
    { designId: String(treeDesign._id), quantity: 1 },
  ]);
  console.log(`  • Báo giá đơn hàng được tính lại từ DB: ${orderResult.subtotal.toLocaleString()}đ`);
  console.log(`  • Danh sách giữ kho (stock reservation): ${orderResult.stockToReserve.length} mục (1 cây + ${orderResult.stockToReserve.length - 1} phụ kiện)`);

  // Dọn dẹp dữ liệu test probe
  await AIDesign.findByIdAndDelete(draft._id);
  await TreeDesign.findByIdAndDelete(treeDesign._id);
  console.log("  • Đã dọn dẹp các tài liệu tạm thử nghiệm.");

  console.log("\n=================================================");
  console.log("🎉 NGHIỆM THU LOGIC BACKEND HOÀN TẤT THÀNH CÔNG!");
  console.log("=================================================");

  await mongoose.disconnect();
}

runProbe().catch((err) => {
  console.error("Probe script lỗi:", err);
  process.exit(1);
});
