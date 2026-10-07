import mongoose, { Schema, Document } from "mongoose";

// ── Christmas concept / palette ──────────────────────────────────────────────
// One Style = one decoration concept (Classic, Minimal, Gingerbread, Winter,
// Cute, Luxury). A TreeDesign pins exactly one Style; accessories filter by
// styleCodes to keep the concept cohesive (e.g. Gingerbread won't allow
// pink-rose baubles).

export type StyleCode =
  | "CLASSIC"
  | "MINIMAL"
  | "GINGERBREAD"
  | "WINTER"
  | "CUTE"
  | "LUXURY";

export const STYLE_CODES: ReadonlyArray<StyleCode> = [
  "CLASSIC",
  "MINIMAL",
  "GINGERBREAD",
  "WINTER",
  "CUTE",
  "LUXURY",
];

export interface IStyle extends Document {
  code: StyleCode;
  name: string;
  description: string;
  palette: string[];
  coverImage: string;
  isActive: boolean;
  sortOrder: number;
}

const StyleSchema = new Schema<IStyle>(
  {
    code: {
      type: String,
      enum: STYLE_CODES as unknown as string[],
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    palette: { type: [String], default: [] },
    coverImage: { type: String, default: "" },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

StyleSchema.index({ isActive: 1, sortOrder: 1 });

export const Style = mongoose.model<IStyle>("Style", StyleSchema);