import { Request, Response } from "express";
import { TreeDesign } from "../../models/TreeDesign";
import {
  loadCatalogForDesign,
  buildDesignResponse,
  findUniqueSlug,
} from "../../services/designService";
import { sendError, ErrorCode } from "../../utils/errors";
import { ah } from "../../utils/asyncRoute";
import { ok, created } from "../../utils/respond";

// ── Presets (TreeDesign with isPreset=true) ─────────────────────────────────

export const listPresets = ah(async (_req, res) => {
  const docs = await TreeDesign.find({ isPreset: true })
    .sort({ updatedAt: -1 })
    .lean();
  // Promise.allSettled so any orphan preset (deleted treeId / styleId /
  // accessoryId) doesn't 500 the entire gallery.
  const results = await Promise.allSettled(
    docs.map((d) => loadCatalogForDesign(d))
  );
  const out: ReturnType<typeof buildDesignResponse>[] = [];
  results.forEach((r, idx) => {
    if (r.status === "fulfilled") {
      out.push(buildDesignResponse(r.value.design, r.value.pricing));
    } else {
      console.warn(
        `[admin] Skipping preset "${docs[idx].name}" (id=${docs[idx]._id}) — config invalid:`,
        r.reason instanceof Error ? r.reason.message : r.reason
      );
    }
  });
  ok(res, { presets: out });
});

export const createPreset = ah(async (req, res) => {
  const { name, config, previewImage } = req.body as {
    name?: string;
    config?: unknown;
    previewImage?: string;
  };
  if (!name || !config) {
    sendError(res, ErrorCode.MISSING_FIELD, "Thiếu name hoặc config");
    return;
  }
  const slug = await findUniqueSlug(name);
  const presetDoc = await TreeDesign.create({
    ownerId: null,
    name,
    slug,
    year: new Date().getFullYear(),
    config,
    isPublic: true,
    isPreset: true,
    previewImage: previewImage || "",
  });
  const populated = await TreeDesign.findById(presetDoc._id).lean();
  if (!populated) {
    sendError(res, ErrorCode.INTERNAL_ERROR, "Không tìm thấy preset sau khi tạo");
    return;
  }
  const { pricing } = await loadCatalogForDesign(populated);
  created(res, { preset: buildDesignResponse(populated, pricing) });
});

export const updatePreset = ah(async (req, res) => {
  const { id } = req.params;
  const design = await TreeDesign.findById(id);
  if (!design || !design.isPreset) {
    sendError(res, ErrorCode.DESIGN_NOT_FOUND, "Không tìm thấy preset");
    return;
  }
  const { name, config, previewImage } = req.body as {
    name?: string;
    config?: unknown;
    previewImage?: string;
  };
  if (name) design.name = name;
  if (config) design.config = config as any;
  if (previewImage !== undefined) design.previewImage = previewImage;
  await design.save();
  const populated = await TreeDesign.findById(design._id).lean();
  if (!populated) {
    sendError(
      res,
      ErrorCode.INTERNAL_ERROR,
      "Không tìm thấy preset sau khi cập nhật"
    );
    return;
  }
  const { pricing } = await loadCatalogForDesign(populated);
  ok(res, { preset: buildDesignResponse(populated, pricing) });
});

export const deletePreset = ah(async (req, res) => {
  const { id } = req.params;
  const design = await TreeDesign.findById(id);
  if (!design || !design.isPreset) {
    sendError(res, ErrorCode.DESIGN_NOT_FOUND, "Không tìm thấy preset");
    return;
  }
  await TreeDesign.findByIdAndDelete(id);
  ok(res, { success: true });
});
