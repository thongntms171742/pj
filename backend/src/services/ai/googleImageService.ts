import { GoogleGenAI } from "@google/genai";
import { ErrorCode } from "../../utils/errors";

export interface TreeImagePromptInput {
  tree: {
    name: string;
    size: string;
    heightCmMin?: number;
    heightCmMax?: number;
    bareImage?: string;
  };
  style?: {
    name: string;
    code?: string;
    palette?: string[];
  } | null;
  accessories: Array<{
    name: string;
    type: string;
    group: string;
    quantity: number;
    personalizationText?: string;
  }>;
  customerPrompt?: string;
}

export class GoogleImageServiceError extends Error {
  public code: string;
  public status: number;
  constructor(code: string, message: string, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * Builds a prompt for Google Gemini Image Generation.
 * Reads real tree specifications, style theme, and accessory list from MongoDB.
 */
export function buildTreeImagePrompt(input: TreeImagePromptInput): string {
  const { tree, style, accessories, customerPrompt } = input;

  const accessoryLines = accessories
    .map((a) => {
      let desc = `- ${a.quantity}x ${a.name} (${a.type.toLowerCase()})`;
      if (a.personalizationText) {
        desc += ` engraved with custom text: "${a.personalizationText}"`;
      }
      return desc;
    })
    .join("\n");

  const styleDescription = style
    ? `Design Theme: "${style.name}" (${style.code || "Holiday Elegance"}).`
    : "Design Theme: Cozy Festive Christmas.";

  const customerNotes = customerPrompt?.trim()
    ? `Customer aesthetic requirement: "${customerPrompt}".`
    : "";

  return `
Professional commercial studio product photography of a decorated Christmas tree.

[Tree Specifications]
- Tree Type: ${tree.name} (Size: ${tree.size})
- Physical Profile: Full, vibrant evergreen pine branches with rich natural green needles.
${styleDescription}

[Decorations & Ornaments Applied]
${accessoryLines || "- Elegantly hung warm fairy lights, glass baubles, and festive ribbon bows."}

${customerNotes}

[Photography & Style Directives]
- Angle: Eye-level central view, showcasing the full tree from base to tree topper star.
- Lighting: Warm ambient glow from decorative Christmas fairy lights, soft diffuse studio fill light.
- Setting: Minimalist, elegant festive room with gentle blurred holiday background (bokeh).
- Render Quality: 8k resolution, crisp detail on needles and ornament reflections, photorealistic, no distortion, no cartoon elements.
`.trim();
}

/**
 * Calls Google GenAI to generate an image buffer based on the given prompt.
 * Uses GEMINI_API_KEY and GEMINI_IMAGE_MODEL environment variables.
 */
export async function generateTreeImage(prompt: string): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new GoogleImageServiceError(
      ErrorCode.AI_DESIGNER_NOT_CONFIGURED,
      "Chưa cấu hình GEMINI_API_KEY trong biến môi trường",
      503
    );
  }

  const modelName =
    process.env.GEMINI_IMAGE_MODEL?.trim() || "gemini-2.5-flash-image";

  const ai = new GoogleGenAI({ apiKey });

  try {
    // Attempt 1: Using client.models.generateImages (Standard for Imagen / Image Generation models)
    if (typeof (ai.models as any)?.generateImages === "function") {
      try {
        const response = await ai.models.generateImages({
          model: modelName,
          prompt,
          config: {
            numberOfImages: 1,
            outputMimeType: "image/jpeg",
          },
        });

        const imageBytes =
          response?.generatedImages?.[0]?.image?.imageBytes;

        if (imageBytes) {
          return Buffer.from(imageBytes, "base64");
        }
      } catch (err: any) {
        // If generateImages failed because model requires generateContent, fall through
        console.warn(
          `[googleImageService] generateImages with model "${modelName}" failed, attempting generateContent fallback...`,
          err?.message
        );
      }
    }

    // Attempt 2: Using client.models.generateContent (For multimodal image generation models)
    const contentResponse = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseModalities: ["IMAGE", "TEXT"] as any,
      },
    });

    // Extract inline image bytes from candidates
    const candidates = contentResponse?.candidates || [];
    for (const candidate of candidates) {
      const parts = candidate.content?.parts || [];
      for (const part of parts) {
        if ((part as any).inlineData?.data) {
          return Buffer.from((part as any).inlineData.data, "base64");
        }
      }
    }

    throw new GoogleImageServiceError(
      ErrorCode.AI_GENERATION_FAILED,
      "Google Gemini không trả về dữ liệu hình ảnh hợp lệ",
      500
    );
  } catch (err: any) {
    if (err instanceof GoogleImageServiceError) {
      throw err;
    }
    console.error("[googleImageService] Gemini API call error:", err);
    throw new GoogleImageServiceError(
      ErrorCode.AI_GENERATION_FAILED,
      `Lỗi khi gọi Google Image API: ${err?.message || "Lỗi không xác định"}`,
      500
    );
  }
}

/**
 * Orchestrates generating and saving an AI design visualization:
 * 1. Verifies ownership or admin permissions.
 * 2. Sets status to GENERATING.
 * 3. Reads tree, style, accessories from MongoDB and builds prompt.
 * 4. Calls Gemini to generate image buffer.
 * 5. Uploads to Cloudinary.
 * 6. Sets status to COMPLETED and stores imageUrl / imagePublicId.
 * If failed: sets status to FAILED, records lastError, but preserves design & catalog selection.
 */
export async function generateAIDesignImage(
  designId: string,
  userId: string,
  isAdmin: boolean
): Promise<{
  aiDesign: {
    _id: any;
    ownerId: any;
    status: string;
    imageUrl: string;
    imagePublicId: string;
    prompt: string;
    preferences: any;
    pricingSnapshot: any;
    createdAt: Date;
    updatedAt: Date;
  };
}> {
  const { Types } = await import("mongoose");
  const { AIDesign } = await import("../../models/AIDesign");
  const { hydrateAIDesign } = await import("./aiDesignerService");
  const { uploadFromBuffer } = await import("../cloudinaryService");

  const aiDoc = await AIDesign.findById(designId);
  if (!aiDoc) {
    throw new GoogleImageServiceError(
      ErrorCode.AI_DESIGN_NOT_FOUND,
      "Không tìm thấy thiết kế AI",
      404
    );
  }

  // Check ownership
  if (aiDoc.ownerId) {
    if (String(aiDoc.ownerId) !== userId && !isAdmin) {
      throw new GoogleImageServiceError(
        ErrorCode.FORBIDDEN,
        "Bạn không có quyền thao tác trên thiết kế này",
        403
      );
    }
  } else if (userId) {
    // If design was created anonymously, claim ownership
    aiDoc.ownerId = new Types.ObjectId(userId);
  }

  // Update status to GENERATING
  aiDoc.status = "GENERATING";
  await aiDoc.save();

  try {
    const { resolved } = await hydrateAIDesign(designId);

    const prompt = buildTreeImagePrompt({
      tree: {
        name: resolved.variant.name,
        size: resolved.variant.size,
        heightCmMin: resolved.variant.heightCmMin,
        heightCmMax: resolved.variant.heightCmMax,
        bareImage: resolved.variant.bareImage,
      },
      style: resolved.style
        ? {
            name: resolved.style.name,
            code: resolved.style.code,
            palette: (resolved.style as any).palette,
          }
        : null,
      accessories: resolved.accessories.map((a) => ({
        name: a.accessory.name,
        type: a.accessory.type,
        group: a.accessory.group,
        quantity: a.quantity,
        personalizationText: a.personalizationText,
      })),
      customerPrompt: aiDoc.prompt,
    });

    const imageBuffer = await generateTreeImage(prompt);

    const folder =
      process.env.CLOUDINARY_FOLDER || "buildyourchristmas/ai-designs";
    const uploadResult = await uploadFromBuffer(imageBuffer, {
      folder,
      resourceType: "image",
    });

    aiDoc.imageUrl = uploadResult.url;
    aiDoc.imagePublicId = uploadResult.publicId;
    aiDoc.status = "COMPLETED";
    aiDoc.lastError = null;
    await aiDoc.save();

    return {
      aiDesign: {
        _id: aiDoc._id,
        ownerId: aiDoc.ownerId,
        status: aiDoc.status,
        imageUrl: aiDoc.imageUrl,
        imagePublicId: aiDoc.imagePublicId,
        prompt: aiDoc.prompt,
        preferences: aiDoc.preferences,
        pricingSnapshot: aiDoc.pricingSnapshot,
        createdAt: aiDoc.createdAt,
        updatedAt: aiDoc.updatedAt,
      },
    };
  } catch (err: any) {
    // Mark as failed while keeping tree and accessories intact for retry
    aiDoc.status = "FAILED";
    aiDoc.lastError = err?.message || "Tạo ảnh thất bại";
    await aiDoc.save();
    throw err;
  }
}
