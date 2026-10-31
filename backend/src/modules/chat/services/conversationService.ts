import { Types } from "mongoose";
import {
  Conversation,
  ChatChannel,
  ChatStatus,
  IChatParticipant,
  ICustomerInfo,
  GUEST_PREFIX,
} from "../../../models/Conversation";
import { User } from "../../../models/User";
import {
  ChatActor,
  actorKey,
  guestKey,
  canAccessConversation,
  findActorParticipant,
  isValidConversationId,
} from "./chatAccess";
import { chatErrors, ChatError } from "./chatErrors";
import { countUnreadBatch, UnreadConvLike, sendMessage } from "./messageService";

// ── Admin user ID resolution & caching (5 minutes TTL) ────────────────────────
let cachedAdminId: string | null = null;
let cachedAdminIdExpiry = 0;
const ADMIN_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Lấy ObjectId (string) của một tài khoản Admin thật trong database.
 * Cache in-memory 5 phút để tránh query User liên tục, nhưng tự động làm mới.
 */
export async function getAdminUserId(): Promise<string> {
  const now = Date.now();
  if (cachedAdminId && now < cachedAdminIdExpiry) {
    return cachedAdminId;
  }

  const admin =
    (await User.findOne({ email: "admin@buildyourchristmas.vn" }).select("_id").lean()) ||
    (await User.findOne({ roles: "admin" }).select("_id").lean());

  if (!admin) {
    throw new Error(
      "[conversationService] Không tìm thấy tài khoản admin nào trong database. Hãy seed hoặc tạo tài khoản admin trước."
    );
  }

  cachedAdminId = String(admin._id);
  cachedAdminIdExpiry = now + ADMIN_CACHE_TTL_MS;
  return cachedAdminId;
}

export function clearAdminUserIdCache(): void {
  cachedAdminId = null;
  cachedAdminIdExpiry = 0;
}

// ── Get or Create Conversation ───────────────────────────────────────────────

export interface GetOrCreateConversationInput {
  channel?: ChatChannel;
  userId?: string;
  sessionId?: string;
  customerInfo?: ICustomerInfo;
}

/**
 * Tìm hoặc tạo mới hội thoại.
 *
 * Logic:
 *  - channel "SUPPORT":
 *      + Chỉ dành cho user đã đăng nhập (hoặc nếu guest gọi thì báo lỗi/hoặc hỗ trợ login).
 *      + Mỗi buyer chỉ có duy nhất 1 conversation SUPPORT với admin.
 *  - channel "AI":
 *      + Nếu có userId: tìm conversation AI đang active của user.
 *        Nếu có sessionId kèm theo: tự "claim" conversation guest (guest:<sessionId>) sang userId.
 *      + Nếu là guest (chỉ có sessionId): tìm theo "guest:<sessionId>".
 *  - Khi tạo mới channel AI: bot gửi lời chào tự động.
 */
export async function getOrCreateConversation(
  input: GetOrCreateConversationInput
): Promise<{ conversation: any; isNew: boolean }> {
  const channel: ChatChannel = input.channel === "SUPPORT" ? "SUPPORT" : "AI";
  const userId = input.userId ? String(input.userId).trim() : undefined;
  const sessionId = input.sessionId ? String(input.sessionId).trim() : undefined;

  if (!userId && !sessionId) {
    throw chatErrors.identityRequired();
  }

  if (channel === "SUPPORT" && !userId) {
    throw chatErrors.loginRequired("Cần đăng nhập để kết nối với tư vấn viên hỗ trợ.");
  }

  // 1. Kênh SUPPORT: Mỗi user có đúng 1 hội thoại với Admin team
  if (channel === "SUPPORT" && userId) {
    let conv = await Conversation.findOne({
      channel: "SUPPORT",
      "participants.userId": userId,
    }).populate("assignedAdminId", "name email avatarUrl");

    if (conv) {
      return { conversation: conv, isNew: false };
    }

    const adminId = await getAdminUserId();
    const userDoc = await User.findById(userId).select("name email phone").lean();

    const customerInfo: ICustomerInfo = {
      name: userDoc?.name || input.customerInfo?.name || "Khách hàng",
      email: userDoc?.email || input.customerInfo?.email,
      phone: userDoc?.phone || input.customerInfo?.phone,
    };

    const newConv = await Conversation.create({
      channel: "SUPPORT",
      status: "WAITING_ADMIN",
      participants: [
        { userId, role: "buyer", lastReadAt: new Date() },
        { userId: adminId, role: "admin", lastReadAt: null },
      ],
      customerInfo,
      tags: ["support_direct"],
    });

    return { conversation: newConv, isNew: true };
  }

  // 2. Kênh AI (Chatbot Gemini)
  if (userId) {
    // Tìm conversation AI đang mở của user
    let conv = await Conversation.findOne({
      channel: "AI",
      "participants.userId": userId,
      status: { $in: ["BOT_ACTIVE", "WAITING_ADMIN", "ADMIN_ACTIVE"] },
    })
      .sort({ updatedAt: -1 })
      .populate("assignedAdminId", "name email avatarUrl");

    // Nếu không thấy nhưng có sessionId, kiểm tra xem có conversation guest đang mở để claim không
    if (!conv && sessionId) {
      const guestParticipantKey = guestKey(sessionId);
      const guestConv = await Conversation.findOne({
        channel: "AI",
        "participants.userId": guestParticipantKey,
        status: { $in: ["BOT_ACTIVE", "WAITING_ADMIN", "ADMIN_ACTIVE"] },
      }).sort({ updatedAt: -1 });

      if (guestConv) {
        // Claim: chuyển guest participant thành buyer userId
        const pIndex = guestConv.participants.findIndex((p) => p.userId === guestParticipantKey);
        if (pIndex !== -1) {
          guestConv.participants[pIndex].userId = userId;
          guestConv.participants[pIndex].role = "buyer";
        } else {
          guestConv.participants.push({ userId, role: "buyer", lastReadAt: new Date() });
        }

        // Cập nhật customerInfo từ user
        const userDoc = await User.findById(userId).select("name email phone").lean();
        if (userDoc) {
          guestConv.customerInfo = {
            name: userDoc.name,
            email: userDoc.email,
            phone: userDoc.phone || guestConv.customerInfo?.phone,
          };
        }

        await guestConv.save();
        conv = await Conversation.findById(guestConv._id).populate(
          "assignedAdminId",
          "name email avatarUrl"
        );
      }
    }

    if (conv) {
      return { conversation: conv, isNew: false };
    }

    // Tạo mới conversation AI cho user
    const userDoc = await User.findById(userId).select("name email phone").lean();
    const customerInfo: ICustomerInfo = {
      name: userDoc?.name || input.customerInfo?.name || "Khách hàng",
      email: userDoc?.email || input.customerInfo?.email,
      phone: userDoc?.phone || input.customerInfo?.phone,
    };

    const newConv = await Conversation.create({
      channel: "AI",
      status: "BOT_ACTIVE",
      participants: [{ userId, role: "buyer", lastReadAt: new Date() }],
      customerInfo,
      tags: ["ai_chat"],
    });

    // Gửi tin chào bot
    await sendWelcomeMessage(newConv._id);

    const refreshed = await Conversation.findById(newConv._id).populate(
      "assignedAdminId",
      "name email avatarUrl"
    );
    return { conversation: refreshed, isNew: true };
  }

  // Khách vãng lai (guest)
  const guestParticipantKey = guestKey(sessionId!);
  let conv = await Conversation.findOne({
    channel: "AI",
    "participants.userId": guestParticipantKey,
    status: { $in: ["BOT_ACTIVE", "WAITING_ADMIN", "ADMIN_ACTIVE"] },
  })
    .sort({ updatedAt: -1 })
    .populate("assignedAdminId", "name email avatarUrl");

  if (conv) {
    return { conversation: conv, isNew: false };
  }

  const newConv = await Conversation.create({
    channel: "AI",
    status: "BOT_ACTIVE",
    participants: [{ userId: guestParticipantKey, role: "guest", lastReadAt: new Date() }],
    customerInfo: input.customerInfo || {},
    tags: ["guest_chat"],
  });

  await sendWelcomeMessage(newConv._id);

  const refreshed = await Conversation.findById(newConv._id).populate(
    "assignedAdminId",
    "name email avatarUrl"
  );
  return { conversation: refreshed, isNew: true };
}

async function sendWelcomeMessage(conversationId: Types.ObjectId): Promise<void> {
  const welcomeContent =
    "Xin chào! 🎄 Em là trợ lý ảo của Build Your Christmas. Em có thể giúp gì cho anh/chị hôm nay ạ? Anh/chị có thể hỏi về tư vấn cây thông, giá cả, hoặc tra cứu đơn hàng nhé!";

  await sendMessage({
    conversationId,
    sender: {
      type: "BOT",
      name: "Trợ lý AI",
    },
    content: welcomeContent,
    metadata: {
      quickReplies: ["Tư vấn cây thông Noel", "Tra cứu đơn hàng", "Gặp nhân viên hỗ trợ"],
    },
    trustedMetadata: true,
  });
}

// ── Resolve Access ──────────────────────────────────────────────────────────

export async function resolveConversationAccess(
  conversationId: string,
  actor: ChatActor
): Promise<any> {
  if (!isValidConversationId(conversationId)) {
    throw chatErrors.invalidId();
  }

  const conv = await Conversation.findById(conversationId).populate(
    "assignedAdminId",
    "name email avatarUrl"
  );
  if (!conv) {
    throw chatErrors.notFound();
  }

  if (!canAccessConversation(conv, actor)) {
    throw chatErrors.forbidden();
  }

  return conv;
}

// ── Mark Read ───────────────────────────────────────────────────────────────

export async function setParticipantLastRead(
  conversationId: string | Types.ObjectId,
  userId: string,
  date: Date = new Date()
): Promise<void> {
  await Conversation.updateOne(
    { _id: conversationId, "participants.userId": userId },
    { $set: { "participants.$.lastReadAt": date } }
  );
}

// ── List Conversations ──────────────────────────────────────────────────────

export interface ListConversationsFilter {
  channel?: ChatChannel;
  status?: string;
  page?: number;
  limit?: number;
}

export async function listConversationsForUser(
  actor: ChatActor,
  filter: ListConversationsFilter = {}
): Promise<{ conversations: any[]; total: number; page: number; limit: number; totalPages: number }> {
  const page = Math.max(1, filter.page || 1);
  const limit = Math.min(50, Math.max(1, filter.limit || 20));
  const skip = (page - 1) * limit;

  const query: any = {};

  if (filter.channel && ["AI", "SUPPORT"].includes(filter.channel)) {
    query.channel = filter.channel;
  }

  if (filter.status && filter.status !== "all") {
    query.status = filter.status;
  }

  if (actor.isAdmin) {
    // Admin có thể xem tất cả các cuộc trò chuyện
    const [conversations, total] = await Promise.all([
      Conversation.find(query)
        .sort({ lastMessageAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("assignedAdminId", "name email avatarUrl")
        .lean(),
      Conversation.countDocuments(query),
    ]);

    return {
      conversations,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // Khách/Buyer: chỉ xem conversation của mình
  const key = actorKey(actor);
  if (!key) {
    return { conversations: [], total: 0, page, limit, totalPages: 0 };
  }

  query["participants.userId"] = key;

  const [conversations, total] = await Promise.all([
    Conversation.find(query)
      .sort({ lastMessageAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("assignedAdminId", "name email avatarUrl")
      .lean(),
    Conversation.countDocuments(query),
  ]);

  return {
    conversations,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}
