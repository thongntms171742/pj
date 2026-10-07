import mongoose, { Schema, Document } from "mongoose";

// ── Build Your Christmas: tree base SKUs ─────────────────────────────────────
// Each Tree document represents a single physical SKU (size S/M/L) — the
// base product a customer customizes. A design always sits on top of exactly
// one Tree; accessories are joined to it via the TreeDesign.config.

export type TreeSize = "S" | "M" | "L";

export interface ITree extends Document {
  size: TreeSize;
  name: string;
  heightCmMin: number;
  heightCmMax: number;
  diameterCm: number;
  material: string;
  density: string;
  description: string;
  images: string[];
  bareImage: string;
  price: number;
  stock: number;
  isActive: boolean;
  sortOrder: number;
}

const TreeSchema = new Schema<ITree>(
  {
    size: { type: String, enum: ["S", "M", "L"], required: true, unique: true },
    name: { type: String, required: true, trim: true },
    heightCmMin: { type: Number, required: true, min: 0 },
    heightCmMax: { type: Number, required: true, min: 0 },
    diameterCm: { type: Number, required: true, min: 0 },
    material: { type: String, required: true, default: "PVC" },
    density: { type: String, required: true, default: "standard" },
    description: { type: String, default: "" },
    images: { type: [String], default: [] },
    bareImage: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

TreeSchema.index({ isActive: 1, sortOrder: 1 });

export const Tree = mongoose.model<ITree>("Tree", TreeSchema);