import { Request, Response } from "express";
import { User } from "../models";
import { sendError, ErrorCode, handleInternalError } from "../utils/errors";

export const getAddresses = async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user!.id);
    if (!user) {
      return sendError(res, ErrorCode.UNAUTHORIZED, "Không tìm thấy user", 401);
    }
    res.json({ addresses: user.addresses });
  } catch (err) {
    handleInternalError(res, err, "getAddresses");
  }
};

export const addAddress = async (req: Request, res: Response) => {
  try {
    const { name, phone, address, province, district, ward, isDefault } = req.body;
    
    if (!name || !phone || !address || !province || !district || !ward) {
      return sendError(res, ErrorCode.MISSING_FIELD, "Vui lòng điền đầy đủ thông tin địa chỉ", 400);
    }

    const user = await User.findById(req.user!.id);
    if (!user) {
      return sendError(res, ErrorCode.UNAUTHORIZED, "Không tìm thấy user", 401);
    }

    if (isDefault) {
      user.addresses.forEach(a => a.isDefault = false);
    } else if (user.addresses.length === 0) {
      // First address is always default
      req.body.isDefault = true;
    }

    const newAddress = {
      name, phone, address, province, district, ward, isDefault: req.body.isDefault || false
    };

    user.addresses.push(newAddress as any);
    await user.save();

    const addedAddress = user.addresses[user.addresses.length - 1];
    res.status(201).json({ address: addedAddress });
  } catch (err) {
    handleInternalError(res, err, "addAddress");
  }
};

export const updateAddress = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, phone, address, province, district, ward, isDefault } = req.body;

    const user = await User.findById(req.user!.id);
    if (!user) {
      return sendError(res, ErrorCode.UNAUTHORIZED, "Không tìm thấy user", 401);
    }

    const addressDoc = user.addresses.find(a => a._id && a._id.toString() === id);
    if (!addressDoc) {
      return sendError(res, ErrorCode.NOT_FOUND, "Không tìm thấy địa chỉ", 404);
    }

    if (isDefault === true) {
      user.addresses.forEach(a => a.isDefault = false);
    }

    if (name !== undefined) addressDoc.name = name;
    if (phone !== undefined) addressDoc.phone = phone;
    if (address !== undefined) addressDoc.address = address;
    if (province !== undefined) addressDoc.province = province;
    if (district !== undefined) addressDoc.district = district;
    if (ward !== undefined) addressDoc.ward = ward;
    if (isDefault !== undefined) addressDoc.isDefault = isDefault;

    if (isDefault === false) {
       const hasDefault = user.addresses.some(a => a.isDefault);
       if (!hasDefault && user.addresses.length > 0) {
           user.addresses[0].isDefault = true;
       }
    }

    await user.save();
    res.json({ address: addressDoc });
  } catch (err) {
    handleInternalError(res, err, "updateAddress");
  }
};

export const deleteAddress = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(req.user!.id);
    if (!user) {
      return sendError(res, ErrorCode.UNAUTHORIZED, "Không tìm thấy user", 401);
    }

    const addressIndex = user.addresses.findIndex(a => a._id && a._id.toString() === id);
    if (addressIndex === -1) {
      return sendError(res, ErrorCode.NOT_FOUND, "Không tìm thấy địa chỉ", 404);
    }

    const wasDefault = user.addresses[addressIndex].isDefault;
    
    user.addresses.splice(addressIndex, 1);

    if (wasDefault && user.addresses.length > 0) {
      user.addresses[0].isDefault = true;
    }

    await user.save();
    res.json({ success: true });
  } catch (err) {
    handleInternalError(res, err, "deleteAddress");
  }
};
