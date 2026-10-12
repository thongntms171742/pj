import mongoose, { Schema, Document, Types } from "mongoose";

// ── Tree variant (Shopee-style SKU) ──────────────────────────────────────────
// ⚠️ Despite the name, this model is NOT the product — it is the tầng 3
// (variant/SKU) of the 3-tier catalog. See TreeProduct.ts and TreeCode.ts.
//
// Tier 1: TreeProduct  — sản phẩm CHA (ảnh, mô tả) — KHÔNG có giá
// Tier 2: TreeCode     — mã cây / phân loại 1 (màu, chất liệu) — KHÔNG có giá
// Tier 3: Tree (here)  — SKU = (code × size) — CÓ giá + tồn kho
//
// Mỗi variant có:
//   - size (S/M/L/XL — string tự do; controller fallback "STANDARD" nếu FE
//     không gửi. `size` KHÔNG bị ràng buộc vào enum.)
//   - price (VND)
//   - stockQuantity (tồn kho)
//   - sku (mã nội bộ duy nhất toàn hệ thống)
//   - heightCmMin/Max, diameterCm (kích thước vật lý)
//   - bareImage (ảnh riêng cho size này — nếu khác nhau giữa các size)
//   - isActive: false = ngừng bán (giữ lại để OrderItem tham chiếu)
//
// Quan hệ:
//   TreeCode 1 ──< TreeVariant N

/**
 * Kích thước cây. Đây KHÔNG phải enum đóng — mọi chuỗi đều hợp lệ vì mỗi mã
 * cây (TreeCode) có thể có bộ size riêng. Giá trị mặc định khi FE không gửi
 * size là "STANDARD" (xem createTreeVariant).
 */
export type TreeSize = "S" | "M" | "L" | "XL" | (string & {});

export interface ITree extends Document {
  productId: Types.ObjectId;
  codeId: Types.ObjectId;
  size: TreeSize;
  sku: string;             // mã SKU nội bộ, unique
  name: string;            // tên hiển thị (auto: "{product} — {code} — {size}")
  heightCmMin: number;
  heightCmMax: number;
  diameterCm: number;
  description: string;
  images: string[];        // ảnh bổ sung
  bareImage: string;       // ảnh cây trơn (không trang trí)
  price: number;
  costPrice?: number; // Giá vốn nội bộ; chỉ admin được xem/quản lý
  stockQuantity: number;
  isActive: boolean;
  sortOrder: number;
}

const TreeSchema = new Schema<ITree>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: "TreeProduct",
      required: true,
      index: true,
    },
    codeId: {
      type: Schema.Types.ObjectId,
      ref: "TreeCode",
      required: true,
      index: true,
    },
    size: { type: String, required: true, trim: true },
    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    name: { type: String, required: true, trim: true },
    heightCmMin: { type: Number, required: true, min: 0 },
    heightCmMax: { type: Number, required: true, min: 0 },
    diameterCm: { type: Number, required: true, min: 0 },
    description: { type: String, default: "" },
    images: { type: [String], default: [] },
    bareImage: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    costPrice: { type: Number, min: 0, default: undefined },
    stockQuantity: { type: Number, required: true, min: 0, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Mỗi (code, size) chỉ tồn tại 1 variant.
TreeSchema.index({ codeId: 1, size: 1 }, { unique: true });
TreeSchema.index({ productId: 1, isActive: 1, sortOrder: 1 });

export const Tree = mongoose.model<ITree>("Tree", TreeSchema);
