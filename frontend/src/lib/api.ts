// Thin fetch wrapper that:
//   - prepends /api (Vite dev proxies to backend on :4000)
//   - injects JWT from localStorage when present
//   - parses JSON
//   - throws ApiError with a useful message on non-2xx

function resolveBaseUrl(): string {
  let url = (import.meta.env.VITE_API_URL || "/api").trim();
  if (url === "/api" || url.startsWith("/")) return url;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }
  if (!url.endsWith("/api")) {
    url = `${url.replace(/\/+$/, "")}/api`;
  }
  return url;
}

const BASE = resolveBaseUrl();
const TOKEN_KEY = "thriftit_token";

export class ApiError extends Error {
  status: number;
  details: unknown;
  constructor(message: string, status: number, details: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export function getToken(): string | null {
  try {
    const direct = localStorage.getItem(TOKEN_KEY);
    if (direct) return direct;
    const sessionStr = localStorage.getItem("thriftit_session");
    if (sessionStr) {
      const parsed = JSON.parse(sessionStr);
      return parsed?.token || null;
    }
    return null;
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem("thriftit_session");
    }
  } catch {}
}

interface RequestInitJson extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** When true, swallow non-2xx and return null instead of throwing. */
  softFail?: boolean;
}

async function request<T>(path: string, init: RequestInitJson = {}): Promise<T> {
  const { body, headers, softFail, ...rest } = init;

  const token = getToken();
  const finalHeaders: Record<string, string> = {
    Accept: "application/json",
    ...(headers as Record<string, string> | undefined),
  };
  if (body !== undefined && !(body instanceof FormData)) {
    finalHeaders["Content-Type"] = "application/json";
  }
  if (token) finalHeaders["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: finalHeaders,
    body:
      body === undefined || body === null
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });

  if (!res.ok) {
    if (res.status === 401) {
      setToken(null);
    }
    let details: unknown = null;
    try {
      details = await res.json();
    } catch {
      try {
        details = await res.text();
      } catch {}
    }
    if (softFail) return null as unknown as T;
    const msg =
      (details && typeof details === "object" && "error" in details && (details as { error: string }).error) ||
      `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, details);
  }

  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

// ── Public helpers ──
export const api = {
  get: <T,>(path: string, init?: RequestInitJson) => request<T>(path, { ...init, method: "GET" }),
  post: <T,>(path: string, body?: unknown, init?: RequestInitJson) =>
    request<T>(path, { ...init, method: "POST", body }),
  patch: <T,>(path: string, body?: unknown, init?: RequestInitJson) =>
    request<T>(path, { ...init, method: "PATCH", body }),
  delete: <T,>(path: string, init?: RequestInitJson) =>
    request<T>(path, { ...init, method: "DELETE" }),
};

// ── Typed wrappers for backend models ──
// Kept loose (loose typing) because the rest of the frontend expects the
// exact Product/Seller/Order shapes it already had. The wrappers just give
// us `await` ergonomics; the call sites cast to local types.

export type ApiProduct = {
  _id: string;
  title: string;
  description?: string;
  price: number;
  condition: number;
  size: string;
  quantity: number;
  status: "pending" | "active" | "reserved" | "sold" | "archived";
  reservedUntil?: string | null;
  reservedByOrderId?: string | null;
  coverImage: string;
  views: number;
  likes: number;
  location?: string;
  seller?: string;
  sellerName?: string;
  sellerAvatar?: string;
  sellerId: {
    _id: string;
    handle: string;
    shopName: string;
    avatarUrl?: string;
    rating?: number;
  };
  categoryId?: { _id: string; name: string; slug: string };
};

export type ApiSeller = {
  _id: string;
  shopName: string;
  handle: string;
  description?: string;
  avatarUrl?: string;
  coverImages: string[];
  rating: number;
  totalTransactions: number;
  totalRevenue?: number;
  commissionRate?: number;
  status?: "active" | "pending_approval" | "suspended";
};

export type ApiCartItem = {
  _id: string;
  cartId: string;
  productId: ApiProduct;
  quantity: number;
  priceSnapshot: number;
  checked: boolean;
};

export type ApiOrderItem = {
  productId: string;
  sellerId: string;
  productName: string;
  productImageUrl?: string;
  unitPrice: number;
  quantity: number;
  conditionSnapshot?: number;
  sellerAmount: number;
};

export type ApiOrderStatusEvent = {
  status: string;
  by: string;
  at: string;
  reason?: string;
};

export type ApiOrder = {
  _id: string;
  orderCode: string;
  buyerId: string;
  items: ApiOrderItem[];
  subtotal: number;
  shippingFee: number;
  platformFeeRate: number;
  platformFeeAmount: number;
  sellerAmount: number;
  discount: number;
  totalAmount: number;
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
  statusHistory?: ApiOrderStatusEvent[];
  paymentMethod?: string;
  paymentId?: string;
  paidAt?: string;
  shippingName?: string;
  shippingPhone?: string;
  shippingAddress?: string;
  trackingNumber?: string;
  shippingProvider?: string;
  idempotencyKey?: string;
  createdAt: string;
};

export type ApiNotification = {
  _id: string;
  userId: string;
  type: "order" | "chat" | "promo" | "system" | "review";
  title: string;
  message?: string;
  isRead: boolean;
  createdAt: string;
};

export type ApiSessionUser = {
  id: string;
  email: string;
  name: string;
  roles: ("buyer" | "seller" | "admin")[];
};
