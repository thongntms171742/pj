import { Request, Response } from "express";
import { sendError, ErrorCode, handleInternalError } from "../utils/errors";
import { generateGreetingCardImage, type GreetingCardStyle } from "../services/ai/googleImageService";

// ── POST /api/greeting-cards/generate ───────────────────────────────────────
// Body: { title, body, style? }
// Response: image/png binary (attachment) — không lưu DB, không lưu Cloudinary.
//
// FE nhận blob → tạo object URL → cho user download.

const VALID_STYLES: GreetingCardStyle[] = ["classic", "modern", "cute", "elegant"];

export const generateCard = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { title, body, style } = req.body as {
      title?: string;
      body?: string;
      style?: string;
    };

    const trimmedTitle = String(title || "").trim();
    const trimmedBody = String(body || "").trim();

    if (!trimmedTitle) {
      sendError(res, ErrorCode.INVALID_INPUT, "Thiếu `title` của thiệp");
      return;
    }
    if (trimmedTitle.length > 100) {
      sendError(
        res,
        ErrorCode.INVALID_INPUT,
        "`title` không được vượt quá 100 ký tự"
      );
      return;
    }
    if (!trimmedBody) {
      sendError(res, ErrorCode.INVALID_INPUT, "Thiếu `body` của thiệp");
      return;
    }
    if (trimmedBody.length > 500) {
      sendError(
        res,
        ErrorCode.INVALID_INPUT,
        "`body` không được vượt quá 500 ký tự"
      );
      return;
    }

    const finalStyle: GreetingCardStyle = (VALID_STYLES as string[]).includes(
      String(style || "")
    )
      ? (style as GreetingCardStyle)
      : "classic";

    const buffer = await generateGreetingCardImage({
      title: trimmedTitle,
      body: trimmedBody,
      style: finalStyle,
    });

    // Tên file: greeting-card-{timestamp}.png
    const filename = `greeting-card-${Date.now()}.png`;

    res.setHeader("Content-Type", "image/png");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    res.setHeader("Content-Length", String(buffer.length));
    res.send(buffer);
  } catch (err: any) {
    if (err?.code && err?.status) {
      sendError(res, err.code as any, err.message, err.status);
      return;
    }
    handleInternalError(res, err, "[greetingCards] generateCard error");
  }
};
