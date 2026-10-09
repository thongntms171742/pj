import mongoose, { Schema, Document, Types } from "mongoose";

// ── Build Your Christmas: tree size variants ─────────────────────────────────
//
// Tree documents are now CHILD variants of a TreeProduct family (e.g.
// "Cây thông Noel Mây Xanh"). One document = one (productId, size) pair.
//
// Collection name remains "trees" to preserve:
//
//   1. Snapshot compatibility — historical OrderItems keep tree._id refs
//      resolving without a data migration.
//   2. Design compatibility — TreeDesign.config.treeId continues to point
//      to a trees-collection document, but that document now represents
//      a specific size variant (not a whole product).
//   3. Admin tooling — admin can still soft-delete / edit a single size
//      without affecting siblings (when productId is null/legacy).
//
// New admin flow (Shopee-style):
//   - Create TreeProduct (parent): name, material, description, cover image
//   - Within product, list Tree variants per size (S/M/L): price, stock,
//     height, ảnh riêng
//   - Catalog API returns [{ product: {...}, variants: [...] }]
//   - Migration: existing 3 trees (one per size, no productId) are
//     backfilled into a single TreeProduct via migrate-tree-products.ts

export type TreeSize = "S" | "M" | "L";

export interface ITree extends Document {
  productId: Types.ObjectId | null; // null = legacy pre-migration variant
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
// Within a product, only one variant per size. Legacy variants (productId
// = null) keep the old behavior of unique size.
TreeSchema.index(
  { productId: 1, size: 1 },
  {
    unique: true,
    partialFilterExpression: { productId: { $type: "objectId" } },
  }
);

export const Tree = mongoose.model<ITree>("Tree", TreeSchema);
