import { Request, Response } from "express";
import { User, IAddress } from "../models/User";

// ── GET /api/addresses ───────────────────────────────────────────────────────
export const getAddresses = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const user = await User.findById(userId).lean();
    if (!user) {
      res.status(404).json({ error: "Người dùng không tồn tại" });
      return;
    }
    res.json({ addresses: user.addresses || [] });
  } catch (error) {
    console.error("[addresses] getAddresses error:", error);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── POST /api/addresses ──────────────────────────────────────────────────────
export const addAddress = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { label, name, phone, province, district, ward, detail, isDefault, type } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ error: "Người dùng không tồn tại" });
      return;
    }

    const newAddress: IAddress = {
      label, name, phone, province, district, ward: ward || "", detail, type: type || "delivery", isDefault: !!isDefault
    };

    // If this is default, set other addresses of same type to not default
    if (newAddress.isDefault) {
      user.addresses.forEach(a => {
        if (a.type === newAddress.type) a.isDefault = false;
      });
    }

    user.addresses.push(newAddress as any);
    await user.save();

    res.json({ addresses: user.addresses });
  } catch (error) {
    console.error("[addresses] addAddress error:", error);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── PUT /api/addresses/:id ───────────────────────────────────────────────────
export const updateAddress = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const addressId = req.params.id;
    const { label, name, phone, province, district, ward, detail, isDefault, type } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ error: "Người dùng không tồn tại" });
      return;
    }

    const address = user.addresses.id(addressId) as any;
    if (!address) {
      res.status(404).json({ error: "Địa chỉ không tồn tại" });
      return;
    }

    if (label !== undefined) address.label = label;
    if (name !== undefined) address.name = name;
    if (phone !== undefined) address.phone = phone;
    if (province !== undefined) address.province = province;
    if (district !== undefined) address.district = district;
    if (ward !== undefined) address.ward = ward;
    if (detail !== undefined) address.detail = detail;
    if (type !== undefined) address.type = type;

    if (isDefault) {
      user.addresses.forEach((a: any) => {
        if (a.type === address.type && a._id.toString() !== addressId) {
          a.isDefault = false;
        }
      });
      address.isDefault = true;
    } else if (isDefault === false) {
      address.isDefault = false;
    }

    await user.save();
    res.json({ addresses: user.addresses });
  } catch (error) {
    console.error("[addresses] updateAddress error:", error);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};

// ── DELETE /api/addresses/:id ────────────────────────────────────────────────
export const deleteAddress = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const addressId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ error: "Người dùng không tồn tại" });
      return;
    }

    user.addresses.pull({ _id: addressId });
    await user.save();

    res.json({ addresses: user.addresses });
  } catch (error) {
    console.error("[addresses] deleteAddress error:", error);
    res.status(500).json({ error: "Lỗi hệ thống" });
  }
};
