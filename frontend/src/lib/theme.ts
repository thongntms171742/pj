// ── Brand palette ──────────────────────────────────────────────────────────────
export const T = "#D27D2D";
export const ESPRESSO = "#3A2312";
export const COFFEE = "#6F4E37";
export const LINEN = "#FAF0E6";
export const CARD = "#FFF8F0";
export const MUTED = "#E8D5BC";
export const SOFT = "#EFE0CC";

// ── Typography presets ──────────────────────────────────────────────────────────
export const ff: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" };
export const serif: React.CSSProperties = { fontFamily: "'Playfair Display', serif" };

// ── Formatters ─────────────────────────────────────────────────────────────────
export function fmt(n: number): string {
  return n.toLocaleString("vi-VN") + "₫";
}

// ── LocalStorage keys ──────────────────────────────────────────────────────────
export const STORAGE_KEYS = {
  currentUser: "thriftit_currentUser",
  currentEmail: "thriftit_currentEmail",
  cart: "thriftit_cart",
  likedProducts: "thriftit_likedProducts",
  products: "thriftit_products",
  myProductsByEmail: "thriftit_myProductsByEmail",
  orders: "thriftit_orders",
  screen: "thriftit_screen",
  userRole: "thriftit_userRole",
};

// ── Storage helpers (generic) ──────────────────────────────────────────────────
export function getStoredJSON<T>(key: string): T | null {
  try {
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : null;
  } catch {
    return null;
  }
}

export function setStoredJSON<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function getStoredString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setStoredString(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export function removeStored(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

// ── User session helpers ───────────────────────────────────────────────────────
export function getStoredUser() {
  try {
    const name = localStorage.getItem(STORAGE_KEYS.currentUser);
    const email = localStorage.getItem(STORAGE_KEYS.currentEmail);
    return { name, email };
  } catch {
    return { name: null, email: null };
  }
}

export function setStoredUser(name: string, email: string) {
  setStoredString(STORAGE_KEYS.currentUser, name);
  setStoredString(STORAGE_KEYS.currentEmail, email);
}

export function clearStoredUser() {
  removeStored(STORAGE_KEYS.currentUser);
  removeStored(STORAGE_KEYS.currentEmail);
}

// ── Liked products helpers ────────────────────────────────────────────────────
export function getStoredLikedProducts(): number[] {
  return getStoredJSON<number[]>(STORAGE_KEYS.likedProducts) || [];
}

export function setStoredLikedProducts(ids: number[]) {
  setStoredJSON(STORAGE_KEYS.likedProducts, ids);
}
