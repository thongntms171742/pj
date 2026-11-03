/**
 * searchProducts.tool.ts — Tool 1: tìm cây thông / phụ kiện trong catalog.
 *
 * Tách từ services/ai/chatbotService.ts (P0 refactor Hybrid).
 * Cải tiến so với bản cũ:
 *   - Hỗ trợ type "accessory" (đọc TreeProduct + mô tả có chứa phụ kiện).
 *   - Parse khoảng ngân sách dạng tiếng Việt: "2tr", "2 triệu", "dưới 3 triệu",
 *     "từ 1tr đến 2tr" → maxPrice / minPrice.
 *   - Lọc theo kích thước nếu truyền size (S/M/L/XL hoặc chiều cao cm).
 *   - Trả về metadata.suggestedProducts đúng shape DTO (type/price/imageUrl).
 */

import { Types } from "mongoose";
import { Tree } from "../../../../models/Tree";
import { TreeProduct } from "../../../../models/TreeProduct";
import { escapeRegExp } from "../../../../utils/regex";
import { formatVnd } from "../copy";

export interface SearchProductsArgs {
  query?: string;
  type?: "all" | "tree" | "accessory";
  maxPrice?: number;
  minPrice?: number;
  size?: string;
}

export interface SuggestedProduct {
  id: string;
  type: "tree" | "accessory";
  name: string;
  price: number;
  imageUrl?: string;
}

export interface SearchProductsResult {
  trees: Array<{
    id: string;
    name: string;
    size: string;
    price: number;
    heightRange: string;
    stock: number;
    image: string;
  }>;
  accessories: Array<{
    id: string;
    name: string;
    price: number;
    image: string;
  }>;
  suggestedProducts: SuggestedProduct[];
}

/** Chuẩn hoá size về chữ hoa để so khớp (S/M/L/XL). */
function normalizeSize(raw: string): string {
  const s = raw.trim().toUpperCase();
  if (["S", "M", "L", "XL", "XXL"].includes(s)) return s;
  // "size s" / "size L" → "S" / "L"
  const m = s.match(/\b(?:SIZE)?\s*(XXL|XL|L|M|S)\b/);
  return m ? m[1] : "";
}

/**
 * Parse ngân sách tiếng Việt từ text tự do.
 *  - "dưới 2tr"          → { maxPrice: 2000000 }
 *  - "2 triệu"           → { maxPrice: 2000000 }
 *  - "từ 1tr đến 2tr"    → { minPrice: 1000000, maxPrice: 2000000 }
 *  - "khoảng 1.5 triệu"  → { maxPrice: 1500000 }
 *  - "5tr"               → { maxPrice: 5000000 }
 */
export function parseBudget(text: string): { minPrice?: number; maxPrice?: number } {
  const raw = (text || "").toLowerCase().replace(/\s+/g, " ");
  if (!raw) return {};

  const toNumber = (token: string): number => {
    // token dạng "2tr", "2.5tr", "1500000", "1,5tr"
    const cleaned = token.replace(/[^\d.,]/g, "").replace(",", ".");
    const num = parseFloat(cleaned);
    if (!Number.isFinite(num)) return 0;
    // "tr"/"triệu" → nhân 1e6. Nếu token đã là số thuần thì giữ nguyên.
    if (/tr|trieu|triệu/i.test(token)) return Math.round(num * 1_000_000);
    if (num >= 1000) return Math.round(num);
    return Math.round(num * 1_000_000);
  };

  const rangeMatch = raw.match(
    /(?:tu|từ)\s*([\d.,]+\s*(?:tr|trieu|triệu|đ|d)?)\s*(?:den|đến|to|->|-)\s*([\d.,]+\s*(?:tr|trieu|triệu|đ|d)?)/
  );
  if (rangeMatch) {
    const min = toNumber(rangeMatch[1]);
    const max = toNumber(rangeMatch[2]);
    if (min > 0 || max > 0) return { minPrice: min || undefined, maxPrice: max || undefined };
  }

  const underMatch = raw.match(
    /(?:duoi|dưới|toi da|toi đa|khong vuot|ko vuot|tối đa|max)\s*([\d.,]+\s*(?:tr|trieu|triệu|đ|d))/
  );
  if (underMatch) {
    const max = toNumber(underMatch[1]);
    if (max > 0) return { maxPrice: max };
  }

  const singleMatch = raw.match(/([\d.,]+\s*(?:tr|trieu|triệu))(?!\s*(?:den|đến))/);
  if (singleMatch) {
    const val = toNumber(singleMatch[1]);
    if (val > 0) return { maxPrice: val };
  }

  return {};
}

/**
 * Tìm sản phẩm theo từ khoá + bộ lọc.
 */
export async function executeSearchProducts(
  args: SearchProductsArgs
): Promise<SearchProductsResult> {
  const type = args.type || "all";
  const query = (args.query || "").trim();
  const regex = query ? new RegExp(escapeRegExp(query), "i") : null;

  const maxPrice = args.maxPrice && args.maxPrice > 0 ? args.maxPrice : undefined;
  const minPrice = args.minPrice && args.minPrice > 0 ? args.minPrice : undefined;
  const size = args.size ? normalizeSize(args.size) : "";

  const result: SearchProductsResult = { trees: [], accessories: [], suggestedProducts: [] };

  if (type === "all" || type === "tree") {
    const treeFilter: any = { isActive: true };
    if (regex) {
      treeFilter.$or = [{ name: regex }, { description: regex }, { size: regex }];
    }
    if (maxPrice) treeFilter.price = { ...(treeFilter.price || {}), $lte: maxPrice };
    if (minPrice) treeFilter.price = { ...(treeFilter.price || {}), $gte: minPrice };
    if (size) treeFilter.size = size;

    const trees = await Tree.find(treeFilter)
      .select("name size price heightCmMin heightCmMax stockQuantity bareImage")
      .sort({ sortOrder: 1 })
      .limit(6);

    result.trees = trees.map((t: any) => ({
      id: String(t._id),
      name: t.name,
      size: t.size,
      price: t.price,
      heightRange: `${t.heightCmMin}-${t.heightCmMax}cm`,
      stock: t.stockQuantity,
      image: t.bareImage,
    }));

    for (const t of result.trees) {
      result.suggestedProducts.push({
        id: t.id,
        type: "tree",
        name: t.name,
        price: t.price,
        imageUrl: t.image,
      });
    }
  }

  if (type === "all" || type === "accessory") {
    const accessoryFilter: any = { isActive: true };
    if (regex) {
      accessoryFilter.$or = [
        { name: regex },
        { description: regex },
        { category: regex },
      ];
    }

    const products = await TreeProduct.find(accessoryFilter)
      .select("name coverImage description")
      .sort({ sortOrder: 1 })
      .limit(6);

    for (const p of products as any[]) {
      const price = await resolveProductPrice(p._id);
      result.accessories.push({
        id: String(p._id),
        name: p.name,
        price,
        image: p.coverImage,
      });
      result.suggestedProducts.push({
        id: String(p._id),
        type: "accessory",
        name: p.name,
        price,
        imageUrl: p.coverImage,
      });
    }
  }

  // Ưu tiên cây thông lên đầu danh sách gợi ý.
  result.suggestedProducts = result.suggestedProducts
    .sort((a, b) => (a.type === b.type ? 0 : a.type === "tree" ? -1 : 1))
    .slice(0, 6);

  return result;
}

/** Lấy giá thấp nhất của một TreeProduct ( qua các variant ). */
async function resolveProductPrice(productId: unknown): Promise<number> {
  const id = productId instanceof Types.ObjectId ? productId : new Types.ObjectId(String(productId));
  const cheapest = await Tree.find({ productId: id, isActive: true })
    .sort({ price: 1 })
    .limit(1)
    .select("price")
    .lean();
  return cheapest?.[0]?.price ?? 0;
}

/** Format danh sách gợi ý ra text (dùng khi AI không trả lời được). */
export function formatSearchProductsFallback(result: SearchProductsResult): string {
  if (!result.trees.length && !result.accessories.length) {
    return "Hiện tại em chưa tìm thấy mẫu cây khớp hoàn toàn với yêu cầu của anh/chị. Anh/chị có thể cho em biết thêm ngân sách hoặc kích thước mong muốn không ạ? 🎄";
  }
  let msg = "Dưới đây là một số gợi ý phù hợp dành cho anh/chị:\n";
  for (const t of result.trees) {
    msg += `• 🎄 ${t.name} (Size ${t.size}, cao ${t.heightRange}) - ${formatVnd(t.price)}\n`;
  }
  for (const a of result.accessories) {
    msg += `• 🎁 ${a.name} - ${formatVnd(a.price)}\n`;
  }
  return msg;
}
