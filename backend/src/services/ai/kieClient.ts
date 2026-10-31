export const KIE_BASE_URL = "https://api.kie.ai/api/v1";
export const KIE_MODEL = "google/nano-banana";
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
export const TASK_TIMEOUT_MS = 8 * 60 * 1000;
export const POLL_INTERVAL_MS = 2500;

export type KieResponse = {
  code?: number;
  msg?: string;
  message?: string;
  data?: any;
};

export function serviceError(
  message: string,
  code: string,
  status: number
): Error & { code: string; status: number } {
  return Object.assign(new Error(message), { code, status });
}

export async function kieRequest<T = KieResponse>(
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

export function parseResultUrls(value: any): string[] {
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

export async function waitForImage(taskId: string): Promise<string> {
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

export async function downloadGeneratedImage(imageUrl: string): Promise<Buffer> {
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
