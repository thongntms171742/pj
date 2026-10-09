import mongoose, { Schema, Document } from "mongoose";

// ── Tree product family (parent) ────────────────────────────────────────────
// A "Cây thông Noel Mây Xanh" is a family. It groups N size variants that
// share the same material/density/description but differ in size, price,
// stock, dimensions.
//
// Following Shopee Seller Centre pattern: 1 parent product groups N
// variants. This avoids data duplication when admin updates material.

export interface ITreeProduct extends Document {
  name: string;
  slug: string;
  material: string;
  density: string;
  description: string;
  coverImage: string;
  images: string[];
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
    material: { type: String, required: true, default: "PVC" },
    density: { type: String, required: true, default: "standard" },
    description: { type: String, default: "" },
    coverImage: { type: String, default: "" },
    images: { type: [String], default: [] },
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
