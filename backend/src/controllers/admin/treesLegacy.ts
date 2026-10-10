import { Request, Response } from "express";
import { Tree } from "../../models/Tree";
import {
  sendError,
  ErrorCode,
} from "../../utils/errors";
import { ah } from "../../utils/asyncRoute";
import { ok, created } from "../../utils/respond";

// ── Legacy Tree CRUD (back-compat) ────────────────────────────────────────────
// Original `Tree` model is still a 3-tier child (variant). We keep these
// endpoints so any older admin FE pages keep working, but new code should
// use the /tree-products endpoints.

export const listTrees = ah(async (req, res) => {
  const { isActive } = req.query;
  const query: Record<string, unknown> = {};
  if (isActive === "true") query.isActive = true;
  if (isActive === "false") query.isActive = false;
  const trees = await Tree.find(query).sort({ sortOrder: 1, size: 1 }).lean();
  ok(res, {
    trees: trees.map((t) => ({
      _id: String(t._id),
      size: t.size,
      name: t.name,
      price: t.price,
      stock: (t as { stockQuantity?: number }).stockQuantity ?? 0,
      isActive: t.isActive,
      images: t.images,
      heightCmMin: t.heightCmMin,
      heightCmMax: t.heightCmMax,
    })),
  });
});

export const createTree = ah(async (req, res) => {
  const body = req.body as any;
  if (!body.size || !body.name || body.price == null) {
    sendError(res, ErrorCode.MISSING_FIELD, "Thiếu size, name hoặc price");
    return;
  }
  const tree = await Tree.create(body);
  created(res, { tree });
});

export const updateTree = ah(async (req, res) => {
  const { id } = req.params;
  const tree = await Tree.findByIdAndUpdate(id, req.body, { new: true });
  if (!tree) {
    sendError(res, ErrorCode.TREE_NOT_FOUND, "Không tìm thấy cây");
    return;
  }
  ok(res, { tree });
});
