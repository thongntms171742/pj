import mongoose, { Schema, Document, Types } from "mongoose";

export interface ILedgerEntry {
  account: string;
  type: "DR" | "CR";
  amount: number;
}

export interface ILedger extends Document {
  transactionId: string; // e.g. TR-timestamp
  orderId: Types.ObjectId | string; // the order triggering this
  orderCode?: string; // e.g. ORD-12345678
  entries: ILedgerEntry[];
  description: string;
  createdAt: Date;
}

const LedgerEntrySchema = new Schema(
  {
    account: { type: String, required: true },
    type: { type: String, enum: ["DR", "CR"], required: true },
    amount: { type: Number, required: true },
  },
  { _id: false }
);

const LedgerSchema = new Schema(
  {
    transactionId: { type: String, required: true, unique: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order" },
    orderCode: { type: String },
    entries: [LedgerEntrySchema],
    description: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Ledger = mongoose.model<ILedger>("Ledger", LedgerSchema);
