import mongoose, { Schema, Document } from "mongoose";
import type { StyleCode } from "./Style";
import type { TreeSize } from "./Tree";

// ── Accessory SKU (one decoration item) ──────────────────────────────────────
// Accessories belong to one of: LIGHT_STRING, BOW, STOCKING, STAR,
// BELL, BAUBLE, CANDY, FIGURINE, NAME_TAG, NAME_ORNAMENT. The `group` field
// rolls the type into a coarse bucket (LIGHTS / ORNAMENT / DECOR / PERSONAL)
// that mirrors the editor UI.
//
// styleCodes: list of compatible styles. Empty array means "useable in every
// style". This lets us keep, e.g., gingerbread men exclusive to GINGERBREAD.

export type AccessoryGroup = "LIGHTS" | "ORNAMENT" | "DECOR" | "PERSONAL";

export type AccessoryType =
  | "LIGHT_STRING"
  | "BAUBLE"
  | "BELL"
  | "CANDY"
  | "FIGURINE"
  | "BOW"
  | "STOCKING"
  | "STAR"
  | "NAME_TAG"
  | "NAME_ORNAMENT";

export interface IAccessory extends Document {
  group: AccessoryGroup;
  type: AccessoryType;
  name: string;
  description: string;
  image: string;
  price: number;
  stock: number;
  styleCodes: StyleCode[];
  maxQtyBySize: { S: number; M: number; L: number };
  isPersonalizable: boolean;
  personalizationMaxLength: number;
  productionDays: number;
  isActive: boolean;
  sortOrder: number;
}

const AccessorySchema = new Schema<IAccessory>(
  {
    group: {
      type: String,
      enum: ["LIGHTS", "ORNAMENT", "DECOR", "PERSONAL"],
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "LIGHT_STRING",
        "BAUBLE",
        "BELL",
        "CANDY",
        "FIGURINE",
        "BOW",
        "STOCKING",
        "STAR",
        "NAME_TAG",
        "NAME_ORNAMENT",
      ],
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    image: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    styleCodes: { type: [String], default: [] },
    maxQtyBySize: {
      type: {
        S: { type: Number, required: true, default: 1, min: 1 },
        M: { type: Number, required: true, default: 1, min: 1 },
        L: { type: Number, required: true, default: 1, min: 1 },
      },
      required: true,
      _id: false,
    },
    isPersonalizable: { type: Boolean, default: false },
    personalizationMaxLength: { type: Number, default: 12, min: 1 },
    productionDays: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

AccessorySchema.index({ isActive: 1, group: 1, sortOrder: 1 });
AccessorySchema.index({ isActive: 1, type: 1 });

export const Accessory = mongoose.model<IAccessory>("Accessory", AccessorySchema);