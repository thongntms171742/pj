import { v2 as cloudinary } from "cloudinary";
import { randomUUID } from "crypto";

export type MediaResourceType = "image" | "video" | "raw";

export interface CloudinaryUploadResult {
  url: string;
  path: string;
  publicId: string;
  format: string;
  size: number;
  resourceType: string;
  width?: number;
  height?: number;
  duration?: number;
}

export interface CloudinaryUploadOptions {
  folder?: string;
  resourceType?: "image" | "video" | "auto";
}

const DEFAULT_FOLDER =
  process.env.CLOUDINARY_FOLDER || "buildyourchristmas";

function getCleanCloudinaryUrl(): string | undefined {
  let url = process.env.CLOUDINARY_URL;
  if (!url || typeof url !== "string") return undefined;
  url = url.trim();
  if (url.startsWith("CLOUDINARY_URL=")) {
    url = url.replace(/^CLOUDINARY_URL=\s*/, "").trim();
  }
  return url || undefined;
}

function hasCredentials(): boolean {
  const url = getCleanCloudinaryUrl();

  if (url) {
    try {
      const parsed = new URL(url);
      return (
        parsed.protocol === "cloudinary:" &&
        Boolean(parsed.username) &&
        Boolean(parsed.password) &&
        Boolean(parsed.hostname)
      );
    } catch {
      return false;
    }
  }

  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

export function isCloudinaryEnabled(): boolean {
  return hasCredentials();
}

function configureCloudinary(): void {
  if (!isCloudinaryEnabled()) {
    throw new Error("Cloudinary credentials are not configured.");
  }

  const cleanUrl = getCleanCloudinaryUrl();
  if (cleanUrl) {
    process.env.CLOUDINARY_URL = cleanUrl;
    cloudinary.config({ secure: true });
    return;
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

function normalizeResult(result: any): CloudinaryUploadResult {
  return {
    url: result.secure_url,
    path: result.secure_url,
    publicId: result.public_id,
    format: result.format || "",
    size: result.bytes || 0,
    resourceType: result.resource_type,
    width: result.width,
    height: result.height,
    duration: result.duration,
  };
}

export async function uploadFromBuffer(
  buffer: Buffer,
  options: CloudinaryUploadOptions = {}
): Promise<CloudinaryUploadResult> {
  configureCloudinary();

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("Cannot upload an empty buffer.");
  }

  const folder = options.folder || DEFAULT_FOLDER;
  const resourceType = options.resourceType || "auto";

  const result = await new Promise<any>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        public_id: randomUUID(),
        overwrite: false,
      },
      (error: any, uploaded: any) => {
        if (error) {
          reject(error);
          return;
        }

        if (!uploaded) {
          reject(new Error("Cloudinary returned an empty result."));
          return;
        }

        resolve(uploaded);
      }
    );

    stream.end(buffer);
  });

  return normalizeResult(result);
}

export async function uploadFromDataUrl(
  dataUrl: string,
  options: CloudinaryUploadOptions = {}
): Promise<CloudinaryUploadResult> {
  configureCloudinary();

  if (!/^data:[^;]+;base64,/.test(dataUrl)) {
    throw new Error("Invalid Base64 Data URL.");
  }

  const result = await cloudinary.uploader.upload(dataUrl, {
    folder: options.folder || DEFAULT_FOLDER,
    resource_type: options.resourceType || "auto",
    public_id: randomUUID(),
    overwrite: false,
  });

  return normalizeResult(result);
}

export async function deleteAsset(
  publicId: string,
  resourceType: MediaResourceType = "image"
): Promise<boolean> {
  configureCloudinary();

  if (!publicId || publicId.includes("://")) {
    throw new Error("A valid Cloudinary publicId is required.");
  }

  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
    invalidate: true,
  });

  return result.result === "ok" || result.result === "not found";
}

/**
 * Returns an optimized delivery URL for images.
 * Keep the original secure URL for videos unless video
 * transformations are explicitly needed.
 */
export function getOptimizedImageUrl(publicId: string): string {
  configureCloudinary();

  return cloudinary.url(publicId, {
    secure: true,
    resource_type: "image",
    quality: "auto",
    fetch_format: "auto",
  });
}
