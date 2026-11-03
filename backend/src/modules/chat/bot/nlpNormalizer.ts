/**
 * nlpNormalizer.ts — chuẩn hoá tin nhắn tiếng Việt cho rule engine.
 *
 * Mục tiêu: biến 1 câu tự do của khách thành dạng so khớp ổn định, để
 * `intentClassifier` chỉ cần so khớp chuỗi đơn giản (không cần NLP nặng).
 *
 * Các bước:
 *   1. Lowercase + bỏ dấu tiếng Việt (giữ BẢN CÓ DẤU để phục vụ trả lời).
 *   2. Chuẩn hoá khoảng trắng + dấu câu.
 *   3. Tách "có dấu" / "không dấu" để match tiếng Việt lẫn lộn.
 *   4. Trích slot: kích thước (1m8 / size L / 180cm), ngân sách (2tr / 2 triệu),
 *      mã đơn (BYC-xxx), số điện thoại (10 số VN).
 *   5. Chuẩn hoá từ đồng nghĩa về 1 canonical form.
 */

import { normalizePhone } from "../../../utils/regex";

export interface NormalizedText {
  /** Bản giữ nguyên (chỉ trim + gộp khoảng trắng). */
  raw: string;
  /** Lowercase, giữ dấu. */
  lower: string;
  /** Lowercase, bỏ dấu — dùng để so khớp keyword. */
  plain: string;
  /** Token đã chuẩn hoá (plain, không rỗng). */
  tokens: string[];
}

export interface ExtractedSlots {
  /** Kích thước dạng chuẩn: "S" | "M" | "L" | "XL" | "180" (cm). */
  size?: string;
  /** Chiều cao cm nếu tìm được. */
  heightCm?: number;
  /** Ngân sách tối đa (VNĐ). */
  maxPrice?: number;
  /** Ngân sách tối thiểu (VNĐ). */
  minPrice?: number;
  /** Mã đơn hàng (BYC-xxxx). */
  orderCode?: string;
  /** Số điện thoại 10 số (đã chuẩn hoá). */
  phone?: string;
  /** Style/phong cách cây. */
  style?: string;
  /** Không gian sử dụng. */
  space?: string;
}

/**
 * Bỏ dấu tiếng Việt.
 * Dùng NFD + bỏ combining marks, thay các chữ đặc biệt còn lại.
 */
export function stripDiacritics(input: string): string {
  return (input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^\x20-\x7E]/g, " ");
}

/** Lowercase + gộp khoảng trắng + bỏ dấu câu thừa ở cuối. */
export function normalizeText(input: string): NormalizedText {
  const raw = (input || "").replace(/\s+/g, " ").trim();
  const lower = raw.toLowerCase();
  const plain = stripDiacritics(lower).replace(/[^\x20-\x7E]/g, " ");
  const tokens = plain.split(" ").filter(Boolean);
  return { raw, lower, plain, tokens };
}

/** Bảng từ đồng nghĩa: canonical → các biến thể. */
const SYNONYM_GROUPS: ReadonlyArray<{ canonical: string; variants: string[] }> = [
  { canonical: "don hang", variants: ["don hang", "don cua toi", "order", "don cua ban"] },
  { canonical: "giao hang", variants: ["giao hang", "ship", "shipping", "van chuyen", "giao hang den noi"] },
  { canonical: "phi ship", variants: ["phi ship", "phi giao hang", "phi van chuyen", "tien ship", "phi giao"] },
  { canonical: "thoi gian giao", variants: ["thoi gian giao", "bao lao giao", "khi nao giao", "giao hang bao lau"] },
  { canonical: "lap dat", variants: ["lap dat", "lap rap", "cắm cây", "trang tri", "decorate", "trang tri noel"] },
  { canonical: "bao hanh", variants: ["bao hanh", "warranty", "bao tri", "hu", "hong"] },
  { canonical: "hoa don", variants: ["hoa don", "invoice", "vat hoa don", "chung tu"] },
  { canonical: "thanh toan", variants: ["thanh toan", "payment", "tra tien", "chuyen khoan", "sepay"] },
  { canonical: "doi tra", variants: ["doi tra", "doi hang", "tra hang", "hoan hang", "refund"] },
  { canonical: "mua si", variants: ["mua si", "so luong lon", "buoc si", "wholesale", "gia si"] },
  { canonical: "cham soc cay", variants: ["cham soc cay", "tuoi cay", "bao tri cay", "cay diep", "cay kho"] },
  { canonical: "goi nhan vien", variants: ["goi nhan vien", "tu van vien", "nhan vien", "nguoi that", "goi nguoi", "chat voi nhan vien", "can tu van vien"] },
  { canonical: "cay thong", variants: ["cay thong", "cay noel", "cay gia", "thong noel", "cay thong noel"] },
  { canonical: "gia", variants: ["gia", "bao nhieu", "price", "gia tien", "cong bao nhieu"] },
  { canonical: "kich thuoc", variants: ["kich thuoc", "size", "cao bao nhieu", "cao may", "kich thuoc nao"] },
  { canonical: "khiếu nại", variants: ["khieu nai", "complaint", "khieu nai ve", "that bai"] },
  { canonical: "cam on", variants: ["cam on", "thanks", "thank you", "cam on anh", "cam on chi"] },
];

/**
 * Thay thế các biến thể từ đồng nghĩa bằng dạng canonical (trên bản plain).
 * Dùng word-boundary để tránh khớp chuỗi con.
 */
export function applySynonyms(plain: string): string {
  let out = plain;
  for (const group of SYNONYM_GROUPS) {
    for (const variant of group.variants) {
      const re = new RegExp(`(?<![a-z0-9])${escapeForWordBoundary(variant)}(?![a-z0-9])`, "g");
      out = out.replace(re, group.canonical);
    }
  }
  return out;
}

function escapeForWordBoundary(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Map kích thước chuẩn của catalog (Tree.size). */
const SIZE_ALIASES: Record<string, string> = {
  S: "S",
  M: "M",
  L: "L",
  XL: "XL",
  XXL: "XL",
};

/** Map style cây về canonical. */
const STYLE_ALIASES: Record<string, string> = {
  classic: "classic",
  "co dien": "classic",
  "co dien sang trong": "classic",
  nordic: "nordic",
  "phong cach bac": "nordic",
  "bac": "nordic",
  luxury: "luxury",
  "sang trong": "luxury",
  "cao cap": "luxury",
};

/** Map không gian. */
const SPACE_ALIASES: Record<string, string> = {
  "phong khach": "phong_khach",
  "living room": "phong_khach",
  "sanh": "sanh",
  lobby: "sanh",
  "van phong": "van_phong",
  office: "van_phong",
  "phong ngu": "phong_ngu",
  bedroom: "phong_ngu",
  "phong an": "phong_an",
  "be thong": "be_thong",
};

/**
 * Trích kích thước: "1m8" → 180cm, "size L" → "L", "180cm" → 180.
 */
export function extractSize(text: string): { size?: string; heightCm?: number } {
  const plain = stripDiacritics(text).toLowerCase();

  // Dạng "1m8" / "1m80" / "1,8m" → cm
  const meterMatch = plain.match(/(\d+)\s*m\s*(\d{1,2})\b/);
  if (meterMatch) {
    const meters = parseInt(meterMatch[1], 10);
    const rest = parseInt(meterMatch[2], 10);
    if (meters > 0) {
      // Quy ước Việt Nam: "1m8" = 1,8m = 180cm ⇒ phần sau là cm (1 số = 10cm).
      // "1m80" = 180cm (2 số = cm thật).
      const cm = meters * 100 + (rest < 10 ? rest * 10 : rest);
      return { heightCm: cm, size: cmToSize(cm) };
    }
  }

  // Dạng "1.8m" / "1,8 m" → cm  (1.8m = 180cm)
  const decimalMeter = plain.match(/(\d+)[.,](\d{1,2})\s*m\b/);
  if (decimalMeter) {
    const meters = parseFloat(`${decimalMeter[1]}.${decimalMeter[2]}`);
    if (Number.isFinite(meters) && meters > 0) {
      const cm = Math.round(meters * 100);
      return { heightCm: cm, size: cmToSize(cm) };
    }
  }

  // Dạng "180cm"
  const cmMatch = plain.match(/(\d{2,3})\s*cm\b/);
  if (cmMatch) {
    const cm = parseInt(cmMatch[1], 10);
    return { heightCm: cm, size: cmToSize(cm) };
  }

  // Dạng "size L" / "size xl" / "cỡ lớn"
  const sizeMatch = plain.match(/(?:size|co|size la|size nho)?\s*\b(xxl|xl|[sml])\b/);
  if (sizeMatch) {
    const raw = sizeMatch[1].toUpperCase();
    if (SIZE_ALIASES[raw]) return { size: SIZE_ALIASES[raw] };
  }

  // "cỡ lớn" / "cỡ nhỏ"
  if (/\bco lon\b|\bcao lon\b|\bto\b/.test(plain)) return { size: "L" };
  if (/\bco nho\b|\bthap\b/.test(plain)) return { size: "S" };

  return {};
}

/** Quy đổi chiều cao cm → size catalog (S=120, M=150, L=180, XL=210). */
export function cmToSize(cm: number): string {
  if (cm >= 195) return "XL";
  if (cm >= 165) return "L";
  if (cm >= 135) return "M";
  if (cm >= 100) return "S";
  return "S";
}

/** Trích ngân sách (VNĐ). */
export function extractBudget(text: string): { minPrice?: number; maxPrice?: number } {
  const plain = stripDiacritics(text).toLowerCase().replace(/\s+/g, " ");
  if (!plain) return {};

  const toNumber = (token: string): number => {
    const cleaned = token.replace(/[^\d.,]/g, "").replace(",", ".");
    const num = parseFloat(cleaned);
    if (!Number.isFinite(num)) return 0;
    if (/tr|trieu/i.test(token)) return Math.round(num * 1_000_000);
    if (num >= 1000) return Math.round(num);
    return Math.round(num * 1_000_000);
  };

  const rangeMatch = plain.match(
    /(?:tu)\s*([\d.,]+\s*(?:tr|trieu)?)\s*(?:den|to|->|-)\s*([\d.,]+\s*(?:tr|trieu)?)/
  );
  if (rangeMatch) {
    const min = toNumber(rangeMatch[1]);
    const max = toNumber(rangeMatch[2]);
    if (min > 0 || max > 0) return { minPrice: min || undefined, maxPrice: max || undefined };
  }

  const underMatch = plain.match(
    /(?:duoi|toi da|khong vuot|be hon|duoi)\s*([\d.,]+\s*(?:tr|trieu))/
  );
  if (underMatch) {
    const max = toNumber(underMatch[1]);
    if (max > 0) return { maxPrice: max };
  }

  const overMatch = plain.match(/(?:tren|hon|it nhat)\s*([\d.,]+\s*(?:tr|trieu))/);
  if (overMatch) {
    const min = toNumber(overMatch[1]);
    if (min > 0) return { minPrice: min };
  }

  const singleMatch = plain.match(/([\d.,]+\s*(?:tr|trieu))/);
  if (singleMatch) {
    const val = toNumber(singleMatch[1]);
    if (val > 0) return { maxPrice: val };
  }

  return {};
}

/** Trích mã đơn hàng (BYC-...). */
export function extractOrderCode(text: string): string | undefined {
  const plain = stripDiacritics(text).toUpperCase();
  // Mã đơn dạng BYC-2026-9812 / BYC2026-9812 / BYC-2026 ⇒ gom cả các
  // phần sau dấu gạch nối vào 1 token.
  const m = plain.match(/\bBYC[-_]?[A-Z0-9]+(?:-[A-Z0-9]+)*\b/);
  if (m) return m[0].replace(/[_]/g, "-");
  // ObjectId hex 24 ký tự
  const oid = plain.match(/\b[0-9A-F]{24}\b/);
  if (oid) return oid[0];
  return undefined;
}

/** Trích số điện thoại Việt Nam (10 số, bắt đầu 0). */
export function extractPhone(text: string): string | undefined {
  const digits = (text || "").replace(/\D/g, "");
  const groups = digits.match(/\d{10,11}/g);
  if (!groups) return undefined;
  for (const g of groups) {
    const candidate = g.length === 11 && g.startsWith("84") ? `0${g.slice(2)}` : g.slice(0, 10);
    if (/^0\d{9}$/.test(candidate)) return normalizePhone(candidate);
  }
  return undefined;
}

/** Trích style cây. */
export function extractStyle(text: string): string | undefined {
  const plain = stripDiacritics(text).toLowerCase();
  for (const [alias, canonical] of Object.entries(STYLE_ALIASES)) {
    if (plain.includes(alias)) return canonical;
  }
  return undefined;
}

/** Trích không gian sử dụng. */
export function extractSpace(text: string): string | undefined {
  const plain = stripDiacritics(text).toLowerCase();
  for (const [alias, canonical] of Object.entries(SPACE_ALIASES)) {
    if (plain.includes(alias)) return canonical;
  }
  return undefined;
}

/**
 * Trích toàn bộ slot từ 1 tin nhắn.
 */
export function extractSlots(text: string): ExtractedSlots {
  const slots: ExtractedSlots = {};

  const sizeInfo = extractSize(text);
  if (sizeInfo.size) slots.size = sizeInfo.size;
  if (sizeInfo.heightCm) slots.heightCm = sizeInfo.heightCm;

  const budget = extractBudget(text);
  if (budget.minPrice) slots.minPrice = budget.minPrice;
  if (budget.maxPrice) slots.maxPrice = budget.maxPrice;

  const orderCode = extractOrderCode(text);
  if (orderCode) slots.orderCode = orderCode;

  const phone = extractPhone(text);
  if (phone) slots.phone = phone;

  const style = extractStyle(text);
  if (style) slots.style = style;

  const space = extractSpace(text);
  if (space) slots.space = space;

  return slots;
}

/**
 * Chuẩn hoá đầy đủ 1 tin nhắn: text + slots.
 */
export function normalizeInput(input: string): {
  text: NormalizedText;
  slots: ExtractedSlots;
  canonical: string;
} {
  const text = normalizeText(input);
  const slots = extractSlots(input);
  const canonical = applySynonyms(text.plain);
  return { text, slots, canonical };
}
