import mongoose, { Schema, Document, Types } from "mongoose";

// ── Build Your Christmas: tree size variants ─────────────────────────────────
//
// Tree documents are now CHILD variants of a TreeProduct family (e.g.
// "Cây thông Noel"). One document = one (productId, color, size) triple.
//
// 2D Matrix (Shopee-style):
//   - Phân loại 1: Color (Mây Xanh, Tuyết Bạc, Đại Lễ Hội) → maps to material
//   - Phân loại 2: Size (S, M, L)
//   Cartesian product: 3 colors × 3 sizes = 9 variants per product
//
// Collection name remains "trees" to preserve:
//   1. Snapshot compatibility — historical OrderItems keep tree._id refs
//      resolving without a data migration.
//   2. Design compatibility — TreeDesign.config.treeId continues to point
//      to a trees-collection document, but that document now represents
//      a specific (product, color, size) combo (not a whole product).
//
// Admin flow (Shopee-style):
//   - Create TreeProduct (parent): name, description, density, cover image
//   - Admin selects N colors (from a predefined list, maps to material)
//   - For each color: add S/M/L variants → price, stock, height, ảnh riêng
//   - FE renders a matrix: rows = colors, cols = sizes, cells = SKU

export type TreeSize = "S" | "M" | "L";

export type TreeColor =
  | "Mây Xanh"
  | "Tuyết Bạc"
  | "Đại Lễ Hội";

export const TREE_COLORS: TreeColor[] = [
  "Mây Xanh",
  "Tuyết Bạc",
  "Đại Lễ Hội",
];

export interface ITree extends Document {
  productId: Types.ObjectId | null; // null = legacy pre-migration variant
  color: TreeColor | null;           // null = legacy variant (single-color)
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
    // New: parent product (Shopee-style grouping). Optional for backward
    // compat with legacy variants that pre-date the migration.
    productId: {
      type: Schema.Types.ObjectId,
      ref: "TreeProduct",
      default: null,
      index: true,
    },
    // New: color (Phân loại 1 — maps to material). Null for legacy variants.
    color: {
      type: String,
      enum: ["Mây Xanh", "Tuyết Bạc", "Đại Lễ Hội"],
      default: null,
    },
    size: { type: String, enum: ["S", "M", "L"], required: true },
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
// Within a product, only one variant per (color, size). Legacy variants (productId
// = null) keep the old behavior of unique size only.
TreeSchema.index(
  { productId: 1, color: 1, size: 1 },
  {
    unique: true,
    partialFilterExpression: { productId: { $type: "objectId" } },
  }
);

export const Tree = mongoose.model<ITree>("Tree", TreeSchema);
