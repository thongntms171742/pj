import mongoose, { Schema, Document, Types } from "mongoose";

// ── Category / Danh mục (Shopee-style Phân loại 1) — TẦNG 2 ────────────────
// Một "Category" đại diện cho 1 mẫu cây / nhóm phân loại của cùng 1 sản phẩm cha.
//
// ⚠️ Cấu trúc 3 tầng, đọc theo thứ tự: TreeProduct → Category → Tree.
//   Tier 1: TreeProduct — tên, ảnh, mô tả chung
//   Tier 2: Category (file này) — danh mục / phân loại 1
//   Tier 3: Tree        — SKU = category × size, CÓ giá + tồn kho
//
// Ví dụ: Sản phẩm "Cây thông Noel trang trí"
//   - Category 1: Xanh truyền thống (image, material, sortOrder riêng)
//   - Category 2: Phủ tuyết
//   - Category 3: Đèn LED đa sắc
//
// Mỗi category có nhiều size (S, M, L, XL...) — 1 category không bắt buộc
// phải có cùng size với category khác.
//
// Quan hệ:
//   TreeProduct 1 ──< Category N ──< Tree N (size)
//
// Category KHÔNG chứa giá / tồn kho — đó là việc của Tree.
//
// ℹ️ Ghi chú migration: model này dùng TÊN COLLECTION `treecodes` (giữ nguyên
// từ schema cũ) để không mất dữ liệu đã có trên production. Tên collection
// là chi tiết kỹ thuật bên trong DB, FE không cần biết.

export interface ICategory extends Document {
  productId: Types.ObjectId;
  code: string;        // mã nội bộ, vd "C-GREEN", "C-SNOW" (giữ tên field cũ)
  name: string;        // tên hiển thị, vd "Xanh truyền thống"
  description: string;
  image: string;       // ảnh đại diện cho danh mục
  material: string;    // chất liệu lá, vd "PVC xanh", "PVC phủ bạc"
  isActive: boolean;
  sortOrder: number;
}

const CategorySchema = new Schema<ICategory>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: "TreeProduct",
      required: true,
      index: true,
    },
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    image: { type: String, default: "" },
    material: { type: String, default: "" },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Trong cùng 1 product, code phải unique.
CategorySchema.index({ productId: 1, code: 1 }, { unique: true });
CategorySchema.index({ productId: 1, isActive: 1, sortOrder: 1 });

// ⚠️ collection "treecodes": giữ nguyên tên collection cũ để dữ liệu hiện có
// (đã tạo trước khi đổi tên) không bị mất.
export const Category = mongoose.model<ICategory>(
  "Category",
  CategorySchema,
  "treecodes"
);