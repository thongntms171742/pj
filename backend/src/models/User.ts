import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";

// ── Address profile (embedded sub-document) ───────────────────────────────────
export interface IAddress extends Document {
  name: string;
  phone: string;
  address: string;
  province: string;
  provinceId?: string;       // Mã hành chính (VD: "79" cho TP.HCM)
  provinceName?: string;     // Tên tỉnh/thành phố
  district: string;
  ward: string;
  communeId?: string;        // Mã phường/xã từ AddressKit
  communeName?: string;      // Tên phường/xã
  isDefault: boolean;
}

const AddressSchema = new Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  address: { type: String, required: true },
  province: { type: String, default: "Thành phố Hồ Chí Minh" },
  provinceId: { type: String, default: "79" },    // Mã hành chính (VD: "79" cho TP.HCM)
  provinceName: { type: String, default: "Thành phố Hồ Chí Minh" },  // Tên tỉnh/thành phố
  district: { type: String, default: "" },
  ward: { type: String, default: "" },
  communeId: { type: String, default: "" },      // Mã phường/xã từ AddressKit
  communeName: { type: String, default: "" },   // Tên phường/xã
  isDefault: { type: Boolean, default: false },
});

// ── User (Build Your Christmas) ──────────────────────────────────────────────
// Single-brand: there is no `sellerProfile` / per-seller commission. The
// only roles are `buyer` and `admin`. Staff log in as buyers with the
// `admin` role on top — the existing requireAdmin middleware handles that.
export type AuthProvider = "local" | "google" | "both";

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
  authProvider: AuthProvider;
  googleId?: string | null;
  emailVerified: boolean;
  emailVerifiedAt?: Date | null;
  comparePassword(plain: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: "" },
    // Rỗng nếu user đăng ký bằng Google và chưa đặt mật khẩu local.
    passwordHash: { type: String, default: "" },
    avatarUrl: { type: String, default: "" },
    roles: {
      type: [{ type: String, enum: ["buyer", "admin"] }],
      default: ["buyer"],
    },
    addresses: { type: [AddressSchema], default: [] },
    accountStatus: { type: String, enum: ["active", "suspended"], default: "active" },
    accountStatusReason: { type: String, default: "" },
    authProvider: {
      type: String,
      enum: ["local", "google", "both"],
      default: "local",
    },
    googleId: { type: String, default: null },
    // Default `true` giữ tương thích các tài khoản cũ/seed chưa có field này;
    // endpoint `/api/auth/register` chủ động gán `false` khi yêu cầu xác thực OTP.
    emailVerified: { type: Boolean, default: true },
    emailVerifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

UserSchema.index(
  { googleId: 1 },
  {
    unique: true,
    partialFilterExpression: { googleId: { $type: "string" } },
  }
);

UserSchema.methods.comparePassword = async function (plain: string): Promise<boolean> {
  if (!this.passwordHash) return false;
  return bcrypt.compare(plain, this.passwordHash);
};

export const User = mongoose.model<IUser>("User", UserSchema);