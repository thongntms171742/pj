import mongoose, { Schema, Document } from "mongoose";

export type MobilePlatform = "android" | "ios";

export interface MobileAppConfigFields {
  platform: MobilePlatform;
  latestVersion: string;
  minSupportedVersion: string;
  latestBuildNumber: number | null;
  minBuildNumber: number | null;
  forceUpdate: boolean;
  storeUrl: string;
  title: string;
  message: string;
  releaseNotes: string[];
  isMaintenance: boolean;
  maintenanceMessage: string;
  updatedBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IMobileAppConfig extends Document, MobileAppConfigFields {}

const MobileAppConfigSchema = new Schema<IMobileAppConfig>(
  {
    platform: {
      type: String,
      enum: ["android", "ios"],
      required: true,
      unique: true,
    },
    latestVersion: { type: String, required: true, default: "1.0.0", trim: true },
    minSupportedVersion: { type: String, required: true, default: "1.0.0", trim: true },
    latestBuildNumber: { type: Number, default: null },
    minBuildNumber: { type: Number, default: null },
    forceUpdate: { type: Boolean, default: false },
    storeUrl: { type: String, default: "", trim: true },
    title: { type: String, default: "Đã có phiên bản mới", trim: true },
    message: {
      type: String,
      default: "Vui lòng cập nhật ứng dụng để có trải nghiệm tốt nhất.",
      trim: true,
    },
    releaseNotes: { type: [String], default: [] },
    isMaintenance: { type: Boolean, default: false },
    maintenanceMessage: { type: String, default: "", trim: true },
    updatedBy: { type: String, default: "" },
  },
  { timestamps: true }
);

export const MobileAppConfig = mongoose.model<IMobileAppConfig>(
  "MobileAppConfig",
  MobileAppConfigSchema
);
