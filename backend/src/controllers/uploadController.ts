import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { sendError, ErrorCode, handleInternalError } from "../utils/errors";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB for images
const MAX_VIDEO_SIZE = 30 * 1024 * 1024; // 30MB for MP4 videos
const ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".svg", ".mp4"];
const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
  "video/mp4",
];

// Ensure uploads directory exists
const UPLOADS_DIR = path.resolve(__dirname, "../../uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export const uploadMedia = async (req: Request, res: Response): Promise<void> => {
  try {
    const contentType = req.headers["content-type"] || "";

    // 1. JSON payload with base64 data URL
    if (contentType.includes("application/json")) {
      const { file, image, dataUrl } = req.body as {
        file?: string;
        image?: string;
        dataUrl?: string;
      };
      const raw = file || image || dataUrl;

      if (!raw || typeof raw !== "string") {
        sendError(res, ErrorCode.MISSING_FIELD, "Vui lòng đính kèm file ảnh/video hoặc base64 string");
        return;
      }

      // Check for Data URL: data:image/png;base64,xxxx or data:video/mp4;base64,xxxx
      const match = raw.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
      if (match) {
        const mime = match[1].toLowerCase();
        const base64Data = match[2];

        if (!ALLOWED_MIME_TYPES.includes(mime)) {
          sendError(res, ErrorCode.UNSUPPORTED_MEDIA_TYPE, "Định dạng tệp không được hỗ trợ (chỉ nhận ảnh PNG, JPG, WebP, SVG hoặc video MP4)");
          return;
        }

        const isVideo = mime === "video/mp4";
        const maxLimit = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
        const buffer = Buffer.from(base64Data, "base64");
        if (buffer.length > maxLimit) {
          sendError(res, ErrorCode.FILE_TOO_LARGE, isVideo ? "Dung lượng video vượt quá giới hạn 30MB" : "Dung lượng ảnh vượt quá giới hạn 5MB");
          return;
        }

        const ext = isVideo ? ".mp4" : mime === "image/jpeg" ? ".jpg" : `.${mime.split("/")[1]}`;
        const prefix = isVideo ? "vid_" : "img_";
        const filename = `${prefix}${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`;
        const filePath = path.join(UPLOADS_DIR, filename);

        await fs.promises.writeFile(filePath, buffer);

        const host = req.get("host") || "localhost:4000";
        const protocol = req.protocol || "http";
        const fileUrl = `${protocol}://${host}/uploads/${filename}`;

        res.status(201).json({
          url: fileUrl,
          path: `/uploads/${filename}`,
          publicId: `uploads/${filename.replace(/\.[^/.]+$/, "")}`,
          format: ext.replace(".", ""),
          size: buffer.length,
        });
        return;
      } else {
        // Plain URL passed
        if (raw.startsWith("http://") || raw.startsWith("https://")) {
          res.status(200).json({
            url: raw,
            publicId: raw,
            format: "external",
          });
          return;
        }
        sendError(res, ErrorCode.INVALID_INPUT, "Dữ liệu không đúng định dạng Base64 Data URL");
        return;
      }
    }

    // 2. Multipart form data
    if (contentType.includes("multipart/form-data")) {
      const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
      if (!boundaryMatch) {
        sendError(res, ErrorCode.INVALID_INPUT, "Thiếu multipart boundary");
        return;
      }
      const boundary = boundaryMatch[1] || boundaryMatch[2];

      // Buffer incoming stream if not yet fully buffered
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const fullBuffer = Buffer.concat(chunks);

      if (fullBuffer.length > MAX_VIDEO_SIZE + 1024) {
        sendError(res, ErrorCode.FILE_TOO_LARGE, "Dung lượng tệp tải lên vượt quá giới hạn tối đa (30MB)");
        return;
      }

      // Simple multipart body splitter
      const boundaryBuffer = Buffer.from(`--${boundary}`);
      const parts = splitBuffer(fullBuffer, boundaryBuffer);

      let savedFile: { url: string; path: string; publicId: string; format: string; size: number } | null = null;

      for (const part of parts) {
        const headerEndIndex = part.indexOf("\r\n\r\n");
        if (headerEndIndex === -1) continue;

        const headersText = part.subarray(0, headerEndIndex).toString("utf-8");
        const bodyContent = part.subarray(headerEndIndex + 4);

        // Remove trailing \r\n if present
        const cleanContent = bodyContent.subarray(0, bodyContent.length - 2);

        const filenameMatch = headersText.match(/filename="([^"]+)"/i);
        if (filenameMatch && cleanContent.length > 0) {
          const originalName = filenameMatch[1];
          const ext = path.extname(originalName).toLowerCase();

          if (!ALLOWED_EXTENSIONS.includes(ext)) {
            sendError(res, ErrorCode.UNSUPPORTED_MEDIA_TYPE, "Định dạng tệp không được hỗ trợ (chỉ nhận ảnh PNG, JPG, WebP, SVG hoặc video MP4)");
            return;
          }

          const isVideo = ext === ".mp4";
          const maxLimit = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
          if (cleanContent.length > maxLimit) {
            sendError(res, ErrorCode.FILE_TOO_LARGE, isVideo ? "Dung lượng video vượt quá giới hạn 30MB" : "Dung lượng ảnh vượt quá giới hạn 5MB");
            return;
          }

          const prefix = isVideo ? "vid_" : "upload_";
          const filename = `${prefix}${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`;
          const filePath = path.join(UPLOADS_DIR, filename);

          await fs.promises.writeFile(filePath, cleanContent);

          const host = req.get("host") || "localhost:4000";
          const protocol = req.protocol || "http";
          const fileUrl = `${protocol}://${host}/uploads/${filename}`;

          savedFile = {
            url: fileUrl,
            path: `/uploads/${filename}`,
            publicId: `uploads/${filename.replace(/\.[^/.]+$/, "")}`,
            format: ext.replace(".", ""),
            size: cleanContent.length,
          };
          break;
        }
      }

      if (savedFile) {
        res.status(201).json(savedFile);
        return;
      }

      sendError(res, ErrorCode.MISSING_FIELD, "Không tìm thấy file trong request form-data");
      return;
    }

    sendError(res, ErrorCode.INVALID_INPUT, "Content-Type phải là application/json hoặc multipart/form-data");
  } catch (err) {
    handleInternalError(res, err, "[uploads] uploadMedia error");
  }
};

function splitBuffer(buf: Buffer, delimiter: Buffer): Buffer[] {
  const result: Buffer[] = [];
  let start = 0;
  let index: number;

  while ((index = buf.indexOf(delimiter, start)) !== -1) {
    if (index > start) {
      result.push(buf.subarray(start, index));
    }
    start = index + delimiter.length;
  }

  if (start < buf.length) {
    result.push(buf.subarray(start));
  }

  return result;
}
