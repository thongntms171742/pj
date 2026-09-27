import { Request, Response } from "express";
import mongoose from "mongoose";
import { Category } from "../models/Category";
import { Product } from "../models/Product";
import { mapProduct } from "./productController";


const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

async function askGemini(prompt: string, image?: { mimeType: string; data: string }): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY (hoặc KIE API KEY) chưa được cấu hình trên backend");

  const baseUrl = process.env.AI_BASE_URL || "https://api.kie.ai/v1";

  const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
  if (image) {
    content.push({ type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.data}` } });
  }

  const payload = {
    model: GEMINI_MODEL,
    messages: [{ role: "user", content }],
    response_format: { type: "json_object" }
  };

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI API trả về HTTP ${response.status}: ${errorText.substring(0, 150)}`);
  }
  
  const result = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const text = result.choices?.[0]?.message?.content;
  if (!text) throw new Error("AI không trả về kết quả");
  return text;
}

function getJsonObject(text: string): Record<string, unknown> {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI trả về dữ liệu không hợp lệ");
  return JSON.parse(match[0]) as Record<string, unknown>;
}

export const searchWithAi = async (req: Request, res: Response): Promise<void> => {
  const { query, image } = req.body as { query?: unknown; image?: unknown };
  const searchQuery = typeof query === "string" ? query.trim() : "";
  if ((searchQuery.length > 500) || (searchQuery.length > 0 && searchQuery.length < 2)) {
    res.status(400).json({ error: "Mô tả tìm kiếm cần từ 2 đến 500 ký tự" }); return;
  }
  if (image !== undefined && (typeof image !== "object" || image === null)) {
    res.status(400).json({ error: "Ảnh tìm kiếm không hợp lệ" }); return;
  }
  try {
    const imageInput = image as { mimeType?: unknown; data?: unknown } | undefined;
    const imageData = typeof imageInput?.data === "string" ? imageInput.data.replace(/^data:image\/(?:jpeg|png|webp);base64,/, "") : "";
    const mimeType = imageInput?.mimeType;
    if (imageInput && (!imageData || imageData.length > 8_000_000 || !["image/jpeg", "image/png", "image/webp"].includes(String(mimeType)))) {
      res.status(400).json({ error: "Ảnh cần là JPG, PNG hoặc WebP và tối đa 6MB" }); return;
    }
    if (!searchQuery && !imageInput) {
      res.status(400).json({ error: "Hãy nhập mô tả hoặc chọn ảnh tham khảo" }); return;
    }
    const text = await askGemini(
      `Bạn hỗ trợ tìm đồ secondhand tại Việt Nam. Phân tích ${imageInput ? "ảnh tham khảo" : "mô tả"}; trả JSON duy nhất với keys: searchText (từ khóa ngắn để dò tên/mô tả/danh mục), category (chỉ một trong Áo, Quần, Váy, Áo khoác, Phụ kiện hoặc chuỗi rỗng), styles (mảng tối đa 5 phong cách/chất liệu/màu). Không bịa chi tiết ảnh. ${searchQuery ? `Yêu cầu người dùng: ${searchQuery}` : "Chỉ dựa trên món đồ nhìn thấy trong ảnh."}`,
      imageInput ? { mimeType: String(mimeType), data: imageData } : undefined,
    );
    const result = getJsonObject(text);
    res.json({ searchText: typeof result.searchText === "string" ? result.searchText : searchQuery, category: typeof result.category === "string" ? result.category : "", styles: Array.isArray(result.styles) ? result.styles.filter((v): v is string => typeof v === "string").slice(0, 5) : [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi phân tích AI";
    res.status(message.includes("GEMINI_API_KEY") ? 503 : 502).json({ error: message });
  }
};

export const analyzeListing = async (req: Request, res: Response): Promise<void> => {
  const { image } = req.body as { image?: unknown };
  const input = image as { mimeType?: unknown; data?: unknown } | undefined;
  const data = typeof input?.data === "string" ? input.data.replace(/^data:image\/(?:jpeg|png|webp);base64,/, "") : "";
  const mimeType = input?.mimeType;
  if (!data || data.length > 8_000_000 || !["image/jpeg", "image/png", "image/webp"].includes(String(mimeType))) {
    res.status(400).json({ error: "Ảnh cần là JPG, PNG hoặc WebP và tối đa 6MB" }); return;
  }
  try {
    const categories = await Category.find().select("name").lean();
    const allowed = categories.map((category) => category.name);
    const text = await askGemini(`Phân tích ảnh quần áo secondhand do người bán tải lên. Trả JSON duy nhất: {"title": tên ngắn, "description": mô tả những gì nhìn thấy, "category": một trong [${allowed.join(", ")}], "condition": số nguyên 30-100, "conditionNotes": dấu hiệu nhìn thấy hoặc "Không thể xác định rõ"}. Ước lượng tình trạng thận trọng chỉ từ dấu hiệu nhìn thấy; nêu rằng đây chỉ là gợi ý và cần người bán xác nhận. Không khẳng định chất liệu/nhãn hiệu nếu không nhìn rõ.`, { mimeType: String(mimeType), data });
    const result = getJsonObject(text);
    res.json({ title: typeof result.title === "string" ? result.title.slice(0, 120) : "", description: typeof result.description === "string" ? result.description.slice(0, 1000) : "", category: allowed.includes(String(result.category)) ? result.category : allowed[0] || "", condition: typeof result.condition === "number" ? Math.min(100, Math.max(30, Math.round(result.condition))) : 80, conditionNotes: typeof result.conditionNotes === "string" ? result.conditionNotes.slice(0, 300) : "Gợi ý tự động; vui lòng tự xác nhận tình trạng thực tế." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi phân tích AI";
    res.status(message.includes("GEMINI_API_KEY") ? 503 : 502).json({ error: message });
  }
};

export const getRecommendations = async (req: Request, res: Response): Promise<void> => {
  try {
    const viewed = Array.isArray(req.body.viewed) ? req.body.viewed.filter((id: unknown): id is string => typeof id === "string" && mongoose.isValidObjectId(id)).slice(0, 30) : [];
    const liked = Array.isArray(req.body.liked) ? req.body.liked.filter((id: unknown): id is string => typeof id === "string" && mongoose.isValidObjectId(id)).slice(0, 30) : [];
    const [history, candidates] = await Promise.all([
      Product.find({ _id: { $in: [...viewed, ...liked] } }).select("categoryId sellerId").lean(),
      Product.find({ status: "active" }).populate({ path: "sellerId", select: "name email sellerProfile" }).populate({ path: "categoryId", select: "name slug" }).sort({ createdAt: -1 }).limit(100).lean(),
    ]);
    const categoryWeights = new Map<string, number>();
    const sellerWeights = new Map<string, number>();
    for (const item of history) {
      const weight = liked.includes(item._id.toString()) ? 3 : 1;
      if (item.categoryId) {
        const id = item.categoryId.toString(); categoryWeights.set(id, (categoryWeights.get(id) || 0) + weight);
      }
      const sellerId = item.sellerId.toString(); sellerWeights.set(sellerId, (sellerWeights.get(sellerId) || 0) + weight);
    }
    const excluded = new Set([...viewed, ...liked]);
    const ranked = candidates.filter((p) => !excluded.has(p._id.toString())).sort((a, b) => {
      const score = (p: typeof candidates[number]) => (categoryWeights.get(p.categoryId?._id.toString() || "") || 0) * 4 + (sellerWeights.get(p.sellerId?._id.toString() || "") || 0) * 2 + (p.likes || 0) * 0.05 + (p.views || 0) * 0.01;
      return score(b) - score(a) || b._id.getTimestamp().getTime() - a._id.getTimestamp().getTime();
    });
    res.json({ products: ranked.slice(0, 20).map(mapProduct), personalized: history.length > 0 });
  } catch (error) {
    console.error("[ai] getRecommendations error:", error);
    res.status(500).json({ error: "Không thể tải gợi ý sản phẩm" });
  }
};
