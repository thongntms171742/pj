import mongoose, { Schema, Document, Types } from "mongoose";
import type { AccessoryType, AccessoryGroup } from "./Accessory";
import type { TreeSize } from "./Tree";

// ── Shared DesignConfig ──────────────────────────────────────────────────────
// Used by TreeDesign.config, CartItem.config, and the snapshot baked into
// OrderItem.tree/style/lines. Keeping one shape across all 3 layers means
// the editor, cart, and order speak the same language.

export type DeliveryOption = "READY_TO_DISPLAY" | "DIY_KIT" | "SEPARATE";

export interface DesignAccessoryEntry {
  accessoryId: Types.ObjectId;
  quantity: number;
  personalizationText?: string;
}

export interface DesignConfig {
  treeId: Types.ObjectId;
  styleId: Types.ObjectId;
  accessories: DesignAccessoryEntry[];
  deliveryOption: DeliveryOption;
}

// Lightweight refs populated when serving a design/cart/order to FE.
export interface ResolvedTreeRef {
  _id: string;
  size: TreeSize;
  name: string;
  price: number;
  bareImage: string;
  unitPrice?: number; // captured for OrderItem; FE often reads `price`
}

export interface ResolvedStyleRef {
  _id: string;
  code: string;
  name: string;
  coverImage: string;
  palette: string[];
}

export interface ResolvedAccessoryRef {
  accessoryId: string;
  name: string;
  type: AccessoryType;
  group: AccessoryGroup;
  image: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  personalizationText?: string;
  isPersonalizable: boolean;
  personalizationMaxLength: number;
  productionDays: number;
}

// ── TreeDesign ───────────────────────────────────────────────────────────────
// ownerId null + isPreset true = ready-made design owned by staff.
// Otherwise it's a customer-created design that can be saved / shared /
// duplicated across years.

export interface ITreeDesign extends Document {
  ownerId: Types.ObjectId | null;
  name: string;
  slug: string;
  year: number;
  config: DesignConfig;
  isPublic: boolean;
  isPreset: boolean;
  duplicatedFrom: Types.ObjectId | null;
  previewImage: string;
}

const TreeDesignSchema = new Schema<ITreeDesign>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    name: { type: String, required: true, trim: true, default: "My Christmas" },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    year: { type: Number, required: true, default: () => new Date().getFullYear() },
    config: {
      treeId: { type: Schema.Types.ObjectId, ref: "Tree", required: true },
      styleId: { type: Schema.Types.ObjectId, ref: "Style", required: true },
      accessories: [
        {
          _id: false,
          accessoryId: {
            type: Schema.Types.ObjectId,
            ref: "Accessory",
            required: true,
          },
          quantity: { type: Number, required: true, min: 1 },
          personalizationText: { type: String, default: "" },
        },
      ],
      deliveryOption: {
        type: String,
        enum: ["READY_TO_DISPLAY", "DIY_KIT", "SEPARATE"],
        required: true,
        default: "READY_TO_DISPLAY",
      },
    },
    isPublic: { type: Boolean, default: true },
    isPreset: { type: Boolean, default: false, index: true },
    duplicatedFrom: {
      type: Schema.Types.ObjectId,
      ref: "TreeDesign",
      default: null,
    },
    previewImage: { type: String, default: "" },
  },
  { timestamps: true }
);

TreeDesignSchema.index({ ownerId: 1, updatedAt: -1 });
TreeDesignSchema.index({ isPreset: 1, year: -1, updatedAt: -1 });

// Pre-save guard: when a design is being SAVED as a preset (or any design
// that will appear in public galleries), ensure every accessory that is
// flagged `isPersonalizable` carries a non-empty personalizationText.
//
// Why: a missing personalizationText previously caused 500s on
// GET /api/catalog/presets because loadCatalogForDesign raised
// PERSONALIZATION_REQUIRED and the controller had to allSettled-skip the
// entire preset. Validating at write time keeps the catalog clean.
//
// Customer drafts (isPreset=false) are exempt so the FE editor can save
// progress without forcing the user to fill every name tag.
TreeDesignSchema.pre("validate", async function (next) {
  try {
    const design = this as unknown as ITreeDesign;
    if (!design.config?.accessories?.length) return next();
    const isPublicDesign = design.isPreset === true || design.isPublic === true;
    if (!isPublicDesign) return next();
    const Accessory = mongoose.model("Accessory");
    const ids = design.config.accessories.map((a) => a.accessoryId);
    const docs = await Accessory.find({ _id: { $in: ids } })
      .select("_id isPersonalizable name")
      .lean();
    const byId = new Map(docs.map((d) => [String(d._id), d]));
    for (const entry of design.config.accessories) {
      const meta = byId.get(String(entry.accessoryId));
      if (!meta) continue; // orphan-id is checked separately by prune script
      if ((meta as { isPersonalizable?: boolean }).isPersonalizable) {
        const text = (entry.personalizationText ?? "").trim();
        if (!text) {
          return next(
            new Error(
              `Accessory "${(meta as { name?: string }).name}" yêu cầu nhập chữ cá nhân hóa trước khi lưu preset công khai.`
            )
          );
        }
      }
    }
    return next();
  } catch (err) {
    return next(err as Error);
  }
});

export const TreeDesign = mongoose.model<ITreeDesign>("TreeDesign", TreeDesignSchema);