import mongoose, { Schema, Document } from "mongoose";

export interface IBanner extends Document {
  title: string;
  subtitle?: string;
  imageUrl: string;
  linkUrl: string;
  position: string;
  isActive: boolean;
  sortOrder: number;
  aspectRatio?: '16:9' | '9:16' | '1:1';
  placement?: 'HERO_SLIDER' | 'SIDE_PROMO';
  ctaLabel?: string;
  ctaLink?: string;
  overlayColor?: string;
  createdAt: Date;
  updatedAt: Date;
}

const BannerSchema = new Schema<IBanner>(
  {
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, default: "" },
    imageUrl: { type: String, required: true, trim: true },
    linkUrl: { type: String, default: "", trim: true },
    position: { type: String, default: "home_hero", trim: true },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
    aspectRatio: { type: String, enum: ["16:9", "9:16", "1:1"], default: "16:9" },
    placement: { type: String, enum: ["HERO_SLIDER", "SIDE_PROMO"], default: "HERO_SLIDER" },
    ctaLabel: { type: String, default: "" },
    ctaLink: { type: String, default: "" },
    overlayColor: { type: String, default: "" },
  },
  { timestamps: true }
);

BannerSchema.index({ isActive: 1, position: 1, sortOrder: 1 });

export const Banner = mongoose.model<IBanner>("Banner", BannerSchema);
