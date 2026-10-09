import mongoose, { Schema, Document } from "mongoose";

// ── Tree product (Shopee-style parent) ──────────────────────────────────────
// Sản phẩm CHA — chỉ chứa thông tin chung, KHÔNG chứa giá / tồn kho.
// Cấu trúc 3 cấp: TreeProduct → TreeCode (mã cây) → TreeVariant (size)
//
// 1 Product = 1 cây thông vật lý tên "Cây thông Noel trang trí"
// 1 Product có N mã (vd: Xanh truyền thống, Phủ tuyết, Đèn LED)
// 1 Mã có M size (vd: S, M, L, XL — không bắt buộc đồng đều)
// → Tổng SKU = Σ (size per code) — có thể khác nhau giữa các mã.
//
// Customer nhìn thấy 1 sản phẩm → chọn mã → chọn size → add giỏ hàng.

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
