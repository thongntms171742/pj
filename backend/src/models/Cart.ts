import mongoose, { Schema, Document, Types } from "mongoose";

export interface ICart extends Document {
  userId: Types.ObjectId;
}

const CartSchema = new Schema<ICart>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  },
  { timestamps: true }
);

export const Cart = mongoose.model<ICart>("Cart", CartSchema);
