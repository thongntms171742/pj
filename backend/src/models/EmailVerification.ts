import mongoose, { Schema, Document, Types } from "mongoose";

export interface IEmailVerification extends Document {
  userId: Types.ObjectId;
  email: string;
  otpHash: string;
  attempts: number;
  lastSentAt: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const EmailVerificationSchema = new Schema<IEmailVerification>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    otpHash: { type: String, required: true },
    attempts: { type: Number, default: 0, min: 0 },
    lastSentAt: { type: Date, required: true, default: () => new Date() },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// MongoDB TTL index tự động xóa document ngay khi qua `expiresAt`.
EmailVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EmailVerification = mongoose.model<IEmailVerification>(
  "EmailVerification",
  EmailVerificationSchema
);
