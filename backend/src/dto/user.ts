import { toStr } from "../utils/ids";

/**
 * User DTO. Single source of truth for the user shape returned to FE.
 * Auth, profile, and admin user listing all call this.
 *
 * NOTE: `addresses` is passed through as-is. The legacy addressController
 * had inconsistent returns (sometimes `_id.toString()`, sometimes raw
 * ObjectId). We keep the existing shape to avoid breaking FE.
 */
export interface UserDto {
  _id: string;
  name: string;
  email: string;
  phone: string;
  roles: string[];
  avatarUrl: string;
  accountStatus: string;
  accountStatusReason: string;
  addresses: any[];
  createdAt?: string;
}

export function userToDto(u: any): UserDto {
  return {
    _id: toStr(u._id),
    name: u.name,
    email: u.email,
    phone: u.phone || "",
    roles: u.roles || [],
    avatarUrl: u.avatarUrl || "",
    accountStatus: u.accountStatus,
    accountStatusReason: u.accountStatusReason ?? "",
    addresses: u.addresses ?? [],
    ...(u.createdAt ? { createdAt: new Date(u.createdAt).toISOString() } : {}),
  };
}

/** Auth response wraps a token + user. */
export interface AuthResponseDto {
  token: string;
  user: UserDto;
}
