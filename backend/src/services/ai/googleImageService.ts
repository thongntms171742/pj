import { uploadFromBuffer } from "../cloudinaryService";
import { TreeProduct } from "../../models/TreeProduct";

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

// ── Compose prompt từ TreeProduct + prompt khách ───────────────────────────
//
// TreeProduct đã là 1 concept hoàn chỉnh: coverImage + description chứa sẵn
// thông tin cây + phụ kiện + style (cả cấu trúc, dây đèn, nơ, bông tuyết…).
// AI chỉ cần đọc description → render ra ảnh thành phẩm, có tính tới prompt
// riêng của khách.
export interface ComposedPrompt {
  promptText: string;
  imageInput: string[];
}

export function composePrompt(input: {
  treeProduct: any;
  customerPrompt?: string;
}): ComposedPrompt {
  const tp = input.treeProduct as any;
  const description = String(tp.description || "").trim();
  const name = String(tp.name || "Christmas tree");
  const customerPrompt = String(input.customerPrompt || "").trim();

  const cover = String(tp.coverImage || "").trim();
  const imageInput = cover && /^https?:\/\//i.test(cover) ? [cover] : [];

  // Prompt text: mô tả concept + yêu cầu khách + style chụp.
  const lines: string[] = [
    `Studio product photo of a Christmas tree design concept titled "${name}".`,
    "",
    "[REFERENCE CONCEPT]",
    description
      ? `The reference image shows the customer's chosen concept. Faithfully render: ${description}`
      : "The reference image shows the customer's chosen concept. Maintain its style, decorations, and palette.",
    "",
    "[CUSTOMER REQUEST]",
    customerPrompt || "No additional request; render the concept as described.",
    "",
    "[COMPOSITION & QUALITY]",
    "- 3:4 portrait orientation, photorealistic studio shot.",
    "- Sharp focus on the tree; soft warm ambient studio lighting.",
    "- High resolution, no watermark, no text overlay unless described.",
  ];

  return {
    promptText: lines.filter(Boolean).join("\n"),
    imageInput,
  };
}

// ── Resolve TreeProduct reference image với priority chain ──────────────────
async function resolveReferenceImage(productId: string): Promise<string> {
  const product = await TreeProduct.findById(productId)
    .select("coverImage images")
    .lean();
  if (!product) return "";
  if (product.coverImage && /^https?:\/\//i.test(product.coverImage)) {
    return product.coverImage;
  }
  if (Array.isArray(product.images) && product.images.length > 0) {
    const first = product.images.find((u) => /^https?:\/\//i.test(u));
    if (first) return first;
  }
  return "";
}

// ── Render ảnh thành phẩm cho 1 Design (gộp TreeDesign + AIDesign cũ) ───────
export async function generateDesignImage(designId: string, ownerId: string, isAdmin: boolean) {
  if (!process.env.KIE_API_KEY?.trim()) {
    throw serviceError("KIE API chưa được cấu hình. Hãy thêm KIE_API_KEY vào biến môi trường backend.", "AI_DESIGNER_NOT_CONFIGURED", 503);
  }

  // Lazy import to avoid circular deps at module load.
  const { Design } = await import("../../models/Design");

  const design = await Design.findById(designId);
  if (!design) throw serviceError("Không tìm thấy thiết kế", "DESIGN_NOT_FOUND", 404);
  if (!isAdmin && String(design.ownerId || "") !== ownerId) {
    throw serviceError("Bạn không có quyền tạo ảnh cho thiết kế này", "FORBIDDEN", 403);
  }
  if (design.status === "AI_PENDING") {
    throw serviceError("Thiết kế đang được tạo ảnh, vui lòng thử lại sau", "AI_GENERATION_FAILED", 409);
  }

  const treeProduct = await TreeProduct.findById(design.baseTreeProductId)
    .select("name coverImage images description")
    .lean();
  if (!treeProduct) {
    throw serviceError("Không tìm thấy mẫu cây trong catalog", "TREE_NOT_FOUND", 404);
  }

  const referenceImage = await resolveReferenceImage(design.baseTreeProductId.toString());
  const imageInput = referenceImage ? [referenceImage] : [];

  const { promptText } = composePrompt({
    treeProduct: treeProduct,
    customerPrompt: design.prompt,
  });

  await Design.updateOne(
    { _id: design._id },
    { $set: { status: "AI_PENDING", lastError: null } }
  );

  try {
    const created = await kieRequest<KieResponse>(`${KIE_BASE_URL}/jobs/createTask`, {
      method: "POST",
      body: JSON.stringify({
        model: KIE_MODEL,
        input: {
          prompt: promptText,
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
    const uploaded = await uploadFromBuffer(imageBuffer, { folder: "buildyourchristmas/designs", resourceType: "image" });

    await Design.updateOne(
      { _id: design._id },
      {
        $set: {
          status: "AI_COMPLETED",
          imageUrl: uploaded.url,
          imagePublicId: uploaded.publicId,
          previewImage: uploaded.url,
          lastError: null,
        },
      }
    );

    return {
      designId: String(design._id),
      status: "AI_COMPLETED" as const,
      imageUrl: uploaded.url,
      imagePublicId: uploaded.publicId,
    };
  } catch (cause: any) {
    const safeMessage = String(cause?.message || "KIE image generation failed").slice(0, 400);
    await Design.updateOne(
      { _id: design._id },
      { $set: { status: "FAILED", lastError: safeMessage } }
    );
    if (cause?.code && cause?.status) throw cause;
    throw serviceError(safeMessage, "AI_GENERATION_FAILED", 502);
  }
}
