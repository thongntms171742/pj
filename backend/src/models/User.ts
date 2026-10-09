import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";

// ── Address profile (embedded sub-document) ───────────────────────────────────
export interface IAddress extends Document {
  name: string;
  phone: string;
  address: string;
  province: string;
  district: string;
  ward: string;
  isDefault: boolean;
}

const AddressSchema = new Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  address: { type: String, required: true },
  province: { type: String, required: true },
  district: { type: String, required: true },
  ward: { type: String, required: true },
  isDefault: { type: Boolean, default: false },
});

// ── User (Build Your Christmas) ──────────────────────────────────────────────
// Single-brand: there is no `sellerProfile` / per-seller commission. The
// only roles are `buyer` and `admin`. Staff log in as buyers with the
// `admin` role on top — the existing requireAdmin middleware handles that.
export interface IUser extends Document {
  name: string;
  email: string;
  phone?: string;
  passwordHash: string;
  avatarUrl?: string;
  roles: ("buyer" | "admin")[];
  addresses: IAddress[];
  accountStatus: "active" | "suspended";
  accountStatusReason: string;
  comparePassword(plain: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: "" },
    passwordHash: { type: String, required: true },
    avatarUrl: { type: String, default: "" },
    roles: {
      type: [{ type: String, enum: ["buyer", "admin"] }],
      default: ["buyer"],
    },
    addresses: { type: [AddressSchema], default: [] },
    accountStatus: { type: String, enum: ["active", "suspended"], default: "active" },
    accountStatusReason: { type: String, default: "" },
  },
  { timestamps: true }
);

UserSchema.methods.comparePassword = async function (plain: string): Promise<boolean> {
  return bcrypt.compare(plain, this.passwordHash);
};

export const User = mongoose.model<IUser>("User", UserSchema);