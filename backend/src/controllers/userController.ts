import { Request, Response } from "express";
import { User } from "../models";
import { sendError, ErrorCode, handleInternalError } from "../utils/errors";
import { ah } from "../utils/asyncRoute";
import { ok, created } from "../utils/respond";

export const getAddresses = ah(async (req, res) => {
  const user = await User.findById(req.user!.id);
  if (!user) {
    return sendError(res, ErrorCode.UNAUTHORIZED, "Không tìm thấy user", 401);
  }
  ok(res, { addresses: user.addresses });
});

export const addAddress = ah(async (req, res) => {
  const { name, phone, address, province, district, ward, isDefault: rawIsDefault } =
    req.body as {
      name?: unknown;
      phone?: unknown;
      address?: unknown;
      province?: unknown;
      district?: unknown;
      ward?: unknown;
      isDefault?: unknown;
    };

  if (!name || !phone || !address || !province || !district || !ward) {
    return sendError(
      res,
      ErrorCode.MISSING_FIELD,
      "Vui lòng điền đầy đủ thông tin địa chỉ",
      400
    );
  }

  const user = await User.findById(req.user!.id);
  if (!user) {
    return sendError(res, ErrorCode.UNAUTHORIZED, "Không tìm thấy user", 401);
  }

  // Compute the effective isDefault flag WITHOUT mutating req.body.
  // First address always becomes default; explicit `isDefault: true` flips
  // the default to the new one.
  const isDefault =
    !!rawIsDefault ||
    (user.addresses.length === 0);

  if (isDefault) {
    user.addresses.forEach((a) => {
      a.isDefault = false;
    });
  }

  const newAddress = {
    name,
    phone,
    address,
    province,
    district,
    ward,
    isDefault,
  };

  user.addresses.push(newAddress as any);
  await user.save();

  const addedAddress = user.addresses[user.addresses.length - 1];
  created(res, { address: addedAddress });
});

export const updateAddress = ah(async (req, res) => {
  const { id } = req.params;
  const { name, phone, address, province, district, ward, isDefault } = req.body as {
    name?: string;
    phone?: string;
    address?: string;
    province?: string;
    district?: string;
    ward?: string;
    isDefault?: boolean;
  };

  const user = await User.findById(req.user!.id);
  if (!user) {
    return sendError(res, ErrorCode.UNAUTHORIZED, "Không tìm thấy user", 401);
  }

  const addressDoc = user.addresses.find(
    (a) => a._id && a._id.toString() === id
  );
  if (!addressDoc) {
    return sendError(res, ErrorCode.NOT_FOUND, "Không tìm thấy địa chỉ", 404);
  }

  if (isDefault === true) {
    user.addresses.forEach((a) => {
      a.isDefault = false;
    });
  }

  if (name !== undefined) addressDoc.name = name;
  if (phone !== undefined) addressDoc.phone = phone;
  if (address !== undefined) addressDoc.address = address;
  if (province !== undefined) addressDoc.province = province;
  if (district !== undefined) addressDoc.district = district;
  if (ward !== undefined) addressDoc.ward = ward;
  if (isDefault !== undefined) addressDoc.isDefault = isDefault;

  if (isDefault === false) {
    const hasDefault = user.addresses.some((a) => a.isDefault);
    if (!hasDefault && user.addresses.length > 0) {
      user.addresses[0].isDefault = true;
    }
  }

  await user.save();
  ok(res, { address: addressDoc });
});

export const deleteAddress = ah(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(req.user!.id);
  if (!user) {
    return sendError(res, ErrorCode.UNAUTHORIZED, "Không tìm thấy user", 401);
  }

  const addressIndex = user.addresses.findIndex(
    (a) => a._id && a._id.toString() === id
  );
  if (addressIndex === -1) {
    return sendError(res, ErrorCode.NOT_FOUND, "Không tìm thấy địa chỉ", 404);
  }

  const wasDefault = user.addresses[addressIndex].isDefault;
  user.addresses.splice(addressIndex, 1);

  if (wasDefault && user.addresses.length > 0) {
    user.addresses[0].isDefault = true;
  }

  await user.save();
  ok(res, { success: true });
});

