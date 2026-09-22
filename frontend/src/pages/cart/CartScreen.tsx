import { useState } from "react";
import { ShoppingCart, Trash2, Tag, Percent, Sparkles } from "lucide-react";
import { BrandCheckbox } from "../../components/layout/Logo";
import { T, MUTED, COFFEE, LINEN, CARD, ESPRESSO, SOFT, fmt, serif, ff } from "../../lib/theme";
import type { CartGroup, Screen } from "../../types";

interface CartScreenProps {
  go: (s: Screen) => void;
  cartGroups: CartGroup[];
  updateCart: (cart: CartGroup[]) => void;
  // Optional backend sync callbacks. When omitted the screen still works
  // (e.g. while a guest session has no JWT).
  syncItem?: (itemApiId: string, patch: { quantity?: number; checked?: boolean }) => void;
  deleteItem?: (itemApiId: string) => void;
}

export function CartScreen({
  go,
  cartGroups,
  updateCart,
  syncItem,
  deleteItem,
}: CartScreenProps) {
  const [promo, setPromo] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoError, setPromoError] = useState(false);

  const allItems = cartGroups.flatMap((g) => g.items);
  const checkedItems = allItems.filter((i) => i.checked);
  const allChecked = allItems.length > 0 && allItems.every((i) => i.checked);
  const someChecked = allItems.some((i) => i.checked);

  const subtotal = checkedItems.reduce((s, i) => s + i.price * i.qty, 0);
  const discount = promoApplied ? Math.round(subtotal * 0.1) : 0;
  const ship = checkedItems.length > 0 ? 30000 : 0;
  const total = subtotal - discount + ship;

  const toggleAll = () => {
    const next = !allChecked;
    const newCart = cartGroups.map((g) => ({
      ...g,
      items: g.items.map((i) => ({ ...i, checked: next })),
    }));
    updateCart(newCart);
    for (const g of cartGroups) {
      for (const i of g.items) {
        if (i.apiId) syncItem?.(i.apiId, { checked: next });
      }
    }
  };
  const toggleGroup = (seller: string) => {
    const group = cartGroups.find((g) => g.seller === seller);
    if (!group) return;
    const allGroupChecked = group.items.every((i) => i.checked);
    const newCart = cartGroups.map((g) =>
      g.seller !== seller ? g : { ...g, items: g.items.map((i) => ({ ...i, checked: !allGroupChecked })) }
    );
    updateCart(newCart);
    for (const i of group.items) {
      if (i.apiId) syncItem?.(i.apiId, { checked: !allGroupChecked });
    }
  };
  const toggleItem = (seller: string, id: number) => {
    const target = cartGroups.find((g) => g.seller === seller)?.items.find((i) => i.id === id);
    const newCart = cartGroups.map((g) =>
      g.seller !== seller
        ? g
        : { ...g, items: g.items.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)) }
    );
    updateCart(newCart);
    if (target?.apiId) syncItem?.(target.apiId, { checked: !target.checked });
  };
  const adjustQty = (seller: string, id: number, d: number) => {
    const target = cartGroups.find((g) => g.seller === seller)?.items.find((i) => i.id === id);
    const newQty = target ? Math.max(1, target.qty + d) : 1;
    const newCart = cartGroups.map((g) =>
      g.seller !== seller
        ? g
        : {
            ...g,
            items: g.items.map((i) => (i.id === id ? { ...i, qty: newQty } : i)),
          }
    );
    updateCart(newCart);
    if (target?.apiId) syncItem?.(target.apiId, { quantity: newQty });
  };
  const removeItem = (seller: string, id: number) => {
    const target = cartGroups.find((g) => g.seller === seller)?.items.find((i) => i.id === id);
    const newCart = cartGroups
      .map((g) => ({ ...g, items: g.items.filter((i) => !(g.seller === seller && i.id === id)) }))
      .filter((g) => g.items.length > 0);
    updateCart(newCart);
    if (target?.apiId) deleteItem?.(target.apiId);
  };
  const removeChecked = () => {
    const toDelete = cartGroups.flatMap((g) => g.items.filter((i) => i.checked && i.apiId));
    const newCart = cartGroups
      .map((g) => ({ ...g, items: g.items.filter((i) => !i.checked) }))
      .filter((g) => g.items.length > 0);
    updateCart(newCart);
    for (const i of toDelete) {
      deleteItem?.(i.apiId as string);
    }
  };

  const applyPromo = () => {
    if (!promo.trim()) return;
    if (promo.toUpperCase() === "THRIFT10" || promo.toUpperCase() === "VINTAGE") {
      setPromoApplied(true);
      setPromoError(false);
    } else {
      setPromoError(true);
      setPromoApplied(false);
    }
  };

  return (
    <div style={{ backgroundColor: LINEN, minHeight: "100vh" }}>
      <div style={{ backgroundColor: COFFEE, borderBottom: `2px solid rgba(0,0,0,0.15)` }}>
        <div className="max-w-[1440px] mx-auto px-8 py-4 flex items-center gap-3">
          <ShoppingCart size={22} style={{ color: LINEN }} />
          <h1 className="text-xl font-bold italic" style={{ ...serif, color: LINEN }}>
            Giỏ hàng của tôi
          </h1>
          <span
            className="text-sm px-3 py-0.5 rounded-full ml-1"
            style={{ backgroundColor: "rgba(255,255,255,0.18)", color: LINEN, ...ff }}
          >
            {allItems.length} sản phẩm
          </span>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-8 py-8">
        {allItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-28 gap-5">
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center"
              style={{ backgroundColor: MUTED }}
            >
              <ShoppingCart size={44} style={{ color: COFFEE }} strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <p className="text-xl font-bold mb-1" style={{ ...serif, color: ESPRESSO }}>
                Giỏ hàng trống
              </p>
              <p className="text-sm" style={{ color: COFFEE, ...ff }}>
                Hãy thêm vài món vintage vào giỏ nhé!
              </p>
            </div>
            <button
              className="px-8 py-3 rounded-xl font-bold text-sm transition-all hover:opacity-90 shadow-md"
              style={{ backgroundColor: T, color: LINEN, ...ff }}
            >
              Tiếp tục mua sắm
            </button>
          </div>
        ) : (
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: "28px", alignItems: "start" }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div
                className="flex items-center gap-4 px-5 py-3 rounded-2xl"
                style={{ backgroundColor: CARD, border: `1px solid ${MUTED}` }}
              >
                <BrandCheckbox checked={allChecked} onClick={toggleAll} />
                <span className="text-sm font-semibold" style={{ color: ESPRESSO, ...ff }}>
                  Chọn tất cả ({allItems.length} sản phẩm)
                </span>
                {someChecked && (
                  <button
                    onClick={removeChecked}
                    className="ml-auto text-xs font-semibold flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all hover:opacity-80"
                    style={{ color: "#C0392B", backgroundColor: "#FDEDEC", ...ff }}
                  >
                    <Trash2 size={12} /> Xóa đã chọn ({checkedItems.length})
                  </button>
                )}
              </div>

              {cartGroups.map((group) => {
                const groupChecked = group.items.every((i) => i.checked);
                const groupTotal = group.items
                  .filter((i) => i.checked)
                  .reduce((s, i) => s + i.price * i.qty, 0);
                return (
                  <div
                    key={group.seller}
                    className="rounded-2xl overflow-hidden"
                    style={{
                      backgroundColor: CARD,
                      border: `1px solid ${MUTED}`,
                      boxShadow: "0 2px 8px rgba(58,35,18,0.06)",
                    }}
                  >
                    <div
                      className="flex items-center gap-3 px-5 py-3"
                      style={{ backgroundColor: SOFT, borderBottom: `1px solid ${MUTED}` }}
                    >
                      <BrandCheckbox
                        checked={groupChecked}
                        onClick={() => toggleGroup(group.seller)}
                      />
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                        style={{ backgroundColor: COFFEE, color: LINEN }}
                      >
                        {group.seller.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-bold" style={{ color: ESPRESSO, ...ff }}>
                          @{group.seller}
                        </span>
                        <span
                          className="ml-2 text-xs px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: `${T}22`, color: T, ...ff }}
                        >
                          ⭐ Shop uy tín
                        </span>
                      </div>
                      <span className="text-xs font-semibold" style={{ color: COFFEE, ...ff }}>
                        {group.items.length} món · {fmt(groupTotal)}
                      </span>
                    </div>

                    {group.items.map((item, idx) => (
                      <div
                        key={`${item.id}-buy`}
                        className="flex items-center gap-4 px-5 py-4"
                        style={{
                          borderBottom: idx < group.items.length - 1 ? `1px solid ${MUTED}55` : "none",
                          backgroundColor: item.checked ? `${T}06` : CARD,
                          transition: "background-color 0.15s",
                        }}
                      >
                        <BrandCheckbox
                          checked={item.checked}
                          onClick={() => toggleItem(group.seller, item.id)}
                        />

                        <div className="relative flex-shrink-0">
                          <img
                            src={item.image}
                            alt={item.name}
                            style={{
                              width: 88,
                              height: 88,
                              objectFit: "cover",
                              borderRadius: 12,
                              border: `1px solid ${MUTED}`,
                            }}
                          />
                          <span
                            className="absolute bottom-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{
                              backgroundColor: ESPRESSO + "dd",
                              color: LINEN,
                              ...ff,
                            }}
                          >
                            {item.condition}%
                          </span>
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p className="text-sm font-bold leading-snug" style={{ color: ESPRESSO, ...ff }}>
                            {item.name}
                          </p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span
                              className="text-xs px-2.5 py-0.5 rounded-full font-medium"
                              style={{
                                backgroundColor: SOFT,
                                color: COFFEE,
                                border: `1.5px solid ${MUTED}`,
                                ...ff,
                              }}
                            >
                              Size {item.size}
                            </span>
                            <span
                              className="text-xs px-2.5 py-0.5 rounded-full font-medium"
                              style={{
                                backgroundColor: SOFT,
                                color: COFFEE,
                                border: `1.5px solid ${MUTED}`,
                                ...ff,
                              }}
                            >
                              Độ mới {item.condition}%
                            </span>
                          </div>
                          <p className="text-xs mt-2" style={{ color: COFFEE, ...ff }}>
                            Đơn giá:{" "}
                            <span style={{ color: ESPRESSO, fontWeight: 600 }}>
                              {fmt(item.price)}
                            </span>
                          </p>
                        </div>

                        <div
                          className="flex items-center gap-0 rounded-xl overflow-hidden flex-shrink-0"
                          style={{ border: `1.5px solid ${MUTED}` }}
                        >
                          <button
                            onClick={() => adjustQty(group.seller, item.id, -1)}
                            className="flex items-center justify-center transition-all hover:opacity-70"
                            style={{ width: 34, height: 34, backgroundColor: SOFT, color: COFFEE }}
                          >
                            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                              <path d="M2 6.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                            </svg>
                          </button>
                          <span
                            className="flex items-center justify-center text-sm font-bold"
                            style={{
                              width: 38,
                              height: 34,
                              color: ESPRESSO,
                              backgroundColor: CARD,
                              borderLeft: `1.5px solid ${MUTED}`,
                              borderRight: `1.5px solid ${MUTED}`,
                              ...ff,
                            }}
                          >
                            {item.qty}
                          </span>
                          <button
                            onClick={() => adjustQty(group.seller, item.id, 1)}
                            className="flex items-center justify-center transition-all hover:opacity-90"
                            style={{ width: 34, height: 34, backgroundColor: T, color: LINEN }}
                          >
                            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                              <path
                                d="M6.5 2v9M2 6.5h9"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                              />
                            </svg>
                          </button>
                        </div>

                        <div className="text-right flex-shrink-0" style={{ minWidth: 110 }}>
                          <p className="text-base font-bold" style={{ ...serif, color: T }}>
                            {fmt(item.price * item.qty)}
                          </p>
                          {item.qty > 1 && (
                            <p className="text-xs mt-0.5" style={{ color: COFFEE, ...ff }}>
                              {fmt(item.price)} × {item.qty}
                            </p>
                          )}
                        </div>

                        <button
                          onClick={() => removeItem(group.seller, item.id)}
                          className="flex-shrink-0 p-2 rounded-xl transition-all hover:opacity-80 ml-1"
                          style={{ backgroundColor: "#FDEDEC" }}
                        >
                          <Trash2 size={15} style={{ color: "#C0392B" }} />
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })}

              <div
                className="flex items-center gap-3 px-5 py-3.5 rounded-2xl"
                style={{ backgroundColor: `${T}0F`, border: `1.5px dashed ${T}55` }}
              >
                <Sparkles size={18} style={{ color: T, flexShrink: 0 }} />
                <p className="text-sm" style={{ color: ESPRESSO, ...ff }}>
                  <strong>Gợi ý từ AI:</strong> Bạn thường mua cùng với "Áo Linen" — thử xem thêm{" "}
                  <span className="font-bold underline cursor-pointer" style={{ color: T }}>
                    Quần linen ống rộng vintage
                  </span>{" "}
                  nhé!
                </p>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px", position: "sticky", top: "128px" }}>
              <div
                className="rounded-2xl overflow-hidden"
                style={{
                  backgroundColor: CARD,
                  border: `1px solid ${MUTED}`,
                  boxShadow: "0 2px 8px rgba(58,35,18,0.06)",
                }}
              >
                <div
                  className="px-5 py-3.5 flex items-center gap-2"
                  style={{ backgroundColor: SOFT, borderBottom: `1px solid ${MUTED}` }}
                >
                  <Percent size={15} style={{ color: T }} />
                  <span className="text-sm font-bold" style={{ color: ESPRESSO, ...ff }}>
                    Mã giảm giá
                  </span>
                </div>
                <div className="p-4">
                  <div className="flex gap-2">
                    <input
                      value={promo}
                      onChange={(e) => {
                        setPromo(e.target.value);
                        setPromoError(false);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && applyPromo()}
                      placeholder="Nhập mã giảm giá..."
                      className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none border-2 transition-all"
                      style={{
                        backgroundColor: SOFT,
                        border: `2px solid ${promoError ? "#C0392B" : promoApplied ? "#27AE60" : MUTED}`,
                        color: ESPRESSO,
                        ...ff,
                      }}
                    />
                    <button
                      onClick={applyPromo}
                      className="px-4 py-2.5 rounded-xl text-sm font-bold flex-shrink-0 transition-all hover:opacity-90 active:scale-[0.97]"
                      style={{
                        backgroundColor: promoApplied ? "#27AE6022" : T,
                        color: promoApplied ? "#27AE60" : LINEN,
                        border: `2px solid ${promoApplied ? "#27AE60" : T}`,
                        ...ff,
                      }}
                    >
                      {promoApplied ? "✓ Đã dùng" : "Áp dụng"}
                    </button>
                  </div>
                  {promoError && (
                    <p className="text-xs mt-2" style={{ color: "#C0392B", ...ff }}>
                      ✗ Mã không hợp lệ hoặc đã hết hạn. Thử mã <strong>THRIFT10</strong>
                    </p>
                  )}
                  {promoApplied && (
                    <p className="text-xs mt-2 font-semibold" style={{ color: "#27AE60", ...ff }}>
                      ✓ Đã áp dụng mã — giảm 10% tạm tính!
                    </p>
                  )}
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {["THRIFT10", "VINTAGE", "FREESHIP"].map((code) => (
                      <button
                        key={code}
                        onClick={() => {
                          setPromo(code);
                          setPromoError(false);
                        }}
                        className="text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all hover:opacity-80"
                        style={{
                          border: `1px dashed ${T}`,
                          color: T,
                          backgroundColor: `${T}0F`,
                          ...ff,
                        }}
                      >
                        {code}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div
                className="rounded-2xl overflow-hidden"
                style={{
                  backgroundColor: CARD,
                  border: `1px solid ${MUTED}`,
                  boxShadow: "0 2px 8px rgba(58,35,18,0.06)",
                }}
              >
                <div
                  className="px-5 py-3.5 flex items-center gap-2"
                  style={{ backgroundColor: SOFT, borderBottom: `1px solid ${MUTED}` }}
                >
                  <Tag size={15} style={{ color: T }} />
                  <span className="text-sm font-bold" style={{ color: ESPRESSO, ...ff }}>
                    Tóm tắt đơn hàng
                  </span>
                </div>

                <div className="px-5 pt-4 pb-2 space-y-3">
                  {cartGroups.map((g) => {
                    const groupCheckedItems = g.items.filter((i) => i.checked);
                    if (groupCheckedItems.length === 0) return null;
                    return (
                      <div key={g.seller}>
                        <p
                          className="text-[11px] font-bold uppercase tracking-wide mb-1.5"
                          style={{ color: COFFEE, ...ff }}
                        >
                          @{g.seller}
                        </p>
                        {groupCheckedItems.map((item) => (
                          <div key={item.id} className="flex justify-between items-start mb-1">
                            <span
                              className="text-xs leading-snug pr-2 flex-1"
                              style={{ color: ESPRESSO, ...ff }}
                            >
                              {item.name} <span style={{ color: COFFEE }}>×{item.qty}</span>
                            </span>
                            <span
                              className="text-xs font-semibold flex-shrink-0"
                              style={{ color: ESPRESSO, ...ff }}
                            >
                              {fmt(item.price * item.qty)}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>

                <div className="px-5 pb-5 pt-2" style={{ borderTop: `1px solid ${MUTED}` }}>
                  <div className="space-y-2.5 pt-3">
                    <div className="flex justify-between text-sm">
                      <span style={{ color: COFFEE, ...ff }}>
                        Tạm tính ({checkedItems.length} sản phẩm)
                      </span>
                      <span style={{ color: ESPRESSO, ...ff }}>{fmt(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span style={{ color: COFFEE, ...ff }}>Phí vận chuyển</span>
                      <span style={{ color: ESPRESSO, ...ff }}>
                        {checkedItems.length > 0 ? fmt(ship) : "—"}
                      </span>
                    </div>
                    {promoApplied && (
                      <div className="flex justify-between text-sm font-semibold">
                        <span style={{ color: "#27AE60", ...ff }}>Giảm giá (10%)</span>
                        <span style={{ color: "#27AE60", ...ff }}>−{fmt(discount)}</span>
                      </div>
                    )}
                  </div>

                  <div
                    className="flex justify-between items-center mt-4 pt-4"
                    style={{ borderTop: `2px solid ${MUTED}` }}
                  >
                    <span className="font-bold text-base" style={{ color: ESPRESSO, ...ff }}>
                      Tổng thanh toán
                    </span>
                    <span className="text-2xl font-bold" style={{ ...serif, color: T }}>
                      {fmt(total)}
                    </span>
                  </div>

                  <button
                    className="w-full mt-4 py-4 rounded-2xl font-bold text-base shadow-lg transition-all hover:opacity-90 active:scale-[0.98]"
                    style={{
                      backgroundColor: checkedItems.length === 0 ? MUTED : T,
                      color: checkedItems.length === 0 ? COFFEE : LINEN,
                      cursor: checkedItems.length === 0 ? "not-allowed" : "pointer",
                      ...ff,
                    }}
                    onClick={() => go("payment")}
                    disabled={checkedItems.length === 0}
                  >
                    {checkedItems.length === 0
                      ? "Chọn sản phẩm để mua"
                      : `Mua Hàng (${checkedItems.length} món)`}
                  </button>

                  <div className="flex items-center justify-center gap-1.5 mt-3">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M6 1L7.5 4.5H11L8.5 6.5L9.5 10L6 8L2.5 10L3.5 6.5L1 4.5H4.5L6 1Z"
                        fill={COFFEE}
                      />
                    </svg>
                    <p className="text-[11px]" style={{ color: COFFEE, ...ff }}>
                      🔒 Thanh toán bảo mật · Đổi trả trong 7 ngày
                    </p>
                  </div>
                </div>
              </div>

              <div
                className="rounded-2xl px-4 py-3 grid grid-cols-3 gap-2"
                style={{ backgroundColor: CARD, border: `1px solid ${MUTED}` }}
              >
                {[
                  { icon: "🛡️", label: "Bảo vệ người mua" },
                  { icon: "🔄", label: "Đổi trả dễ dàng" },
                  { icon: "⚡", label: "Giao hàng nhanh" },
                ].map((b) => (
                  <div key={b.label} className="flex flex-col items-center gap-1 py-1">
                    <span className="text-lg">{b.icon}</span>
                    <span
                      className="text-[10px] text-center font-semibold leading-tight"
                      style={{ color: COFFEE, ...ff }}
                    >
                      {b.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
