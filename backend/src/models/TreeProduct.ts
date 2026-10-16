import mongoose, { Schema, Document } from "mongoose";

// ── Tree product (Shopee-style parent) — TẦNG 1 ──────────────────────────────
// Sản phẩm CHA — chỉ chứa thông tin chung, KHÔNG chứa giá / tồn kho.
//
// ⚠️ Cấu trúc 3 tầng, đọc theo thứ tự: TreeProduct → TreeCode → Tree.
//   Tier 1: TreeProduct (file này)  — tên, ảnh, mô tả chung
//   Tier 2: TreeCode                — mã cây / phân loại 1 (màu, chất liệu)
//   Tier 3: Tree                   — SKU = code × size, CÓ giá + tồn kho
//
//   1 Product = 1 cây thông vật lý tên "Cây thông Noel trang trí"
//   1 Product có N mã (vd: Xanh truyền thống, Phủ tuyết, Đèn LED)
//   1 Mã có M size (vd: S, M, L, XL — không bắt buộc đồng đều)
//   → Tổng SKU = Σ (size per code) — có thể khác nhau giữa các mã.
//
// Customer nhắc 1 sản phẩm → chọn mã → chọn size → add giỏ hàng.
// Admin tạo sản phẩm qua 3 request tuần tự (xem controllers/admin/treeProducts.ts).

export interface ITreeProduct extends Document {
  name: string;
  slug: string;
  category: string; // vd "Cây thông Noel"
  density: string;
  description: string;
  coverImage: string;
  images: string[];
  aspectRatio?: "1:1" | "3:4" | string;
  videoUrl?: string;
  ratingAverage?: number;
  reviewCount?: number;
  isActive: boolean;
  sortOrder: number;
}

const TreeProductSchema = new Schema<ITreeProduct>(
  {
    name: { type: String, required: true, trim: true, index: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    category: { type: String, default: "Cây thông Noel" },
    density: { type: String, required: true, default: "standard" },
    description: { type: String, default: "" },
    coverImage: { type: String, default: "" },
    images: { type: [String], default: [] },
    aspectRatio: { type: String, enum: ["1:1", "3:4"], default: "1:1" },
    videoUrl: { type: String, default: "" },
    ratingAverage: { type: Number, default: 5 },
    reviewCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

TreeProductSchema.index({ isActive: 1, sortOrder: 1, name: 1 });

export const TreeProduct = mongoose.model<ITreeProduct>(
  "TreeProduct",
  TreeProductSchema
);
