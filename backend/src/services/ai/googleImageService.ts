import { uploadFromBuffer, deleteAsset } from "../cloudinaryService";
import { Tree } from "../../models/Tree";

const KIE_BASE_URL = "https://api.kie.ai/api/v1";
const KIE_MODEL = "nano-banana-2-1";
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const TASK_TIMEOUT_MS = 8 * 60 * 1000;
const POLL_INTERVAL_MS = 2500;

type KieResponse = {
  code?: number;
  msg?: string;
  message?: string;
  data?: any;
};

function serviceError(
  message: string,
  code: string,
  status: number
): Error & { code: string; status: number } {
  return Object.assign(new Error(message), { code, status });
}

async function kieRequest<T = KieResponse>(
  url: string,
  init: RequestInit
): Promise<T> {
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
    throw serviceError(
      "KIE API trả về dữ liệu không hợp lệ.",
      "AI_PROVIDER_INVALID_RESPONSE",
      502
    );
  }

  if (!response.ok || (typeof body?.code === "number" && body.code !== 200)) {
    const providerCode = Number(body?.code || response.status);
    const message = String(
      body?.msg || body?.message || `KIE API error (${providerCode})`
    ).slice(0, 240);
    if (providerCode === 401 || providerCode === 403) {
      throw serviceError(
        "KIE API key không hợp lệ hoặc chưa có quyền sử dụng model.",
        "AI_PROVIDER_AUTH_FAILED",
        502
      );
    }
    if (providerCode === 429) {
      throw serviceError(
        "KIE API đang giới hạn yêu cầu hoặc đã hết credit. Kiểm tra số dư và hạn mức KIE.",
        "AI_QUOTA_EXCEEDED",
        429
      );
    }
    throw serviceError(message, "AI_PROVIDER_REQUEST_FAILED", 502);
  }
  return body as T;
}

function parseResultUrls(value: any): string[] {
  if (!value) return [];
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }
  const candidates = [
    parsed?.resultUrls,
    parsed?.result_urls,
    parsed?.resultImageUrl ? [parsed.resultImageUrl] : undefined,
    parsed?.resultImageUrls,
    parsed?.images?.map((item: any) =>
      typeof item === "string" ? item : item?.url
    ),
  ];
  for (const list of candidates) {
    if (Array.isArray(list)) {
      const urls = list.filter(
        (url: any) => typeof url === "string" && /^https:\/\//i.test(url)
      );
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
      const urls = parseResultUrls(
        task.resultJson || task.result_json || task.result || task
      );
      if (urls[0]) return urls[0];
      throw serviceError(
        "KIE đã hoàn tất tác vụ nhưng không trả về URL ảnh.",
        "AI_PROVIDER_INVALID_RESPONSE",
        502
      );
    }
    if (state === "fail" || state === "failed" || state === "error") {
      const failMessage = String(
        task.failMsg || task.errorMessage || query.msg || "KIE không tạo được ảnh."
      ).slice(0, 240);
      throw serviceError(
        `KIE tạo ảnh thất bại: ${failMessage}`,
        "AI_GENERATION_FAILED",
        502
      );
    }
  }
  throw serviceError(
    "KIE đang xử lý ảnh lâu hơn dự kiến. Vui lòng thử lại sau.",
    "AI_GENERATION_TIMEOUT",
    504
  );
}

async function downloadGeneratedImage(imageUrl: string): Promise<Buffer> {
  let response: Response;
  try {
    response = await fetch(imageUrl, { signal: AbortSignal.timeout(45_000) });
  } catch (cause: any) {
    throw serviceError(
      `Không tải được ảnh từ KIE: ${String(cause?.message || "network error").slice(0, 160)}`,
      "AI_IMAGE_DOWNLOAD_FAILED",
      502
    );
  }
  if (!response.ok)
    throw serviceError(
      "Không tải được ảnh kết quả từ KIE.",
      "AI_IMAGE_DOWNLOAD_FAILED",
      502
    );
  const contentType = response.headers.get("content-type") || "";
  if (contentType && !contentType.toLowerCase().startsWith("image/")) {
    throw serviceError(
      "KIE trả về URL không phải tệp ảnh.",
      "AI_PROVIDER_INVALID_RESPONSE",
      502
    );
  }
  const arrayBuffer = await response.arrayBuffer();
  if (
    !arrayBuffer.byteLength ||
    arrayBuffer.byteLength > MAX_IMAGE_BYTES
  ) {
    throw serviceError(
      "Ảnh từ KIE rỗng hoặc vượt quá giới hạn 12 MB.",
      "AI_IMAGE_TOO_LARGE",
      502
    );
  }
  return Buffer.from(arrayBuffer);
}

// ── ROOM PROMPT (Tree variant + ảnh phòng + customer prompt) ──────────────
export interface ComposedRoomPrompt {
  promptText: string;
  imageInput: string[];
}

export interface ComposeRoomPromptInput {
  treeName: string;
  treeSize: string;
  treeDescription: string;
  customerPrompt?: string;
  roomImageUrl: string;
  treeReferenceUrl?: string;
}

export function composeRoomPrompt(input: ComposeRoomPromptInput): ComposedRoomPrompt {
  const customerPrompt = String(input.customerPrompt || "").trim();
  const treeDesc = String(input.treeDescription || "").trim();
  const imageInput: string[] = [];

  // Reference 1: ảnh phòng user upload (bắt buộc)
  if (
    input.roomImageUrl &&
    /^https?:\/\//i.test(input.roomImageUrl)
  ) {
    imageInput.push(input.roomImageUrl);
  }
  // Reference 2: ảnh tham chiếu của cây (bareImage) — nếu có
  if (
    input.treeReferenceUrl &&
    /^https?:\/\//i.test(input.treeReferenceUrl) &&
    !imageInput.includes(input.treeReferenceUrl)
  ) {
    imageInput.push(input.treeReferenceUrl);
  }

  const lines: string[] = [
    `Photorealistic interior photo of a real room.`,
    "",
    "[ROOM REFERENCE]",
    `The first reference image is the customer's actual room (real photograph). Preserve the room's lighting, perspective, flooring, walls, and existing furniture exactly as shown.`,
    "",
    "[TREE TO INSERT]",
    `Place a Christmas tree variant named "${input.treeName}" (size ${input.treeSize || "standard"}) into the room in a natural, believable spot.`,
    treeDesc
      ? `Tree details: ${treeDesc}`
      : "The tree should look like a premium artificial Christmas tree with realistic needles, full shape, and proportional trunk.",
    "",
    "[INTEGRATION RULES]",
    "- The tree must cast realistic shadows matching the room's ambient light direction.",
    "- Match color temperature: if the room is warm-lit, the tree is warm; if cool, keep the tree cool.",
    "- The tree must respect the room's perspective (vanishing point, ground plane).",
    "- Do NOT change the room's walls, floor, ceiling, or any existing object.",
    "- The tree should look physically placed in the room, NOT composited on top.",
    "",
    "[CUSTOMER REQUEST]",
    customerPrompt || "No additional request; integrate the tree naturally into the room.",
    "",
    "[QUALITY]",
    "- 3:4 portrait orientation.",
    "- High resolution, no watermark, no text overlay, no logo.",
    "- Photorealistic, no illustration style.",
  ];

  return {
    promptText: lines.filter(Boolean).join("\n"),
    imageInput,
  };
}

// ── CARD PROMPT (greeting card: title + body + style) ──────────────────────
export type GreetingCardStyle = "classic" | "modern" | "cute" | "elegant";

export interface ComposedCardPrompt {
  promptText: string;
  aspectRatio: "3:4";
}

export interface ComposeCardPromptInput {
  title: string;
  body: string;
  style: GreetingCardStyle;
}

const CARD_STYLE_HINTS: Record<GreetingCardStyle, string> = {
  classic: "Traditional Christmas aesthetic: deep reds, forest greens, gold accents, classic ornaments, holly leaves, and pine cones. Elegant serif typography feel.",
  modern: "Minimalist modern Christmas: muted palette (sage green, cream, blush, copper), clean geometric shapes, contemporary typography, lots of white space.",
  cute: "Kawaii / cute Christmas: soft pastels, smiling ornaments, candy canes, stars, snowflakes, hand-drawn doodle feel, rounded shapes.",
  elegant: "Luxury elegant Christmas: navy blue + gold, marble textures, calligraphy feel, delicate snowflakes, refined ornaments, sophisticated atmosphere.",
};

export function composeCardPrompt(input: ComposeCardPromptInput): ComposedCardPrompt {
  const title = String(input.title || "").trim();
  const body = String(input.body || "").trim();
  const styleHint = CARD_STYLE_HINTS[input.style] || CARD_STYLE_HINTS.classic;

  const lines: string[] = [
    `Beautiful Christmas greeting card design.`,
    "",
    "[STYLE]",
    styleHint,
    "",
    "[GREETING MESSAGE]",
    `Title: "${title || "Merry Christmas"}"`,
    `Body: "${body || "Wishing you joy and warmth this holiday season."}"`,
    "",
    "[LAYOUT]",
    "- The greeting message text must be clearly readable and beautifully typeset on the card.",
    "- Center-align the title prominently near the top.",
    "- Center-align the body text below the title.",
    "- Surround the text with festive decorations (trees, snowflakes, ornaments, ribbons, etc.) consistent with the chosen style.",
    "- Leave a small margin around the edges (no text touching borders).",
    "",
    "[QUALITY]",
    "- 3:4 portrait greeting card format.",
    "- High resolution, no watermark, no logo, no signature.",
    "- Print-ready aesthetic, balanced composition.",
  ];

  return {
    promptText: lines.filter(Boolean).join("\n"),
    aspectRatio: "3:4",
  };
}

// ── ROOM DESIGN FLOW: ghép cây vào phòng ───────────────────────────────────
export interface RoomDesignGenerateResult {
  designId: string;
  status: "AI_COMPLETED";
  imageUrl: string;
  imagePublicId: string;
}

export async function generateRoomDesignImage(
  designId: string,
  ownerId: string,
  isAdmin: boolean
): Promise<RoomDesignGenerateResult> {
  if (!process.env.KIE_API_KEY?.trim()) {
    throw serviceError(
      "KIE API chưa được cấu hình. Hãy thêm KIE_API_KEY vào biến môi trường backend.",
      "AI_DESIGNER_NOT_CONFIGURED",
      503
    );
  }

  // Lazy import để tránh circular deps.
  const { Design } = await import("../../models/Design");

  const design = await Design.findById(designId);
  if (!design)
    throw serviceError(
      "Không tìm thấy thiết kế",
      "DESIGN_NOT_FOUND",
      404
    );
  if (!isAdmin && String(design.ownerId || "") !== ownerId) {
    throw serviceError(
      "Bạn không có quyền tạo ảnh cho thiết kế này",
      "FORBIDDEN",
      403
    );
  }
  if (design.status === "AI_PENDING") {
    throw serviceError(
      "Thiết kế đang được tạo ảnh, vui lòng thử lại sau",
      "AI_GENERATION_FAILED",
      409
    );
  }
  if (!design.roomImageUrl) {
    throw serviceError(
      "Thiết kế chưa có ảnh phòng. Hãy upload ảnh phòng trước.",
      "ROOM_IMAGE_REQUIRED",
      400
    );
  }

  // Load Tree variant để lấy bareImage làm reference cây.
  const variant = await Tree.findById(design.treeVariantId)
    .select("name size bareImage description productId codeId")
    .lean();
  if (!variant) {
    throw serviceError(
      "Không tìm thấy mẫu cây trong catalog",
      "TREE_NOT_FOUND",
      404
    );
  }

  const { promptText, imageInput } = composeRoomPrompt({
    treeName: variant.name,
    treeSize: variant.size,
    treeDescription:
      (variant as any).description ||
      "Premium artificial Christmas tree with realistic needles and full shape.",
    customerPrompt: design.prompt,
    roomImageUrl: design.roomImageUrl,
    treeReferenceUrl: variant.bareImage,
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
    if (!taskId)
      throw serviceError(
        "KIE không trả về taskId khi tạo ảnh.",
        "AI_PROVIDER_INVALID_RESPONSE",
        502
      );

    const imageUrl = await waitForImage(String(taskId));
    const imageBuffer = await downloadGeneratedImage(imageUrl);
    const uploaded = await uploadFromBuffer(imageBuffer, {
      folder: "buildyourchristmas/room-designs",
      resourceType: "image",
    });

    // Cleanup ảnh phòng (reference) — đã dùng xong, không cần lưu vĩnh viễn.
    if (design.roomImagePublicId) {
      try {
        await deleteAsset(design.roomImagePublicId, "image");
      } catch (err) {
        console.warn(
          `[googleImageService] Failed to cleanup room image ${design.roomImagePublicId}:`,
          err
        );
      }
    }

    await Design.updateOne(
      { _id: design._id },
      {
        $set: {
          status: "AI_COMPLETED",
          resultImageUrl: uploaded.url,
          resultImagePublicId: uploaded.publicId,
          roomImageUrl: "",
          roomImagePublicId: "",
          lastError: null,
        },
      }
    );

    return {
      designId: String(design._id),
      status: "AI_COMPLETED",
      imageUrl: uploaded.url,
      imagePublicId: uploaded.publicId,
    };
  } catch (cause: any) {
    const safeMessage = String(
      cause?.message || "KIE image generation failed"
    ).slice(0, 400);
    await Design.updateOne(
      { _id: design._id },
      { $set: { status: "FAILED", lastError: safeMessage } }
    );
    if (cause?.code && cause?.status) throw cause;
    throw serviceError(safeMessage, "AI_GENERATION_FAILED", 502);
  }
}

// ── GREETING CARD FLOW: text + style → AI render → buffer PNG ─────────────
export interface GreetingCardInput {
  title: string;
  body: string;
  style: GreetingCardStyle;
}

export async function generateGreetingCardImage(
  input: GreetingCardInput
): Promise<Buffer> {
  if (!process.env.KIE_API_KEY?.trim()) {
    throw serviceError(
      "KIE API chưa được cấu hình. Hãy thêm KIE_API_KEY vào biến môi trường backend.",
      "AI_DESIGNER_NOT_CONFIGURED",
      503
    );
  }

  const { promptText, aspectRatio } = composeCardPrompt(input);

  try {
    const created = await kieRequest<KieResponse>(`${KIE_BASE_URL}/jobs/createTask`, {
      method: "POST",
      body: JSON.stringify({
        model: KIE_MODEL,
        input: {
          prompt: promptText,
          image_input: [],
          aspect_ratio: aspectRatio,
          resolution: "1K",
          output_format: "png",
        },
      }),
    });
    const taskId = created?.data?.taskId;
    if (!taskId)
      throw serviceError(
        "KIE không trả về taskId khi tạo ảnh thiệp.",
        "AI_PROVIDER_INVALID_RESPONSE",
        502
      );

    const imageUrl = await waitForImage(String(taskId));
    const imageBuffer = await downloadGeneratedImage(imageUrl);
    return imageBuffer;
  } catch (cause: any) {
    if (cause?.code && cause?.status) throw cause;
    const safeMessage = String(cause?.message || "KIE greeting card failed").slice(
      0,
      400
    );
    throw serviceError(safeMessage, "GREETING_CARD_GENERATION_FAILED", 502);
  }
}
