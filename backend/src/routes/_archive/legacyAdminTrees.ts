import { Router } from "express";
import { requireAuth, requireAdmin } from "../../middleware/auth";
import {
  listTrees,
  createTree,
  updateTree,
} from "../../controllers/admin/treesLegacy";
import { logWarn } from "../../utils/logger";

// ── Legacy admin tree routes (back-compat) ───────────────────────────────────
// Same deprecation policy as routes/_archive/legacyCatalog.ts.

const router = Router();

router.use(requireAuth, requireAdmin);
router.use((req, _res, next) => {
  logWarn(`[legacy] admin ${req.method} /api/admin/trees* called`, {
    userId: req.user?.id,
    path: req.path,
  });
  next();
});

router.get("/trees", listTrees);
router.post("/trees", createTree);
router.patch("/trees/:id", updateTree);

export default router;
