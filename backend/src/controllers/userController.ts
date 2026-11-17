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
  Message,
  HandoffRequest,
} from "../models";
import { deleteAsset } from "../services/cloudinaryService";
import { SERVICE_PROVINCE_ID } from "../config/business";
import { resolveHcmCommuneInfo } from "../services/addressService";
import { isHcmProvinceInput } from "../services/hcmCommunesData";
import { sendError, ErrorCode } from "../utils/errors";
import { ah } from "../utils/asyncRoute";
import { ok, created } from "../utils/respond";

export const getAddresses = ah(async (req, res) => {
  const user = await User.findById(req.user!.id);
  if (!user) {
    sendError(res, ErrorCode.UNAUTHORIZED, "Không tìm thấy user", 401);
    return;
  }
  ok(res, { addresses: user.addresses });
});

export const addAddress = ah(async (req, res) => {
  const body = (req.body || {}) as Record<string, any>;
  const cleanName = String(body.name ?? body.fullName ?? body.recipientName ?? "").trim();
  const cleanPhone = String(body.phone ?? body.phoneNumber ?? "").trim();
  const cleanAddress = String(
    body.address ?? body.street ?? body.detailAddress ?? body.shippingAddress ?? ""
  ).trim();

  if (!cleanName || !cleanPhone || !cleanAddress) {
      sendError(
        res,
        ErrorCode.MISSING_FIELD,
        "Vui lòng nhập đầy đủ họ tên, số điện thoại và địa chỉ giao hàng",
        400
      );
    return;
  }

  const rawProvinceId = String(body.provinceId ?? body.shippingProvinceId ?? "").trim();
  const rawProvinceName = String(
    body.provinceName ?? body.province ?? body.shippingProvinceName ?? ""
  ).trim();

  // Giới hạn chỉ lưu địa chỉ giao hàng tại TP.HCM (mã tỉnh 79)
  if (!isHcmProvinceInput(rawProvinceId, rawProvinceName, SERVICE_PROVINCE_ID)) {
      sendError(
        res,
        ErrorCode.DELIVERY_AREA_NOT_SUPPORTED,
        `Hệ thống hiện chỉ hỗ trợ giao hàng tại TP. Hồ Chí Minh (mã tỉnh ${SERVICE_PROVINCE_ID})`
      );
    return;
  }

  const provinceId = SERVICE_PROVINCE_ID;
  const provinceName = rawProvinceName || "Thành phố Hồ Chí Minh";
  const province = String(body.province ?? "").trim() || provinceName;
  const district = String(body.district ?? body.shippingDistrict ?? "").trim();

  const rawCommuneId = String(body.communeId ?? body.shippingCommuneId ?? "").trim();
  const rawCommuneName = String(
    body.communeName ?? body.ward ?? body.shippingCommuneName ?? ""
  ).trim();
  const resolvedCommune = await resolveHcmCommuneInfo({
    communeId: rawCommuneId,
    communeName: rawCommuneName,
    addressText: cleanAddress,
  });
  const communeId = resolvedCommune.communeId;
  const communeName = resolvedCommune.communeName;
  const ward = String(body.ward ?? "").trim() || communeName;

  const user = await User.findById(req.user!.id);
  if (!user) {
    sendError(res, ErrorCode.UNAUTHORIZED, "Không tìm thấy user", 401);
    return;
  }

  // Compute the effective isDefault flag WITHOUT mutating req.body.
  // First address always becomes default; explicit `isDefault: true` flips
  // the default to the new one.
  const isDefault =
    !!body.isDefault ||
    user.addresses.length === 0;

  if (isDefault) {
    user.addresses.forEach((a) => {
      a.isDefault = false;
    });
  }

  const newAddress = {
    name: cleanName,
    phone: cleanPhone,
    address: cleanAddress,
    province,
    provinceId,
    provinceName,
    district,
    ward,
    communeId,
    communeName,
    isDefault,
  };

  user.addresses.push(newAddress as any);
  await user.save();

  const addedAddress = user.addresses[user.addresses.length - 1];
  created(res, { address: addedAddress });
});

export const updateAddress = ah(async (req, res) => {
  const { id } = req.params;
  const body = (req.body || {}) as Record<string, any>;

  const user = await User.findById(req.user!.id);
  if (!user) {
    sendError(res, ErrorCode.UNAUTHORIZED, "Không tìm thấy user", 401);
    return;
  }

  const addressDoc = user.addresses.find(
    (a) => a._id && a._id.toString() === id
  );
  if (!addressDoc) {
    sendError(res, ErrorCode.NOT_FOUND, "Không tìm thấy địa chỉ", 404);
    return;
  }

  const rawProvinceId =
    body.provinceId !== undefined || body.shippingProvinceId !== undefined
      ? String(body.provinceId ?? body.shippingProvinceId ?? "").trim()
      : undefined;
  const rawProvinceName =
    body.provinceName !== undefined || body.province !== undefined || body.shippingProvinceName !== undefined
      ? String(body.provinceName ?? body.province ?? body.shippingProvinceName ?? "").trim()
      : undefined;

  if (rawProvinceId !== undefined || rawProvinceName !== undefined) {
    if (!isHcmProvinceInput(rawProvinceId, rawProvinceName, SERVICE_PROVINCE_ID)) {
        sendError(
          res,
          ErrorCode.DELIVERY_AREA_NOT_SUPPORTED,
          `Hệ thống hiện chỉ hỗ trợ giao hàng tại TP. Hồ Chí Minh (mã tỉnh ${SERVICE_PROVINCE_ID})`
        );
      return;
    }
    addressDoc.provinceId = SERVICE_PROVINCE_ID;
    addressDoc.provinceName = rawProvinceName || "Thành phố Hồ Chí Minh";
    addressDoc.province =
      body.province !== undefined && String(body.province).trim()
        ? String(body.province).trim()
        : addressDoc.provinceName;
  }

  if (body.isDefault === true) {
    user.addresses.forEach((a) => {
      a.isDefault = false;
    });
  }

  const nextName = body.name ?? body.fullName ?? body.recipientName;
  const nextPhone = body.phone ?? body.phoneNumber;
  const nextAddr = body.address ?? body.street ?? body.detailAddress ?? body.shippingAddress;

  if (nextName !== undefined) addressDoc.name = String(nextName).trim();
  if (nextPhone !== undefined) addressDoc.phone = String(nextPhone).trim();
  if (nextAddr !== undefined) addressDoc.address = String(nextAddr).trim();
  if (body.district !== undefined) addressDoc.district = String(body.district).trim();

  const hasCommuneUpdate =
    body.communeId !== undefined ||
    body.communeName !== undefined ||
    body.ward !== undefined ||
    body.shippingCommuneId !== undefined ||
    body.shippingCommuneName !== undefined;

  if (hasCommuneUpdate) {
    const rawCommuneId =
      body.communeId !== undefined || body.shippingCommuneId !== undefined
        ? String(body.communeId ?? body.shippingCommuneId ?? "").trim()
        : addressDoc.communeId || "";
    const rawCommuneName =
      body.communeName !== undefined || body.ward !== undefined || body.shippingCommuneName !== undefined
        ? String(body.communeName ?? body.ward ?? body.shippingCommuneName ?? "").trim()
        : addressDoc.communeName || addressDoc.ward || "";

    const resolvedCommune = await resolveHcmCommuneInfo({
      communeId: rawCommuneId,
      communeName: rawCommuneName,
      preferLookupName: body.communeName === undefined && body.ward === undefined,
    });

    addressDoc.communeId = resolvedCommune.communeId;
    addressDoc.communeName = resolvedCommune.communeName;
    addressDoc.ward =
      body.ward !== undefined && String(body.ward).trim()
        ? String(body.ward).trim()
        : resolvedCommune.communeName;
  }

if (body.isDefault !== undefined) addressDoc.isDefault = Boolean(body.isDefault);

if (body.isDefault === false) {
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
    sendError(res, ErrorCode.UNAUTHORIZED, "Không tìm thấy user", 401);
    return;
  }

  const addressIndex = user.addresses.findIndex(
    (a) => a._id && a._id.toString() === id
  );
  if (addressIndex === -1) {
    sendError(res, ErrorCode.NOT_FOUND, "Không tìm thấy địa chỉ", 404);
    return;
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
    sendError(res, ErrorCode.UNAUTHORIZED, "Chưa đăng nhập", 401);
    return;
  }

  // 1. Idempotency check: user có tồn tại không
  const user = await User.findById(userId);
  if (!user) {
    sendError(res, ErrorCode.NOT_FOUND, "Tài khoản không tồn tại", 404);
    return;
  }

  const userObjectId = new Types.ObjectId(userId);

  // 2. Chặn nếu còn đơn hàng đang xử lý
  const BLOCKING_STATUSES = ["PENDING_PAYMENT", "PAID", "CONFIRMED", "PACKING"];
  const blocking = await Order.find({
    buyerId: userObjectId,
    status: { $in: BLOCKING_STATUSES },
  }).select("orderCode status totalAmount");

  if (blocking.length > 0) {
      sendError(
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
    return;
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
      deleteAsset(d.roomImagePublicId, "image").catch(() => { });
    }
    if (d.resultImagePublicId) {
      deleteAsset(d.resultImagePublicId, "image").catch(() => { });
    }
  }
  await Design.deleteMany({ ownerId: userObjectId });

  // 4.3. Reviews
  await Review.deleteMany({ buyerId: userObjectId });

  // 4.4. Notifications
  await Notification.deleteMany({ userId: userObjectId });

  // 4.5. Chat (xoá vĩnh viễn — không giữ dữ liệu hội thoại của người đã xoá)
  const chatConversations = await Conversation.find({ userId: userObjectId }).select(
    "_id"
  );
  const chatConversationIds = chatConversations.map((c) => c._id);
  if (chatConversationIds.length > 0) {
    await Message.deleteMany({ conversationId: { $in: chatConversationIds } });
    await HandoffRequest.deleteMany({ conversationId: { $in: chatConversationIds } });
    await Conversation.deleteMany({ _id: { $in: chatConversationIds } });
  }

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


