import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import {
  User,
  Order,
  Cart,
  CartItem,
  Design,
  Review,
  Notification,
  Conversation,
} from "../models";
import { deleteAsset } from "../services/cloudinaryService";
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

// ── Rate limiter cho yêu cầu xoá tài khoản (1 request / 60s / user) ───────────
const deletionCooldowns = new Map<string, number>();

export const deleteAccountRateLimiter = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const userId = req.user?.id;
  if (!userId) {
    next();
    return;
  }
  const now = Date.now();
  const lastTime = deletionCooldowns.get(userId);
  if (lastTime && now - lastTime < 60000) {
    sendError(
      res,
      ErrorCode.CONFLICT,
      "Yêu cầu xoá tài khoản quá nhanh. Vui lòng thử lại sau 1 phút.",
      429
    );
    return;
  }
  deletionCooldowns.set(userId, now);

  if (deletionCooldowns.size > 1000) {
    for (const [key, ts] of deletionCooldowns) {
      if (now - ts > 60000) deletionCooldowns.delete(key);
    }
  }
  next();
};

// ── DELETE /api/users/me (Account Deletion & Data Cascade) ────────────────────
export const deleteMyAccount = ah(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return sendError(res, ErrorCode.UNAUTHORIZED, "Chưa đăng nhập", 401);
  }

  // 1. Idempotency check: user có tồn tại không
  const user = await User.findById(userId);
  if (!user) {
    return sendError(res, ErrorCode.NOT_FOUND, "Tài khoản không tồn tại", 404);
  }

  const userObjectId = new Types.ObjectId(userId);

  // 2. Chặn nếu còn đơn hàng đang xử lý
  const BLOCKING_STATUSES = ["PENDING_PAYMENT", "PAID", "CONFIRMED", "PACKING"];
  const blocking = await Order.find({
    buyerId: userObjectId,
    status: { $in: BLOCKING_STATUSES },
  }).select("orderCode status totalAmount");

  if (blocking.length > 0) {
    return sendError(
      res,
      ErrorCode.ORDER_IN_PROGRESS,
      "Bạn còn đơn hàng đang được xử lý. Vui lòng hoàn tất hoặc huỷ đơn trước khi xoá tài khoản.",
      409,
      {
        blockingOrders: blocking.map((b) => ({
          orderCode: b.orderCode,
          orderStatus: b.status,
          totalAmount: b.totalAmount,
        })),
      }
    );
  }

  // 3. Scrub PII trong Order (giữ lịch sử đối soát)
  await Order.updateMany(
    { buyerId: userObjectId },
    {
      $set: {
        shippingName: "Khách hàng đã xóa tài khoản",
        shippingPhone: "",
        shippingAddress: "",
        shippingProvinceName: "",
        shippingCommuneName: "",
        internalNotes: "",
        pickupInfo: null,
        isAnonymized: true,
        userDeletedAt: new Date(),
      },
    }
  );

  // 4. Cascade xóa dữ liệu cá nhân
  // 4.1. Cart + CartItems
  const cart = await Cart.findOne({ userId: userObjectId });
  if (cart) {
    await CartItem.deleteMany({ cartId: cart._id });
    await Cart.findByIdAndDelete(cart._id);
  }

  // 4.2. Designs (dọn dẹp Cloudinary asset nếu có)
  const designs = await Design.find({ ownerId: userObjectId }).select(
    "roomImagePublicId resultImagePublicId"
  );
  for (const d of designs) {
    if (d.roomImagePublicId) {
      deleteAsset(d.roomImagePublicId, "image").catch(() => {});
    }
    if (d.resultImagePublicId) {
      deleteAsset(d.resultImagePublicId, "image").catch(() => {});
    }
  }
  await Design.deleteMany({ ownerId: userObjectId });

  // 4.3. Reviews
  await Review.deleteMany({ buyerId: userObjectId });

  // 4.4. Notifications
  await Notification.deleteMany({ userId: userObjectId });

  // 4.5. Conversations (anonymize customerInfo & pull participant, xóa AI channel rỗng)
  await Conversation.updateMany(
    { "participants.userId": String(userId) },
    {
      $pull: { participants: { userId: String(userId) } },
      $set: {
        "customerInfo.name": "Khách hàng đã xóa tài khoản",
        "customerInfo.phone": "",
        "customerInfo.email": "",
      },
    }
  );
  await Conversation.deleteMany({
    channel: "AI",
    "participants.0": { $exists: false },
  });

  // 5. Xóa user vĩnh viễn (addresses[] là embedded trong User nên tự động cascade)
  await User.findByIdAndDelete(userId);

  // 6. Ghi log audit (không log PII)
  console.log(
    JSON.stringify({
      action: "ACCOUNT_DELETED",
      userId: String(userId),
      at: new Date().toISOString(),
    })
  );

  // 7. Trả 204 No Content
  res.status(204).send();
});


