import mongoose, { Schema, Document, Types } from "mongoose";
import type { DeliveryOption } from "./TreeDesign";

export type AIDesignStatus = "DRAFT" | "GENERATING" | "COMPLETED" | "FAILED";

export interface AIDesignAccessoryItem {
  accessoryId: Types.ObjectId;
  quantity: number;
  personalizationText?: string;
}

export interface AIDesignPreferences {
  theme?: string;
  budgetMax?: number;
  spaceSize?: "S" | "M" | "L" | "XL" | string;
  styleCode?: string;
  personalizationText?: string;
  notes?: string;
}

export interface AIDesignPricingSnapshot {
  treePrice: number;
  accessoriesTotal: number;
  decorationFee: number;
  shippingFee: number;
  totalSalePrice: number;
  totalCostPrice?: number;
  expectedGrossProfit?: number;
}

export interface IAIDesign extends Document {
  ownerId: Types.ObjectId | null;
  prompt: string;
  preferences: AIDesignPreferences;
  variantId: Types.ObjectId;
  styleId: Types.ObjectId | null;
  accessories: AIDesignAccessoryItem[];
  deliveryOption: DeliveryOption;
  imageUrl: string;
  imagePublicId: string;
  pricingSnapshot: AIDesignPricingSnapshot;
  status: AIDesignStatus;
  lastError: string | null;
  convertedToTreeDesignId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const AIDesignSchema = new Schema<IAIDesign>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    prompt: {
      type: String,
      trim: true,
      default: "",
    },
    preferences: {
      theme: { type: String, default: "" },
      budgetMax: { type: Number, default: 0 },
      spaceSize: { type: String, default: "" },
      styleCode: { type: String, default: "" },
      personalizationText: { type: String, default: "" },
      notes: { type: String, default: "" },
    },
    variantId: {
      type: Schema.Types.ObjectId,
      ref: "Tree",
      required: true,
      index: true,
    },
    styleId: {
      type: Schema.Types.ObjectId,
      ref: "Style",
      default: null,
    },
    accessories: [
      {
        _id: false,
        accessoryId: {
          type: Schema.Types.ObjectId,
          ref: "Accessory",
          required: true,
        },
        quantity: { type: Number, required: true, min: 1, default: 1 },
        personalizationText: { type: String, default: "" },
      },
    ],
    deliveryOption: {
      type: String,
      enum: ["READY_TO_DISPLAY", "DIY_KIT", "SEPARATE"],
      default: "DIY_KIT",
    },
    imageUrl: {
      type: String,
      trim: true,
      default: "",
    },
    imagePublicId: {
      type: String,
      trim: true,
      default: "",
    },
    pricingSnapshot: {
      treePrice: { type: Number, default: 0 },
      accessoriesTotal: { type: Number, default: 0 },
      decorationFee: { type: Number, default: 0 },
      shippingFee: { type: Number, default: 0 },
      totalSalePrice: { type: Number, default: 0 },
      totalCostPrice: { type: Number, default: 0 },
      expectedGrossProfit: { type: Number, default: 0 },
    },
    status: {
      type: String,
      enum: ["DRAFT", "GENERATING", "COMPLETED", "FAILED"],
      default: "DRAFT",
      index: true,
    },
    lastError: {
      type: String,
      default: null,
    },
    convertedToTreeDesignId: {
      type: Schema.Types.ObjectId,
      ref: "TreeDesign",
      default: null,
    },
  },
  { timestamps: true }
);

AIDesignSchema.index({ ownerId: 1, createdAt: -1 });

export const AIDesign = mongoose.model<IAIDesign>("AIDesign", AIDesignSchema);
