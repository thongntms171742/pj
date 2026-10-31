import { uploadFromBuffer, deleteAsset } from "../cloudinaryService";
import { Tree } from "../../models/Tree";
import {
  KIE_BASE_URL,
  KIE_MODEL,
  kieRequest,
  waitForImage,
  downloadGeneratedImage,
  serviceError,
  KieResponse,
} from "./kieClient";

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

  if (input.roomImageUrl && /^https?:\/\//i.test(input.roomImageUrl)) {
    imageInput.push(input.roomImageUrl);
  }
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

  const { Design } = await import("../../models/Design");

  const design = await Design.findById(designId);
  if (!design) {
    throw serviceError("Không tìm thấy thiết kế", "DESIGN_NOT_FOUND", 404);
  }
  if (!isAdmin && String(design.ownerId || "") !== ownerId) {
    throw serviceError("Bạn không có quyền tạo ảnh cho thiết kế này", "FORBIDDEN", 403);
  }
  if (design.status === "AI_PENDING") {
    throw serviceError("Thiết kế đang được tạo ảnh, vui lòng thử lại sau", "AI_GENERATION_FAILED", 409);
  }
  if (!design.roomImageUrl) {
    throw serviceError("Thiết kế chưa có ảnh phòng. Hãy upload ảnh phòng trước.", "ROOM_IMAGE_REQUIRED", 400);
  }

  const variant = await Tree.findById(design.treeVariantId)
    .select("name size bareImage description productId codeId")
    .lean();
  if (!variant) {
    throw serviceError("Không tìm thấy mẫu cây trong catalog", "TREE_NOT_FOUND", 404);
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

  await Design.updateOne({ _id: design._id }, { $set: { status: "AI_PENDING", lastError: null } });

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
    if (!taskId) {
      throw serviceError("KIE không trả về taskId khi tạo ảnh.", "AI_PROVIDER_INVALID_RESPONSE", 502);
    }

    const imageUrl = await waitForImage(String(taskId));
    const imageBuffer = await downloadGeneratedImage(imageUrl);
    const uploaded = await uploadFromBuffer(imageBuffer, {
      folder: "buildyourchristmas/room-designs",
      resourceType: "image",
    });

    if (design.roomImagePublicId) {
      try {
        await deleteAsset(design.roomImagePublicId, "image");
      } catch (err) {
        console.warn(`[legacyRoomDesignService] Failed to cleanup room image ${design.roomImagePublicId}:`, err);
      }
    }

    await Design.updateOne(
      { _id: design._id },
      {
        $set: {
          status: "AI_COMPLETED",
          resultImageUrl: uploaded.url,
          resultImagePublicId: uploaded.publicId,
          compositeSource: "AI",
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
    const safeMessage = String(cause?.message || "KIE image generation failed").slice(0, 400);
    await Design.updateOne({ _id: design._id }, { $set: { status: "FAILED", lastError: safeMessage } });
    if (cause?.code && cause?.status) throw cause;
    throw serviceError(safeMessage, "AI_GENERATION_FAILED", 502);
  }
}
