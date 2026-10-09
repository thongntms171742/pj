import mongoose, { Schema, Document } from "mongoose";

// ── Tree product family (parent) ────────────────────────────────────────────
// A "Cây thông Noel" is a family. It groups N size variants that
// share the same density/description but differ in color and size.
//
// Following Shopee Seller Centre pattern: 1 parent product groups N
// variants across 2 classification dimensions:
//
//   Phân loại 1: Color (e.g. Mây Xanh, Tuyết Bạc, Đại Lễ Hội)
//   Phân loại 2: Size (S, M, L)
//
// Cartesian product: up to 3 × 3 = 9 variants per product.

export type TreeColor =
  | "Mây Xanh"
  | "Tuyết Bạc"
  | "Đại Lễ Hội";

export const TREE_COLORS: TreeColor[] = [
  "Mây Xanh",
  "Tuyết Bạc",
  "Đại Lễ Hội",
];

export interface ITreeProduct extends Document {
  name: string;
  slug: string;
  density: string;
  description: string;
  coverImage: string;
  images: string[];
  colors: TreeColor[]; // Phân loại 1 — e.g. ["Mây Xanh", "Tuyết Bạc", "Đại Lễ Hội"]
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
    density: { type: String, required: true, default: "standard" },
    description: { type: String, default: "" },
    coverImage: { type: String, default: "" },
    images: { type: [String], default: [] },
    colors: {
      type: [String],
      enum: ["Mây Xanh", "Tuyết Bạc", "Đại Lễ Hội"],
      default: ["Mây Xanh"],
    },
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
