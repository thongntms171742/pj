import mongoose, { Schema, Document, Types } from "mongoose";
import type { AccessoryType, AccessoryGroup } from "./Accessory";
import type { TreeSize } from "./Tree";

// ── Shared DesignConfig ──────────────────────────────────────────────────────
// Used by TreeDesign.config, CartItem.config, and the snapshot baked into
// OrderItem.tree/style/lines. Keeping one shape across all 3 layers means
// the editor, cart, and order speak the same language.

export type DeliveryOption = "READY_TO_DISPLAY" | "DIY_KIT" | "SEPARATE";

export interface DesignAccessoryEntry {
  accessoryId: Types.ObjectId;
  quantity: number;
  personalizationText?: string;
}

export interface DesignConfig {
  treeId: Types.ObjectId;
  styleId: Types.ObjectId;
  accessories: DesignAccessoryEntry[];
  deliveryOption: DeliveryOption;
}

// Lightweight refs populated when serving a design/cart/order to FE.
export interface ResolvedTreeRef {
  _id: string;
  size: TreeSize;
  name: string;
  price: number;
  bareImage: string;
  unitPrice?: number; // captured for OrderItem; FE often reads `price`
}

export interface ResolvedStyleRef {
  _id: string;
  code: string;
  name: string;
  coverImage: string;
  palette: string[];
}

export interface ResolvedAccessoryRef {
  accessoryId: string;
  name: string;
  type: AccessoryType;
  group: AccessoryGroup;
  image: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  personalizationText?: string;
  isPersonalizable: boolean;
  personalizationMaxLength: number;
  productionDays: number;
}

// ── TreeDesign ───────────────────────────────────────────────────────────────
// ownerId null + isPreset true = ready-made design owned by staff.
// Otherwise it's a customer-created design that can be saved / shared /
// duplicated across years.

export interface ITreeDesign extends Document {
  ownerId: Types.ObjectId | null;
  name: string;
  slug: string;
  year: number;
  config: DesignConfig;
  isPublic: boolean;
  isPreset: boolean;
  duplicatedFrom: Types.ObjectId | null;
  previewImage: string;
}

const TreeDesignSchema = new Schema<ITreeDesign>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    name: { type: String, required: true, trim: true, default: "My Christmas" },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    year: { type: Number, required: true, default: () => new Date().getFullYear() },
    config: {
      treeId: { type: Schema.Types.ObjectId, ref: "Tree", required: true },
      styleId: { type: Schema.Types.ObjectId, ref: "Style", required: true },
      accessories: [
        {
          _id: false,
          accessoryId: {
            type: Schema.Types.ObjectId,
            ref: "Accessory",
            required: true,
          },
          quantity: { type: Number, required: true, min: 1 },
          personalizationText: { type: String, default: "" },
        },
      ],
      deliveryOption: {
        type: String,
        enum: ["READY_TO_DISPLAY", "DIY_KIT", "SEPARATE"],
        required: true,
        default: "READY_TO_DISPLAY",
      },
    },
    isPublic: { type: Boolean, default: true },
    isPreset: { type: Boolean, default: false, index: true },
    duplicatedFrom: {
      type: Schema.Types.ObjectId,
      ref: "TreeDesign",
      default: null,
    },
    previewImage: { type: String, default: "" },
  },
  { timestamps: true }
);

TreeDesignSchema.index({ ownerId: 1, updatedAt: -1 });
TreeDesignSchema.index({ isPreset: 1, year: -1, updatedAt: -1 });

export const TreeDesign = mongoose.model<ITreeDesign>("TreeDesign", TreeDesignSchema);