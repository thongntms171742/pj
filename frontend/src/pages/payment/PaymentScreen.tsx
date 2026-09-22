import React, { useState, useRef } from "react";
import { CheckCircle, Check, Shield } from "lucide-react";
import { T, ESPRESSO, COFFEE, LINEN, CARD, MUTED, SOFT, serif, ff, fmt } from "../../lib/theme";
import type { Screen, CartGroup, OrderItem } from "../../types";

// ── Payment Screen ──────────────────────────────────────────────────────────────
export function PaymentScreen({ go, cartGroups, updateCart, addOrder }: { go: (s: Screen) => void; cartGroups: CartGroup[]; updateCart: (cart: CartGroup[]) => void; addOrder: (items: OrderItem[], total: number, payment: string, name?: string, phone?: string, address?: string) => void; }) {
  const [step, setStep] = useState<"address" | "card" | "otp">("address");
  const [fullName, setFullName] = useState("Nguyễn Thanh Linh");
  const [phone, setPhone] = useState("0987654321");
  const [address, setAddress] = useState("123 Đường Lê Lợi, Quận 1, TP. Hồ Chí Minh");
  const [addressError, setAddressError] = useState("");

  const [selectedCard, setSelectedCard] = useState<string>("card-1");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [otpError, setOtpError] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [orderId, setOrderId] = useState("");
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Mock saved cards
  const savedCards = [
    { id: "card-1", bank: "Vietcombank", type: "VISA", last4: "4521", exp: "12/27", default: true },
    { id: "card-2", bank: "Techcombank", type: "MASTER", last4: "8834", exp: "09/26", default: false },
    { id: "card-3", bank: "MB Bank", type: "VISA", last4: "1109", exp: "03/28", default: false },
  ];

  const selectedCardData = savedCards.find(c => c.id === selectedCard);

  // Calculate totals
  const allItems = cartGroups.flatMap(g => g.items);
  const checkedItems = allItems.filter(i => i.checked);
  const subtotal = checkedItems.reduce((s, i) => s + i.price * i.qty, 0);
  const ship = checkedItems.length > 0 ? 30000 : 0;
  const total = subtotal + ship;

  const handleNextToPayment = () => {
    if (!fullName.trim()) {
      setAddressError("Vui lòng nhập họ tên người nhận!");
      return;
    }
    if (!phone.trim() || !/^\d{10,11}$/.test(phone)) {
      setAddressError("Vui lòng nhập số điện thoại hợp lệ (10-11 chữ số)!");
      return;
    }
    if (!address.trim() || address.trim().length < 10) {
      setAddressError("Vui lòng nhập địa chỉ nhận hàng chi tiết!");
      return;
    }
    setAddressError("");
    setStep("card");
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    setOtpError(false);

    // Auto-focus next input
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all filled
    if (newOtp.every(d => d !== "") && newOtp.join("").length === 6) {
      handleVerifyOtp(newOtp.join(""));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOtp = (code: string) => {
    // Mock: accept any 6 digits, but "123456" fails
    if (code === "123456") {
      setOtpError(true);
      return;
    }
    setIsProcessing(true);

    // Create order items from checked cart items
    const orderItems: OrderItem[] = checkedItems.map(item => ({
      id: item.id.toString(),
      name: item.name,
      price: item.price,
      size: item.size,
      qty: item.qty,
      image: item.image,
      condition: item.condition,
      seller: cartGroups.find(g => g.items.some(i => i.id === item.id))?.seller || "",
    }));

    // Generate order ID
    const newOrderId = `ORD-${Date.now().toString().slice(-6)}`;
    setOrderId(newOrderId);

    // Add order and clear cart
    addOrder(orderItems, total, `${selectedCardData?.bank} ***${selectedCardData?.last4}`, fullName, phone, address);
    const newCart = cartGroups.map(g => ({
      ...g,
      items: g.items.filter(i => !i.checked)
    })).filter(g => g.items.length > 0);
    updateCart(newCart);

    setTimeout(() => {
      setIsProcessing(false);
      setIsSuccess(true);
    }, 2000);
  };

  const handlePayNow = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setStep("otp");
    }, 1500);
  };

  const cardTypeColors: Record<string, string> = {
    VISA: "#1A1F71",
    MASTER: "#EB001B",
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: LINEN }}>
        <div className="text-center p-10 rounded-3xl" style={{ backgroundColor: CARD, border: `1px solid ${MUTED}`, maxWidth: 480, width: "100%" }}>
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6" style={{ backgroundColor: "#27AE6022" }}>
            <CheckCircle size={48} style={{ color: "#27AE60" }} />
          </div>
          <h2 className="text-2xl font-bold mb-2" style={{ ...serif, color: ESPRESSO }}>Thanh toán thành công!</h2>
          <p className="text-sm mb-6" style={{ color: COFFEE, ...ff }}>
            Cảm ơn bạn đã mua sắm tại Thrifti. Đơn hàng của bạn đang được xử lý và sẽ giao trong 2-5 ngày.
          </p>
          <div className="space-y-3 mb-8 p-4 rounded-2xl text-left" style={{ backgroundColor: SOFT, border: `1px solid ${MUTED}` }}>
            <div className="flex justify-between">
              <span className="text-sm" style={{ color: COFFEE, ...ff }}>Mã đơn hàng</span>
              <span className="text-sm font-bold" style={{ color: ESPRESSO, ...ff }}>#{orderId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm" style={{ color: COFFEE, ...ff }}>Người nhận</span>
              <span className="text-sm font-bold" style={{ color: ESPRESSO, ...ff }}>{fullName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm" style={{ color: COFFEE, ...ff }}>SĐT liên hệ</span>
              <span className="text-sm font-bold" style={{ color: ESPRESSO, ...ff }}>{phone}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm" style={{ color: COFFEE, ...ff }}>Địa chỉ giao</span>
              <span className="text-sm font-bold truncate max-w-[200px]" style={{ color: ESPRESSO, ...ff }} title={address}>{address}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm" style={{ color: COFFEE, ...ff }}>Phương thức</span>
              <span className="text-sm font-bold" style={{ color: ESPRESSO, ...ff }}>{selectedCardData?.bank} ****{selectedCardData?.last4}</span>
            </div>
            <div className="flex justify-between items-center pt-2" style={{ borderTop: `1px dashed ${MUTED}` }}>
              <span className="text-sm font-bold" style={{ color: ESPRESSO, ...ff }}>Tổng thanh toán</span>
              <span className="text-lg font-bold" style={{ ...serif, color: T }}>{fmt(total)}</span>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => go("account")} className="flex-1 py-3 rounded-xl font-bold text-sm transition-all hover:opacity-90" style={{ backgroundColor: T, color: LINEN, ...ff }}>
              Xem đơn mua
            </button>
            <button onClick={() => go("home")} className="flex-1 py-3 rounded-xl font-bold text-sm border transition-all hover:opacity-90" style={{ borderColor: MUTED, color: COFFEE, backgroundColor: CARD, ...ff }}>
              Tiếp tục mua sắm
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: LINEN }}>
      {/* Header */}
      <div style={{ backgroundColor: COFFEE }}>
        <div className="max-w-[600px] mx-auto px-6 py-5 flex items-center gap-4">
          <button
            onClick={() => {
              if (step === "card") setStep("address");
              else if (step === "otp") setStep("card");
              else go("cart");
            }}
            className="flex items-center gap-2 text-sm font-semibold transition-all hover:opacity-80"
            style={{ color: LINEN, ...ff }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M11 4L6 9L11 14" stroke={LINEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Quay lại
          </button>
          <div className="h-5 w-px" style={{ backgroundColor: LINEN + "44" }} />
          <h1 className="text-xl font-bold italic" style={{ ...serif, color: LINEN }}>Thanh toán</h1>
        </div>
      </div>

      <div className="max-w-[600px] mx-auto px-6 py-8">
        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-3 mb-8">
          {[
            { num: 1, label: "Địa chỉ" },
            { num: 2, label: "Chọn thẻ" },
            { num: 3, label: "Xác thực OTP" },
            { num: 4, label: "Hoàn tất" },
          ].map((s, i) => {
            const currentIdx = step === "address" ? 0 : step === "card" ? 1 : step === "otp" ? 2 : 3;
            const isActive = i <= currentIdx;
            return (
              <div key={s.num} className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{
                      backgroundColor: isActive ? T : MUTED,
                      color: isActive ? LINEN : COFFEE,
                    }}
                  >
                    {i < currentIdx ? <Check size={14} /> : s.num}
                  </div>
                  <span className="text-sm font-semibold" style={{ color: isActive ? T : COFFEE, ...ff }}>{s.label}</span>
                </div>
                {i < 3 && <div className="w-8 h-px" style={{ backgroundColor: MUTED }} />}
              </div>
            );
          })}
        </div>

        {/* STEP 1: Địa chỉ */}
        {step === "address" && (
          <div className="space-y-6">
            <div className="rounded-2xl p-5" style={{ backgroundColor: CARD, border: `1px solid ${MUTED}` }}>
              <h3 className="text-base font-bold mb-4 font-serif" style={{ ...serif, color: ESPRESSO }}>Thông tin nhận hàng</h3>

              {addressError && (
                <div className="mb-4 p-3.5 rounded-xl border text-xs font-semibold" style={{ backgroundColor: "#FDEDEC", color: "#E74C3C", borderColor: "#FADBD8" }}>
                  ⚠️ {addressError}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold block mb-1.5" style={{ color: COFFEE, ...ff }}>Họ và tên người nhận *</label>
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="VD: Nguyễn Thanh Linh"
                    className="w-full px-4 py-3 rounded-xl text-sm outline-none border-2 transition-all"
                    style={{ backgroundColor: SOFT, border: `2px solid ${MUTED}`, color: ESPRESSO, ...ff }}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold block mb-1.5" style={{ color: COFFEE, ...ff }}>Số điện thoại liên hệ *</label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="VD: 0987654321"
                    className="w-full px-4 py-3 rounded-xl text-sm outline-none border-2 transition-all"
                    style={{ backgroundColor: SOFT, border: `2px solid ${MUTED}`, color: ESPRESSO, ...ff }}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold block mb-1.5" style={{ color: COFFEE, ...ff }}>Địa chỉ giao hàng chi tiết *</label>
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Số nhà, tên đường, phường/xã, quận/huyện, tỉnh/thành phố..."
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl text-sm outline-none border-2 resize-none transition-all"
                    style={{ backgroundColor: SOFT, border: `2px solid ${MUTED}`, color: ESPRESSO, ...ff }}
                  />
                </div>
              </div>
            </div>

            {/* Next Button & Summary Preview */}
            <div className="rounded-2xl p-5" style={{ backgroundColor: CARD, border: `1px solid ${MUTED}` }}>
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs" style={{ color: COFFEE }}>Tổng tiền ({checkedItems.length} sản phẩm):</p>
                  <p className="text-xl font-bold text-amber-800 mt-0.5">{fmt(total)}</p>
                </div>
                <button
                  onClick={handleNextToPayment}
                  className="px-6 py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 shadow-md"
                  style={{ backgroundColor: T }}
                >
                  Chọn phương thức thanh toán
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Chọn thẻ */}
        {step === "card" && (
          <div className="space-y-6">
            {/* Order Summary Card */}
            <div className="rounded-2xl p-5" style={{ backgroundColor: CARD, border: `1px solid ${MUTED}` }}>
              <h3 className="text-base font-bold mb-4" style={{ ...serif, color: ESPRESSO }}>Đơn hàng của bạn</h3>
              <div className="space-y-3">
                {checkedItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <img src={item.image} alt={item.name} className="w-12 h-12 rounded-lg object-cover" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: ESPRESSO, ...ff }}>{item.name}</p>
                      <p className="text-xs" style={{ color: COFFEE, ...ff }}>Size {item.size} · ×{item.qty}</p>
                    </div>
                    <span className="text-sm font-bold" style={{ color: T }}>{fmt(item.price * item.qty)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 space-y-2" style={{ borderTop: `1px solid ${MUTED}` }}>
                <div className="flex justify-between text-sm">
                  <span style={{ color: COFFEE }}>Tạm tính</span>
                  <span style={{ color: ESPRESSO }}>{fmt(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: COFFEE }}>Phí vận chuyển</span>
                  <span style={{ color: ESPRESSO }}>{fmt(ship)}</span>
                </div>
                <div className="flex justify-between items-center pt-2" style={{ borderTop: `1px solid ${MUTED}` }}>
                  <span className="font-bold" style={{ color: ESPRESSO }}>Tổng thanh toán</span>
                  <span className="text-2xl font-bold" style={{ ...serif, color: T }}>{fmt(total)}</span>
                </div>
              </div>
            </div>

            {/* Saved Cards */}
            <div>
              <h3 className="text-base font-bold mb-3" style={{ ...serif, color: ESPRESSO }}>Phương thức thanh toán</h3>
              <div className="space-y-3">
                {savedCards.map((card) => (
                  <button
                    key={card.id}
                    onClick={() => setSelectedCard(card.id)}
                    className="w-full p-4 rounded-2xl flex items-center gap-4 transition-all"
                    style={{
                      backgroundColor: selectedCard === card.id ? `${T}0F` : CARD,
                      border: `2px solid ${selectedCard === card.id ? T : MUTED}`,
                    }}
                  >
                    <div className="w-12 h-8 rounded flex items-center justify-center text-xs font-bold" style={{ backgroundColor: cardTypeColors[card.type] || COFFEE, color: LINEN }}>
                      {card.type}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-bold" style={{ color: ESPRESSO, ...ff }}>{card.bank}</p>
                      <p className="text-xs" style={{ color: COFFEE, ...ff }}>{card.type} •••• {card.last4} · {card.exp}</p>
                    </div>
                    {card.default && <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ backgroundColor: T + "22", color: T, ...ff }}>Mặc định</span>}
                    {selectedCard === card.id && <CheckCircle size={20} style={{ color: T }} />}
                  </button>
                ))}
              </div>
            </div>

            {/* Add new card hint */}
            <button className="w-full p-4 rounded-2xl border-2 border-dashed text-sm font-semibold transition-all hover:opacity-80" style={{ borderColor: MUTED, color: COFFEE, backgroundColor: CARD, ...ff }}>
              + Thêm thẻ mới
            </button>

            {/* Pay Button */}
            <button
              onClick={handlePayNow}
              disabled={isProcessing}
              className="w-full py-4 rounded-2xl font-bold text-base shadow-lg transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ backgroundColor: isProcessing ? MUTED : T, color: LINEN, cursor: isProcessing ? "not-allowed" : "pointer", ...ff }}
            >
              {isProcessing ? "Đang xử lý..." : `Thanh toán ${fmt(total)}`}
            </button>

            <p className="text-center text-xs" style={{ color: COFFEE, ...ff }}>
              🔒 Thanh toán được bảo mật bởi SSL · Mã hóa end-to-end
            </p>
          </div>
        )}

        {/* STEP 3: OTP Verification */}
        {step === "otp" && (
          <div className="space-y-6">
            {/* OTP Card */}
            <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: CARD, border: `1px solid ${MUTED}` }}>
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${T}18` }}>
                <Shield size={32} style={{ color: T }} />
              </div>
              <h3 className="text-lg font-bold mb-2" style={{ ...serif, color: ESPRESSO }}>Xác thực thanh toán</h3>
              <p className="text-sm mb-4" style={{ color: COFFEE, ...ff }}>
                Nhập mã OTP được gửi đến số điện thoại <strong style={{ color: ESPRESSO }}>{phone.slice(0, 4)}***{phone.slice(-3)}</strong>
              </p>
              <p className="text-xs mb-6 px-4 py-2.5 rounded-xl" style={{ backgroundColor: SOFT, color: COFFEE, border: `1.5px solid ${MUTED}`, ...ff }}>
                🔑 <strong>Hướng dẫn Demo:</strong> Nhập 6 chữ số bất kỳ (VD: 000000) để xác thực thành công. Nhập <strong>123456</strong> để mô phỏng lỗi giao dịch.
              </p>

              {/* OTP Input */}
              <div className="flex justify-center gap-2 mb-4">
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { if (el) otpRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    className="w-12 h-14 rounded-xl text-center text-xl font-bold outline-none transition-all"
                    style={{
                      backgroundColor: SOFT,
                      border: `2px solid ${otpError ? "#E74C3C" : digit ? T : MUTED}`,
                      color: ESPRESSO,
                    }}
                  />
                ))}
              </div>

              {otpError && (
                <p className="text-sm mb-4" style={{ color: "#E74C3C", ...ff }}>
                  Mã OTP không đúng. Vui lòng thử lại.
                </p>
              )}

              <p className="text-xs" style={{ color: COFFEE, ...ff }}>
                Mã có hiệu lực trong <strong>60 giây</strong>
              </p>

              <button className="mt-4 text-sm font-semibold" style={{ color: T, ...ff }}>
                Gửi lại mã
              </button>
            </div>

            {/* Payment Info */}
            <div className="rounded-2xl p-4" style={{ backgroundColor: SOFT, border: `1px solid ${MUTED}` }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: ESPRESSO, ...ff }}>{selectedCardData?.bank}</p>
                  <p className="text-xs" style={{ color: COFFEE, ...ff }}>{selectedCardData?.type} •••• {selectedCardData?.last4}</p>
                </div>
                <span className="text-lg font-bold" style={{ ...serif, color: T }}>{fmt(total)}</span>
              </div>
            </div>

            {/* Processing Overlay */}
            {isProcessing && (
              <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
                <div className="p-6 rounded-2xl text-center" style={{ backgroundColor: CARD }}>
                  <div className="w-12 h-12 rounded-full border-4 border-t-transparent mx-auto mb-4 animate-spin" style={{ borderColor: T, borderTopColor: "transparent" }} />
                  <p className="font-bold" style={{ color: ESPRESSO, ...ff }}>Đang xác thực...</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}