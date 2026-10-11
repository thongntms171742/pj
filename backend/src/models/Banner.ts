import mongoose, { Schema, Document } from "mongoose";

export interface IBanner extends Document {
  title: string;
  imageUrl: string;
  linkUrl: string;
  position: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const BannerSchema = new Schema<IBanner>(
  {
    title: { type: String, required: true, trim: true },
    imageUrl: { type: String, required: true, trim: true },
    linkUrl: { type: String, default: "", trim: true },
    position: { type: String, default: "home_hero", trim: true },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

BannerSchema.index({ isActive: 1, position: 1, sortOrder: 1 });

export const Banner = mongoose.model<IBanner>("Banner", BannerSchema);
