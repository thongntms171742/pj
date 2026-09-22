// ── Screen routing types ───────────────────────────────────────────────────────
export type Screen =
  | "login"
  | "register"
  | "home"
  | "search"
  | "cart"
  | "chat"
  | "account"
  | "post"
  | "notification"
  | "product-detail"
  | "seller"
  | "payment"
  | "admin";

// ── Product ─────────────────────────────────────────────────────────────────────
export interface Product {
  id: number;
  name: string;
  price: number;
  seller: string;
  sellerName?: string;
  condition: number;
  size: string;
  category: string;
  image: string;
  liked: boolean;
  status?: "active" | "pending" | "sold";
  apiId?: string;
}

// ── Seller ──────────────────────────────────────────────────────────────────────
export interface Seller {
  id: number;
  handle: string;
  name: string;
  avatar: string;
  rating: number;
  transactions: number;
  thumbs: string[];
}

// ── Cart ────────────────────────────────────────────────────────────────────────
export interface CartItem {
  id: number;
  apiId?: string;
  productApiId?: string;
  name: string;
  price: number;
  size: string;
  qty: number;
  image: string;
  checked: boolean;
  condition: number;
}

export interface CartGroup {
  seller: string;
  items: CartItem[];
}

// ── Order ───────────────────────────────────────────────────────────────────────
export interface OrderItem {
  id: string;
  name: string;
  price: number;
  size: string;
  qty: number;
  image: string;
  condition: number;
  seller: string;
}

export interface Order {
  id: string;
  apiId?: string;
  items: OrderItem[];
  total: number;
  status:
    | "PENDING_PAYMENT"
    | "PAID"
    | "CONFIRMED"
    | "PACKING"
    | "SHIPPING"
    | "DELIVERING"
    | "DELIVERED"
    | "COMPLETED"
    | "CANCELLED"
    | "DISPUTED"
    | "REFUNDED";
  createdAt: string;
  paymentMethod: string;
  trackingNumber?: string;
  shippingProvider?: string;
  paidAt?: string;
  shippingName?: string;
  shippingPhone?: string;
  shippingAddress?: string;
}

// ── Seller product (the owner's product listing) ───────────────────────────────
export interface SellerProduct {
  id: number;
  apiId?: string;
  name: string;
  price: number;
  quantity: number;
  status: "active" | "pending" | "sold";
  image: string;
  views: number;
  likes: number;
  createdAt: string;
  seller?: string;
}

// ── Account / Session ──────────────────────────────────────────────────────────
export interface MockAccount {
  email: string;
  password: string;
  name: string;
}

// ── Search filter state ────────────────────────────────────────────────────────
export interface FilterState {
  cats: string[];
  minP: string;
  maxP: string;
  sizes: string[];
  cond: number;
  ai: boolean;
}

// ── Contact / Chat ─────────────────────────────────────────────────────────────
export interface Contact {
  id: number;
  name: string;
  avatar: string;
  lastMsg: string;
  time: string;
  unread: number;
  product: { name: string; price: number; image: string };
}

export interface ChatMessage {
  id: number;
  from: "me" | "seller";
  text: string;
  time: string;
}

// ── Notification ──────────────────────────────────────────────────────────────
export interface Notification {
  id: number;
  apiId?: string;
  type: "order" | "chat" | "promo" | "system" | "review";
  title: string;
  desc: string;
  time: string;
  read: boolean;
  icon: string;
}

// ── Shipment (from GHTK / shipping providers) ─────────────────────────────────
export interface Shipment {
  _id: string;
  orderCode: string;
  provider: string;
  providerShipmentId: string;
  trackingNumber: string;
  status: ShipmentStatus;
  shippingFee: number;
  estimatedDeliveryAt?: string;
  shippedAt?: string;
  deliveredAt?: string;
  labelUrl?: string;
  trackingUrl?: string;
}

export type ShipmentStatus =
  | "PENDING"
  | "CREATED"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "DELIVERING"
  | "DELIVERED"
  | "RETURNED"
  | "CANCELLED"
  | "FAILED";
