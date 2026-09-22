import React, { useState, useEffect, useCallback } from "react";
import { Sparkles } from "lucide-react";
import {
  T, ESPRESSO, COFFEE, LINEN, MUTED, SOFT, ff, serif,
  getStoredUser, setStoredUser, clearStoredUser,
  getStoredLikedProducts, setStoredLikedProducts,
  getStoredJSON, setStoredJSON, getStoredString, setStoredString, removeStored,
  STORAGE_KEYS,
} from "../lib/theme";
// Categories come from lib/categories.ts; chat contacts (UI-only) come from data/mock.
// We intentionally avoid using any mock data for products/cart/orders —
// those are 100% server-driven now.
import type {
  Screen, Product, Seller, CartGroup, Order, OrderItem, SellerProduct, Notification,
} from "../types";
import { api, ApiError, setToken } from "../lib/api";
import {
  adaptProduct, adaptOrder, adaptCartItems, adaptNotification, adaptToSellerProduct,
} from "../lib/adapters";

import { Header } from "../components/layout/Header";
import { Footer } from "../components/layout/Footer";

import { LoginScreen } from "../pages/auth/LoginScreen";
import { RegisterScreen } from "../pages/auth/RegisterScreen";
import { HomeScreen } from "../pages/home/HomeScreen";
import { SearchScreen } from "../pages/search/SearchScreen";
import { CartScreen } from "../pages/cart/CartScreen";
import { ChatScreen } from "../pages/chat/ChatScreen";
import { NotificationScreen } from "../pages/notification/NotificationScreen";
import { ProductDetailScreen } from "../pages/product-detail/ProductDetailScreen";
import { SellerScreen } from "../pages/seller/SellerScreen";
import { PaymentScreen } from "../pages/payment/PaymentScreen";
import { PostScreen } from "../pages/post/PostScreen";
import { AccountScreen } from "../pages/account/AccountScreen";
import { AdminScreen } from "../pages/admin/AdminScreen";

interface AuthUser {
  name: string;
  email: string;
  token: string;
  roles: string[];
}

const SESSION_KEY = "thriftit_session";

function getStoredSession(): AuthUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser;
    return parsed?.token ? parsed : null;
  } catch {
    return null;
  }
}

function setStoredSession(u: AuthUser | null) {
  try {
    if (u) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(u));
      setToken(u.token);
    } else {
      localStorage.removeItem(SESSION_KEY);
      setToken(null);
    }
  } catch {}
}

export default function App() {
  const session = getStoredSession();
  const storedUser = getStoredUser();
  const storedLiked = getStoredLikedProducts();
  const storedCart = getStoredJSON<CartGroup[]>(STORAGE_KEYS.cart);

  const [screen, setScreen] = useState<Screen>(() => {
    const u = getStoredSession();
    if (!u) return storedUser.name ? "login" : "login";
    if (u.email === "admin@thriftit.vn") return "admin";
    const savedScreen = getStoredString(STORAGE_KEYS.screen);
    return (savedScreen as Screen) || "home";
  });

  // Products: loaded from backend. Empty initial state — show loading skeleton until API responds.
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);

  // Cart: server-driven, empty when no session.
  const [cartGroups, setCartGroups] = useState<CartGroup[]>([]);
  const [cartLoading, setCartLoading] = useState(false);

  // Orders: server-driven, empty when no session.
  const [orders, setOrders] = useState<Order[]>([]);

  const [currentUser, setCurrentUser] = useState<string>(session?.name || storedUser.name || "Nguyễn Thanh Linh");
  const [currentEmail, setCurrentEmail] = useState<string>(session?.email || storedUser.email || "linh.nguyen@gmail.com");
  const [currentRoles, setCurrentRoles] = useState<string[]>(session?.roles || []);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null);
  const [activeTag, setActiveTag] = useState<string>("");
  const [headerQuery, setHeaderQuery] = useState<string>("");
  const [userRole, setUserRole] = useState<"buyer" | "seller">(() => {
    const saved = getStoredString(STORAGE_KEYS.userRole);
    if (saved === "buyer" || saved === "seller") return saved;
    if (session?.email === "shop.minhtu@thriftit.vn" || currentEmail === "shop.minhtu@thriftit.vn") return "seller";
    return "buyer";
  });
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState<number>(0);

  // Seller's own listings, populated by API per session. No mock fallback.
  const [myProductsByEmail, setMyProductsByEmail] = useState<Record<string, SellerProduct[]>>({});

  const myProducts = myProductsByEmail[currentEmail] || [];
  const setMyProducts = (newProds: React.SetStateAction<SellerProduct[]>) => {
    setMyProductsByEmail((prev) => ({
      ...prev,
      [currentEmail]:
        typeof newProds === "function" ? (newProds as (prev: SellerProduct[]) => SellerProduct[])(prev[currentEmail] || []) : newProds,
    }));
  };

  // ── Initial products load from API ──
  useEffect(() => {
    setProductsLoading(true);
    api
      .get<{ products: import("../lib/api").ApiProduct[] }>("/products")
      .then((res) => {
        const likedIds = new Set(getStoredLikedProducts().map(String));
        const adapted = res.products.map((p) => adaptProduct(p, likedIds));
        setProducts(adapted);
      })
      .catch(() => {
        // backend down → keep mock fallback
      })
      .finally(() => setProductsLoading(false));
  }, []);

  // ── Hydrate cart + orders + seller dashboard when session is active ──
  useEffect(() => {
    if (!session?.token) {
      setUnreadNotifications(0);
      return;
    }

    setCartLoading(true);
    api
      .get<{ cart: unknown; items: import("../lib/api").ApiCartItem[] }>("/cart")
      .then((res) => {
        const { groups } = adaptCartItems(res.items);
        setCartGroups(groups);
      })
      .catch(() => {})
      .finally(() => setCartLoading(false));

    api
      .get<{ orders: import("../lib/api").ApiOrder[] }>("/orders")
      .then((res) => setOrders(res.orders.map(adaptOrder)))
      .catch(() => {});

    api
      .get<{ notifications: import("../lib/api").ApiNotification[] }>("/notifications")
      .then((res) => {
        setUnreadNotifications(res.notifications.filter((n) => !n.isRead).length);
      })
      .catch(() => {});

    if (currentRoles.includes("admin")) {
      api
        .get<{ products: import("../lib/api").ApiProduct[] }>("/admin/pending-listings")
        .then((res) => {
          const pending: SellerProduct[] = res.products.map((p) =>
            adaptToSellerProduct(p, p.sellerId?.handle ?? "")
          );
          setMyProductsByEmail((prev) => ({
            ...prev,
            [currentEmail]: [
              ...pending,
              ...(prev[currentEmail] || []).filter(
                (x) => !pending.some((pp) => pp.apiId === x.apiId)
              ),
            ],
          }));
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  // Only user-role preference is kept in localStorage. Everything else is server-driven.

  useEffect(() => {
    setStoredString(STORAGE_KEYS.userRole, userRole);
  }, [userRole]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // ── Post a new listing (still works offline + queues nothing; backend POST) ──
  const handleAddProduct = (newProd: {
    name: string; price: number; category: string; desc: string; size: string; condition: number; image: string;
  }) => {
    const newId = products.length > 0 ? Math.max(...products.map((p) => p.id)) + 1 : 1;
    const sellerHandle = currentEmail === "shop.minhtu@thriftit.vn" ? "minhtu.vintage" : "linh.vintage";

    const addedProduct: Product = {
      id: newId,
      name: newProd.name,
      price: newProd.price,
      seller: sellerHandle,
      condition: newProd.condition,
      size: newProd.size,
      category: newProd.category,
      image: newProd.image,
      liked: false,
      status: "pending",
    };
    setProducts((prev) => [addedProduct, ...prev]);

    const newSellerProd: SellerProduct = {
      id: newId,
      name: newProd.name,
      price: newProd.price,
      quantity: 1,
      status: "pending",
      image: newProd.image,
      views: 0,
      likes: 0,
      createdAt: new Date().toLocaleDateString("vi-VN"),
    };
    setMyProducts((prev) => [newSellerProd, ...prev]);

    // Fire-and-forget to backend
    api
      .post<{ product: import("../lib/api").ApiProduct }>("/products", {
        title: newProd.name,
        price: newProd.price,
        condition: newProd.condition,
        size: newProd.size,
        quantity: 1,
        description: newProd.desc,
        coverImage: newProd.image,
      })
      .catch(() => {/* offline → keep local optimistic update */});

    showToast(`Đã gửi yêu cầu đăng bán sản phẩm "${newProd.name}". Admin sẽ duyệt tin của bạn trong thời gian sớm nhất!`);
  };

  const SCREEN_LABEL: Record<Screen, string> = {
    login: "Đăng nhập",
    register: "Đăng ký",
    home: "Trang chủ",
    search: "Tìm kiếm",
    cart: "Giỏ hàng",
    chat: "Tin nhắn",
    notification: "Thông báo",
    "product-detail": "Chi tiết sản phẩm",
    seller: "Shop",
    payment: "Thanh toán",
    account: "Tài khoản",
    post: "Đăng bán",
    admin: "Bảng quản trị",
  };

  const go = (s: Screen, product?: Product, seller?: Seller) => {
    if (currentEmail === "admin@thriftit.vn" && s !== "admin" && s !== "login") {
      setScreen("admin");
      setStoredString(STORAGE_KEYS.screen, "admin");
      return;
    }
    if (product) setSelectedProduct(product);
    if (seller) setSelectedSeller(seller);
    setScreen(s);
    setStoredString(STORAGE_KEYS.screen, s);
    // Reset scroll on screen change so we don't jump mid-page.
    window.scrollTo({ top: 0 });
  };

  const goToSearchWithTag = (tag: string) => {
    setActiveTag(tag);
    setScreen("search");
  };

  const toggleLike = (id: number) => {
    setProducts((prev) => {
      const updated = prev.map((p) => (p.id === id ? { ...p, liked: !p.liked } : p));
      const likedIds = updated.filter((p) => p.liked).map((p) => p.id);
      setStoredLikedProducts(likedIds);
      return updated;
    });
  };

  const updateCart = (newCart: CartGroup[]) => {
    setCartGroups(newCart);
    setStoredJSON(STORAGE_KEYS.cart, newCart);
  };

  // ── Cart mutations wired to backend ──
  // The UI updates locally first (optimistic), then we PATCH the server so
  // the source of truth stays correct across devices / page reloads.
  const updateCartItemApi = (
    itemApiId: string,
    patch: { quantity?: number; checked?: boolean }
  ) => {
    if (!session?.token) return;
    api.patch(`/cart/items/${itemApiId}`, patch).catch((err) => {
      console.warn("[cart] PATCH failed:", err);
    });
  };

  const deleteCartItemApi = (itemApiId: string) => {
    if (!session?.token) return;
    api.delete(`/cart/items/${itemApiId}`).catch((err) => {
      console.warn("[cart] DELETE failed:", err);
    });
  };

  // ── addToCart: optimistic local + backend POST if logged in ──
  const addToCart = (product: Product, qty: number = 1) => {
    showToast(`Đã thêm ${qty} x "${product.name}" vào giỏ hàng!`);

    // Optimistic local update
    setCartGroups((prev) => {
      const existingGroup = prev.find((g) => g.seller === product.seller);
      if (existingGroup) {
        const existingItem = existingGroup.items.find((i) => i.id === product.id);
        if (existingItem) {
          return prev.map((g) =>
            g.seller === product.seller
              ? {
                  ...g,
                  items: g.items.map((i) =>
                    i.id === product.id ? { ...i, qty: i.qty + qty } : i
                  ),
                }
              : g
          );
        }
        return prev.map((g) =>
          g.seller === product.seller
            ? {
                ...g,
                items: [
                  ...g.items,
                  {
                    id: product.id,
                    name: product.name,
                    price: product.price,
                    size: product.size,
                    qty,
                    image: product.image,
                    checked: false,
                    condition: product.condition,
                    apiId: product.apiId,
                    productApiId: product.apiId,
                  },
                ],
              }
            : g
        );
      }
      return [
        ...prev,
        {
          seller: product.seller,
          items: [
            {
              id: product.id,
              name: product.name,
              price: product.price,
              size: product.size,
              qty,
              image: product.image,
              checked: false,
              condition: product.condition,
              apiId: product.apiId,
              productApiId: product.apiId,
            },
          ],
        },
      ];
    });

    // Backend call if logged in
    if (product.apiId && session?.token) {
      api
        .post<{ item: unknown }>("/cart/items", { productId: product.apiId, quantity: qty })
        .catch(() => {/* offline → keep local */});
    }
  };

  const cartCount = cartGroups.flatMap((g) => g.items).filter((i) => i.checked).length;

  // ── LOGIN ──
  const handleLogin = async (userName: string, userEmail: string, password?: string) => {
    // First try real backend login if a password is provided.
    if (password) {
      try {
        const res = await api.post<{ token: string; user: { name: string; email: string; roles: string[] } }>(
          "/auth/login",
          { email: userEmail, password }
        );
        const next: AuthUser = {
          name: res.user.name,
          email: res.user.email,
          token: res.token,
          roles: res.user.roles,
        };
        setStoredSession(next);
        setCurrentUser(next.name);
        setCurrentEmail(next.email);
        setCurrentRoles(next.roles);
        setStoredUser(next.name, next.email);
        setUserRole(next.roles.includes("seller") ? "seller" : "buyer");

        // Merge any guest cart items the user accumulated before signing in.
        const guestCart = getStoredJSON<CartGroup[]>(STORAGE_KEYS.cart) ?? [];
        const guestItems = guestCart.flatMap((g) =>
          g.items
            .filter((i) => !!i.productApiId)
            .map((i) => ({ productId: i.productApiId as string, quantity: i.qty }))
        );
        if (guestItems.length > 0) {
          try {
            const merged = await api.post<{ items: import("../lib/api").ApiCartItem[] }>(
              "/auth/cart/merge",
              { items: guestItems }
            );
            const { groups } = adaptCartItems(merged.items);
            setCartGroups(groups);
            setStoredJSON(STORAGE_KEYS.cart, groups);
            showToast(
              `Chào mừng ${next.name}! Đã gộp ${guestItems.length} sản phẩm từ giỏ tạm vào tài khoản.`
            );
          } catch (err) {
            console.warn("[cart] merge failed:", err);
            showToast(`Chào mừng ${next.name}!`);
          }
        } else {
          showToast(`Chào mừng ${next.name}!`);
        }

        if (next.email === "admin@thriftit.vn") {
          go("admin");
        } else {
          go("home");
        }
        showToast(`Chào mừng ${next.name}!`);
        return;
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : "Đăng nhập thất bại";
        showToast(`⚠️ ${msg}`);
        return;
      }
    }

    // Fallback: offline/demo login (no password) — useful when backend is down.
    setCurrentUser(userName);
    setCurrentEmail(userEmail);
    setStoredUser(userName, userEmail);
    setCurrentRoles([userEmail === "shop.minhtu@thriftit.vn" ? "seller" : "buyer"]);
    setUserRole(userEmail === "shop.minhtu@thriftit.vn" ? "seller" : "buyer");

    if (userEmail === "admin@thriftit.vn") {
      go("admin");
    } else {
      go("home");
    }
  };

  // ── REGISTER ──
  const handleRegister = async (name: string, email: string, password: string) => {
    try {
      const res = await api.post<{ token: string; user: { name: string; email: string; roles: string[] } }>(
        "/auth/register",
        { name, email, password }
      );
      const next: AuthUser = {
        name: res.user.name,
        email: res.user.email,
        token: res.token,
        roles: res.user.roles,
      };
      setStoredSession(next);
      setCurrentUser(next.name);
      setCurrentEmail(next.email);
      setCurrentRoles(next.roles);
      setStoredUser(next.name, next.email);
      setUserRole("buyer");
      go("home");
      showToast("Đăng ký thành công!");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Đăng ký thất bại";
      showToast(`⚠️ ${msg}`);
    }
  };

  const handleLogout = () => {
    setCurrentUser("Nguyễn Thanh Linh");
    setCurrentEmail("linh.nguyen@gmail.com");
    setCurrentRoles([]);
    setUserRole("buyer");
    setStoredSession(null);
    clearStoredUser();
    removeStored(STORAGE_KEYS.screen);
    removeStored(STORAGE_KEYS.products);
    removeStored(STORAGE_KEYS.myProductsByEmail);
    removeStored(STORAGE_KEYS.orders);
    removeStored(STORAGE_KEYS.userRole);

    // Reset to empty — products will reload from API on next mount, cart/orders are server-driven per session.
    setProducts([]);
    setOrders([]);
    setCartGroups([]);
    setMyProductsByEmail({});

    go("login");
  };

  // ── CHECKOUT → POST /api/orders ──
  const addOrder = async (
    orderItems: OrderItem[],
    total: number,
    paymentMethod: string,
    name?: string,
    phone?: string,
    address?: string
  ) => {
    // Idempotency key so a retry / double-click never produces two orders.
    const idempotencyKey = `idem-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

    // Local optimistic update
    const localOrder: Order = {
      id: `ORD-${Date.now().toString().slice(-6)}`,
      items: orderItems,
      total,
      status: "PENDING_PAYMENT",
      createdAt: new Date().toLocaleDateString("vi-VN"),
      paymentMethod,
      shippingName: name,
      shippingPhone: phone,
      shippingAddress: address,
    };
    setOrders((prev) => [localOrder, ...prev]);

    const purchasedIds = orderItems.map((item) => Number(item.id));

    if (session?.token) {
      try {
        const res = await api.post<{ order: import("../lib/api").ApiOrder }>("/orders", {
          shippingName: name,
          shippingPhone: phone,
          shippingAddress: address,
          paymentMethod,
          idempotencyKey,
        });
        // replace optimistic order with server one
        const serverOrder = adaptOrder(res.order);
        setOrders((prev) => [serverOrder, ...prev.filter((o) => o.id !== localOrder.id)]);

        // Refresh cart from server (it now has fewer items).
        try {
          const fresh = await api.get<{ items: import("../lib/api").ApiCartItem[] }>("/cart");
          const { groups } = adaptCartItems(fresh.items);
          setCartGroups(groups);
        } catch {/* best-effort */}

        // Auto-pay (mock) so the state machine advances. In production this
        // is replaced by a gateway webhook.
        try {
          await api.post<{ order: import("../lib/api").ApiOrder }>("/payments/checkout", {
            orderId: serverOrder.apiId ?? serverOrder.id,
            method: "card",
            cardLast4: "1234",
          });
          showToast(`✓ Đơn ${serverOrder.id} đã thanh toán và chờ shop xác nhận`);
        } catch (payErr) {
          const msg = payErr instanceof ApiError ? payErr.message : "thanh toán thất bại";
          showToast(`⚠️ Đơn đã tạo nhưng thanh toán lỗi: ${msg}`);
        }
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : "Không kết nối được backend";
        showToast(`⚠️ Đơn đã tạo offline: ${msg}`);
      }
    }
  };

  const handleUpdateOrderStatus = (orderId: string, nextStatus: Order["status"]) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o)));

    let msg = "";
    if (nextStatus === "CANCELLED") msg = "Đã hủy đơn hàng thành công!";
    else if (nextStatus === "DELIVERED") msg = "Đã nhận hàng thành công! Bạn có thể đánh giá sản phẩm.";
    else if (nextStatus === "COMPLETED") msg = "Cảm ơn bạn đã gửi đánh giá sản phẩm!";
    if (msg) showToast(msg);

    if (session?.token) {
      api
        .patch(`/orders/${orderId}/status`, { status: nextStatus })
        .catch((err) => {
          console.warn("[order] status update failed:", err);
          const apiMsg = err instanceof ApiError ? err.message : "transition rejected";
          showToast(`⚠️ Không thể đổi trạng thái: ${apiMsg}`);
          // Roll back local change
          api.get<{ orders: import("../lib/api").ApiOrder[] }>("/orders").then((res) => {
            setOrders(res.orders.map(adaptOrder));
          }).catch(() => {});
        });
    }
  };

  return (
    <div className="w-full max-w-[1440px] mx-auto min-w-[320px] shadow-sm relative" style={{ backgroundColor: LINEN, ...ff }}>
      {toastMsg && (
        <div
          className="fixed top-24 right-8 z-[9999] px-6 py-4 rounded-2xl shadow-xl flex items-center gap-3 animate-fade-in-down transition-all"
          style={{ backgroundColor: ESPRESSO, color: LINEN, border: `1.5px solid ${T}` }}
        >
          <Sparkles size={18} style={{ color: T }} />
          <span className="text-sm font-bold">{toastMsg}</span>
        </div>
      )}

      {screen === "login" && (
        <LoginScreen
          onLogin={(name, email, pwd) => handleLogin(name, email, pwd)}
          onRegister={() => go("register")}
        />
      )}
      {screen === "register" && (
        <RegisterScreen onRegister={(name, email, pwd) => handleRegister(name, email, pwd)} onBack={() => go("login")} />
      )}
      {screen !== "login" && screen !== "register" && (
        <>
          {screen !== "admin" && (
            <Header
              screen={screen}
              go={go}
              cartCount={cartCount}
              activeTag={activeTag}
              onTagChange={goToSearchWithTag}
              headerQuery={headerQuery}
              setHeaderQuery={setHeaderQuery}
              currentUserEmail={currentEmail}
              unreadNotifications={unreadNotifications}
            />
          )}
          <main>
            {screen === "home" && (
              <HomeScreen
                go={go}
                products={products.filter((p) => p.status === "active")}
                onLike={toggleLike}
                onAddToCart={addToCart}
                loading={productsLoading}
              />
            )}
            {screen === "search" && (
              <SearchScreen
                products={products.filter((p) => p.status === "active")}
                onLike={toggleLike}
                go={go}
                onAddToCart={addToCart}
                activeTag={activeTag}
                headerQuery={headerQuery}
              />
            )}
            {screen === "cart" && (
              <CartScreen
                go={go}
                cartGroups={cartGroups}
                updateCart={updateCart}
                syncItem={updateCartItemApi}
                deleteItem={deleteCartItemApi}
              />
            )}
            {screen === "chat" && <ChatScreen />}
            {screen === "notification" && <NotificationScreen go={go} />}
            {screen === "product-detail" && selectedProduct && (
              <ProductDetailScreen product={selectedProduct} go={go} onLike={toggleLike} onAddToCart={addToCart} />
            )}
            {screen === "seller" && selectedSeller && (
              <SellerScreen
                seller={selectedSeller}
                go={go}
                products={products.filter((p) => p.status === "active")}
                onAddToCart={addToCart}
              />
            )}
            {screen === "payment" && (
              <PaymentScreen go={go} cartGroups={cartGroups} updateCart={updateCart} addOrder={addOrder} />
            )}
            {screen === "account" && (
              <AccountScreen
                go={go}
                onLogout={handleLogout}
                userName={currentUser}
                userEmail={currentEmail}
                orders={orders}
                myProducts={myProducts}
                setMyProducts={setMyProducts}
                userRole={userRole}
                setUserRole={setUserRole}
                showToast={showToast}
                onUpdateOrderStatus={handleUpdateOrderStatus}
              />
            )}
            {screen === "post" && <PostScreen go={go} onAddProduct={handleAddProduct} />}
            {screen === "admin" && (
              <AdminScreen
                go={go}
                products={products}
                setProducts={setProducts}
                myProductsByEmail={myProductsByEmail}
                setMyProductsByEmail={setMyProductsByEmail}
                userRole={userRole}
                setUserRole={setUserRole}
                onLogout={handleLogout}
              />
            )}
          </main>
          {screen !== "cart" && screen !== "payment" && screen !== "admin" && <Footer go={go} />}
        </>
      )}
    </div>
  );
}
