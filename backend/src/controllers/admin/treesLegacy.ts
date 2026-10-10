// ── Legacy Tree endpoints (READ-ONLY) ─────────────────────────────────────────
// Deprecation: the catalog moved to the 3-tier Shopee structure
//   TreeProduct → TreeCode → TreeVariant (`Tree` collection)
// on 2026-10-09. These handlers only remain so older admin FE builds that
// still call GET /api/admin/trees keep rendering a flat variant list.
//
// ⚠️ WRITE ACCESS REMOVED — why:
//   The old POST /trees forwarded `req.body` straight into `Tree.create(...)`.
//   That bypassed the 3-tier contract entirely: `productId` and `codeId` were
//   optional in that path, so a request could persist a variant that belongs
//   to no product and no code. Those orphans are invisible to
//   GET /catalog/tree-products (which walks product → code → variant) yet
//   still count as live rows in the `Tree` collection.
//
//   If you need to create a variant, use the 3-step flow instead:
//     1) POST /api/admin/tree-products
//     2) POST /api/admin/tree-products/:productId/codes
//     3) POST /api/admin/tree-codes/:codeId/variants
//
// REMOVAL: 2026-12-01 — after confirming no FE build calls this endpoint.

import { Request, Response } from "express";
import { Tree } from "../../models/Tree";
import { sendError, ErrorCode } from "../../utils/errors";
import { ah } from "../../utils/asyncRoute";
import { ok } from "../../utils/respond";
import { logWarn } from "../../utils/logger";

/** Reject writes to the legacy flat-tree endpoint with an actionable error. */
function rejectLegacyWrite(res: Response, operation: string): void {
  sendError(
    res,
    ErrorCode.INVALID_INPUT,
    `POST/PATCH /api/admin/trees đã bị vô hiệu hoá (${operation}). ` +
      `Hãy dùng luồng 3 bước: POST /api/admin/tree-products → ` +
      `POST /api/admin/tree-products/:productId/codes → ` +
      `POST /api/admin/tree-codes/:codeId/variants`
  );
}

/** Legacy flat list of tree variants (grouped by parent is NOT applied). */
export const listTrees = ah(async (req, res) => {
  const { isActive } = req.query;

  logWarn("[legacy] GET /api/admin/trees called — migrate to /admin/tree-products", {
    userId: req.user?.id,
    isActive,
  });

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
      stock: t.stockQuantity ?? 0,
      isActive: t.isActive,
      images: t.images,
      heightCmMin: t.heightCmMin,
      heightCmMax: t.heightCmMax,
    })),
  });
});

/** @deprecated Writes are blocked — see the module header for the 3-tier flow. */
export const createTree = ah(async (_req, res) => {
  rejectLegacyWrite(res, "create");
});

/** @deprecated Writes are blocked — see the module header for the 3-tier flow. */
export const updateTree = ah(async (_req, res) => {
  rejectLegacyWrite(res, "update");
});