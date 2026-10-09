import mongoose, { Schema, Document, Types } from "mongoose";

export interface ICart extends Document {
  userId?: Types.ObjectId | null;
  sessionId?: string | null;
}

const CartSchema = new Schema<ICart>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    sessionId: { type: String, default: null },
  },
  { timestamps: true }
);

CartSchema.index({ userId: 1 }, { unique: true, sparse: true });
CartSchema.index({ sessionId: 1 }, { unique: true, sparse: true });

export const Cart = mongoose.model<ICart>("Cart", CartSchema);
