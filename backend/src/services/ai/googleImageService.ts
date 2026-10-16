import { uploadFromBuffer } from "../cloudinaryService";
import { Tree } from "../../models/Tree";
import { TreeProduct } from "../../models/TreeProduct";
import { TreeCode } from "../../models/TreeCode";
import { Accessory } from "../../models/Accessory";
import { Style } from "../../models/Style";
import { AIDesign } from "../../models/AIDesign";

const KIE_BASE_URL = "https://api.kie.ai/api/v1";
const KIE_MODEL = "nano-banana-2";
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const TASK_TIMEOUT_MS = 8 * 60 * 1000;
const POLL_INTERVAL_MS = 2500;

type KieResponse = {
  code?: number;
  msg?: string;
  message?: string;
  data?: any;
};

function serviceError(message: string, code: string, status: number): Error & { code: string; status: number } {
  return Object.assign(new Error(message), { code, status });
}

async function kieRequest<T = KieResponse>(url: string, init: RequestInit): Promise<T> {
  const apiKey = process.env.KIE_API_KEY?.trim();
  if (!apiKey) {
    throw serviceError(
      "KIE API chưa được cấu hình. Hãy thêm KIE_API_KEY vào biến môi trường backend.",
      "AI_DESIGNER_NOT_CONFIGURED",
      503
    );
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.headers || {}),
      },
      signal: init.signal || AbortSignal.timeout(45_000),
    });
  } catch (cause: any) {
    throw serviceError(
      `Không kết nối được KIE API: ${String(cause?.message || "network error").slice(0, 180)}`,
      "AI_PROVIDER_UNAVAILABLE",
      502
    );
  }

  let body: any;
  try {
    body = await response.json();
  } catch {
    throw serviceError("KIE API trả về dữ liệu không hợp lệ.", "AI_PROVIDER_INVALID_RESPONSE", 502);
  }

  // KIE may report application errors in JSON while HTTP status remains 200.
  if (!response.ok || (typeof body?.code === "number" && body.code !== 200)) {
    const providerCode = Number(body?.code || response.status);
    const message = String(body?.msg || body?.message || `KIE API error (${providerCode})`).slice(0, 240);
    if (providerCode === 401 || providerCode === 403) {
      throw serviceError("KIE API key không hợp lệ hoặc chưa có quyền sử dụng model.", "AI_PROVIDER_AUTH_FAILED", 502);
    }
    if (providerCode === 429) {
      throw serviceError("KIE API đang giới hạn yêu cầu hoặc đã hết credit. Kiểm tra số dư và hạn mức KIE.", "AI_QUOTA_EXCEEDED", 429);
    }
    throw serviceError(message, "AI_PROVIDER_REQUEST_FAILED", 502);
  }
  return body as T;
}

function parseResultUrls(value: any): string[] {
  if (!value) return [];
  let parsed = value;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { return []; }
  }
  const candidates = [
    parsed?.resultUrls,
    parsed?.result_urls,
    parsed?.resultImageUrl ? [parsed.resultImageUrl] : undefined,
    parsed?.resultImageUrls,
    parsed?.images?.map((item: any) => typeof item === "string" ? item : item?.url),
  ];
  for (const list of candidates) {
    if (Array.isArray(list)) {
      const urls = list.filter((url: any) => typeof url === "string" && /^https:\/\//i.test(url));
      if (urls.length) return urls;
    }
  }
  return [];
}

async function waitForImage(taskId: string): Promise<string> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < TASK_TIMEOUT_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const query = await kieRequest<KieResponse>(
      `${KIE_BASE_URL}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      { method: "GET", headers: { "Content-Type": "application/json" } }
    );
    const task = query?.data || {};
    const state = String(task.state || task.status || "").toLowerCase();

    if (state === "success" || state === "succeeded" || state === "completed") {
      const urls = parseResultUrls(task.resultJson || task.result_json || task.result || task);
      if (urls[0]) return urls[0];
      throw serviceError("KIE đã hoàn tất tác vụ nhưng không trả về URL ảnh.", "AI_PROVIDER_INVALID_RESPONSE", 502);
    }
    if (state === "fail" || state === "failed" || state === "error") {
      const failMessage = String(task.failMsg || task.errorMessage || query.msg || "KIE không tạo được ảnh.").slice(0, 240);
      throw serviceError(`KIE tạo ảnh thất bại: ${failMessage}`, "AI_GENERATION_FAILED", 502);
    }
  }
  throw serviceError("KIE đang xử lý ảnh lâu hơn dự kiến. Vui lòng thử lại sau; thiết kế của bạn vẫn được giữ.", "AI_GENERATION_TIMEOUT", 504);
}

async function downloadGeneratedImage(imageUrl: string): Promise<Buffer> {
  let response: Response;
  try {
    response = await fetch(imageUrl, { signal: AbortSignal.timeout(45_000) });
  } catch (cause: any) {
    throw serviceError(`Không tải được ảnh từ KIE: ${String(cause?.message || "network error").slice(0, 160)}`, "AI_IMAGE_DOWNLOAD_FAILED", 502);
  }
  if (!response.ok) throw serviceError("Không tải được ảnh kết quả từ KIE.", "AI_IMAGE_DOWNLOAD_FAILED", 502);
  const contentType = response.headers.get("content-type") || "";
  if (contentType && !contentType.toLowerCase().startsWith("image/")) {
    throw serviceError("KIE trả về URL không phải tệp ảnh.", "AI_PROVIDER_INVALID_RESPONSE", 502);
  }
  const arrayBuffer = await response.arrayBuffer();
  if (!arrayBuffer.byteLength || arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
    throw serviceError("Ảnh từ KIE rỗng hoặc vượt quá giới hạn 12 MB.", "AI_IMAGE_TOO_LARGE", 502);
  }
  return Buffer.from(arrayBuffer);
}

export async function generateAIDesignImage(designId: string, ownerId: string, isAdmin: boolean) {
  if (!process.env.KIE_API_KEY?.trim()) {
    throw serviceError("KIE API chưa được cấu hình. Hãy thêm KIE_API_KEY vào biến môi trường backend.", "AI_DESIGNER_NOT_CONFIGURED", 503);
  }

  const design = await AIDesign.findById(designId);
  if (!design) throw serviceError("Không tìm thấy thiết kế AI", "AI_DESIGN_NOT_FOUND", 404);
  if (!isAdmin && String(design.ownerId || "") !== ownerId) {
    throw serviceError("Bạn không có quyền tạo ảnh cho thiết kế này", "FORBIDDEN", 403);
  }
  if (design.status === "GENERATING") {
    throw serviceError("Thiết kế đang được tạo ảnh, vui lòng thử lại sau", "AI_GENERATION_FAILED", 409);
  }

  const tree = await Tree.findById(design.variantId)
    .select("name size bareImage images productId codeId description")
    .lean();
  if (!tree) throw serviceError("Không tìm thấy mẫu cây trong catalog", "TREE_NOT_FOUND", 404);

  // 1. Resolve real base tree image from catalog:
  // Priority: 1. tree.bareImage -> 2. tree.images[0] -> 3. treeCode.image -> 4. parentProduct.coverImage -> 5. parentProduct.images[0]
  let baseTreeImageUrl = "";
  if (tree.bareImage && /^https?:\/\//i.test(tree.bareImage)) {
    baseTreeImageUrl = tree.bareImage;
  } else if (Array.isArray(tree.images) && tree.images.length > 0 && /^https?:\/\//i.test(tree.images[0])) {
    baseTreeImageUrl = tree.images[0];
  } else if (tree.codeId) {
    const code = await TreeCode.findById(tree.codeId).select("image").lean();
    if (code?.image && /^https?:\/\//i.test(code.image)) {
      baseTreeImageUrl = code.image;
    }
  }

  if (!baseTreeImageUrl && tree.productId) {
    const parentProduct = await TreeProduct.findById(tree.productId).select("coverImage images").lean();
    if (parentProduct?.coverImage && /^https?:\/\//i.test(parentProduct.coverImage)) {
      baseTreeImageUrl = parentProduct.coverImage;
    } else if (Array.isArray(parentProduct?.images) && parentProduct.images.length > 0 && /^https?:\/\//i.test(parentProduct.images[0])) {
      baseTreeImageUrl = parentProduct.images[0];
    }
  }

  const imageInput: string[] = [];
  if (baseTreeImageUrl) {
    imageInput.push(baseTreeImageUrl);
  }

  const accessoryIds = design.accessories.map((a) => a.accessoryId);
  const accessories = accessoryIds.length
    ? await Accessory.find({ _id: { $in: accessoryIds } }).select("name type description image").lean()
    : [];
  const style = design.styleId
    ? await Style.findById(design.styleId).select("name code description palette").lean()
    : null;
  const accessoryLines = design.accessories.map((item) => {
    const accessory: any = accessories.find((x: any) => String(x._id) === String(item.accessoryId));
    return accessory
      ? `${accessory.name} (${accessory.type}), quantity ${item.quantity}${item.personalizationText ? `, text: ${item.personalizationText}` : ""}`
      : "";
  }).filter(Boolean);
  const palette = style?.palette
    ? Array.isArray(style.palette) ? style.palette.join(", ") : JSON.stringify(style.palette)
    : (design.preferences?.theme || "festive Christmas red, gold, blush pink, and evergreen colors");

  const customerNote = design.prompt || design.preferences?.notes || "";
  const isPinkTheme = /hồng|pink|pastel|rose/i.test(customerNote + " " + (design.preferences?.theme || ""));

  const prompt = imageInput.length > 0
    ? [
        "Professional commercial studio product photography: Realistically decorate the customer's chosen base tree with their selected Christmas accessories.",
        "",
        "[REFERENCE IMAGE DIRECTIVE - EXACT BASE TREE CONDITIONING]:",
        "- The reference image in image_input[0] is the customer's chosen living base tree model (cây gốc / cây tùng Noel để bàn đang bán).",
        "- CRITICAL REQUIREMENT: Strictly preserve the exact foundation, branch structure, needle texture, living foliage silhouette, and pot base from this reference image. Do NOT change or replace the base tree with a generic pine/fir tree.",
        "",
        "[CUSTOMER-CHOSEN ACCESSORIES TO ATTACH ONTO THIS TREE]:",
        "Seamlessly hang, drape, and composite the following specific accessories onto the branches of this base tree:",
        accessoryLines.length
          ? accessoryLines.map((line) => `- ${line}`).join("\n")
          : "- Glossy scarlet and glitter red baubles, miniature candy canes, soft white natural cotton flower puffs, tiny white string bows, and a silver 'Merry Christmas' script typography ornament.",
        `- Crown Topper: Attach an elegant ribbon bow topper (${isPinkTheme ? "soft baby-pink silk ribbon" : "rich velvet red ribbon bow"}) gracefully tied at the very peak tip of the cypress tree.`,
        "- Garlands: Draped with delicate thin strings of miniature white pearl bead garland spiraling gently around the green branches.",
        `- Theme & Palette: ${style ? `${style.name} (${style.code})` : (design.preferences?.styleCode || "Cozy Festive Rustic")}. Palette: ${palette}.`,
        customerNote ? `- Customer Note: "${customerNote}".` : "",
        "",
        "[COMPOSITION & BLENDING QUALITY]:",
        "- The decorations must look physically hanging or attached to the tree foliage with realistic gravity, depth, natural occlusions, and matching studio ambient light reflections.",
        "- High-end e-commerce product visual, razor-sharp 8k resolution, crisp detail on foliage and ornaments, photorealistic, no distortion.",
      ].filter(Boolean).join("\n")
    : [
        "Professional commercial studio product photography of a real decorated living tabletop Lemon Cypress Christmas tree (cây tùng thơm / tùng Noel để bàn, botanical Cupressus macrocarpa).",
        "",
        "[Tree Morphology & Pot Style]",
        "- Botanical Type & Form: A real living tabletop evergreen lemon cypress tree (cây tùng để bàn). Slender, compact upright conical silhouette with dense, feathery bright-green foliage, tapering gracefully to a slender pointed tip. Strictly NOT a sprawling triangular Western fir or pine tree with wide horizontal branches.",
        `- Pot Base: The planter pot is neatly wrapped in rustic deep crimson red burlap sackcloth (chậu bọc vải bố đỏ đô), tied around the middle with a delicate silk ribbon bow (${isPinkTheme ? "soft baby pink" : "festive red or pink"}) and natural jute twine cord. Fluffy white faux cotton snow covers the pot rim around the base of the trunk.`,
        `- Base Tree Variant: ${tree.name} (Size: ${tree.size}).`,
        "",
        "[Decorations & Ornaments Applied]",
        `- Crown Topper: A charming ribbon bow topper (${isPinkTheme ? "baby pink silk ribbon" : "rich velvet red ribbon bow"}) tied at the very peak tip of the cypress tree.`,
        "- Garlands: Draped with fine, delicate strings of miniature white pearl bead garland spiraling gently around the green branches.",
        `- Key Ornaments: ${accessoryLines.length ? accessoryLines.join("; ") : "glossy and glitter baubles, striped red-and-white peppermint candy canes, soft natural white cotton flower puffs, tiny white string ribbon bows, and an elegant silver script 'Merry Christmas' typography sign"}.`,
        `- Theme & Palette: ${style ? `${style.name} (${style.code})` : (design.preferences?.styleCode || "Cozy Festive Rustic")}. Palette: ${palette}.`,
        customerNote ? `- Customer Specific Request: "${customerNote}".` : "",
        "",
        "[Photography & Visual Quality]",
        "- Composition: Front-facing eye-level commercial product shot, vertical 3:4 portrait orientation showcasing the full tree from the red burlap pot base to the top ribbon bow.",
        "- Lighting & Setting: Clean minimalist bright studio background, soft warm festive ambient lighting with gentle diffuse fill light.",
        "- Render Quality: 8k resolution, razor-sharp needle detail, crisp reflections on baubles, authentic textures on burlap, velvet, and cotton, photorealistic, no cartoonish elements, no watermark.",
      ].filter(Boolean).join("\n");

  await AIDesign.updateOne({ _id: design._id }, { $set: { status: "GENERATING", lastError: null } });
  try {
    const created = await kieRequest<KieResponse>(`${KIE_BASE_URL}/jobs/createTask`, {
      method: "POST",
      body: JSON.stringify({
        model: KIE_MODEL,
        input: {
          prompt,
          image_input: imageInput,
          aspect_ratio: "3:4",
          resolution: "1K",
          output_format: "png",
        },
      }),
    });
    const taskId = created?.data?.taskId;
    if (!taskId) throw serviceError("KIE không trả về taskId khi tạo ảnh.", "AI_PROVIDER_INVALID_RESPONSE", 502);

    const imageUrl = await waitForImage(String(taskId));
    const imageBuffer = await downloadGeneratedImage(imageUrl);
    const uploaded = await uploadFromBuffer(imageBuffer, { folder: "buildyourchristmas/ai-designs", resourceType: "image" });
    await AIDesign.updateOne({ _id: design._id }, { $set: { status: "COMPLETED", imageUrl: uploaded.url, imagePublicId: uploaded.publicId, lastError: null } });
    return {
      designId: String(design._id),
      status: "COMPLETED",
      imageUrl: uploaded.url,
      imagePublicId: uploaded.publicId,
      aiDesign: {
        _id: design._id,
        ownerId: design.ownerId,
        status: "COMPLETED",
        imageUrl: uploaded.url,
        imagePublicId: uploaded.publicId,
        prompt: design.prompt,
        preferences: design.preferences,
        pricingSnapshot: design.pricingSnapshot,
        createdAt: design.createdAt,
        updatedAt: new Date(),
      },
    };
  } catch (cause: any) {
    const safeMessage = String(cause?.message || "KIE image generation failed").slice(0, 400);
    await AIDesign.updateOne({ _id: design._id }, { $set: { status: "FAILED", lastError: safeMessage } });
    if (cause?.code && cause?.status) throw cause;
    throw serviceError(safeMessage, "AI_GENERATION_FAILED", 502);
  }
}
