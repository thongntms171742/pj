/**
 * product.tools.ts — tool `searchProducts` cho AI.
 *
 * Tra cứu sản phẩm thật từ catalog 3 tầng:
 *   TreeProduct (tên, mô ảnh) → TreeCode (màu, chất liệu) → Tree (SKU, giá, tồn kho)
 *
 * AI KHÔNG được bịa giá ⇒ tool này là nguồn sự thật duy nhất về giá/tồn kho.
 */

import { Types } from "mongoose";
import { TreeProduct } from "../../../models/TreeProduct";
import { TreeCode } from "../../../models/TreeCode";
import { Tree } from "../../../models/Tree";
import { escapeRegExp } from "../../../utils/regex";
import type { AiTool } from "./index";

/** Chuẩn hoá chuỗi tìm kiếm: bỏ dấu, lowercase. */
function normalize(input: string): string {
  return (input ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ProductSearchArgs {
  query?: string;
  minPrice?: number;
  maxPrice?: number;
  size?: string;
  limit?: number;
}

export interface ProductVariantSummary {
  sku: string;
  size: string;
  price: number;
  stockQuantity: number;
  heightCmMin: number;
  heightCmMax: number;
  diameterCm: number;
  isActive: boolean;
}

export interface ProductSearchResult {
  found: boolean;
  total: number;
  products: Array<{
    id: string;
    name: string;
    slug: string;
    category: string;
    description: string;
    coverImage: string;
    ratingAverage: number;
    reviewCount: number;
    codes: Array<{
      id: string;
      name: string;
      description: string;
      image: string;
    }>;
    variants: ProductVariantSummary[];
    priceRange: { min: number; max: number } | null;
  }>;
}

export const searchProductsTool: AiTool = {
  declaration: {
    name: "searchProducts",
    description:
      "Tìm sản phẩm cây Giáng Sinh của Build Your Christmas theo tên, mô tả, khoảng giá hoặc size. Dùng khi khách hàng hỏi về sản phẩm, giá, tồn kho hay kích thước. Trả về giá và tồn kho THẬT từ database.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Từ khoá tìm kiếm: tên sản phẩm, màu, chất liệu (VD: 'cây thông tuyết', 'LED', 'thông tươi').",
        },
        minPrice: {
          type: "number",
          description: "Giá thấp nhất (VND).",
        },
        maxPrice: {
          type: "number",
          description: "Giá cao nhất (VND).",
        },
        size: {
          type: "string",
          description: "Size cụ thể (VD: 'S', 'M', 'L', 'XL').",
        },
        limit: {
          type: "number",
          description: "Số sản phẩm tối đa cần trả về (mặc định 5).",
        },
      },
      required: [],
    },
  },

  async execute(args, _context) {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    const minPrice = Number(args.minPrice);
    const maxPrice = Number(args.maxPrice);
    const size = typeof args.size === "string" ? args.size.trim() : "";
    const limit = Math.min(
      10,
      Math.max(1, Number(args.limit) > 0 ? Number(args.limit) : 5)
    );

    // ── 1. Tìm TreeProduct ────────────────────────────────────────────────
    const productFilter: Record<string, unknown> = { isActive: true };
    if (query) {
      const q = escapeRegExp(normalize(query));
      // Tìm trên tên + description + category (đã bỏ dấu ở DB? không ⇒
      // dùng regex không phân biệt hoa thường trên field gốc).
      const raw = escapeRegExp(query);
      productFilter.$or = [
        { name: new RegExp(raw, "i") },
        { description: new RegExp(raw, "i") },
        { category: new RegExp(raw, "i") },
      ];
      // Bỏ q nếu không dùng (tránh lint warning).
      void q;
    }

    const products = await TreeProduct.find(productFilter)
      .sort({ sortOrder: 1, name: 1 })
      .limit(limit * 3) // lấy dư để lọc theo giá/size sau
      .lean();

    if (products.length === 0) {
      return {
        data: { found: false, total: 0, products: [] } as unknown as Record<
          string,
          unknown
        >,
      };
    }

    const productIds = products.map((p) => p._id);

    // ── 2. Tải codes + variants ──────────────────────────────────────────
    const codes = await TreeCode.find({ productId: { $in: productIds } })
      .lean();
    const codeById = new Map(codes.map((c) => [String(c._id), c]));

    const variantFilter: Record<string, unknown> = {
      productId: { $in: productIds },
      isActive: true,
    };
    if (size) variantFilter.size = size;
    if (Number.isFinite(minPrice) && minPrice > 0) {
      variantFilter.price = { ...(variantFilter.price as object), $gte: minPrice };
    }
    if (Number.isFinite(maxPrice) && maxPrice > 0) {
      variantFilter.price = { ...(variantFilter.price as object), $lte: maxPrice };
    }

    const variants = await Tree.find(variantFilter).lean();

    const variantsByProduct = new Map<string, typeof variants>();
    for (const v of variants) {
      const key = String(v.productId);
      const list = variantsByProduct.get(key) ?? [];
      list.push(v);
      variantsByProduct.set(key, list);
    }

    // ── 3. Lắp ghép kết quả ───────────────────────────────────────────────
    const result: ProductSearchResult = {
      found: false,
      total: 0,
      products: [],
    };

    for (const product of products) {
      const productVariants = variantsByProduct.get(String(product._id)) ?? [];
      if (variants.length > 0 && productVariants.length === 0) continue;

      const prices = productVariants.map((v) => v.price);
      const productCodes = codes.filter(
        (c) => String(c.productId) === String(product._id)
      );

      result.products.push({
        id: String(product._id),
        name: product.name,
        slug: product.slug,
        category: product.category,
        description: (product.description ?? "").slice(0, 500),
        coverImage: product.coverImage,
        ratingAverage: product.ratingAverage ?? 0,
        reviewCount: product.reviewCount ?? 0,
        codes: productCodes.map((c) => ({
          id: String(c._id),
          name: c.name,
          description: (c.description ?? "").slice(0, 200),
          image: c.image ?? "",
        })),
        variants: productVariants.map((v) => ({
          sku: v.sku,
          size: v.size,
          price: v.price,
          stockQuantity: v.stockQuantity,
          heightCmMin: v.heightCmMin,
          heightCmMax: v.heightCmMax,
          diameterCm: v.diameterCm,
          isActive: v.isActive,
        })),
        priceRange:
          prices.length > 0
            ? { min: Math.min(...prices), max: Math.max(...prices) }
            : null,
      });

      if (result.products.length >= limit) break;
    }

    result.found = result.products.length > 0;
    result.total = result.products.length;

    return { data: result as unknown as Record<string, unknown> };  },
};

/** Kiểm tra tồn kho tối thiểu (dùng bởi orchestrator để tránh gợi ý hết hàng). */
export function isVariantAvailable(stockQuantity: number): boolean {
  return stockQuantity > 0;
}

/** Helper: tìm product theo id (dùng khi cần chi tiết). */
export async function findProductById(id: string) {
  if (!Types.ObjectId.isValid(id)) return null;
  return TreeProduct.findById(id).lean();
}
