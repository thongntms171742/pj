import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";

// ── Seller profile (embedded sub-document) ────────────────────────────────────
const SellerProfileSchema = new Schema(
  {
    handle: { type: String, required: true },
    shopName: { type: String, required: true },
    description: { type: String, default: "" },
    avatarUrl: { type: String, default: "" },
    coverImages: { type: [String], default: [] },
    rating: { type: Number, default: 5.0 },
    totalTransactions: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    commissionRate: { type: Number, default: 0.1 },
    status: {
      type: String,
      enum: ["active", "pending_approval", "suspended"],
      default: "active",
    },
  },
  { _id: false }
);

// ── Address (embedded sub-document) ──────────────────────────────────────────
export interface IAddress {
  _id?: mongoose.Types.ObjectId | string;
  label: string;
  name: string;
  phone: string;
  province: string;
  district: string;
  ward: string;
  detail: string;
  isDefault: boolean;
  type: "delivery" | "warehouse";
}

const AddressSchema = new Schema(
  {
    label: { type: String, required: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    province: { type: String, required: true },
    district: { type: String, required: true },
    ward: { type: String, default: "" },
    detail: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
    type: { type: String, enum: ["delivery", "warehouse"], default: "delivery" },
  },
  { timestamps: true }
);

// ── User ──────────────────────────────────────────────────────────────────────
export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  roles: ("buyer" | "seller" | "admin")[];
  sellerProfile?: {
    handle: string;
    shopName: string;
    description?: string;
    avatarUrl?: string;
    coverImages: string[];
    rating: number;
    totalTransactions: number;
    totalRevenue: number;
    commissionRate: number;
    status: "active" | "pending_approval" | "suspended";
  };
  addresses: IAddress[];
  comparePassword(plain: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    roles: {
      type: [{ type: String, enum: ["buyer", "seller", "admin"] }],
      default: ["buyer"],
    },
    sellerProfile: { type: SellerProfileSchema, default: undefined },
    addresses: { type: [AddressSchema], default: [] },
  },
  { timestamps: true }
);

UserSchema.methods.comparePassword = async function (plain: string): Promise<boolean> {
  return bcrypt.compare(plain, this.passwordHash);
};

export const User = mongoose.model<IUser>("User", UserSchema);
