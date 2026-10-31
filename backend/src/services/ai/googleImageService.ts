import {
  KIE_BASE_URL,
  KIE_MODEL,
  kieRequest,
  waitForImage,
  downloadGeneratedImage,
  serviceError,
  KieResponse,
} from "./kieClient";

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
  classic:
    "Traditional Christmas aesthetic: deep reds, forest greens, gold accents, classic ornaments, holly leaves, and pine cones. Elegant serif typography feel.",
  modern:
    "Minimalist modern Christmas: muted palette (sage green, cream, blush, copper), clean geometric shapes, contemporary typography, lots of white space.",
  cute:
    "Kawaii / cute Christmas: soft pastels, smiling ornaments, candy canes, stars, snowflakes, hand-drawn doodle feel, rounded shapes.",
  elegant:
    "Luxury elegant Christmas: navy blue + gold, marble textures, calligraphy feel, delicate snowflakes, refined ornaments, sophisticated atmosphere.",
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
