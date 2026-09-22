// Adapters: convert Mongo/API shapes → existing frontend types.
// Keeps components backward-compatible with the mock-data era.

import type { Product, Seller, CartGroup, Order, OrderItem, SellerProduct, Notification } from "../types";
import type { ApiProduct, ApiSeller, ApiCartItem, ApiOrder, ApiNotification } from "./api";

// ── Product ──
export function adaptProduct(p: ApiProduct, likedIds: Set<string>): Product {
  const id = hashId(p._id);
  return {
    id,
    name: p.title,
    price: p.price,
    seller: p.sellerId?.handle ?? "",
    sellerName: p.sellerId?.shopName,
    condition: p.condition,
    size: p.size,
    category: p.categoryId?.name ?? "",
    image: p.coverImage,
    liked: likedIds.has(p._id),
    status: p.status,
  };
}

// Deterministic positive 31-bit hash from string id.
function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h) || 1;
}

// ── Seller ──
export function adaptSeller(s: ApiSeller): Seller {
  return {
    id: hashId(s._id),
    handle: s.handle,
    name: s.shopName,
    avatar: s.avatarUrl ?? "",
    rating: s.rating,
    transactions: s.totalTransactions,
    thumbs: s.coverImages ?? [],
  };
}

// ── Cart → grouped CartGroup ──
export function adaptCartItems(items: ApiCartItem[]): { groups: CartGroup; likedIds: Set<string> } {
  const likedIds = new Set<string>();
  const groupMap = new Map<string, CartGroup>();
  for (const ci of items) {
    const prod = ci.productId;
    likedIds.add(prod._id);
    const sellerHandle = prod.sellerId?.handle ?? "unknown";
    const item = {
      id: hashId(prod._id),
      apiId: ci._id,
      productApiId: prod._id,
      name: prod.title,
      price: ci.priceSnapshot ?? prod.price,
      size: prod.size,
      qty: ci.quantity,
      image: prod.coverImage,
      checked: ci.checked,
      condition: prod.condition,
    };
    const existing = groupMap.get(sellerHandle);
    if (existing) {
      existing.items.push(item);
    } else {
      groupMap.set(sellerHandle, { seller: sellerHandle, items: [item] });
    }
  }
  return {
    groups: Array.from(groupMap.values()),
    likedIds,
  };
}

// ── Order ──
// Maps backend OrderStatus → frontend-compatible tab status for AccountScreen.
const STATUS_TAB_MAP: Record<string, "pending" | "shipping" | "delivering" | "review" | "cancelled"> = {
  PENDING_PAYMENT: "pending",
  PAID: "pending",
  CONFIRMED: "pending",
  PACKING: "pending",
  SHIPPING: "shipping",
  DELIVERING: "delivering",
  DELIVERED: "delivering",
  COMPLETED: "review",
  CANCELLED: "cancelled",
  DISPUTED: "delivering",
  REFUNDED: "cancelled",
};

// Maps a frontend tab intent to the corresponding backend OrderStatus so the
// UI can call PATCH /orders/:code/status with the right value.
export const STATUS_INTENT_MAP: Record<string, string> = {
  pending: "PENDING_PAYMENT",
  cancelled: "CANCELLED",
  completed: "COMPLETED",
  delivered: "DELIVERED",
  disputed: "DISPUTED",
};

export function getOrderTabStatus(
  status: string
): "pending" | "shipping" | "delivering" | "review" | "cancelled" {
  return STATUS_TAB_MAP[status] ?? "pending";
}

export function adaptOrder(o: ApiOrder): Order {
  return {
    id: o.orderCode,
    apiId: o._id,
    items: o.items.map((it): OrderItem => ({
      id: it.productId,
      name: it.productName,
      price: it.unitPrice,
      size: "",
      qty: it.quantity,
      image: it.productImageUrl ?? "",
      condition: it.conditionSnapshot ?? 0,
      seller: "",
    })),
    total: o.totalAmount,
    status: o.status as Order["status"],
    createdAt: new Date(o.createdAt).toLocaleDateString("vi-VN"),
    paymentMethod: o.paymentMethod ?? "",
    shippingName: o.shippingName,
    shippingPhone: o.shippingPhone,
    shippingAddress: o.shippingAddress,
    trackingNumber: o.trackingNumber,
    shippingProvider: o.shippingProvider,
    paidAt: o.paidAt,
  };
}

// ── Notification ──
export function adaptNotification(n: ApiNotification): Notification {
  return {
    id: hashId(n._id),
    apiId: n._id,
    type: n.type,
    title: n.title,
    desc: n.message ?? "",
    time: timeAgo(new Date(n.createdAt)),
    read: n.isRead,
    icon: iconForType(n.type),
  };
}

function iconForType(t: ApiNotification["type"]): string {
  switch (t) {
    case "order":
      return "Package";
    case "chat":
      return "MessageCircle";
    case "promo":
      return "Percent";
    case "system":
      return "Bell";
    case "review":
      return "Star";
  }
}

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  return date.toLocaleDateString("vi-VN");
}

// ── Product → SellerProduct (for seller dashboard) ──
export function adaptToSellerProduct(p: ApiProduct, sellerHandle: string): SellerProduct {
  return {
    id: hashId(p._id),
    apiId: p._id,
    name: p.title,
    price: p.price,
    quantity: p.quantity,
    status: p.status === "active" ? "active" : p.status === "sold" ? "sold" : "pending",
    image: p.coverImage,
    views: p.views,
    likes: p.likes,
    createdAt: new Date().toLocaleDateString("vi-VN"),
    seller: sellerHandle,
  };
}
