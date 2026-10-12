import { Types } from "mongoose";
import { Tree, ITree } from "../../models/Tree";
import { Accessory, IAccessory } from "../../models/Accessory";
import { Style, IStyle } from "../../models/Style";
import {
  AIDesign,
  IAIDesign,
  AIDesignPreferences,
  AIDesignAccessoryItem,
} from "../../models/AIDesign";
import { ErrorCode } from "../../utils/errors";

export interface ResolvedCatalogSelection {
  variant: ITree;
  style: IStyle | null;
  accessories: Array<{
    accessory: IAccessory;
    quantity: number;
    personalizationText?: string;
    lineTotal: number;
  }>;
  pricing: {
    treePrice: number;
    accessoriesTotal: number;
    decorationFee: number;
    shippingFee: number;
    totalSalePrice: number;
    totalCostPrice: number | null;
    expectedGrossProfit: number | null;
  };
}

export class CatalogValidationError extends Error {
  public code: string;
  public status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * Validates and resolves real catalog items from MongoDB.
 * Ensures tree variant and all accessories exist, are active, and have sufficient stock.
 */
export async function validateAndResolveSelection(input: {
  variantId: string | Types.ObjectId;
  styleId?: string | Types.ObjectId | null;
  accessories: AIDesignAccessoryItem[];
  deliveryOption?: "READY_TO_DISPLAY" | "DIY_KIT" | "SEPARATE";
}): Promise<ResolvedCatalogSelection> {
  // 1. Resolve Tree variant
  if (!input.variantId || !Types.ObjectId.isValid(String(input.variantId))) {
    throw new CatalogValidationError(
      ErrorCode.TREE_NOT_FOUND,
      "variantId không hợp lệ hoặc bị thiếu",
      400
    );
  }

  const variant = await Tree.findOne({
    _id: input.variantId,
    isActive: true,
  });

  if (!variant) {
    throw new CatalogValidationError(
      ErrorCode.TREE_NOT_FOUND,
      "Biến thể cây không tồn tại hoặc đã ngừng kinh doanh",
      404
    );
  }

  if (variant.stockQuantity <= 0) {
    throw new CatalogValidationError(
      ErrorCode.OUT_OF_STOCK,
      `Biến thể cây ${variant.name} đã hết hàng`,
      409
    );
  }

  // 2. Resolve Style (optional)
  let style: IStyle | null = null;
  if (input.styleId && Types.ObjectId.isValid(String(input.styleId))) {
    style = await Style.findOne({ _id: input.styleId, isActive: true });
    if (!style) {
      throw new CatalogValidationError(
        ErrorCode.STYLE_NOT_FOUND,
        "Phong cách (Style) không tồn tại hoặc đã ngừng áp dụng",
        404
      );
    }
  }

  // 3. Resolve Accessories
  const resolvedAccessories: ResolvedCatalogSelection["accessories"] = [];
  const treeSize = (variant.size || "M").toUpperCase() as "S" | "M" | "L";

  if (Array.isArray(input.accessories) && input.accessories.length > 0) {
    const accIds = input.accessories
      .map((a) => String(a.accessoryId))
      .filter((id) => Types.ObjectId.isValid(id));

    const dbAccessories = await Accessory.find({
      _id: { $in: accIds },
      isActive: true,
    });

    const accMap = new Map<string, IAccessory>();
    for (const doc of dbAccessories) {
      accMap.set(String(doc._id), doc);
    }

    for (const item of input.accessories) {
      const accDoc = accMap.get(String(item.accessoryId));
      if (!accDoc) {
        throw new CatalogValidationError(
          ErrorCode.ACCESSORY_NOT_FOUND,
          `Phụ kiện ${item.accessoryId} không tồn tại hoặc đã ngừng bán`,
          404
        );
      }

      const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));

      // Stock check
      if (accDoc.stock < qty) {
        throw new CatalogValidationError(
          ErrorCode.OUT_OF_STOCK,
          `Phụ kiện "${accDoc.name}" không đủ tồn kho (chỉ còn ${accDoc.stock})`,
          409
        );
      }

      // Max quantity bound by size
      if (accDoc.maxQtyBySize && accDoc.maxQtyBySize[treeSize] !== undefined) {
        const maxAllowed = accDoc.maxQtyBySize[treeSize];
        if (qty > maxAllowed) {
          throw new CatalogValidationError(
            ErrorCode.ACCESSORY_QUANTITY_INVALID,
            `Phụ kiện "${accDoc.name}" vượt quá số lượng tối đa cho cây size ${treeSize} (tối đa ${maxAllowed})`,
            400
          );
        }
      }

      const lineTotal = accDoc.price * qty;
      resolvedAccessories.push({
        accessory: accDoc,
        quantity: qty,
        personalizationText: item.personalizationText?.trim() || "",
        lineTotal,
      });
    }
  }

  // 4. Calculate prices
  const treePrice = variant.price;
  const accessoriesTotal = resolvedAccessories.reduce(
    (sum, a) => sum + a.lineTotal,
    0
  );
  const deliveryOption = input.deliveryOption || "DIY_KIT";
  const decorationFee =
    deliveryOption === "READY_TO_DISPLAY"
      ? treeSize === "S"
        ? 150000
        : treeSize === "M"
        ? 250000
        : 350000
      : 0;
  const shippingFee = 30000;
  const totalSalePrice =
    treePrice + accessoriesTotal + decorationFee + shippingFee;

  // Do not claim a profit when any catalog item has no recorded cost price.
  const variantCost = typeof variant.costPrice === "number" ? variant.costPrice : null;
  const accessoryCostsKnown = resolvedAccessories.every(
    (a) => typeof a.accessory.costPrice === "number"
  );
  const totalCostPrice = variantCost !== null && accessoryCostsKnown
    ? variantCost + resolvedAccessories.reduce((sum, a) => sum + (a.accessory.costPrice as number) * a.quantity, 0)
    : null;
  const expectedGrossProfit = totalCostPrice === null ? null : totalSalePrice - totalCostPrice;

  return {
    variant,
    style,
    accessories: resolvedAccessories,
    pricing: {
      treePrice,
      accessoriesTotal,
      decorationFee,
      shippingFee,
      totalSalePrice,
      totalCostPrice,
      expectedGrossProfit,
    },
  };
}

/**
 * Intelligent Catalog Recommendation:
 * Analyzes prompt and customer preferences to query and match real trees and accessories in stock.
 */
export async function recommendCatalogSelection(input: {
  prompt?: string;
  preferences?: AIDesignPreferences;
}): Promise<ResolvedCatalogSelection> {
  const promptText = (input.prompt || "").toLowerCase();
  const prefs = input.preferences || {};

  // 1. Determine tree size preference
  let targetSize: "S" | "M" | "L" | "XL" = "M";
  if (prefs.spaceSize) {
    targetSize = prefs.spaceSize.toUpperCase() as any;
  } else if (
    promptText.includes("nhỏ") ||
    promptText.includes("mini") ||
    promptText.includes("bàn làm việc") ||
    promptText.includes("phòng ngủ")
  ) {
    targetSize = "S";
  } else if (
    promptText.includes("lớn") ||
    promptText.includes("to") ||
    promptText.includes("phòng khách lớn") ||
    promptText.includes("biệt thự")
  ) {
    targetSize = "L";
  }

  // 2. Query suitable Tree variant in stock
  let variant = await Tree.findOne({
    isActive: true,
    size: targetSize,
    stockQuantity: { $gt: 0 },
  }).sort({ sortOrder: 1, price: 1 });

  // Fallback to any active tree in stock if targetSize is out of stock
  if (!variant) {
    variant = await Tree.findOne({
      isActive: true,
      stockQuantity: { $gt: 0 },
    }).sort({ sortOrder: 1 });
  }

  if (!variant) {
    throw new CatalogValidationError(
      ErrorCode.OUT_OF_STOCK,
      "Hiện tại tất cả biến thể cây thông trong hệ thống đều đã hết hàng",
      409
    );
  }

  // 3. Query Style based on prompt / theme
  let style: IStyle | null = null;
  const styles = await Style.find({ isActive: true });

  if (styles.length > 0) {
    if (prefs.styleCode) {
      style =
        styles.find(
          (s) => s.code.toLowerCase() === prefs.styleCode?.toLowerCase()
        ) || null;
    }

    if (!style && promptText) {
      style =
        styles.find(
          (s) =>
            promptText.includes(s.code.toLowerCase()) ||
            promptText.includes(s.name.toLowerCase())
        ) || null;
    }

    // Default to first active style if still not matched
    if (!style) {
      style = styles[0];
    }
  }

  // 4. Query compatible accessories in stock
  const accessoryFilter: any = {
    isActive: true,
    stock: { $gt: 0 },
  };

  if (style) {
    // Accessories either match style or are universal (empty styleCodes)
    accessoryFilter.$or = [
      { styleCodes: style.code },
      { styleCodes: { $size: 0 } },
    ];
  }

  const availableAccessories = await Accessory.find(accessoryFilter)
    .sort({ sortOrder: 1 })
    .limit(15);

  // Group accessories to build a balanced festive set:
  // - 1 dây đèn (LIGHTS)
  // - 1 ngôi sao / chuông đỉnh cây (STAR / BELL / TOPPER)
  // - 3-5 loại quả châu hoặc đồ trang trí (ORNAMENT / DECOR)
  const selectedAccessories: AIDesignAccessoryItem[] = [];
  const treeSizeKey = (variant.size || "M").toUpperCase() as "S" | "M" | "L";

  const lightAcc = availableAccessories.find((a) => a.group === "LIGHTS");
  if (lightAcc) {
    const maxLight = lightAcc.maxQtyBySize?.[treeSizeKey] || 1;
    selectedAccessories.push({
      accessoryId: lightAcc._id as Types.ObjectId,
      quantity: Math.min(1, maxLight),
    });
  }

  const topperAcc = availableAccessories.find(
    (a) => a.type === "STAR" || a.type === "BELL"
  );
  if (topperAcc && String(topperAcc._id) !== String(lightAcc?._id)) {
    const maxTopper = topperAcc.maxQtyBySize?.[treeSizeKey] || 1;
    selectedAccessories.push({
      accessoryId: topperAcc._id as Types.ObjectId,
      quantity: Math.min(1, maxTopper),
    });
  }

  const ornaments = availableAccessories.filter(
    (a) =>
      a.group === "ORNAMENT" ||
      a.group === "DECOR" ||
      a.group === "PERSONAL"
  );

  for (const orn of ornaments.slice(0, 4)) {
    if (selectedAccessories.some((s) => String(s.accessoryId) === String(orn._id))) {
      continue;
    }
    const maxQty = orn.maxQtyBySize?.[treeSizeKey] || 4;
    const recommendedQty = treeSizeKey === "S" ? 2 : treeSizeKey === "M" ? 4 : 6;
    selectedAccessories.push({
      accessoryId: orn._id as Types.ObjectId,
      quantity: Math.min(recommendedQty, maxQty, orn.stock),
      personalizationText: orn.isPersonalizable
        ? prefs.personalizationText || ""
        : "",
    });
  }

  return validateAndResolveSelection({
    variantId: variant._id as Types.ObjectId,
    styleId: style ? (style._id as Types.ObjectId) : null,
    accessories: selectedAccessories,
    deliveryOption: "DIY_KIT",
  });
}

/**
 * Creates and saves an AIDesign record in DRAFT status.
 */
export async function createDraftAIDesign(input: {
  ownerId: string | Types.ObjectId | null;
  prompt?: string;
  preferences?: AIDesignPreferences;
  selection: ResolvedCatalogSelection;
}): Promise<IAIDesign> {
  const { selection } = input;

  const doc = await AIDesign.create({
    ownerId: input.ownerId ? new Types.ObjectId(String(input.ownerId)) : null,
    prompt: input.prompt || "",
    preferences: input.preferences || {},
    variantId: selection.variant,
    styleId: selection.style ? selection.style._id : null,
    accessories: selection.accessories.map((a) => ({
      accessoryId: a.accessory._id,
      quantity: a.quantity,
      personalizationText: a.personalizationText || "",
    })),
    deliveryOption: "DIY_KIT",
    imageUrl: "",
    imagePublicId: "",
    pricingSnapshot: selection.pricing,
    status: "DRAFT",
    lastError: null,
  });

  return doc;
}

/**
 * Format and hydrate an AIDesign document with full catalog details for client responses.
 */
export async function hydrateAIDesign(designId: string | Types.ObjectId): Promise<{
  aiDesign: IAIDesign;
  resolved: ResolvedCatalogSelection;
}> {
  const aiDesign = await AIDesign.findById(designId);
  if (!aiDesign) {
    throw new CatalogValidationError(
      ErrorCode.AI_DESIGN_NOT_FOUND,
      "Không tìm thấy thiết kế AI",
      404
    );
  }

  const resolved = await validateAndResolveSelection({
    variantId: aiDesign.variantId,
    styleId: aiDesign.styleId,
    accessories: aiDesign.accessories,
    deliveryOption: aiDesign.deliveryOption,
  });

  return { aiDesign, resolved };
}
