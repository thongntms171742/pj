import { Request, Response } from "express";
import { Types } from "mongoose";
import {
  recommendCatalogSelection,
  validateAndResolveSelection,
  createDraftAIDesign,
  hydrateAIDesign,
  CatalogValidationError,
} from "../services/ai/aiDesignerService";
import { AIDesign } from "../models/AIDesign";
import { TreeDesign } from "../models/TreeDesign";
import { findUniqueSlug } from "../services/designService";
import { sendError, ErrorCode, handleInternalError } from "../utils/errors";
import { ok, created } from "../utils/respond";
import { generateAIDesignImage } from "../services/ai/googleImageService";

/**
 * POST /api/ai-designer/recommend
 * Handles both:
 * 1. AI Recommendation: { prompt, preferences }
 * 2. Manual Pick: { variantId, accessories, styleId?, deliveryOption? }
 */
export async function recommendDesign(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id || null;
    const body = req.body || {};

    let selection;

    // If client directly provides variantId, validate their manual selection
    if (body.variantId) {
      selection = await validateAndResolveSelection({
        variantId: body.variantId,
        styleId: body.styleId || null,
        accessories: body.accessories || [],
        deliveryOption: body.deliveryOption || "DIY_KIT",
      });
    } else {
      // Recommend from catalog using prompt & preferences
      selection = await recommendCatalogSelection({
        prompt: body.prompt,
        preferences: body.preferences,
      });
    }

    const aiDesignDoc = await createDraftAIDesign({
      ownerId: userId,
      prompt: body.prompt || "",
      preferences: body.preferences || {},
      selection,
    });

    const isAdmin = Boolean(req.user?.roles?.includes("admin"));

    created(res, {
      aiDesign: {
        _id: aiDesignDoc._id,
        status: aiDesignDoc.status,
        prompt: aiDesignDoc.prompt,
        preferences: aiDesignDoc.preferences,
        imageUrl: aiDesignDoc.imageUrl,
        pricing: formatPricingForUser(aiDesignDoc.pricingSnapshot, isAdmin),
        createdAt: aiDesignDoc.createdAt,
      },
      selection: {
        variant: {
          _id: selection.variant._id,
          name: selection.variant.name,
          size: selection.variant.size,
          sku: selection.variant.sku,
          price: selection.variant.price,
          bareImage: selection.variant.bareImage,
          stockQuantity: selection.variant.stockQuantity,
        },
        style: selection.style
          ? {
              _id: selection.style._id,
              code: selection.style.code,
              name: selection.style.name,
              coverImage: selection.style.coverImage,
            }
          : null,
        accessories: selection.accessories.map((item) => ({
          accessoryId: item.accessory._id,
          name: item.accessory.name,
          type: item.accessory.type,
          group: item.accessory.group,
          image: item.accessory.image,
          price: item.accessory.price,
          quantity: item.quantity,
          lineTotal: item.lineTotal,
          personalizationText: item.personalizationText,
        })),
        pricing: formatPricingForUser(selection.pricing, isAdmin),
      },
    });
  } catch (err: any) {
    if (err instanceof CatalogValidationError) {
      sendError(res, err.code as any, err.message, err.status);
      return;
    }
    handleInternalError(res, err, "[aiDesigner] recommendDesign error");
  }
}

/**
 * GET /api/ai-designer/:id
 * Retrieve saved/draft AI design with hydrated catalog details.
 */
export async function getAIDesignById(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = String(req.params.id || "");
    if (!id || !Types.ObjectId.isValid(id)) {
      sendError(res, ErrorCode.INVALID_INPUT, "ID thiết kế AI không hợp lệ", 400);
      return;
    }

    const { aiDesign, resolved } = await hydrateAIDesign(id);
    const isAdmin = Boolean(req.user?.roles?.includes("admin"));

    ok(res, {
      aiDesign: {
        _id: aiDesign._id,
        ownerId: aiDesign.ownerId,
        status: aiDesignDesignStatus(aiDesign),
        prompt: aiDesign.prompt,
        preferences: aiDesign.preferences,
        imageUrl: aiDesign.imageUrl,
        imagePublicId: aiDesign.imagePublicId,
        pricingSnapshot: formatPricingForUser(aiDesign.pricingSnapshot, isAdmin),
        lastError: aiDesign.lastError,
        convertedToTreeDesignId: aiDesign.convertedToTreeDesignId,
        createdAt: aiDesign.createdAt,
        updatedAt: aiDesign.updatedAt,
      },
      catalog: {
        variant: {
          _id: resolved.variant._id,
          name: resolved.variant.name,
          size: resolved.variant.size,
          price: resolved.variant.price,
          bareImage: resolved.variant.bareImage,
        },
        style: resolved.style
          ? {
              _id: resolved.style._id,
              name: resolved.style.name,
              code: resolved.style.code,
            }
          : null,
        accessories: resolved.accessories.map((a) => ({
          accessoryId: a.accessory._id,
          name: a.accessory.name,
          image: a.accessory.image,
          price: a.accessory.price,
          quantity: a.quantity,
          lineTotal: a.lineTotal,
          personalizationText: a.personalizationText,
        })),
        pricing: formatPricingForUser(resolved.pricing, isAdmin),
      },
    });
  } catch (err: any) {
    if (err instanceof CatalogValidationError) {
      sendError(res, err.code as any, err.message, err.status);
      return;
    }
    handleInternalError(res, err, "[aiDesigner] getAIDesignById error");
  }
}

/**
 * POST /api/ai-designer/:id/quote
 * Recalculate price and estimated profit based on latest catalog data.
 */
export async function quoteAIDesign(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = String(req.params.id || "");
    const { resolved } = await hydrateAIDesign(id);

    // Update pricing snapshot in doc
    await AIDesign.findByIdAndUpdate(id, {
      pricingSnapshot: resolved.pricing,
    });

    const isAdmin = Boolean(req.user?.roles?.includes("admin"));

    const pricingResponse: any = {
      treePrice: resolved.pricing.treePrice,
      accessoriesTotal: resolved.pricing.accessoriesTotal,
      decorationFee: resolved.pricing.decorationFee,
      shippingFee: resolved.pricing.shippingFee,
      totalSalePrice: resolved.pricing.totalSalePrice,
    };

    // Return cost and profit only to admin
    if (isAdmin) {
      pricingResponse.totalCostPrice = resolved.pricing.totalCostPrice;
      pricingResponse.expectedGrossProfit = resolved.pricing.expectedGrossProfit;
    }

    ok(res, { pricing: pricingResponse });
  } catch (err: any) {
    if (err instanceof CatalogValidationError) {
      sendError(res, err.code as any, err.message, err.status);
      return;
    }
    handleInternalError(res, err, "[aiDesigner] quoteAIDesign error");
  }
}

/**
 * POST /api/ai-designer/:id/save
 * Converts a completed AIDesign into a standard TreeDesign so it can be ordered or shared.
 */
export async function saveConfirmedDesign(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      sendError(res, ErrorCode.UNAUTHORIZED, "Cần đăng nhập để lưu thiết kế");
      return;
    }

    const id = String(req.params.id || "");
    const aiDoc = await AIDesign.findById(id);
    if (!aiDoc) {
      sendError(res, ErrorCode.AI_DESIGN_NOT_FOUND, "Không tìm thấy thiết kế AI", 404);
      return;
    }

    const designName = (req.body?.name || `AI Design - ${aiDoc.prompt || "Custom"}`).trim();
    const slug = await findUniqueSlug(designName);

    const treeDesign = await TreeDesign.create({
      ownerId: new Types.ObjectId(userId),
      name: designName,
      slug,
      year: new Date().getFullYear(),
      config: {
        variantId: aiDoc.variantId,
        styleId: aiDoc.styleId,
        accessories: aiDoc.accessories,
        deliveryOption: aiDoc.deliveryOption || "DIY_KIT",
      },
      isPublic: true,
      isPreset: false,
      previewImage: aiDoc.imageUrl || "",
    });

    aiDoc.convertedToTreeDesignId = treeDesign._id as Types.ObjectId;
    aiDoc.status = "COMPLETED";
    await aiDoc.save();

    created(res, {
      treeDesign: {
        _id: treeDesign._id,
        name: treeDesign.name,
        slug: treeDesign.slug,
        shareUrl: `/tree/${treeDesign.slug}`,
        previewImage: treeDesign.previewImage,
      },
    });
  } catch (err: any) {
    handleInternalError(res, err, "[aiDesigner] saveConfirmedDesign error");
  }
}

function aiDesignDesignStatus(doc: any): string {
  return doc.status || "DRAFT";
}

function formatPricingForUser(pricing: any, isAdmin: boolean): any {
  if (!pricing) return null;
  const result: any = {
    treePrice: pricing.treePrice,
    accessoriesTotal: pricing.accessoriesTotal,
    decorationFee: pricing.decorationFee,
    shippingFee: pricing.shippingFee,
    totalSalePrice: pricing.totalSalePrice,
  };
  if (isAdmin) {
    result.totalCostPrice =
      pricing.totalCostPrice !== undefined ? pricing.totalCostPrice : null;
    result.expectedGrossProfit =
      pricing.expectedGrossProfit !== undefined
        ? pricing.expectedGrossProfit
        : null;
  }
  return result;
}


/** POST /api/ai-designer/:id/generate-image — generate and upload a product visualization. */
export async function generateDesignImage(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id || "");
    if (!Types.ObjectId.isValid(id)) {
      sendError(res, ErrorCode.INVALID_INPUT, "ID thiết kế AI không hợp lệ", 400);
      return;
    }
    const result = await generateAIDesignImage(id, String(req.user?.id || ""), Boolean(req.user?.roles?.includes("admin")));
    ok(res, result);
  } catch (err: any) {
    if (err?.code && err?.status) {
      sendError(res, err.code as any, err.message, err.status);
      return;
    }
    handleInternalError(res, err, "[aiDesigner] generateDesignImage error");
  }
}
