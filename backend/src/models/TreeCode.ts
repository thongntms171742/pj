import mongoose, { Schema, Document, Types } from "mongoose";

// ── Tree code / Mã cây (Shopee-style Phân loại 1) ──────────────────────────
// Một "Mã cây" đại diện cho 1 mẫu cây / variant lớn của cùng 1 sản phẩm cha.
//
// Ví dụ: Sản phẩm "Cây thông Noel trang trí"
//   - Mã 1: Xanh truyền thống (image, material, sortOrder riêng)
//   - Mã 2: Phủ tuyết
//   - Mã 3: Đèn LED đa sắc
//
// Mỗi mã có nhiều size (S, M, L, XL...) — 1 mã không bắt buộc phải có
// cùng size với mã khác. Mã có ảnh riêng, thứ tự hiển thị riêng.
//
// Quan hệ:
//   TreeProduct 1 ──< TreeCode N ──< TreeVariant N (size)
//
// TreeCode KHÔNG chứa giá / tồn kho — đó là việc của TreeVariant.

export interface ITreeCode extends Document {
  productId: Types.ObjectId;
  code: string;        // mã nội bộ, vd "TREE-GREEN", "TREE-SNOW"
  name: string;        // tên hiển thị, vd "Xanh truyền thống"
  description: string;
  image: string;       // ảnh đại diện cho mã
  material: string;    // chất liệu lá, vd "PVC xanh", "PVC phủ bạc"
  isActive: boolean;
  sortOrder: number;
}

const TreeCodeSchema = new Schema<ITreeCode>(
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
TreeCodeSchema.index({ productId: 1, code: 1 }, { unique: true });
TreeCodeSchema.index({ productId: 1, isActive: 1, sortOrder: 1 });

export const TreeCode = mongoose.model<ITreeCode>("TreeCode", TreeCodeSchema);
