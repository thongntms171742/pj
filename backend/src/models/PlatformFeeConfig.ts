import mongoose, { Schema, Document, Types } from "mongoose";

export interface IPlatformFeeConfig extends Document {
  rate: number;
  effectiveFrom: Date;
  active: boolean;
  createdBy?: Types.ObjectId;
  createdAt: Date;
}

const PlatformFeeConfigSchema = new Schema(
  {
    rate: { type: Number, required: true }, // e.g. 0.05 for 5%
    effectiveFrom: { type: Date, default: Date.now },
    active: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const PlatformFeeConfig = mongoose.model<IPlatformFeeConfig>(
  "PlatformFeeConfig",
  PlatformFeeConfigSchema
);
