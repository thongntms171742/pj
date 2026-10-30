import mongoose, { Schema, Document } from "mongoose";

// ── Media asset (video / audio / image) ──────────────────────────────────────
// Dùng chung cho 3 use-case trên FE:
//   1. HERO_BACKGROUND — video nền ở Hero trang chủ
//   2. STORY_FEED      — video dọc 9:16 kiểu Reels/Story
//   3. MUSIC_TRACK     — nhạc nền phát tự động toàn site
//   4. PROMO           — banner/promo mở rộng (dùng khi cần riêng khỏi Banner)
//
// Tách khỏi `Banner` vì Banner chỉ dành cho ẢNH tĩnh (imageUrl bắt buộc).
// Media asset có thể do Admin upload lên Cloudinary qua `POST /api/uploads`.

export type MediaKind = "VIDEO" | "AUDIO" | "IMAGE";

export type MediaPlacement =
  | "HERO_BACKGROUND"
  | "STORY_FEED"
  | "MUSIC_TRACK"
  | "PROMO";

export type MediaLinkType = "PRODUCT" | "CATEGORY" | "NONE";

export interface IMediaAsset extends Document {
  kind: MediaKind;
  placement: MediaPlacement;
  title: string;
  caption?: string;
  url: string;
  publicId?: string;
  posterUrl?: string;
  format?: string;
  size?: number;
  /** Thời lượng (giây) — Cloudinary trả về cho video/audio. */
  duration?: number;
  ctaLabel?: string;
  ctaLink?: string;
  linkType: MediaLinkType;
  /** Id sản phẩm / danh mục mà CTA trỏ tới (khi linkType khác NONE). */
  linkId?: string;
  musicArtist?: string;
  isLoop: boolean;
  /** Âm lượng mặc định 0–100. */
  volume: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const MediaAssetSchema = new Schema<IMediaAsset>(
  {
    kind: {
      type: String,
      enum: ["VIDEO", "AUDIO", "IMAGE"],
      default: "VIDEO",
      required: true,
    },
    placement: {
      type: String,
      enum: ["HERO_BACKGROUND", "STORY_FEED", "MUSIC_TRACK", "PROMO"],
      default: "STORY_FEED",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    caption: { type: String, default: "", trim: true },
    url: { type: String, required: true, trim: true },
    publicId: { type: String, default: "", trim: true },
    posterUrl: { type: String, default: "", trim: true },
    format: { type: String, default: "", trim: true },
    size: { type: Number, default: 0 },
    duration: { type: Number, default: 0 },
    ctaLabel: { type: String, default: "", trim: true },
    ctaLink: { type: String, default: "", trim: true },
    linkType: {
      type: String,
      enum: ["PRODUCT", "CATEGORY", "NONE"],
      default: "NONE",
    },
    linkId: { type: String, default: "", trim: true },
    musicArtist: { type: String, default: "", trim: true },
    isLoop: { type: Boolean, default: true },
    volume: { type: Number, default: 40, min: 0, max: 100 },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

MediaAssetSchema.index({ isActive: 1, placement: 1, sortOrder: 1 });

export const MediaAsset = mongoose.model<IMediaAsset>(
  "MediaAsset",
  MediaAssetSchema
);
