import { IOrder } from "../models/Order";

export interface SepayWebhookPayload {
  id: number | string;
  gateway?: string;
  transactionDate?: string;
  accountNumber?: string;
  subAccount?: string | null;
  transferType?: "in" | "out" | string;
  transferAmount?: number;
  accumulated?: number;
  code?: string | null;
  content?: string;
  referenceCode?: string;
  description?: string;
}

export interface SepayPaymentInfo {
  orderId: string;
  orderCode: string;
  totalAmount: number;
  bankAccount: string;
  bankName: string;
  accountHolder: string;
  storeName: string;
  transferContent: string;
  qrUrl: string;
  isConfigured: boolean;
}

/**
 * Sinh cú pháp nội dung chuyển khoản chuẩn cho đơn hàng.
 * Ví dụ: đơn BYC-12345678 -> "BYC12345678"
 * Ngân hàng Việt Nam nhận diện chữ cái không dấu và số tốt nhất.
 */
export function getStandardTransferContent(orderCode: string): string {
  const cleanCode = orderCode.trim().toUpperCase();
  const digits = cleanCode.replace(/^BYC-?/i, "");
  return `BYC${digits}`;
}

/**
 * Tạo URL mã QR thanh toán SePay VietQR (vietqr.app).
 * Format chuẩn SePay VietQR:
 * https://vietqr.app/img?bank=MBBank&acc=VQRQAMTPI1482&template=compact&amount=100000&des=BYC00000&showinfo=true&fullacc=true&holder=NGUYEN%20TANG%20MINH%20THONG&store=RUNG%20TRONG%20PHO
 */
export function generateVietQrUrl(params: {
  accountNumber?: string;
  bankName?: string;
  amount: number;
  description: string;
  template?: string;
  holder?: string;
  store?: string;
  showinfo?: boolean;
  fullacc?: boolean;
}): string {
  const baseUrl = process.env.SEPAY_QR_BASE_URL || "https://vietqr.app/img";
  const bankName = (params.bankName || process.env.SEPAY_BANK_NAME || "MBBank").trim();
  const accountNumber = (params.accountNumber || process.env.SEPAY_BANK_ACCOUNT || "VQRQAMTPI1482").trim();
  const template = (params.template || process.env.SEPAY_QR_TEMPLATE || "compact").trim();
  const holder = (params.holder || process.env.SEPAY_ACCOUNT_HOLDER || "NGUYEN TANG MINH THONG").trim();
  const store = (params.store || process.env.SEPAY_STORE_NAME || "RUNG TRONG PHO").trim();

  const url = new URL(baseUrl);
  url.searchParams.set("bank", bankName);
  url.searchParams.set("acc", accountNumber);
  if (template) {
    url.searchParams.set("template", template);
  }
  url.searchParams.set("amount", String(Math.max(0, Math.round(params.amount))));
  url.searchParams.set("des", params.description.trim());
  url.searchParams.set("showinfo", params.showinfo !== false ? "true" : "false");
  url.searchParams.set("fullacc", params.fullacc !== false ? "true" : "false");

  if (holder) {
    url.searchParams.set("holder", holder);
  }
  if (store) {
    url.searchParams.set("store", store);
  }

  return url.toString();
}

/**
 * Lấy thông tin thanh toán SePay chi tiết cho một đơn hàng để Frontend hiển thị mã QR và STK.
 */
export function getSepayPaymentInfo(order: IOrder): SepayPaymentInfo {
  const bankAccount = process.env.SEPAY_BANK_ACCOUNT || "VQRQAMTPI1482";
  const bankName = process.env.SEPAY_BANK_NAME || "MBBank";
  const accountHolder = process.env.SEPAY_ACCOUNT_HOLDER || "NGUYEN TANG MINH THONG";
  const storeName = process.env.SEPAY_STORE_NAME || "RUNG TRONG PHO";
  const transferContent = getStandardTransferContent(order.orderCode);
  const isConfigured = Boolean(bankAccount && bankName);

  const qrUrl = generateVietQrUrl({
    accountNumber: bankAccount,
    bankName,
    amount: order.totalAmount,
    description: transferContent,
    holder: accountHolder,
    store: storeName,
  });

  return {
    orderId: String(order._id),
    orderCode: order.orderCode,
    totalAmount: order.totalAmount,
    bankAccount,
    bankName,
    accountHolder,
    storeName,
    transferContent,
    qrUrl,
    isConfigured,
  };
}

/**
 * Bóc tách mã đơn hàng (orderCode dạng BYC-XXXXXXXX) từ chuỗi nội dung chuyển khoản
 * hoặc từ trường `code` mà SePay tự nhận diện.
 *
 * Hỗ trợ các biến thể khách hay gõ:
 * - "BYC-12345678"
 * - "BYC 12345678"
 * - "BYC12345678"
 * - "byc12345678"
 * - "thanh toan don BYC 12345678"
 */
export function extractOrderCode(
  content?: string | null,
  code?: string | null
): string | null {
  // 1. Kiểm tra trường `code` SePay bóc sẵn nếu có
  if (code && typeof code === "string") {
    const trimmed = code.trim().toUpperCase();
    const match = trimmed.match(/^BYC-?([0-9]{6,12})$/i);
    if (match) {
      return `BYC-${match[1]}`;
    }
  }

  // 2. Phân tích nội dung chuyển khoản `content`
  if (!content || typeof content !== "string") {
    return null;
  }

  // Tìm mẫu BYC theo sau là gạch ngang, khoảng trắng hoặc dính liền với 6-12 số
  const regex = /\bBYC[-_\s]?([0-9]{6,12})\b/i;
  const match = content.match(regex);
  if (match && match[1]) {
    return `BYC-${match[1]}`;
  }

  // Fallback: Tìm bất kỳ chuỗi BYC-XXXXXXXX nào
  const fallbackRegex = /BYC-[0-9]{6,12}/i;
  const fallbackMatch = content.match(fallbackRegex);
  if (fallbackMatch) {
    return fallbackMatch[0].toUpperCase();
  }

  return null;
}

/**
 * Xác thực API Key trong Header Authorization của Webhook SePay gửi sang.
 * SePay gửi: "Authorization: Apikey <SEPAY_API_KEY>" hoặc "Bearer <SEPAY_API_KEY>"
 */
export function verifySepayWebhookAuth(authHeader?: string): boolean {
  const secretKey = (process.env.SEPAY_API_KEY || "").trim();
  if (!secretKey) {
    console.warn(
      "[sepay] CẢNH BÁO: Chưa cấu hình SEPAY_API_KEY trong .env. Bỏ qua xác thực webhook (chỉ nên dùng khi DEV)."
    );
    return true;
  }

  if (!authHeader) {
    return false;
  }

  const parts = authHeader.trim().split(/\s+/);
  if (parts.length === 2) {
    const [scheme, token] = parts;
    if (
      (scheme.toLowerCase() === "apikey" || scheme.toLowerCase() === "bearer") &&
      token === secretKey
    ) {
      return true;
    }
  }

  // Hỗ trợ trường hợp gửi trực tiếp token hoặc so khớp chính xác
  return authHeader.trim() === secretKey;
}
